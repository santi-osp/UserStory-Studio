using System.Xml;
using System.Xml.Linq;

namespace API_HistoriasUsuarioIA_funcion.Application.Common;

/// <summary>
/// Valida el subconjunto HTML que el frontend puede enviar a campos enriquecidos
/// de Azure DevOps. El contenido se rechaza, en lugar de repararse silenciosamente,
/// cuando contiene elementos, atributos o estructuras fuera del contrato.
/// </summary>
public static class WorkItemContentHtmlPolicy
{
    private static readonly HashSet<string> AllowedElements = new(StringComparer.Ordinal)
    {
        "p",
        "br",
        "strong",
        "em",
        "ul",
        "ol",
        "li"
    };

    public static bool IsSafe(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains('<'))
            return true;

        var normalized = value
            .Replace("<br>", "<br/>", StringComparison.Ordinal)
            .Replace("&nbsp;", "&#160;", StringComparison.OrdinalIgnoreCase);

        try
        {
            var settings = new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersFromEntities = 0,
                MaxCharactersInDocument = normalized.Length + 32
            };

            using var textReader = new StringReader($"<root>{normalized}</root>");
            using var xmlReader = XmlReader.Create(textReader, settings);
            var document = XDocument.Load(xmlReader, LoadOptions.PreserveWhitespace);
            var root = document.Root;
            if (root is null)
                return false;

            return root
                .DescendantNodes()
                .All(IsAllowedNode);
        }
        catch (XmlException)
        {
            return false;
        }
    }

    private static bool IsAllowedNode(XNode node)
    {
        if (node is XText)
            return true;

        if (node is not XElement element)
            return false;

        return element.Name.NamespaceName.Length == 0
            && AllowedElements.Contains(element.Name.LocalName)
            && !element.HasAttributes
            && (element.Name.LocalName != "br" || !element.Nodes().Any());
    }
}
