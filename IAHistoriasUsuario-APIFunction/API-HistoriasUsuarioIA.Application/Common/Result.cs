namespace API_HistoriasUsuarioIA_funcion.Application.Common;

/// <summary>
/// Resultado explicito para futuros casos de uso de Application.
/// </summary>
public sealed class Result<T>
{
    private Result(bool isSuccess, T? value, ApplicationError? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public bool IsSuccess { get; }

    public bool IsFailure => !IsSuccess;

    public T? Value { get; }

    public ApplicationError? Error { get; }

    public static Result<T> Success(T value) => new(true, value, null);

    public static Result<T> Failure(ApplicationError error) =>
        new(false, default, error ?? throw new ArgumentNullException(nameof(error)));
}
