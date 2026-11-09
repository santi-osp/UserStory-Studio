using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que obtiene la configuraciÃ³n dinÃ¡mica de campos para crear work items.
    /// </summary>
    /// <remarks>
    /// Consulta Azure DevOps para detectar o usar el tipo solicitado, filtra campos relevantes para UI y enriquece
    /// picklists/opciones cuando el proceso del proyecto las expone.
    /// </remarks>
    public class AzdoWorkItemConfigFunction
    {
        private readonly ILogger<AzdoWorkItemConfigFunction> _logger;
        private readonly IGetAzdoWorkItemConfigUseCase _getAzdoWorkItemConfigUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public AzdoWorkItemConfigFunction(
            ILogger<AzdoWorkItemConfigFunction> logger,
            IGetAzdoWorkItemConfigUseCase getAzdoWorkItemConfigUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _getAzdoWorkItemConfigUseCase = getAzdoWorkItemConfigUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/azdo/workitem-config</c> y devuelve campos configurables para el frontend.
        /// </summary>
        /// <param name="request">
        /// Solicitud con header <c>x-azdo-pat</c>, contexto de organizacion y proyecto en body, headers o
        /// <c>azdoContext.azurePath</c>. El body esperado es <see cref="WorkItemConfigRequest"/>.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion propagado a consultas de Azure DevOps.</param>
        /// <returns>
        /// <c>200</c> con <see cref="WorkItemConfigResponse"/>, <c>400</c> por configuracion requerida faltante,
        /// <c>401/403</c> por autorizacion Azure DevOps, <c>408</c> por timeout y <c>5xx</c> por errores externos o internos.
        /// </returns>
        [Function("GetAzdoWorkItemConfig")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/azdo/workitem-config")] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var endpoint = "v1.0.0/azdo/workitem-config";
            var correlationId = _requestValidation.Prepare(request);
            var clientApp = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader);
            var resolvedContext = new ResolvedAzdoContext();
            var requestBodyText = string.Empty;

            IActionResult Respond(IActionResult result, int statusCode)
            {
                _errorLogging.LogResponseWithBody(
                    _logger,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    statusCode,
                    _errorLogging.ExtractResponseBody(result),
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        durationMs = startedAt.ElapsedMilliseconds
                    });
                return result;
            }

            var azurePat = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzurePatHeader);

            var bodyRead = await _requestValidation.ReadBodyAsync(
                request,
                correlationId,
                requiredBody: false,
                maxBodyBytes: _requestLimits.SmallBodyBytes,
                cancellationToken);
            if (!bodyRead.Succeeded)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(bodyRead.Error!, bodyRead.StatusCode),
                    bodyRead.StatusCode);
            }

            requestBodyText = bodyRead.Body;
            resolvedContext = _requestValidation.ResolveAzdoContext(request, requestBodyText);

            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            WorkItemConfigRequest? configRequest = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(requestBodyText))
                {
                    configRequest = JsonSerializer.Deserialize<WorkItemConfigRequest>(
                        requestBodyText,
                        _requestValidation.JsonOptions);
                }
            }
            catch (JsonException ex)
            {
                var errorBody = ErrorResponseFactory.InvalidJson(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var organizationValidationError = _requestValidation.ValidateOrganization(resolvedContext.Organization, correlationId);
            if (organizationValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(organizationValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var project = (configRequest?.AzdoProject ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(project))
                project = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoProjectHeader);

            if (string.IsNullOrWhiteSpace(project))
                project = AzdoProjectResolver.ExtractProjectFromAzurePath(resolvedContext.AzurePath);

            if (string.IsNullOrWhiteSpace(project))
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "azdoProject es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateProject(project, correlationId),
                _requestValidation.ValidateOptionalPath(resolvedContext.AzurePath, "azurePath", correlationId),
                _requestValidation.ValidateOptionalText(
                    configRequest?.WorkItemType,
                    "workItemType",
                    _requestValidation.MaxProjectLength,
                    correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _getAzdoWorkItemConfigUseCase.ExecuteAsync(
                    new GetAzdoWorkItemConfigQuery(
                        resolvedContext.Organization,
                        project,
                        configRequest?.WorkItemType ?? string.Empty,
                        azurePat,
                        correlationId,
                        clientApp),
                    cancellationToken);

                return Respond(new OkObjectResult(responseBody), StatusCodes.Status200OK);
            }
            catch (ArgumentException ex)
            {
                var errorBody = ErrorResponseFactory.Validation(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest), StatusCodes.Status400BadRequest);
            }
            catch (AzDoRequestException ex)
            {
                var statusCode = ExternalStatusCodeMapper.Map(ex.StatusCode);
                var errorBody = ErrorResponseFactory.AzureDevOps(ex, correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, statusCode),
                    statusCode);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                var errorBody = ErrorResponseFactory.AzureDevOpsTimeout(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout),
                    StatusCodes.Status408RequestTimeout);
            }
            catch (Exception ex)
            {
                var errorBody = ErrorResponseFactory.Unexpected(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
        }

    }
}
