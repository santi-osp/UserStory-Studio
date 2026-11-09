using System.Buffers;
using System.Text;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Common;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Validaciones defensivas de entrada compartidas por las Azure Functions HTTP.
    /// </summary>
    public sealed class RequestValidationHelper
    {
        private readonly RequestValidationOptions _requestValidation;
        private readonly TransportOptions _transport;
        private readonly WorkItemLimitsOptions _workItems;
        private readonly ArchitectureIntegrationOptions _architecture;
        private readonly CvAnalysisOptions _cv;
        private readonly AiConnectionOptions _ai;
        private readonly AzureDevOpsOptions _azureDevOps;
        private readonly JsonPayloadSerializer _jsonSerializer;
        private static readonly UTF8Encoding StrictUtf8 = new(
            encoderShouldEmitUTF8Identifier: false,
            throwOnInvalidBytes: true);

        public RequestValidationHelper(
            IOptions<RequestValidationOptions> requestValidation,
            IOptions<TransportOptions> transport,
            IOptions<WorkItemLimitsOptions> workItems,
            IOptions<ArchitectureIntegrationOptions> architecture,
            IOptions<CvAnalysisOptions> cv,
            IOptions<AiConnectionOptions> ai,
            IOptions<AzureDevOpsOptions> azureDevOps,
            JsonPayloadSerializer jsonSerializer)
        {
            _requestValidation = requestValidation.Value;
            _transport = transport.Value;
            _workItems = workItems.Value;
            _architecture = architecture.Value;
            _cv = cv.Value;
            _ai = ai.Value;
            _azureDevOps = azureDevOps.Value;
            _jsonSerializer = jsonSerializer;
        }

        public int MaxJsonDepth => _requestValidation.MaxJsonDepth;
        public int MaxOrganizationLength => _azureDevOps.Limits.MaxOrganizationLength;
        public int MaxProjectLength => _azureDevOps.Limits.MaxProjectLength;
        public int MaxPathLength => _azureDevOps.Limits.MaxPathLength;
        public int MaxTitleLength => _workItems.MaxTitleLength;
        public int MaxDescriptionLength => _workItems.MaxDescriptionLength;
        public int MaxTestStepTextLength => _workItems.MaxTestStepTextLength;
        public int MaxPromptLength => _ai.MaxPromptLength;
        public int MaxArchitectureMarkdownLength => _architecture.MaxMarkdownLength;
        public int MaxSearchTextLength => _azureDevOps.Search.MaxSearchTextLength;
        public int MaxModelLength => _ai.MaxModelLength;
        public int MaxSecretHeaderLength => _requestValidation.MaxSecretHeaderLength;
        public int MaxWorkItemIds => _azureDevOps.Limits.MaxWorkItemIds;
        public int MaxTestCases => _workItems.MaxTestCases;
        public int MaxTestCaseSteps => _workItems.MaxTestCaseSteps;
        public int MaxAdditionalFields => _workItems.MaxAdditionalFields;
        public int MaxCvTextLength => _cv.MaxTextLength;
        public JsonSerializerOptions JsonOptions => _jsonSerializer.Options;

        public string Prepare(HttpRequest request) =>
            HttpResponseHeaderHelper.Prepare(request, _requestValidation.MaxCorrelationIdLength);

        public ResolvedAzdoContext ResolveAzdoContext(HttpRequest request, string? requestBodyText = null) =>
            AzdoContextResolver.ResolveAzdoContext(
                request,
                _azureDevOps,
                _jsonSerializer.Options,
                requestBodyText);

        public async Task<RequestBodyReadResult> ReadBodyAsync(
            HttpRequest request,
            string correlationId,
            bool requiredBody,
            int maxBodyBytes,
            CancellationToken cancellationToken)
        {
            ArgumentNullException.ThrowIfNull(request);
            if (maxBodyBytes <= 0)
                throw new ArgumentOutOfRangeException(nameof(maxBodyBytes));

            if (request.ContentLength is > 0 && request.ContentLength > maxBodyBytes)
            {
                return RequestBodyReadResult.Failure(
                    ErrorResponseFactory.PayloadTooLarge(correlationId, maxBodyBytes),
                    StatusCodes.Status413PayloadTooLarge);
            }

            var initialCapacity = request.ContentLength is > 0
                ? (int)Math.Min(request.ContentLength.Value, maxBodyBytes)
                : 0;
            await using var buffer = new MemoryStream(initialCapacity);
            var chunk = ArrayPool<byte>.Shared.Rent(
                (int)Math.Min(_transport.ReadBufferBytes, (long)maxBodyBytes + 1));

            try
            {
                var totalBytes = 0;
                while (true)
                {
                    var remainingPlusOne = maxBodyBytes - totalBytes + 1;
                    var bytesToRead = Math.Min(chunk.Length, remainingPlusOne);
                    var read = await request.Body.ReadAsync(
                        chunk.AsMemory(0, bytesToRead),
                        cancellationToken);
                    if (read == 0)
                        break;

                    totalBytes += read;
                    if (totalBytes > maxBodyBytes)
                    {
                        return RequestBodyReadResult.Failure(
                            ErrorResponseFactory.PayloadTooLarge(correlationId, maxBodyBytes),
                            StatusCodes.Status413PayloadTooLarge);
                    }

                    await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
                }

                string body;
                try
                {
                    body = StrictUtf8.GetString(buffer.GetBuffer(), 0, checked((int)buffer.Length));
                }
                catch (DecoderFallbackException)
                {
                    return RequestBodyReadResult.Failure(
                        ErrorResponseFactory.InvalidUtf8(correlationId),
                        StatusCodes.Status400BadRequest);
                }

                if (requiredBody && string.IsNullOrWhiteSpace(body))
                {
                    return RequestBodyReadResult.Failure(
                        ErrorResponseFactory.EmptyRequestBody(correlationId),
                        StatusCodes.Status400BadRequest);
                }

                return RequestBodyReadResult.Success(body);
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(chunk, clearArray: true);
            }
        }

        public ErrorResponse? ValidateJsonIfPresent(string body, string correlationId)
        {
            if (string.IsNullOrWhiteSpace(body))
                return null;

            try
            {
                using var _ = JsonDocument.Parse(
                    body,
                    new JsonDocumentOptions { MaxDepth = _jsonSerializer.Options.MaxDepth });
                return null;
            }
            catch (JsonException)
            {
                return ErrorResponseFactory.InvalidJson(correlationId);
            }
        }

        public ErrorResponse? ValidateRequiredText(
            string? value,
            string fieldName,
            int maxLength,
            string correlationId,
            bool allowLineBreaks = false)
        {
            if (string.IsNullOrWhiteSpace(value))
                return ErrorResponseFactory.Validation(correlationId, $"{fieldName} es requerido.");

            return ValidateOptionalText(value, fieldName, maxLength, correlationId, allowLineBreaks);
        }

        public ErrorResponse? ValidateOptionalText(
            string? value,
            string fieldName,
            int maxLength,
            string correlationId,
            bool allowLineBreaks = false)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            var normalized = value.Trim();

            if (normalized.Length > maxLength)
            {
                return ErrorResponseFactory.Validation(
                    correlationId,
                    $"{fieldName} supera la longitud maxima de {maxLength} caracteres.");
            }

            if (HasInvalidControlCharacters(normalized, allowLineBreaks))
                return ErrorResponseFactory.Validation(correlationId, $"{fieldName} contiene caracteres no permitidos.");

            return null;
        }

        public ErrorResponse? ValidateAzurePat(string? value, string correlationId)
        {
            if (string.IsNullOrWhiteSpace(value))
                return ErrorResponseFactory.AzurePatRequired(correlationId);

            return ValidateOptionalText(
                value,
                "x-azdo-pat",
                MaxSecretHeaderLength,
                correlationId);
        }

        public ErrorResponse? ValidateOrganization(string? value, string correlationId) =>
            ValidateRequiredText(value, "organization", MaxOrganizationLength, correlationId);

        public ErrorResponse? ValidateProject(string? value, string correlationId, string fieldName = "azdoProject") =>
            ValidateRequiredText(value, fieldName, MaxProjectLength, correlationId);

        public ErrorResponse? ValidateOptionalPath(string? value, string fieldName, string correlationId) =>
            ValidateOptionalText(value, fieldName, MaxPathLength, correlationId);

        public ErrorResponse? ValidateModel(string? value, string correlationId) =>
            ValidateOptionalText(value, "model", MaxModelLength, correlationId);

        public ErrorResponse? ValidateCvPageCount(int? value, string correlationId) =>
            ValidateOptionalPositiveRange(value, "pageCount", min: 1, max: _cv.MaxPageCount, correlationId);

        public ErrorResponse? ValidateWorkItemId(int value, string correlationId) =>
            value <= 0
                ? ErrorResponseFactory.InvalidWorkItemId(correlationId)
                : null;

        public ErrorResponse? ValidateWorkItemIds(
            IReadOnlyCollection<int> ids,
            bool hasInvalidIds,
            string correlationId)
        {
            if (hasInvalidIds || ids.Any(id => id <= 0))
                return ErrorResponseFactory.InvalidWorkItemId(correlationId);

            if (ids.Count == 0)
            {
                return ErrorResponseFactory.Validation(
                    correlationId,
                    "Debe enviar al menos un workItemId mayor a 0.");
            }

            if (ids.Count > MaxWorkItemIds)
            {
                return ErrorResponseFactory.Validation(
                    correlationId,
                    $"workItemIds no puede contener mas de {MaxWorkItemIds} elementos.");
            }

            return null;
        }

        public ErrorResponse? ValidateWorkItemPayload(CreateWorkItemPayload payload, string correlationId)
        {
            if (payload.Hu is null)
                return ErrorResponseFactory.Validation(correlationId, "El JSON debe contener hu.");

            if (!WorkItemContentHtmlPolicy.IsSafe(payload.Hu.Description))
                return ErrorResponseFactory.Validation(correlationId, "hu.description contiene HTML no permitido.");

            if (!WorkItemContentHtmlPolicy.IsSafe(payload.Hu.AcceptanceCriteria))
                return ErrorResponseFactory.Validation(correlationId, "hu.acceptanceCriteria contiene HTML no permitido.");

            return FirstError(
                ValidateOptionalPath(payload.AreaPath, "areaPath", correlationId),
                ValidateOptionalPath(payload.IterationPath, "iterationPath", correlationId),
                ValidateOptionalText(payload.WorkItemType, "workItemType", MaxProjectLength, correlationId),
                ValidateRequiredText(payload.Hu.Title, "hu.title", MaxTitleLength, correlationId),
                ValidateOptionalText(payload.Hu.Description, "hu.description", MaxDescriptionLength, correlationId, allowLineBreaks: true),
                ValidateOptionalText(payload.Hu.AcceptanceCriteria, "hu.acceptanceCriteria", MaxDescriptionLength, correlationId, allowLineBreaks: true),
                ValidateAdditionalFields(payload.Hu.AdditionalFields, correlationId),
                ValidateTestSuite(payload.TestSuite, correlationId),
                ValidateTestCases(payload.TestCases, correlationId));
        }

        public ErrorResponse? ValidateTestCases(IReadOnlyList<TestCaseFields>? testCases, string correlationId)
        {
            if (testCases is null || testCases.Count == 0)
                return null;

            if (testCases.Count > MaxTestCases)
            {
                return ErrorResponseFactory.Validation(
                    correlationId,
                    $"testCases no puede contener mas de {MaxTestCases} elementos.");
            }

            for (var index = 0; index < testCases.Count; index++)
            {
                var item = testCases[index];
                var prefix = $"testCases[{index}]";
                if (item is null)
                    return ErrorResponseFactory.Validation(correlationId, $"{prefix} es requerido.");

                var error = FirstError(
                    ValidateRequiredText(item.Title, $"{prefix}.title", MaxTitleLength, correlationId),
                    ValidateRequiredText(item.State, $"{prefix}.state", MaxProjectLength, correlationId));

                if (error is not null)
                    return error;

                if (item.Steps is not { Count: > 0 })
                    return ErrorResponseFactory.Validation(correlationId, $"{prefix}.steps debe contener al menos un paso.");

                if (item.Steps.Count > MaxTestCaseSteps)
                {
                    return ErrorResponseFactory.Validation(
                        correlationId,
                        $"{prefix}.steps no puede contener mas de {MaxTestCaseSteps} elementos.");
                }

                for (var stepIndex = 0; stepIndex < item.Steps.Count; stepIndex++)
                {
                    var step = item.Steps[stepIndex];
                    var stepPrefix = $"{prefix}.steps[{stepIndex}]";
                    if (step is null)
                        return ErrorResponseFactory.Validation(correlationId, $"{stepPrefix} es requerido.");

                    var stepError = FirstError(
                        ValidateRequiredText(step.Action, $"{stepPrefix}.action", MaxTestStepTextLength, correlationId, allowLineBreaks: true),
                        ValidateRequiredText(step.Expected, $"{stepPrefix}.expected", MaxTestStepTextLength, correlationId, allowLineBreaks: true));
                    if (stepError is not null)
                        return stepError;
                }
            }

            return null;
        }

        public ErrorResponse? ValidateCreateTestCasesPayload(
            CreateTestCasesPayload payload,
            string correlationId) =>
            FirstError(
                ValidateRequiredText(payload.AzdoProject, "azdoProject", MaxProjectLength, correlationId),
                ValidateRequiredText(payload.AreaPath, "areaPath", MaxPathLength, correlationId),
                ValidateOptionalPath(payload.AreaPath, "areaPath", correlationId),
                ValidateRequiredText(payload.IterationPath, "iterationPath", MaxPathLength, correlationId),
                ValidateOptionalPath(payload.IterationPath, "iterationPath", correlationId),
                ValidateRequiredText(payload.SuiteTitle, "suiteTitle", MaxTitleLength, correlationId),
                payload.TestSuite is null || payload.TestSuite.PlanId <= 0
                    ? ErrorResponseFactory.Validation(correlationId, "testSuite.planId debe ser mayor a 0.")
                    : null,
                payload.TestCases is not { Count: > 0 }
                    ? ErrorResponseFactory.Validation(correlationId, "testCases debe contener al menos un elemento.")
                    : null,
                ValidateTestCases(payload.TestCases, correlationId));

        public ErrorResponse? FirstError(params ErrorResponse?[] errors) =>
            errors.FirstOrDefault(error => error is not null);

        private static ErrorResponse? ValidateTestSuite(TestSuitePayload? testSuite, string correlationId)
        {
            if (testSuite is null)
                return null;

            return testSuite.PlanId < 0
                ? ErrorResponseFactory.Validation(correlationId, "testSuite.planId debe ser mayor o igual a 0.")
                : null;
        }

        private static ErrorResponse? ValidateOptionalPositiveRange(
            int? value,
            string fieldName,
            int min,
            int max,
            string correlationId)
        {
            if (!value.HasValue)
                return null;

            return value.Value < min || value.Value > max
                ? ErrorResponseFactory.Validation(correlationId, $"{fieldName} esta fuera del rango permitido.")
                : null;
        }

        private static ErrorResponse? ValidateOptionalDoubleRange(
            double? value,
            string fieldName,
            double min,
            double max,
            string correlationId)
        {
            if (!value.HasValue)
                return null;

            return double.IsNaN(value.Value)
                || double.IsInfinity(value.Value)
                || value.Value < min
                || value.Value > max
                ? ErrorResponseFactory.Validation(correlationId, $"{fieldName} esta fuera del rango permitido.")
                : null;
        }

        private ErrorResponse? ValidateOptionalDateText(string? value, string fieldName, string correlationId) =>
            ValidateOptionalText(value, fieldName, MaxProjectLength, correlationId);

        private ErrorResponse? ValidateAdditionalFields(
            IReadOnlyDictionary<string, JsonElement> fields,
            string correlationId)
        {
            if (fields.Count > MaxAdditionalFields)
            {
                return ErrorResponseFactory.Validation(
                    correlationId,
                    $"hu no puede contener mas de {MaxAdditionalFields} campos dinamicos.");
            }

            foreach (var pair in fields)
            {
                var nameError = ValidateRequiredText(pair.Key, "additionalField", MaxProjectLength, correlationId);
                if (nameError is not null)
                    return nameError;

                if (pair.Value.ValueKind == JsonValueKind.String)
                {
                    var stringValue = pair.Value.GetString();
                    var valueError = ValidateOptionalText(
                        stringValue,
                        pair.Key,
                        MaxDescriptionLength,
                        correlationId,
                        allowLineBreaks: true);
                    if (valueError is not null)
                        return valueError;

                    if (IsRichTextReferenceName(pair.Key)
                        && !WorkItemContentHtmlPolicy.IsSafe(stringValue))
                    {
                        return ErrorResponseFactory.Validation(
                            correlationId,
                            $"{pair.Key} contiene HTML no permitido.");
                    }
                }
                else if (pair.Value.ValueKind is not (
                    JsonValueKind.Null
                    or JsonValueKind.True
                    or JsonValueKind.False
                    or JsonValueKind.Number))
                {
                    return ErrorResponseFactory.Validation(
                        correlationId,
                        $"{pair.Key} debe contener un valor escalar.");
                }
            }

            return null;
        }

        private static bool IsRichTextReferenceName(string fieldName) =>
            fieldName.Equals("System.Description", StringComparison.OrdinalIgnoreCase)
            || fieldName.Equals(
                "Microsoft.VSTS.Common.AcceptanceCriteria",
                StringComparison.OrdinalIgnoreCase);

        private static bool HasInvalidControlCharacters(string value, bool allowLineBreaks)
        {
            foreach (var character in value)
            {
                if (!char.IsControl(character))
                    continue;

                if (allowLineBreaks && character is '\r' or '\n' or '\t')
                    continue;

                return true;
            }

            return false;
        }
    }

    public sealed record RequestBodyReadResult(string Body, ErrorResponse? Error, int StatusCode)
    {
        public bool Succeeded => Error is null;

        public static RequestBodyReadResult Success(string body) =>
            new(body, null, StatusCodes.Status200OK);

        public static RequestBodyReadResult Failure(ErrorResponse error, int statusCode) =>
            new(string.Empty, error, statusCode);
    }
}
