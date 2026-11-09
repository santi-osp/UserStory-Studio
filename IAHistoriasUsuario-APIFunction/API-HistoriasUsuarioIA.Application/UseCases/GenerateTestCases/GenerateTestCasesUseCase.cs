using System.Text.Json;
using System.Text.RegularExpressions;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateTestCases;

public sealed class GenerateTestCasesUseCase : IGenerateTestCasesUseCase
{
    private readonly IWorkItemGenerationAiGateway _aiGateway;
    private readonly ILogger<GenerateTestCasesUseCase> _logger;
    private readonly JsonPayloadSerializer _jsonSerializer;
    private readonly TestCaseContentValidator _testCaseValidator;

    public GenerateTestCasesUseCase(
        IWorkItemGenerationAiGateway aiGateway,
        ILogger<GenerateTestCasesUseCase> logger,
        JsonPayloadSerializer jsonSerializer,
        TestCaseContentValidator testCaseValidator)
    {
        _aiGateway = aiGateway;
        _logger = logger;
        _jsonSerializer = jsonSerializer;
        _testCaseValidator = testCaseValidator;
    }

    public async Task<GenerateWorkItemUseCaseResponse> ExecuteAsync(
        GenerateTestCasesCommand command,
        CancellationToken cancellationToken)
    {
        var generated = await _aiGateway.GenerateAsync(
            command.Prompt,
            command.SystemPrompt,
            command.RequestedModel,
            "GenerateTestCases",
            cancellationToken);
        try
        {
            var payload = JsonSerializer.Deserialize<GeneratedTestCasesPayload>(
                generated.JsonPayloadText,
                _jsonSerializer.Options);
            if (payload is null
                || string.IsNullOrWhiteSpace(payload.SuiteTitle)
                || Regex.IsMatch(payload.SuiteTitle.Trim(), @"^\d{4}-\d{2}-\d{2}\s+-", RegexOptions.CultureInvariant)
                || Regex.IsMatch(payload.SuiteTitle.Trim(), @"\(\d+\)$", RegexOptions.CultureInvariant)
                || !_testCaseValidator.AreValid(payload.TestCases, requireAny: true))
                throw new WorkItemGenerationInvalidResponseException();

            _logger.LogInformation(
                "Generacion exclusiva de Test Cases completada. CorrelationId: {CorrelationId}. TestCases: {TestCases}. JsonChars: {JsonChars}",
                command.CorrelationId,
                payload.TestCases.Count,
                generated.JsonPayloadText.Length);
            return new GenerateWorkItemUseCaseResponse
            {
                Json = generated.JsonPayloadText,
                Raw = generated.RawOutputText
            };
        }
        catch (JsonException)
        {
            throw new WorkItemGenerationInvalidResponseException();
        }
    }

}
