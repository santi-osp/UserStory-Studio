using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que evalua un Work Item existente con el proveedor de IA configurado.
    /// </summary>
    /// <remarks>
    /// Consulta solo campos del work item, no trae discusiones, comentarios ni historial, y no devuelve prompt ni
    /// salida cruda del modelo al frontend.
    /// </remarks>
    public class EvaluateWorkItemFunction
    {
        private const string EndpointRoute = "v1.0.0/azdo/hu/evaluate";

        private readonly ILogger<EvaluateWorkItemFunction> _logger;
        private readonly IEvaluateWorkItemUseCase _evaluateWorkItemUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public EvaluateWorkItemFunction(
            ILogger<EvaluateWorkItemFunction> logger,
            IEvaluateWorkItemUseCase evaluateWorkItemUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _evaluateWorkItemUseCase = evaluateWorkItemUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/azdo/hu/evaluate</c> y devuelve una evaluaciÃ³n funcional estructurada.
        /// </summary>
        [Function("EvaluateWorkItem")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = EndpointRoute)] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var correlationId = _requestValidation.Prepare(request);
            var clientApp = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader);
            var resolvedContext = new ResolvedAzdoContext();
            var requestBodyText = string.Empty;

            IActionResult Respond(IActionResult result, int statusCode)
            {
                _errorLogging.LogResponseWithBody(
                    _logger,
                    EndpointRoute,
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
                maxBodyBytes: _requestLimits.AiBodyBytes,
                cancellationToken);
            if (!bodyRead.Succeeded)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(bodyRead.Error!, bodyRead.StatusCode),
                    bodyRead.StatusCode);
            }

            requestBodyText = bodyRead.Body;
            resolvedContext = _requestValidation.ResolveAzdoContext(request, requestBodyText);

            EvaluateWorkItemRequest? evaluationRequest;
            try
            {
                if (ContainsForbiddenDiscussionFlag(requestBodyText))
                {
                    return Respond(
                        ErrorResponseFactory.ToActionResult(
                            ErrorResponseFactory.Validation(correlationId, "El request de evaluaciÃ³n no debe incluir includeDiscussionComments."),
                            StatusCodes.Status400BadRequest),
                        StatusCodes.Status400BadRequest);
                }

                evaluationRequest = JsonSerializer.Deserialize<EvaluateWorkItemRequest>(
                    requestBodyText,
                    _requestValidation.JsonOptions);
            }
            catch (JsonException ex)
            {
                var errorBody = ErrorResponseFactory.InvalidJson(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest), StatusCodes.Status400BadRequest);
            }

            if (evaluationRequest is null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "El body es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var workItemIdValidationError = _requestValidation.ValidateWorkItemId(evaluationRequest.WorkItemId, correlationId);
            if (workItemIdValidationError is not null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(workItemIdValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var organizationValidationError = _requestValidation.ValidateOrganization(resolvedContext.Organization, correlationId);
            if (organizationValidationError is not null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(organizationValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var project = evaluationRequest.AzdoProject.Trim();
            if (string.IsNullOrWhiteSpace(project))
                project = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoProjectHeader);

            if (string.IsNullOrWhiteSpace(project))
                project = AzdoProjectResolver.ExtractProjectFromAzurePath(resolvedContext.AzurePath);

            if (string.IsNullOrWhiteSpace(project))
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "azdoProject es requerido para evaluar el Work Item."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateProject(project, correlationId),
                _requestValidation.ValidateModel(evaluationRequest.RequestedModel, correlationId),
                _requestValidation.ValidateRequiredText(
                    evaluationRequest.Prompt,
                    "prompt",
                    _requestValidation.MaxPromptLength,
                    correlationId,
                    allowLineBreaks: true),
                _requestValidation.ValidateRequiredText(
                    evaluationRequest.SystemPrompt,
                    "systemPrompt",
                    _requestValidation.MaxPromptLength,
                    correlationId,
                    allowLineBreaks: true),
                _requestValidation.ValidateOptionalPath(resolvedContext.AzurePath, "azurePath", correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _evaluateWorkItemUseCase.ExecuteAsync(
                    new EvaluateWorkItemCommand(
                        resolvedContext.Organization,
                        project,
                        evaluationRequest.WorkItemId,
                        evaluationRequest.RequestedModel,
                        evaluationRequest.Prompt,
                        evaluationRequest.SystemPrompt,
                        azurePat,
                        correlationId,
                        clientApp),
                    cancellationToken);

                return Respond(new OkObjectResult(responseBody), StatusCodes.Status200OK);
            }
            catch (WorkItemEvaluationInvalidResponseException ex)
            {
                var errorBody = ErrorResponseFactory.AiInvalidResponse(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        project,
                        evaluationRequest.WorkItemId,
                        ex.Model,
                        jsonPayloadChars = ex.JsonPayloadLength
                    });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status502BadGateway),
                    StatusCodes.Status502BadGateway);
            }
            catch (ArgumentException ex)
            {
                var errorBody = ErrorResponseFactory.Validation(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
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
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, statusCode), statusCode);
            }
            catch (AiInvalidResponseException ex)
            {
                var errorBody = ErrorResponseFactory.AiInvalidResponse(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger, ex, EndpointRoute, correlationId, requestBodyText, errorBody,
                    new { provider = ex.Provider });
                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }
            catch (AiConfigurationException ex)
            {
                var errorBody = ErrorResponseFactory.Configuration(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError), StatusCodes.Status500InternalServerError);
            }
            catch (AiProviderHttpException ex)
            {
                var statusCode = ExternalStatusCodeMapper.Map(ex.StatusCode ?? StatusCodes.Status502BadGateway);
                var errorBody = ErrorResponseFactory.AiProvider(ex, correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project, externalStatusCode = ex.StatusCode });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, statusCode), statusCode);
            }
            catch (AiProviderTimeoutException ex)
            {
                var errorBody = ErrorResponseFactory.AiTimeout(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger, ex, EndpointRoute, correlationId, requestBodyText, errorBody,
                    new { provider = ex.Provider });
                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout),
                    StatusCodes.Status408RequestTimeout);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                var errorBody = ErrorResponseFactory.Timeout(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout), StatusCodes.Status408RequestTimeout);
            }
            catch (Exception ex)
            {
                var errorBody = ErrorResponseFactory.Unexpected(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError), StatusCodes.Status500InternalServerError);
            }
        }

        private bool ContainsForbiddenDiscussionFlag(string requestBodyText)
        {
            if (string.IsNullOrWhiteSpace(requestBodyText))
                return false;

            using var doc = JsonDocument.Parse(
                requestBodyText,
                new JsonDocumentOptions { MaxDepth = _requestValidation.JsonOptions.MaxDepth });
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                return false;

            return doc.RootElement.EnumerateObject().Any(property =>
                property.NameEquals("includeDiscussionComments")
                || property.Name.Equals("includeDiscussionComments", StringComparison.OrdinalIgnoreCase));
        }
    }
}
