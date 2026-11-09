using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que crea un Work Item y, si aplica, Test Cases asociados en Azure DevOps.
    /// </summary>
    /// <remarks>
    /// Usa el PAT recibido por header para construir el cliente de Azure DevOps. El tipo de work item controla si se
    /// crean Test Cases: solo User Story y Product Backlog Item mantienen los casos de prueba recibidos.
    /// </remarks>
    public class CreateAzureDevOpsItemsFunction
    {
        private readonly ILogger<CreateAzureDevOpsItemsFunction> _logger;
        private readonly ICreateAzureDevOpsItemsUseCase _createAzureDevOpsItemsUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public CreateAzureDevOpsItemsFunction(
            ILogger<CreateAzureDevOpsItemsFunction> logger,
            ICreateAzureDevOpsItemsUseCase createAzureDevOpsItemsUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _createAzureDevOpsItemsUseCase = createAzureDevOpsItemsUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/create</c> y materializa el payload de Work Item en Azure DevOps.
        /// </summary>
        /// <param name="request">
        /// Solicitud HTTP con header <c>x-azdo-pat</c> y body <see cref="CreateWorkItemPayload"/>. La organizacion puede
        /// resolverse desde <c>azdoOrg</c>, <c>azdoContext</c>, headers o configuracion.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion usado para operaciones externas.</param>
        /// <returns>
        /// <c>200</c> con identificadores y URLs creadas, <c>400</c> por JSON invalido, PAT/campos faltantes o
        /// validaciones de work item, <c>401/403</c> por autorizacion Azure DevOps, <c>408</c> por timeout y <c>5xx</c>
        /// ante errores externos o internos.
        /// </returns>
        [Function("CreateAzureDevOpsItems")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/create")] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var endpoint = "v1.0.0/create";
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
                requiredBody: true,
                maxBodyBytes: _requestLimits.WorkItemBodyBytes,
                cancellationToken);
            if (!bodyRead.Succeeded)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(bodyRead.Error!, bodyRead.StatusCode),
                    bodyRead.StatusCode);
            }

            requestBodyText = bodyRead.Body;
            CreateWorkItemPayload? payload;
            try
            {
                payload = JsonSerializer.Deserialize<CreateWorkItemPayload>(requestBodyText, _requestValidation.JsonOptions);
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
                    new { clientApp });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }
            resolvedContext = _requestValidation.ResolveAzdoContext(request, requestBodyText);

            var organization = payload?.AzdoOrg?.Trim();
            var project = payload?.AzdoProject?.Trim();

            if (string.IsNullOrWhiteSpace(organization))
                organization = resolvedContext.Organization;

            resolvedContext = new ResolvedAzdoContext
            {
                Organization = organization ?? string.Empty,
                AzurePath = resolvedContext.AzurePath
            };

            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
            {
                _logger.LogWarning(
                    "Solicitud rechazada por falta de PAT. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}",
                    correlationId,
                    clientApp);
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            if (payload is null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "El body es requerido y debe ser JSON valido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            if (string.IsNullOrWhiteSpace(organization))
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "azdoOrg es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            if (string.IsNullOrWhiteSpace(project))
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "azdoProject es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            if (payload?.Hu is null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "El JSON debe contener hu."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateOrganization(organization, correlationId),
                _requestValidation.ValidateProject(project, correlationId),
                _requestValidation.ValidateWorkItemPayload(payload, correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var planId = payload.TestSuite?.PlanId ?? 0;
            if (payload.TestCases is { Count: > 0 } && planId <= 0)
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "testSuite.planId es requerido cuando testCases contiene elementos."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            if (payload.TestCases is { Count: > 0 } && string.IsNullOrWhiteSpace(payload.IterationPath))
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "iterationPath es requerido cuando testCases contiene elementos."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var organizationValue = organization.Trim();
            var projectValue = project.Trim();

            try
            {
                var responseBody = await _createAzureDevOpsItemsUseCase.ExecuteAsync(
                    new CreateAzureDevOpsItemsCommand(
                        organizationValue,
                        projectValue,
                        azurePat,
                        payload,
                        correlationId,
                        clientApp),
                    cancellationToken);

                var statusCode = responseBody.OperationStatus == "partial"
                    ? StatusCodes.Status207MultiStatus
                    : StatusCodes.Status200OK;
                return Respond(
                    new ObjectResult(responseBody) { StatusCode = statusCode },
                    statusCode);
            }
            catch (WorkItemFieldNotAllowedException ex)
            {
                _logger.LogWarning(
                    "Solicitud rechazada por campos dinamicos no permitidos. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Organization: {Organization}. Project: {Project}. InvalidFields: {InvalidFields}",
                    correlationId,
                    clientApp,
                    organization,
                    project,
                    ex.FieldNames);

                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.WorkItemFieldNotAllowed(correlationId, ex.Message),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }
            catch (WorkItemValidationException ex)
            {
                var errorBody = ErrorResponseFactory.Validation(
                    correlationId,
                    "Faltan campos requeridos para crear el Work Item.");

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }
            catch (ArgumentException ex)
            {
                var errorBody = ErrorResponseFactory.Validation(correlationId, ex.Message);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
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
                    new { clientApp, organization, project });

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
                    new { clientApp, organization, project });

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
                    new { clientApp, organization, project });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
        }

    }
}
