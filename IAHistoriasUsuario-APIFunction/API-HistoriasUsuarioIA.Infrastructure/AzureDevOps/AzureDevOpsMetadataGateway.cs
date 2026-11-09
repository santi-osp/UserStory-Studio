using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;
using Microsoft.Extensions.Logging;

namespace API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;

/// <summary>
/// Adaptador Azure DevOps para consultar proyectos, areas e iteraciones.
/// </summary>
public sealed class AzureDevOpsMetadataGateway : IAzureDevOpsMetadataGateway
{
    private readonly IAzDoServiceFactory _azdoServiceFactory;
    private readonly ILogger<AzureDevOpsMetadataGateway> _logger;

    public AzureDevOpsMetadataGateway(
        IAzDoServiceFactory azdoServiceFactory,
        ILogger<AzureDevOpsMetadataGateway> logger)
    {
        _azdoServiceFactory = azdoServiceFactory;
        _logger = logger;
    }

    public async Task<GetAzdoMetadataResponse> GetMetadataAsync(
        GetAzdoMetadataQuery query,
        CancellationToken cancellationToken)
    {
        var azdoService = _azdoServiceFactory.Create(
            query.Organization,
            string.Empty,
            query.AzurePat,
            _logger);

        var projects = await azdoService.GetProjectsAsync();
        var orderedProjects = projects
            .Where(project => !string.IsNullOrWhiteSpace(project))
            .Select(project => project.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(project => project, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var areaPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var iterationPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var projectMetadata = new List<GetAzdoProjectMetadata>();

        foreach (var project in orderedProjects)
        {
            var projectAreas = await azdoService.GetClassificationPathsAsync(project, "areas");
            var projectAreaPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in projectAreas)
            {
                var normalizedPath = AzdoPathHelper.NormalizePath(path);
                if (string.IsNullOrWhiteSpace(normalizedPath))
                    continue;

                projectAreaPaths.Add(normalizedPath);
                if (AzdoPathHelper.MatchesAzurePath(normalizedPath, query.AzurePath))
                    areaPaths.Add(normalizedPath);
            }

            var projectIterations = await azdoService.GetClassificationPathsAsync(project, "iterations");
            var projectIterationPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in projectIterations)
            {
                var normalizedPath = AzdoPathHelper.NormalizePath(path);
                if (string.IsNullOrWhiteSpace(normalizedPath))
                    continue;

                projectIterationPaths.Add(normalizedPath);
                if (AzdoPathHelper.MatchesAzurePath(normalizedPath, query.AzurePath))
                    iterationPaths.Add(normalizedPath);
            }

            projectMetadata.Add(new GetAzdoProjectMetadata
            {
                Project = project,
                AreaPaths = projectAreaPaths.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToArray(),
                IterationPaths = projectIterationPaths.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToArray()
            });
        }

        return new GetAzdoMetadataResponse
        {
            Projects = orderedProjects,
            AreaPaths = areaPaths
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            IterationPaths = iterationPaths
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            ProjectMetadata = projectMetadata
        };
    }
}
