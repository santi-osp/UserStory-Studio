namespace API_HistoriasUsuarioIA_funcion;

public static class AzdoPathHelper
{
    public static string NormalizePath(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var normalized = value.Trim().Replace('\\', '/');
        while (normalized.Contains("//", StringComparison.Ordinal))
            normalized = normalized.Replace("//", "/", StringComparison.Ordinal);

        return normalized.Trim('/');
    }

    public static bool MatchesAzurePath(string candidatePath, string azurePathFilter)
    {
        var candidate = NormalizePath(candidatePath);
        var filter = NormalizePath(azurePathFilter);

        if (string.IsNullOrEmpty(candidate))
            return false;

        if (string.IsNullOrEmpty(filter))
            return true;

        return candidate.StartsWith(filter, StringComparison.OrdinalIgnoreCase)
            || filter.StartsWith(candidate, StringComparison.OrdinalIgnoreCase);
    }
}
