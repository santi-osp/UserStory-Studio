using API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;

namespace API_HistoriasUsuarioIA_funcion.Application.Abstractions;

/// <summary>
/// Puerto de Application para crear una jerarquía arquitectura-HU en Azure DevOps.
/// </summary>
public interface IAzureDevOpsArchitectureWorkItemGateway
{
    Task<IntegracionArquitecturaHUCreateResponse> CreateHierarchyAsync(
        IntegrateArchitectureHuCommand command,
        ParsedIntegracionArquitecturaHUDocument parsedDocument,
        CancellationToken cancellationToken);
}
