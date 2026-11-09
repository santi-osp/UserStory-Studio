using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Common;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;

/// <summary>
/// Orquesta la generacion con los prompts completos del cliente y valida el JSON resultante.
/// </summary>
public sealed class GenerateWorkItemUseCase : IGenerateWorkItemUseCase
{
    private readonly IWorkItemGenerationAiGateway _aiGateway;
    private readonly ILogger<GenerateWorkItemUseCase> _logger;
    private readonly JsonPayloadSerializer _jsonSerializer;
    private readonly TestCaseContentValidator _testCaseValidator;

    public GenerateWorkItemUseCase(
        IWorkItemGenerationAiGateway aiGateway,
        ILogger<GenerateWorkItemUseCase> logger,
        JsonPayloadSerializer jsonSerializer,
        TestCaseContentValidator testCaseValidator)
    {
        _aiGateway = aiGateway;
        _logger = logger;
        _jsonSerializer = jsonSerializer;
        _testCaseValidator = testCaseValidator;
    }

    public async Task<GenerateWorkItemUseCaseResponse> ExecuteAsync(
        GenerateWorkItemCommand command,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Inicio generacion con IA. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Model: {Model}. PromptChars: {PromptChars}. SystemPromptChars: {SystemPromptChars}",
            command.CorrelationId,
            command.ClientApp,
            string.IsNullOrWhiteSpace(command.RequestedModel) ? "(default)" : command.RequestedModel,
            command.Prompt.Trim().Length,
            command.SystemPrompt.Trim().Length);

        var result = await _aiGateway.GenerateAsync(
            command.Prompt,
            command.SystemPrompt,
            command.RequestedModel,
            "GenerateWorkItem",
            cancellationToken);

        try
        {
            var parsedPayload = JsonSerializer.Deserialize<WorkItemPayload>(
                result.JsonPayloadText,
                _jsonSerializer.Options);

            if (parsedPayload?.WorkItem is null
                || !_testCaseValidator.AreValid(parsedPayload.TestCases, requireAny: false))
            {
                _logger.LogWarning(
                    "JSON generado sin seccion workItem valida. CorrelationId: {CorrelationId}. JsonChars: {JsonChars}",
                    command.CorrelationId,
                    result.JsonPayloadText.Length);

                throw new WorkItemGenerationInvalidResponseException();
            }

            _logger.LogInformation(
                "Generacion completada y validada. CorrelationId: {CorrelationId}. WorkItemType: {WorkItemType}. TestCases: {TestCases}. JsonChars: {JsonChars}. RawChars: {RawChars}",
                command.CorrelationId,
                parsedPayload.WorkItemType,
                parsedPayload.TestCases?.Count ?? 0,
                result.JsonPayloadText.Length,
                result.RawOutputText.Length);

            return new GenerateWorkItemUseCaseResponse
            {
                Json = result.JsonPayloadText,
                Raw = result.RawOutputText
            };
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(
                "No se pudo deserializar la salida generada a WorkItemPayload. CorrelationId: {CorrelationId}. JsonChars: {JsonChars}. ExceptionType: {ExceptionType}",
                command.CorrelationId,
                result.JsonPayloadText.Length,
                ex.GetType().Name);

            throw new WorkItemGenerationInvalidResponseException();
        }
    }

}
