namespace API_HistoriasUsuarioIA_funcion.Domain.Policies;

/// <summary>
/// Politica para validar campos dinamicos que provienen del cliente.
/// </summary>
public interface IWorkItemFieldPolicy
{
    bool ContainsBlockedField(IEnumerable<string> additionalFieldNames);

    WorkItemFieldPolicyResult ValidateHuFieldNames(IEnumerable<string> fieldNames);
}

public sealed record WorkItemFieldPolicyResult(
    bool IsValid,
    string Message,
    IReadOnlyList<string> InvalidFields)
{
    public static WorkItemFieldPolicyResult Valid { get; } = new(true, string.Empty, []);

    public static WorkItemFieldPolicyResult Invalid(string message, IReadOnlyList<string> invalidFields) =>
        new(false, message, invalidFields);
}
