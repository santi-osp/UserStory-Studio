using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que analiza hojas de vida con el proveedor de IA configurado.
    /// </summary>
    /// <remarks>
    /// Este endpoint se expone sin Function Key y conserva todas sus validaciones funcionales.
    /// El texto del CV se trunca antes de construir el prompt para controlar el tamano enviado al modelo.
    /// </remarks>
    public class AnalyzeCvFunction
    {
        private const string EndpointRoute = "v1.0.0/cv/analyze";

        private readonly ILogger<AnalyzeCvFunction> _logger;
        private readonly IAnalyzeCvUseCase _analyzeCvUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;
        public AnalyzeCvFunction(
            ILogger<AnalyzeCvFunction> logger,
            IAnalyzeCvUseCase analyzeCvUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _analyzeCvUseCase = analyzeCvUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST</c> sobre <c>v1.0.0/cv/analyze</c>.
        /// </summary>
        /// <param name="request">
        /// Solicitud con body <see cref="CvAnalysisRequest"/>. El campo <c>text</c> es obligatorio; <c>model</c>,
        /// <c>fileName</c>, <c>source</c> y <c>pageCount</c> ajustan metadata y modelo usado.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion propagado al proveedor de IA.</param>
        /// <returns>
        /// <c>200</c> con <see cref="CvAnalysisResponse"/>, <c>400</c> por payload
        /// invalido, <c>408</c> por timeout, <c>502</c> si la IA no devuelve el esquema esperado y <c>5xx</c> por
        /// errores de configuracion o internos.
        /// </returns>
        [Function("AnalyzeCvFeedback")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = EndpointRoute)] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var correlationId = _requestValidation.Prepare(request);
            var clientApp = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader);
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
                        durationMs = startedAt.ElapsedMilliseconds
                    });
                return result;
            }

            var bodyRead = await _requestValidation.ReadBodyAsync(
                request,
                correlationId,
                requiredBody: true,
                maxBodyBytes: _requestLimits.CvBodyBytes,
                cancellationToken);
            if (!bodyRead.Succeeded)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(bodyRead.Error!, bodyRead.StatusCode),
                    bodyRead.StatusCode);
            }

            requestBodyText = bodyRead.Body;

            CvAnalysisRequest? cvRequest;
            try
            {
                cvRequest = JsonSerializer.Deserialize<CvAnalysisRequest>(requestBodyText, _requestValidation.JsonOptions);
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
                    new { clientApp });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest), StatusCodes.Status400BadRequest);
            }

            if (cvRequest is null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "La solicitud no contiene un payload valido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateRequiredText(
                    cvRequest.Text,
                    "text",
                    _requestValidation.MaxCvTextLength,
                    correlationId,
                    allowLineBreaks: true),
                _requestValidation.ValidateOptionalText(
                    cvRequest.FileName,
                    "fileName",
                    _requestValidation.MaxTitleLength,
                    correlationId),
                _requestValidation.ValidateOptionalText(
                    cvRequest.Source,
                    "source",
                    _requestValidation.MaxProjectLength,
                    correlationId),
                _requestValidation.ValidateCvPageCount(cvRequest.PageCount, correlationId),
                _requestValidation.ValidateModel(cvRequest.Model, correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _analyzeCvUseCase.ExecuteAsync(
                    new AnalyzeCvCommand(
                        cvRequest.Text ?? string.Empty,
                        cvRequest.Model,
                        cvRequest.FileName,
                        cvRequest.Source,
                        cvRequest.PageCount,
                        correlationId,
                        clientApp),
                    cancellationToken);

                return Respond(new OkObjectResult(responseBody), StatusCodes.Status200OK);
            }
            catch (CvAnalysisInvalidResponseException ex)
            {
                var errorBody = ErrorResponseFactory.AiInvalidResponse(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status502BadGateway),
                    StatusCodes.Status502BadGateway);
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
                    new { clientApp });

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
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
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
                    _logger, ex, EndpointRoute, correlationId, requestBodyText, errorBody,
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
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp });

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
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError),
                    StatusCodes.Status500InternalServerError);
            }
        }

    }
}
