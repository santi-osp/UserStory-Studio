using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que consulta comentarios de discusion de uno o varios work items.
    /// </summary>
    /// <remarks>
    /// Acepta identificadores por body o query string, elimina duplicados e incluye comentarios eliminados segun la
    /// API de Azure DevOps para mantener trazabilidad de discusiones.
    /// </remarks>
    public class AzdoWorkItemDiscussionCommentsFunction
    {
        private readonly ILogger<AzdoWorkItemDiscussionCommentsFunction> _logger;
        private readonly IGetAzdoWorkItemDiscussionCommentsUseCase _getDiscussionCommentsUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public AzdoWorkItemDiscussionCommentsFunction(
            ILogger<AzdoWorkItemDiscussionCommentsFunction> logger,
            IGetAzdoWorkItemDiscussionCommentsUseCase getDiscussionCommentsUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _getDiscussionCommentsUseCase = getDiscussionCommentsUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/azdo/workitems/discussion/comments</c> y devuelve comentarios por work item.
        /// </summary>
        /// <param name="request">
        /// Solicitud con <c>x-azdo-pat</c>, contexto de organizacion y proyecto, y al menos un id en
        /// <see cref="WorkItemDiscussionCommentsRequest"/> o query <c>workItemId(s)</c>.
        /// </param>
        /// <param name="cancellationToken">Token de cancelacion propagado a consultas de comentarios.</param>
        /// <returns>
        /// <c>200</c> con <see cref="WorkItemsDiscussionCommentsResponse"/>, <c>400</c> por ids o contexto faltantes,
        /// <c>401/403</c> por autorizacion Azure DevOps, <c>408</c> por timeout y <c>5xx</c> por errores externos o internos.
        /// </returns>
        [Function("GetAzdoWorkItemDiscussionComments")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "v1.0.0/azdo/workitems/discussion/comments")] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var endpoint = "v1.0.0/azdo/workitems/discussion/comments";
            var correlationId = _requestValidation.Prepare(request);
            var clientApp = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader);
            var resolvedContext = new ResolvedAzdoContext();
            var resolvedProject = string.Empty;
            var resolvedWorkItemIds = Array.Empty<int>();
            var requestBodyText = string.Empty;

            IActionResult Respond(IActionResult result, int statusCode)
            {
                _errorLogging.LogResponseWithBody(
                    _logger,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    statusCode,
                    _errorLogging.ExtractResponseBody(result),
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        project = resolvedProject,
                        workItemIdsCount = resolvedWorkItemIds.Length,
                        durationMs = startedAt.ElapsedMilliseconds
                    });
                return result;
            }

            var azurePat = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzurePatHeader);

            var bodyRead = await _requestValidation.ReadBodyAsync(
                request,
                correlationId,
                requiredBody: false,
                maxBodyBytes: _requestLimits.SmallBodyBytes,
                cancellationToken);
            if (!bodyRead.Succeeded)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(bodyRead.Error!, bodyRead.StatusCode),
                    bodyRead.StatusCode);
            }

            requestBodyText = bodyRead.Body;
            resolvedContext = _requestValidation.ResolveAzdoContext(request, requestBodyText);

            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            WorkItemDiscussionCommentsRequest? commentsRequest = null;
            if (!string.IsNullOrWhiteSpace(requestBodyText))
            {
                try
                {
                    commentsRequest = JsonSerializer.Deserialize<WorkItemDiscussionCommentsRequest>(
                        requestBodyText,
                        _requestValidation.JsonOptions);
                }
                catch (JsonException ex)
                {
                    var errorBody = ErrorResponseFactory.InvalidJson(correlationId);
                    _errorLogging.LogExceptionWithBodies(
                        _logger,
                        ex,
                        endpoint,
                        correlationId,
                        requestBodyText,
                        errorBody,
                        new { clientApp, resolvedContext.Organization });

                    return Respond(
                        ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest),
                        StatusCodes.Status400BadRequest);
                }
            }

            var workItemIdsResult = ResolveWorkItemIds(request, commentsRequest);
            resolvedWorkItemIds = workItemIdsResult.Ids;
            var idsValidationError = _requestValidation.ValidateWorkItemIds(
                resolvedWorkItemIds,
                workItemIdsResult.HasInvalidIds,
                correlationId);
            if (idsValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(idsValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var organizationValidationError = _requestValidation.ValidateOrganization(resolvedContext.Organization, correlationId);
            if (organizationValidationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(organizationValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var project = (commentsRequest?.AzdoProject ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(project))
                project = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoProjectHeader);

            if (string.IsNullOrWhiteSpace(project) && request.Query.TryGetValue("azdoProject", out var projectValues))
                project = projectValues.FirstOrDefault()?.Trim() ?? string.Empty;

            if (string.IsNullOrWhiteSpace(project))
                project = AzdoProjectResolver.ExtractProjectFromAzurePath(resolvedContext.AzurePath);

            resolvedProject = project;

            if (string.IsNullOrWhiteSpace(project))
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "azdoProject es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateProject(project, correlationId),
                _requestValidation.ValidateOptionalPath(resolvedContext.AzurePath, "azurePath", correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _getDiscussionCommentsUseCase.ExecuteAsync(
                    new GetAzdoWorkItemDiscussionCommentsQuery(
                        resolvedContext.Organization,
                        project,
                        resolvedWorkItemIds,
                        azurePat,
                        correlationId,
                        clientApp),
                    cancellationToken);

                return Respond(new OkObjectResult(responseBody), StatusCodes.Status200OK);
            }
            catch (ArgumentException ex)
            {
                var errorBody = ErrorResponseFactory.Validation(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        project,
                        workItemIds = resolvedWorkItemIds
                    });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest), StatusCodes.Status400BadRequest);
            }
            catch (AzDoRequestException ex)
            {
                var statusCode = ExternalStatusCodeMapper.Map(ex.StatusCode);
                var errorBody = ErrorResponseFactory.AzureDevOps(ex, correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        project,
                        workItemIds = resolvedWorkItemIds
                    });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, statusCode),
                    statusCode);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                var errorBody = ErrorResponseFactory.AzureDevOpsTimeout(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        project,
                        workItemIds = resolvedWorkItemIds
                    });

                return Respond(
                    ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout),
                    StatusCodes.Status408RequestTimeout);
            }
            catch (Exception ex)
            {
                var errorBody = ErrorResponseFactory.Unexpected(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    endpoint,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        project,
                        workItemIds = resolvedWorkItemIds
                    });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError), StatusCodes.Status500InternalServerError);
            }
        }

        private static ResolvedWorkItemIds ResolveWorkItemIds(HttpRequest request, WorkItemDiscussionCommentsRequest? commentsRequest)
        {
            var ids = new List<int>();
            var hasInvalidIds = false;

            if (commentsRequest?.WorkItemIds is { Count: > 0 })
            {
                ids.AddRange(commentsRequest.WorkItemIds);
                hasInvalidIds = commentsRequest.WorkItemIds.Any(id => id <= 0);
            }

            if (commentsRequest?.WorkItemId is int bodySingleId)
            {
                ids.Add(bodySingleId);
                hasInvalidIds |= bodySingleId <= 0;
            }

            if (request.Query.TryGetValue("workItemIds", out var queryWorkItemIds))
            {
                foreach (var queryValue in queryWorkItemIds)
                {
                    if (string.IsNullOrWhiteSpace(queryValue))
                        continue;

                    foreach (var token in queryValue.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    {
                        if (int.TryParse(token, out var parsedId) && parsedId > 0)
                        {
                            ids.Add(parsedId);
                        }
                        else
                        {
                            hasInvalidIds = true;
                        }
                    }
                }
            }

            if (request.Query.TryGetValue("workItemId", out var querySingleId))
            {
                var rawSingleId = querySingleId.FirstOrDefault();
                if (int.TryParse(rawSingleId, out var parsedSingleId) && parsedSingleId > 0)
                {
                    ids.Add(parsedSingleId);
                }
                else if (!string.IsNullOrWhiteSpace(rawSingleId))
                {
                    hasInvalidIds = true;
                }
            }

            var resolvedIds = ids
                .Where(id => id > 0)
                .Distinct()
                .ToArray();

            return new ResolvedWorkItemIds(resolvedIds, hasInvalidIds);
        }

        private sealed record ResolvedWorkItemIds(int[] Ids, bool HasInvalidIds);

    }
}
