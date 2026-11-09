using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion;

/// <summary>Crea exclusivamente Test Cases dentro de una suite estatica nueva.</summary>
public sealed class CreateTestCasesFunction
{
    private readonly ICreateTestCasesUseCase _useCase;
    private readonly RequestLimitsOptions _requestLimits;
    private readonly ILogger<CreateTestCasesFunction> _logger;
    private readonly RequestValidationHelper _requestValidation;

    public CreateTestCasesFunction(
        ICreateTestCasesUseCase useCase,
        ILogger<CreateTestCasesFunction> logger,
        IOptions<RequestLimitsOptions> requestLimits,
        RequestValidationHelper requestValidation)
    {
        _useCase = useCase;
        _logger = logger;
        _requestLimits = requestLimits.Value;
        _requestValidation = requestValidation;
    }

    [Function("CreateTestCases")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/create-test-cases")] HttpRequest request,
        CancellationToken cancellationToken)
    {
        var correlationId = _requestValidation.Prepare(request);

        var azurePat = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzurePatHeader);
        var patError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
        if (patError is not null)
            return ErrorResponseFactory.ToActionResult(patError, StatusCodes.Status400BadRequest);

        var body = await _requestValidation.ReadBodyAsync(
            request,
            correlationId,
            requiredBody: true,
            maxBodyBytes: _requestLimits.WorkItemBodyBytes,
            cancellationToken);
        if (!body.Succeeded)
            return ErrorResponseFactory.ToActionResult(body.Error!, body.StatusCode);

        CreateTestCasesPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<CreateTestCasesPayload>(body.Body, _requestValidation.JsonOptions);
        }
        catch (JsonException)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.InvalidJson(correlationId),
                StatusCodes.Status400BadRequest);
        }

        if (payload is null)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.Validation(correlationId, "El body es requerido."),
                StatusCodes.Status400BadRequest);
        }

        var context = _requestValidation.ResolveAzdoContext(request, body.Body);
        var organization = string.IsNullOrWhiteSpace(payload.AzdoOrg)
            ? context.Organization
            : payload.AzdoOrg.Trim();
        var validation = _requestValidation.FirstError(
            _requestValidation.ValidateOrganization(organization, correlationId),
            _requestValidation.ValidateCreateTestCasesPayload(payload, correlationId));
        if (validation is not null)
            return ErrorResponseFactory.ToActionResult(validation, StatusCodes.Status400BadRequest);

        try
        {
            var response = await _useCase.ExecuteAsync(
                new CreateTestCasesCommand(
                    organization,
                    payload.AzdoProject.Trim(),
                    azurePat,
                    payload,
                    correlationId,
                    HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader)),
                cancellationToken);
            var status = response.OperationStatus == "partial"
                ? StatusCodes.Status207MultiStatus
                : StatusCodes.Status200OK;
            return new ObjectResult(response) { StatusCode = status };
        }
        catch (ArgumentException ex)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.Validation(correlationId, ex.Message),
                StatusCodes.Status400BadRequest);
        }
        catch (AzDoRequestException ex)
        {
            var status = ExternalStatusCodeMapper.Map(ex.StatusCode);
            return ErrorResponseFactory.ToActionResult(ErrorResponseFactory.AzureDevOps(ex, correlationId), status);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.AzureDevOpsTimeout(correlationId),
                StatusCodes.Status408RequestTimeout);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                "Fallo inesperado en create-test-cases. CorrelationId: {CorrelationId}. RequestedTestCases: {RequestedTestCases}. ExceptionType: {ExceptionType}",
                correlationId,
                payload.TestCases.Count,
                ex.GetType().Name);
            return ErrorResponseFactory.ToActionResult(
                ErrorResponseFactory.Unexpected(correlationId),
                StatusCodes.Status500InternalServerError);
        }
    }
}
