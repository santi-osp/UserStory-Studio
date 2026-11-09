namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

public static class AzureDevOpsErrorMessageSanitizer
{
    private const int Status401Unauthorized = 401;
    private const int Status403Forbidden = 403;
    private const int Status408RequestTimeout = 408;

    public static string ToSafeCreationMessage(Exception exception)
    {
        if (exception is not AzDoRequestException azdoException)
            return "Ocurrio un error inesperado procesando la solicitud.";

        return azdoException.StatusCode switch
        {
            Status401Unauthorized or Status403Forbidden =>
                "No fue posible autorizar la operacion contra Azure DevOps. Verifica las credenciales y permisos.",
            Status408RequestTimeout =>
                "Azure DevOps tardo demasiado en responder.",
            _ =>
                "No fue posible completar la operacion contra Azure DevOps."
        };
    }

    public static string ToSafeMutationDetail(
        AzDoRequestException exception,
        int maxDetailLength,
        int maxJsonDepth)
    {
        var detail = ExtractSafeDetail(exception.ResponseBody, maxDetailLength, maxJsonDepth);
        return string.IsNullOrWhiteSpace(detail)
            ? $"Azure DevOps rechazo la operacion con estado {exception.StatusCode}."
            : detail;
    }

    public static bool IndicatesNameConflict(string responseBody, int maxDetailLength, int maxJsonDepth)
    {
        var detail = ExtractSafeDetail(responseBody, maxDetailLength, maxJsonDepth);
        return detail.Contains("already exists", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("ya existe", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("mismo nombre", StringComparison.OrdinalIgnoreCase);
    }

    private static string ExtractSafeDetail(string responseBody, int maxDetailLength, int maxJsonDepth)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
            return string.Empty;

        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(
                responseBody,
                new System.Text.Json.JsonDocumentOptions { MaxDepth = maxJsonDepth });
            var root = document.RootElement;
            var parts = new List<string>();
            AddString(root, "message", parts);
            AddString(root, "typeName", parts);
            AddString(root, "errorCode", parts);
            var detail = string.Join(" ", parts.Distinct(StringComparer.OrdinalIgnoreCase));
            return ContainsSensitiveDetail(detail)
                ? string.Empty
                : Limit(RemoveControlCharacters(detail), maxDetailLength);
        }
        catch (System.Text.Json.JsonException)
        {
            return string.Empty;
        }
    }

    private static void AddString(System.Text.Json.JsonElement root, string propertyName, ICollection<string> parts)
    {
        if (root.TryGetProperty(propertyName, out var value))
        {
            var text = value.ValueKind == System.Text.Json.JsonValueKind.String
                ? value.GetString()
                : value.ValueKind == System.Text.Json.JsonValueKind.Number
                    ? value.GetRawText()
                    : null;
            if (!string.IsNullOrWhiteSpace(text))
                parts.Add(text.Trim());
        }
    }

    private static string Limit(string value, int maxDetailLength) =>
        value.Length <= maxDetailLength ? value : value[..maxDetailLength];

    private static bool ContainsSensitiveDetail(string value) =>
        value.Contains("http://", StringComparison.OrdinalIgnoreCase)
        || value.Contains("https://", StringComparison.OrdinalIgnoreCase)
        || value.Contains("Bearer ", StringComparison.OrdinalIgnoreCase)
        || value.Contains("Basic ", StringComparison.OrdinalIgnoreCase)
        || value.Contains("api key", StringComparison.OrdinalIgnoreCase)
        || value.Contains("apikey", StringComparison.OrdinalIgnoreCase)
        || value.Contains("password", StringComparison.OrdinalIgnoreCase)
        || value.Contains("client secret", StringComparison.OrdinalIgnoreCase)
        || value.Contains("personal access token", StringComparison.OrdinalIgnoreCase)
        || value.Contains("azure pat", StringComparison.OrdinalIgnoreCase)
        || value.Contains("x-azdo-pat", StringComparison.OrdinalIgnoreCase);

    private static string RemoveControlCharacters(string value) =>
        new(value.Where(character => !char.IsControl(character) || character == ' ').ToArray());
}
