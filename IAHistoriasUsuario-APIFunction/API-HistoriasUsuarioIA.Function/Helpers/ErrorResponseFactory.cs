using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using API_HistoriasUsuarioIA_funcion.Infrastructure.AzureDevOps;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Builds safe error responses for HTTP functions.
    /// </summary>
    internal static class ErrorResponseFactory
    {
        public static ObjectResult ToActionResult(ErrorResponse error, int statusCode) =>
            new(error) { StatusCode = statusCode };

        public static ErrorResponse InvalidJson(string correlationId) =>
            new(
                "INVALID_JSON",
                "El cuerpo de la solicitud no tiene un JSON valido.",
                correlationId);

        public static ErrorResponse EmptyRequestBody(string correlationId) =>
            new(
                "EMPTY_REQUEST_BODY",
                "El cuerpo de la solicitud es obligatorio.",
                correlationId);

        public static ErrorResponse PayloadTooLarge(string correlationId, int maxBodyBytes) =>
            new(
                "PAYLOAD_TOO_LARGE",
                "El cuerpo de la solicitud supera el limite permitido.",
                correlationId,
                $"Tamano maximo: {maxBodyBytes} bytes.");

        public static ErrorResponse InvalidUtf8(string correlationId) =>
            new(
                "INVALID_UTF8",
                "El cuerpo de la solicitud debe estar codificado en UTF-8 valido.",
                correlationId);

        public static ErrorResponse AzurePatRequired(string correlationId) =>
            new(
                "AZURE_PAT_REQUIRED",
                "Se requiere credencial de Azure DevOps para esta operacion.",
                correlationId);

        public static ErrorResponse WorkItemFieldNotAllowed(string correlationId, string? detail = null) =>
            new(
                "WORK_ITEM_FIELD_NOT_ALLOWED",
                "La solicitud contiene campos de work item no permitidos.",
                correlationId,
                NormalizeDetail(detail));

        public static ErrorResponse InvalidWorkItemId(string correlationId) =>
            new(
                "INVALID_WORK_ITEM_ID",
                "workItemId debe ser un entero positivo.",
                correlationId);

        public static ErrorResponse Validation(string correlationId, string? detail = null) =>
            new(
                "VALIDATION_ERROR",
                "La solicitud no cumple con los datos requeridos.",
                correlationId,
                NormalizeDetail(detail));

        public static ErrorResponse AzureDevOps(AzDoRequestException exception, string correlationId)
        {
            if (exception.StatusCode is StatusCodes.Status401Unauthorized or StatusCodes.Status403Forbidden)
            {
                return new ErrorResponse(
                    "AZDO_UNAUTHORIZED",
                    "No fue posible autorizar la operacion contra Azure DevOps. Verifica las credenciales y permisos.",
                    correlationId);
            }

            if (exception.StatusCode == StatusCodes.Status408RequestTimeout)
            {
                return AzureDevOpsTimeout(correlationId);
            }

            return new ErrorResponse(
                "AZDO_REQUEST_FAILED",
                "No fue posible completar la operacion contra Azure DevOps.",
                correlationId);
        }

        public static ErrorResponse AzureDevOpsTimeout(string correlationId) =>
            new(
                "AZDO_REQUEST_TIMEOUT",
                "Azure DevOps tardo demasiado en responder. La creacion pudo quedar en estado ambiguo; verifica en Azure DevOps antes de reintentar.",
                correlationId);

        public static ErrorResponse AiProvider(AiProviderHttpException exception, string correlationId)
        {
            if (exception.StatusCode == StatusCodes.Status408RequestTimeout)
            {
                return AiTimeout(correlationId);
            }

            return new ErrorResponse(
                "OPENAI_REQUEST_FAILED",
                "No fue posible completar la generacion con el servicio de IA.",
                correlationId);
        }

        public static ErrorResponse AiTimeout(string correlationId) =>
            new(
                "OPENAI_REQUEST_TIMEOUT",
                "El servicio de IA tardo demasiado en responder.",
                correlationId);

        public static ErrorResponse Timeout(string correlationId) =>
            new(
                "REQUEST_TIMEOUT",
                "La operacion tardo demasiado en responder.",
                correlationId);

        public static ErrorResponse AiInvalidResponse(string correlationId) =>
            new(
                "AI_INVALID_RESPONSE",
                "El servicio de IA devolvio una respuesta que no pudo procesarse.",
                correlationId);

        public static ErrorResponse Configuration(string correlationId) =>
            new(
                "CONFIGURATION_ERROR",
                "El servicio no esta configurado correctamente para completar la operacion.",
                correlationId);

        public static ErrorResponse Unexpected(string correlationId) =>
            new(
                "UNEXPECTED_ERROR",
                "Ocurrio un error inesperado procesando la solicitud.",
                correlationId);

        public static string SafeAzureDevOpsCreationMessage(Exception exception)
        {
            return AzureDevOpsErrorMessageSanitizer.ToSafeCreationMessage(exception);
        }

        private static string? NormalizeDetail(string? detail) =>
            string.IsNullOrWhiteSpace(detail) ? null : detail.Trim();
    }
}
