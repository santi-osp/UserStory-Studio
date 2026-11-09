using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Utilidades para leer respuestas de OpenAI y aislar el JSON embebido en texto.
    /// </summary>
    public static class AiHelpers
    {
        /// <summary>
        /// Extrae texto de la estructura <c>output/content/text</c> devuelta por Responses API.
        /// </summary>
        public static string ExtractOutputText(JsonElement root)
        {
            var sb = new StringBuilder();
            if (root.TryGetProperty("output", out var output) && output.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in output.EnumerateArray())
                {
                    if (!item.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
                        continue;
                    foreach (var c in content.EnumerateArray())
                    {
                        if (c.TryGetProperty("text", out var text))
                            sb.AppendLine(text.GetString() ?? string.Empty);
                    }
                }
            }

            return sb.ToString().Trim();
        }

        /// <summary>
        /// Extrae JSON desde fenced code blocks o desde el primer objeto JSON encontrado en el texto.
        /// </summary>
        public static string ExtractJsonFromText(string rawText)
        {
            var match = Regex.Match(rawText, @"```json\s*([\s\S]*?)\s*```", RegexOptions.IgnoreCase);
            if (!match.Success)
                match = Regex.Match(rawText, @"```\s*([\s\S]*?)\s*```");
            if (match.Success)
                return match.Groups[1].Value.Trim();

            int start = rawText.IndexOf('{');
            int end = rawText.LastIndexOf('}');
            if (start >= 0 && end > start)
                return rawText[start..(end + 1)].Trim();

            return rawText.Trim();
        }
    }
}
