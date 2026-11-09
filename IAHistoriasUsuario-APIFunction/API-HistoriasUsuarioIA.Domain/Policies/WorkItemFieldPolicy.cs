namespace API_HistoriasUsuarioIA_funcion.Domain.Policies;

using System.Text.RegularExpressions;

/// <summary>
/// Valida los campos permitidos dentro de <c>hu</c>.
/// </summary>
public sealed class WorkItemFieldPolicy : IWorkItemFieldPolicy
{
    private const string AllowedReferenceNameExpression =
        @"^(?:System|Microsoft|Custom)\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$";
    private static readonly HashSet<string> BlockedFieldKeys = BuildBlockedFieldKeys();
    private static readonly HashSet<string> BaseHuFieldKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "title",
        "description",
        "acceptanceCriteria"
    };

    private static readonly HashSet<string> LegacyAliasKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "assignedTo",
        "startDate",
        "finishDate",
        "valueArea",
        "priority",
        "risk",
        "storyPoints",
        "tipoHU",
        "frenteDeTrabajo"
    };

    private static readonly HashSet<string> InfrastructureFieldKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "areaPath",
        "iterationPath",
        "workItemType",
        "testCases",
        "testSuite",
        "System.AreaPath",
        "System.IterationPath",
        "System.WorkItemType",
        "System.TeamProject",
        "System.State",
        "System.Reason"
    };

    private readonly int _maxReferenceNameLength;
    private readonly Regex _allowedReferenceNamePattern;

    public WorkItemFieldPolicy(int maxReferenceNameLength, TimeSpan regexTimeout)
    {
        if (maxReferenceNameLength <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxReferenceNameLength));
        if (regexTimeout <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(regexTimeout));

        _maxReferenceNameLength = maxReferenceNameLength;
        _allowedReferenceNamePattern = new Regex(
            AllowedReferenceNameExpression,
            RegexOptions.CultureInvariant,
            regexTimeout);
    }

    public bool ContainsBlockedField(IEnumerable<string> additionalFieldNames)
    {
        ArgumentNullException.ThrowIfNull(additionalFieldNames);

        return additionalFieldNames
            .Where(fieldName => !string.IsNullOrWhiteSpace(fieldName))
            .Select(Normalize)
            .Any(BlockedFieldKeys.Contains);
    }

    public WorkItemFieldPolicyResult ValidateHuFieldNames(IEnumerable<string> fieldNames)
    {
        ArgumentNullException.ThrowIfNull(fieldNames);

        var emptyFields = new List<string>();
        var legacyAliases = new List<string>();
        var infrastructureFields = new List<string>();
        var blockedFields = new List<string>();
        var invalidReferenceNames = new List<string>();

        foreach (var rawFieldName in fieldNames)
        {
            var fieldName = rawFieldName?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(fieldName))
            {
                emptyFields.Add(fieldName);
                continue;
            }

            if (BaseHuFieldKeys.Contains(fieldName))
                continue;

            if (LegacyAliasKeys.Contains(fieldName))
            {
                legacyAliases.Add(fieldName);
                continue;
            }

            if (InfrastructureFieldKeys.Contains(fieldName))
            {
                infrastructureFields.Add(fieldName);
                continue;
            }

            if (BlockedFieldKeys.Contains(Normalize(fieldName)))
            {
                blockedFields.Add(fieldName);
                continue;
            }

            if (!IsAllowedReferenceName(fieldName))
                invalidReferenceNames.Add(fieldName);
        }

        if (emptyFields.Count > 0)
            return WorkItemFieldPolicyResult.Invalid("La HU contiene una clave vacia o invalida.", emptyFields);

        if (legacyAliases.Count > 0)
            return WorkItemFieldPolicyResult.Invalid(
                "La HU contiene aliases legacy no permitidos. Usa referenceName de Azure DevOps.",
                legacyAliases);

        if (infrastructureFields.Count > 0)
            return WorkItemFieldPolicyResult.Invalid(
                "La HU contiene campos de infraestructura no permitidos. Usa areaPath, iterationPath y workItemType en la raiz del request.",
                infrastructureFields);

        if (blockedFields.Count > 0)
            return WorkItemFieldPolicyResult.Invalid(
                "La HU contiene campos protegidos de Azure DevOps no permitidos para creacion.",
                blockedFields);

        if (invalidReferenceNames.Count > 0)
            return WorkItemFieldPolicyResult.Invalid(
                "La HU contiene campos dinamicos invalidos. Usa referenceName de Azure DevOps con prefijo System., Microsoft. o Custom.",
                invalidReferenceNames);

        return WorkItemFieldPolicyResult.Valid;
    }

    private static HashSet<string> BuildBlockedFieldKeys()
    {
        string[] blockedReferenceNames =
        [
            "System.CreatedBy",
            "System.ChangedBy",
            "System.CreatedDate",
            "System.ChangedDate",
            "System.AuthorizedAs",
            "System.AuthorizedDate",
            "System.Rev",
            "System.Id",
            "System.Watermark",
            "System.BoardColumn",
            "System.BoardColumnDone",
            "System.State",
            "System.Reason",
            "System.ActivatedBy",
            "System.ActivatedDate",
            "System.ResolvedBy",
            "System.ResolvedDate",
            "System.ClosedBy",
            "System.ClosedDate",
            "Microsoft.VSTS.Common.StateChangeDate"
        ];

        var blockedKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var referenceName in blockedReferenceNames)
        {
            blockedKeys.Add(Normalize(referenceName));

            var separatorIndex = referenceName.LastIndexOf('.');
            if (separatorIndex >= 0 && separatorIndex < referenceName.Length - 1)
                blockedKeys.Add(Normalize(referenceName[(separatorIndex + 1)..]));
        }

        return blockedKeys;
    }

    private bool IsAllowedReferenceName(string value)
    {
        return value.Length <= _maxReferenceNameLength
            && _allowedReferenceNamePattern.IsMatch(value);
    }

    private static string Normalize(string value)
    {
        var characters = value
            .Where(char.IsLetterOrDigit)
            .Select(char.ToLowerInvariant)
            .ToArray();

        return new string(characters);
    }
}
