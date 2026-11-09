using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que genera un payload JSON de historia de usuario usando el proveedor de IA configurado.
    /// </summary>
    /// <remarks>
    /// El endpoint es anonimo y transporta sin cambios los prompts completos del cliente.
    /// </remarks>
    public class GenerateWorkItemFunction
    {
        private readonly ILogger<GenerateWorkItemFunction> _logger;
        private readonly IGenerateWorkItemUseCase _generateWorkItemUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public GenerateWorkItemFunction(
            ILogger<GenerateWorkItemFunction> logger,
            IGenerateWorkItemUseCase generateWorkItemUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _generateWorkItemUseCase = generateWorkItemUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/generate</c> y devuelve el JSON generado para un Work Item.
        /// </summary>
        /// <param name="request">
        /// Solicitud HTTP con body <see cref="GenerateWorkItemRequest"/>.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion propagado al proveedor de IA.</param>
        /// <returns>
        /// <c>200</c> con <c>json</c> y <c>raw</c>, <c>400</c> si falta el prompt o el JSON generado no contiene Work Item,
        /// <c>408</c> por timeout y <c>5xx</c> ante errores de IA o internos.
        /// </returns>
        [Function("GenerateWorkItem")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/generate")] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var endpoint = "v1.0.0/generate";
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
            GenerateWorkItemRequest? generationRequest;
            try
            {
                generationRequest = JsonSerializer.Deserialize<GenerateWorkItemRequest>(
                    requestBodyText,
                    _requestValidation.JsonOptions);
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

            if (generationRequest is null || string.IsNullOrWhiteSpace(generationRequest.Prompt))
            {
                _logger.LogWarning(
                    "Solicitud rechazada por prompt vacio. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}",
                    correlationId,
                    clientApp);
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "El prompt es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateRequiredText(
                    generationRequest.Prompt,
                    "prompt",
                    _requestValidation.MaxPromptLength,
                    correlationId,
                    allowLineBreaks: true),
                _requestValidation.ValidateRequiredText(
                    generationRequest.SystemPrompt,
                    "systemPrompt",
                    _requestValidation.MaxPromptLength,
                    correlationId,
                    allowLineBreaks: true),
                _requestValidation.ValidateModel(generationRequest.Model, correlationId),
                _requestValidation.ValidateOptionalText(
                    resolvedContext.Organization,
                    "organization",
                    _requestValidation.MaxOrganizationLength,
                    correlationId),
                _requestValidation.ValidateOptionalPath(
                    resolvedContext.AzurePath,
                    "azurePath",
                    correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _generateWorkItemUseCase.ExecuteAsync(
                    new GenerateWorkItemCommand(
                        generationRequest.Prompt,
                        generationRequest.SystemPrompt!,
                        generationRequest.Model,
                        correlationId,
                        clientApp),
                    cancellationToken);

                return Respond(new OkObjectResult(responseBody), StatusCodes.Status200OK);
            }
            catch (WorkItemGenerationInvalidResponseException)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.AiInvalidResponse(correlationId),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }
            catch (AiInvalidResponseException ex)
            {
                var errorBody = ErrorResponseFactory.AiInvalidResponse(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger, ex, endpoint, correlationId, requestBodyText, errorBody,
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
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
            catch (AiProviderHttpException ex)
            {
                var statusCode = ExternalStatusCodeMapper.Map(ex.StatusCode ?? StatusCodes.Status502BadGateway);
                var errorBody = ErrorResponseFactory.AiProvider(ex, correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        externalStatusCode = ex.StatusCode
                    });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, statusCode),
                    statusCode);
            }
            catch (AiProviderTimeoutException ex)
            {
                var errorBody = ErrorResponseFactory.AiTimeout(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger, ex, endpoint, correlationId, requestBodyText, errorBody,
                    new { provider = ex.Provider });
                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout),
                    StatusCodes.Status408RequestTimeout);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                var errorBody = ErrorResponseFactory.AiTimeout(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization });

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
                    new { clientApp, resolvedContext.Organization });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
        }

    }
}
