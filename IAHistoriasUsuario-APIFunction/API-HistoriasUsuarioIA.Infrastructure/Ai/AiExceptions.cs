namespace API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

public class AiConfigurationException : Exception
{
    public AiConfigurationException(string message) : base(message) { }
}

public sealed class UnsupportedAiProviderException : AiConfigurationException
{
    public UnsupportedAiProviderException(string provider)
        : base($"AiConnection:Provider no soportado: {provider}.") { }
}

public sealed class AiProviderHttpException : Exception
{
    public AiProviderHttpException(
        string provider,
        int? statusCode,
        int responseBodyLength,
        Exception? innerException = null)
        : base($"AI provider request failed. Provider={provider}; Status={statusCode}.", innerException)
    {
        Provider = provider;
        StatusCode = statusCode;
        ResponseBodyLength = responseBodyLength;
    }

    public string Provider { get; }
    public int? StatusCode { get; }
    public int ResponseBodyLength { get; }
}

public sealed class AiProviderTimeoutException : TimeoutException
{
    public AiProviderTimeoutException(string provider, Exception innerException)
        : base($"AI provider timed out. Provider={provider}.", innerException)
    {
        Provider = provider;
    }

    public string Provider { get; }
}

public sealed class AiInvalidResponseException : Exception
{
    public AiInvalidResponseException(string provider, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        Provider = provider;
    }

    public string Provider { get; }
}
