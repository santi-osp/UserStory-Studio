using System.Text.RegularExpressions;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;

public static partial class TestSuiteNameResolver
{
    public static string NormalizeBaseTitle(string? title)
    {
        var normalized = ExternalWhitespace().Replace(title?.Trim() ?? string.Empty, " ");
        if (string.IsNullOrWhiteSpace(normalized))
            throw new ArgumentException("El titulo base de la suite es requerido.");
        return normalized;
    }

    public static (string BaseName, string FinalName, bool Renamed) Resolve(
        DateOnly utcDate,
        string title,
        IEnumerable<string> siblingNames)
    {
        var baseName = $"{utcDate:yyyy-MM-dd} - {NormalizeBaseTitle(title)}";
        var existing = siblingNames
            .Select(name => ExternalWhitespace().Replace(name.Trim(), " "))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!existing.Contains(baseName))
            return (baseName, baseName, false);

        for (var suffix = 2; ; suffix++)
        {
            var candidate = $"{baseName} ({suffix})";
            if (!existing.Contains(candidate))
                return (baseName, candidate, true);
        }
    }

    [GeneratedRegex(@"[ \t]+")]
    private static partial Regex ExternalWhitespace();
}
