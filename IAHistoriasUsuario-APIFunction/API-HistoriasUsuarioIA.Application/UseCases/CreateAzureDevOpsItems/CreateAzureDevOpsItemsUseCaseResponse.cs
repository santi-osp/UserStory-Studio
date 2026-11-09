using System.Text.Json.Serialization;
using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

/// <summary>
/// Resultado exitoso canonico de <c>v1.0.0/create</c>.
/// </summary>
public sealed class CreateAzureDevOpsItemsUseCaseResponse
{
    [JsonPropertyName("huId")]
    public int? HuId { get; init; }

    [JsonPropertyName("huUrl")]
    public string? HuUrl { get; init; }

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;

    [JsonPropertyName("operationStatus")]
    public string OperationStatus { get; init; } = "completed";

    [JsonPropertyName("suite")]
    public SuiteCreationResult? Suite { get; init; }

    [JsonPropertyName("createdTestCases")]
    public IReadOnlyList<CreatedWorkItem> CreatedTestCases { get; init; } = [];

    [JsonPropertyName("failedTestCases")]
    public IReadOnlyList<FailedTestCaseResult> FailedTestCases { get; init; } = [];

    [JsonPropertyName("warnings")]
    public IReadOnlyList<string> Warnings { get; init; } = [];

    [JsonPropertyName("plan")]
    public SelectedTestPlanResult? Plan { get; init; }
}

public sealed record SuiteCreationResult(
    int Id,
    string SuiteType,
    string RequestedBaseName,
    string FinalName,
    bool RenamedDueToDuplicate);

public sealed record SelectedTestPlanResult(int Id, string Name);

public sealed record FailedTestCaseResult(int Index, string Title, string Message, string Phase);
