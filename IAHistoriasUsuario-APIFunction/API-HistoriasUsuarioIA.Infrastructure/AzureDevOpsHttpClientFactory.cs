using System.Net.Http.Headers;
using System.Text;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Crea clientes HTTP de Azure DevOps con autenticacion Basic basada en PAT.
    /// </summary>
    public sealed class AzureDevOpsClientFactory : IAzureDevOpsClientFactory
    {
        private readonly IHttpClientFactory _httpClientFactory;

        public AzureDevOpsClientFactory(IHttpClientFactory httpClientFactory)
        {
            _httpClientFactory = httpClientFactory;
        }

        /// <inheritdoc />
        public HttpClient CreateAuthenticatedClient(string azurePat)
        {
            if (string.IsNullOrWhiteSpace(azurePat))
                throw new ArgumentException("azurePat es requerido.", nameof(azurePat));

            var client = _httpClientFactory.CreateClient("AzureDevOps");
            var encodedCredentials = Convert.ToBase64String(Encoding.ASCII.GetBytes($":{azurePat.Trim()}"));

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", encodedCredentials);
            if (!client.DefaultRequestHeaders.Accept.Any(
                    header => header.MediaType?.Equals("application/json", StringComparison.OrdinalIgnoreCase) == true))
            {
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            }

            return client;
        }
    }
}
