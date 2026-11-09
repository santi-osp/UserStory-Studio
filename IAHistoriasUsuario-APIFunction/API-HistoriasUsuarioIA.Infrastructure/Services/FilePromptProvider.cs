namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Proveedor de prompts basado en archivos markdown copiados al output de la Function.
    /// </summary>
    public sealed class FilePromptProvider : IPromptProvider
    {
        private const string PromptsDirectoryName = "Prompts";

        public async Task<string> GetPromptAsync(string promptName, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(promptName))
                throw new ArgumentException("El nombre del prompt es requerido.", nameof(promptName));

            var promptsRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, PromptsDirectoryName));
            var normalizedPromptName = promptName
                .Trim()
                .Replace('\\', Path.DirectorySeparatorChar)
                .Replace('/', Path.DirectorySeparatorChar);
            var promptPath = Path.GetFullPath(Path.Combine(promptsRoot, normalizedPromptName));

            if (!promptPath.StartsWith(promptsRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                && !promptPath.Equals(promptsRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"El prompt '{promptName}' no es una ruta valida dentro de la carpeta Prompts.");
            }

            if (!promptPath.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"El prompt '{promptName}' debe ser un archivo .md.");

            if (!File.Exists(promptPath))
                throw new FileNotFoundException($"No existe el prompt '{promptName}' en la carpeta Prompts.", promptPath);

            return (await File.ReadAllTextAsync(promptPath, cancellationToken)).Trim();
        }
    }
}
