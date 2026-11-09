using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateTestCases;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion;

/// <summary>Genera exclusivamente un titulo base de suite y Test Cases de multiples pasos.</summary>
public sealed class GenerateTestCasesFunction
{
    private readonly IGenerateTestCasesUseCase _useCase;
    private readonly RequestLimitsOptions _requestLimits;
    private readonly ILogger<GenerateTestCasesFunction> _logger;
    private readonly RequestValidationHelper _requestValidation;
    private readonly ErrorLoggingHelper _errorLogging;

    public GenerateTestCasesFunction(
        IGenerateTestCasesUseCase useCase,
        ILogger<GenerateTestCasesFunction> logger,
        IOptions<RequestLimitsOptions> requestLimits,
        RequestValidationHelper requestValidation,
        ErrorLoggingHelper errorLogging)
    {
        _useCase = useCase;
        _logger = logger;
        _requestLimits = requestLimits.Value;
        _requestValidation = requestValidation;
        _errorLogging = errorLogging;
    }

    [Function("GenerateTestCases")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/generate-test-cases")] HttpRequest request,
        CancellationToken cancellationToken)
    {
        var correlationId = _requestValidation.Prepare(request);

        var body = await _requestValidation.ReadBodyAsync(
            request,
            correlationId,
            requiredBody: true,
            maxBodyBytes: _requestLimits.AiBodyBytes,
            cancellationToken);
        if (!body.Succeeded)
            return ErrorResponseFactory.ToActionResult(body.Error!, body.StatusCode);

        GenerateTestCasesRequest? generationRequest;
        try
        {
            generationRequest = JsonSerializer.Deserialize<GenerateTestCasesRequest>(body.Body, _requestValidation.JsonOptions);
        }
        catch (JsonException)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.InvalidJson(correlationId),
                StatusCodes.Status400BadRequest);
        }

        var validation = _requestValidation.FirstError(
            _requestValidation.ValidateRequiredText(
                generationRequest?.Prompt,
                "prompt",
                _requestValidation.MaxPromptLength,
                correlationId,
                allowLineBreaks: true),
            _requestValidation.ValidateRequiredText(
                generationRequest?.SystemPrompt,
                "systemPrompt",
                _requestValidation.MaxPromptLength,
                correlationId,
                allowLineBreaks: true),
            _requestValidation.ValidateModel(generationRequest?.Model, correlationId));
        if (validation is not null)
            return ErrorResponseFactory.ToActionResult(validation, StatusCodes.Status400BadRequest);

        try
        {
            var response = await _useCase.ExecuteAsync(
                new GenerateTestCasesCommand(
                    generationRequest!.Prompt,
                    generationRequest.SystemPrompt,
                    generationRequest.Model,
                    correlationId,
                    HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader)),
                cancellationToken);
            return new OkObjectResult(response);
        }
        catch (WorkItemGenerationInvalidResponseException)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.AiInvalidResponse(correlationId),
                StatusCodes.Status400BadRequest);
        }
        catch (AiInvalidResponseException)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.AiInvalidResponse(correlationId),
                StatusCodes.Status400BadRequest);
        }
        catch (AiConfigurationException)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.Configuration(correlationId),
                StatusCodes.Status500InternalServerError);
        }
        catch (AiProviderHttpException ex)
        {
            var status = ExternalStatusCodeMapper.Map(ex.StatusCode ?? StatusCodes.Status502BadGateway);
            return ErrorResponseFactory.ToActionResult(ErrorResponseFactory.AiProvider(ex, correlationId), status);
        }
        catch (AiProviderTimeoutException)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.AiTimeout(correlationId),
                StatusCodes.Status408RequestTimeout);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.AiTimeout(correlationId),
                StatusCodes.Status408RequestTimeout);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                "Fallo inesperado en generate-test-cases. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. ExceptionType: {ExceptionType}",
                correlationId,
                _errorLogging.RedactHeaderValue(
                    HttpResponseHeaderHelper.ClientAppHeader,
                    HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader)),
                ex.GetType().Name);
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.Unexpected(correlationId),
                StatusCodes.Status500InternalServerError);
        }
    }
}
