using API_HistoriasUsuarioIA_funcion.Application.Abstractions;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Parsing;

/// <summary>
/// Adapter que expone el parser existente sin modificar sus reglas ni normalizaciones.
/// </summary>
public sealed class ArchitectureHuParserAdapter : IArchitectureHuParser
{
    public ParsedIntegracionArquitecturaHUDocument Parse(string markdown) =>
        IntegracionArquitecturaHUParser.Parse(markdown);
}
