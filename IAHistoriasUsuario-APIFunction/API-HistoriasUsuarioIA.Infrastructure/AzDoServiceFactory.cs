using API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Construye instancias de <see cref="AzDoService"/> con cliente autenticado y version de API configurada.
    /// </summary>
    public sealed class AzDoServiceFactory : IAzDoServiceFactory
    {
        private readonly IAzureDevOpsClientFactory _clientFactory;
        private readonly AzureDevOpsOptions _options;
        private readonly ObservabilityOptions _observability;
        private readonly JsonPayloadSerializer _jsonSerializer;

        public AzDoServiceFactory(
            IAzureDevOpsClientFactory clientFactory,
            IOptions<AzureDevOpsOptions> options,
            IOptions<ObservabilityOptions> observability,
            JsonPayloadSerializer jsonSerializer)
        {
            _clientFactory = clientFactory;
            _options = options.Value;
            _observability = observability.Value;
            _jsonSerializer = jsonSerializer;
        }

        /// <inheritdoc />
        public IAzDoService Create(string organization, string project, string azurePat, ILogger? logger = null)
        {
            var client = _clientFactory.CreateAuthenticatedClient(azurePat);
            var normalizedOrganization = organization?.Trim() ?? string.Empty;
            var normalizedProject = project?.Trim() ?? string.Empty;
            return new AzDoService(
                normalizedOrganization,
                normalizedProject,
                client,
                AzureDevOpsProtocol.ApiVersion,
                logger,
                _options.Search.DefaultTop,
                _options.Search.MaxTop,
                _options.Queries.ProjectsTop,
                _options.Queries.ClassificationDepth,
                _options.Queries.CommentsTop,
                _options.Queries.TestPlansTop,
                _observability.MaxExternalErrorDetailLength,
                _jsonSerializer.Options);
        }
    }
}
