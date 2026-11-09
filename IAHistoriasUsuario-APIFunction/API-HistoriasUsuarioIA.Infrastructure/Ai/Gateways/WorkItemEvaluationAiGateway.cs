using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai.Gateways;

public sealed class WorkItemEvaluationAiGateway : IWorkItemEvaluationAiGateway
{
    private readonly IAiJsonGenerator _aiJsonGenerator;
    private readonly JsonPayloadSerializer _jsonSerializer;

    public WorkItemEvaluationAiGateway(
        IAiJsonGenerator aiJsonGenerator,
        JsonPayloadSerializer jsonSerializer)
    {
        _aiJsonGenerator = aiJsonGenerator;
        _jsonSerializer = jsonSerializer;
    }

    public async Task<WorkItemEvaluationAiResponse> EvaluateAsync(
        AzdoWorkItemDetails workItem,
        string? prompt,
        string? systemPrompt,
        string? requestedModel,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(prompt))
            throw new ArgumentException("prompt es requerido para evaluar work items.", nameof(prompt));
        if (string.IsNullOrWhiteSpace(systemPrompt))
            throw new ArgumentException("systemPrompt es requerido para evaluar work items.", nameof(systemPrompt));

        var result = await _aiJsonGenerator.GenerateJsonAsync(
            new AiJsonGenerationRequest(
                systemPrompt,
                BuildWorkItemEvaluationPrompt(workItem, prompt),
                requestedModel,
                "EvaluateWorkItem"),
            cancellationToken);

        return new WorkItemEvaluationAiResponse(result.Model, result.JsonPayloadText);
    }

    private string BuildWorkItemEvaluationPrompt(AzdoWorkItemDetails workItem, string prompt)
    {
        var payload = new
        {
            instruction = prompt.Trim(),
            workItem = new
            {
                id = workItem.Id,
                title = workItem.Title,
                description = workItem.Description,
                acceptanceCriteria = workItem.AcceptanceCriteria,
                workItemType = workItem.WorkItemType,
                state = workItem.State,
                areaPath = workItem.AreaPath,
                iterationPath = workItem.IterationPath,
                priority = workItem.Priority,
                storyPoints = workItem.StoryPoints,
                functionalFields = workItem.FunctionalFields
            }
        };
        return JsonSerializer.Serialize(payload, _jsonSerializer.Options);
    }
}
