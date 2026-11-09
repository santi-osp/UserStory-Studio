namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Lee prompts centralizados por nombre logico.
    /// </summary>
    public interface IPromptProvider
    {
        Task<string> GetPromptAsync(string promptName, CancellationToken cancellationToken = default);
    }
}
