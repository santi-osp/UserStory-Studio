namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;

/// <summary>
/// Normaliza rutas de clasificacion con las mismas reglas usadas por el servicio Azure DevOps existente.
/// </summary>
public static class ArchitectureHuPathNormalizer
{
    public static string Normalize(string? path, string kind)
    {
        if (string.IsNullOrWhiteSpace(path))
            return string.Empty;

        var normalized = path.Trim().Replace('/', '\\');
        while (normalized.Contains("\\\\", StringComparison.Ordinal))
            normalized = normalized.Replace("\\\\", "\\", StringComparison.Ordinal);

        normalized = normalized.Trim('\\');
        if (string.IsNullOrWhiteSpace(normalized))
            return string.Empty;

        var segments = normalized
            .Split('\\', StringSplitOptions.RemoveEmptyEntries)
            .Select(segment => segment.Trim())
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .ToList();

        if (segments.Count == 0)
            return string.Empty;

        string[] technicalRoots = kind.Equals("iteration", StringComparison.OrdinalIgnoreCase)
            ? ["iteration", "iterations"]
            : ["area", "areas"];

        if (segments.Count > 1 && technicalRoots.Contains(segments[0], StringComparer.OrdinalIgnoreCase))
            segments.RemoveAt(0);

        if (segments.Count > 2 && technicalRoots.Contains(segments[1], StringComparer.OrdinalIgnoreCase))
            segments.RemoveAt(1);

        return string.Join("\\", segments);
    }
}
