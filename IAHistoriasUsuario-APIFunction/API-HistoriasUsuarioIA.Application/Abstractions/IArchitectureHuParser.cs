namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para convertir markdown de arquitectura en una jerarquia intermedia.
/// </summary>
public interface IArchitectureHuParser
{
    ParsedIntegracionArquitecturaHUDocument Parse(string markdown);
}
