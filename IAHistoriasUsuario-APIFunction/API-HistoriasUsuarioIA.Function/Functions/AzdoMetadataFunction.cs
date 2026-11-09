using System.Diagnostics;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que expone proyectos, areas e iteraciones de Azure DevOps para parametrizar la UI.
    /// </summary>
    /// <remarks>
    /// Cuando se recibe <c>azdoContext.azurePath</c>, las rutas agregadas se filtran por ese prefijo, pero la
    /// respuesta conserva metadata por proyecto para que el frontend pueda mostrar selecciones completas.
    /// </remarks>
    public class AzdoMetadataFunction
    {
        private readonly ILogger<AzdoMetadataFunction> _logger;
        private readonly IGetAzdoMetadataUseCase _getAzdoMetadataUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public AzdoMetadataFunction(
            ILogger<AzdoMetadataFunction> logger,
            IGetAzdoMetadataUseCase getAzdoMetadataUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _getAzdoMetadataUseCase = getAzdoMetadataUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/azdo/metadata</c> y devuelve metadata de clasificacion de Azure DevOps.
        /// </summary>
        /// <param name="request">
        /// Solicitud con header <c>x-azdo-pat</c> y organizacion resuelta desde <see cref="AzdoMetadataRequest"/>,
        /// headers o configuracion.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion usado en validacion y consultas externas.</param>
        /// <returns>
        /// <c>200</c> con proyectos, area paths, iteration paths y metadata por proyecto, <c>400</c> por PAT u
        /// organizacion faltantes, <c>401/403</c> por autorizacion Azure DevOps, <c>408</c> por timeout y <c>5xx</c> por
        /// errores externos o internos.
        /// </returns>
        [Function("GetAzdoMetadata")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/azdo/metadata")] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var endpoint = "v1.0.0/azdo/metadata";
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
            var jsonValidationError = _requestValidation.ValidateJsonIfPresent(requestBodyText, correlationId);
            if (jsonValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(jsonValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            resolvedContext = _requestValidation.ResolveAzdoContext(request, requestBodyText);
            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateOrganization(resolvedContext.Organization, correlationId),
                _requestValidation.ValidateOptionalPath(resolvedContext.AzurePath, "azurePath", correlationId));
            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _getAzdoMetadataUseCase.ExecuteAsync(
                    new GetAzdoMetadataQuery(
                        resolvedContext.Organization,
                        resolvedContext.AzurePath,
                        azurePat,
                        correlationId,
                        clientApp),
                    cancellationToken);
                return Respond(new OkObjectResult(responseBody), StatusCodes.Status200OK);
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
                    new { clientApp, resolvedContext.Organization, resolvedContext.AzurePath });
                return Respond(ErrorResponseFactory.ToActionResult(errorBody, statusCode), statusCode);
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
                    new { clientApp, resolvedContext.Organization, resolvedContext.AzurePath });
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
                    new { clientApp, resolvedContext.Organization, resolvedContext.AzurePath });
                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
        }
    }
}
