namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Fabrica clientes HTTP autenticados para Azure DevOps usando PAT por solicitud.
    /// </summary>
    public interface IAzureDevOpsClientFactory
    {
        /// <summary>
        /// Crea un cliente con autenticacion Basic compatible con Azure DevOps PAT.
        /// </summary>
        HttpClient CreateAuthenticatedClient(string azurePat);
    }
}
