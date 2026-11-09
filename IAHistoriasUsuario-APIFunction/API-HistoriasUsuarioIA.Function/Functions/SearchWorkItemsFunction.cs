using System.Diagnostics;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion
{
    /// <summary>
    /// Azure Function HTTP que busca Work Items para el selector de evaluaciÃ³n.
    /// </summary>
    /// <remarks>
    /// Usa WIQL y Work Items Batch para traer solo campos livianos; no consulta descripciÃ³n, criterios,
    /// discusiones, comentarios ni historial.
    /// </remarks>
    public class SearchWorkItemsFunction
    {
        private const string EndpointRoute = "v1.0.0/azdo/hu/search";

        private readonly ILogger<SearchWorkItemsFunction> _logger;
        private readonly ISearchWorkItemsUseCase _searchWorkItemsUseCase;
        private readonly RequestLimitsOptions _requestLimits;
        private readonly RequestValidationHelper _requestValidation;
        private readonly ErrorLoggingHelper _errorLogging;

        public SearchWorkItemsFunction(
            ILogger<SearchWorkItemsFunction> logger,
            ISearchWorkItemsUseCase searchWorkItemsUseCase,
            IOptions<RequestLimitsOptions> requestLimits,
            RequestValidationHelper requestValidation,
            ErrorLoggingHelper errorLogging)
        {
            _logger = logger;
            _searchWorkItemsUseCase = searchWorkItemsUseCase;
            _requestLimits = requestLimits.Value;
            _requestValidation = requestValidation;
            _errorLogging = errorLogging;
        }

        /// <summary>
        /// Atiende <c>POST v1.0.0/azdo/hu/search</c> y devuelve opciones para seleccionar un Work Item.
        /// </summary>
        [Function("SearchWorkItems")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = EndpointRoute)] HttpRequest request,
            CancellationToken cancellationToken)
        {
            var startedAt = Stopwatch.StartNew();
            var correlationId = _requestValidation.Prepare(request);
            var clientApp = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.ClientAppHeader);
            var resolvedContext = new ResolvedAzdoContext();
            var requestBodyText = string.Empty;

            IActionResult Respond(IActionResult result, int statusCode)
            {
                _errorLogging.LogResponseWithBody(
                    _logger,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    statusCode,
                    _errorLogging.ExtractResponseBody(result),
                    new
                    {
                        clientApp,
                        resolvedContext.Organization,
                        durationMs = startedAt.ElapsedMilliseconds
                    });
                return result;
            }

            var azurePat = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzurePatHeader);
            var bodyRead = await _requestValidation.ReadBodyAsync(
                request,
                correlationId,
                requiredBody: true,
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

            SearchWorkItemsRequest? searchRequest;
            try
            {
                searchRequest = JsonSerializer.Deserialize<SearchWorkItemsRequest>(
                    requestBodyText,
                    _requestValidation.JsonOptions);
            }
            catch (JsonException ex)
            {
                var errorBody = ErrorResponseFactory.InvalidJson(correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest), StatusCodes.Status400BadRequest);
            }

            if (searchRequest is null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "El body es requerido."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var patValidationError = _requestValidation.ValidateAzurePat(azurePat, correlationId);
            if (patValidationError is not null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(patValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var organizationValidationError = _requestValidation.ValidateOrganization(resolvedContext.Organization, correlationId);
            if (organizationValidationError is not null)
                return Respond(
                    ErrorResponseFactory.ToActionResult(organizationValidationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var project = searchRequest.AzdoProject.Trim();
            if (string.IsNullOrWhiteSpace(project))
                project = HttpResponseHeaderHelper.GetHeader(request, HttpResponseHeaderHelper.AzdoProjectHeader);

            if (string.IsNullOrWhiteSpace(project))
                project = AzdoProjectResolver.ExtractProjectFromAzurePath(resolvedContext.AzurePath);

            if (string.IsNullOrWhiteSpace(project))
                return Respond(
                    ErrorResponseFactory.ToActionResult(
                        ErrorResponseFactory.Validation(correlationId, "azdoProject es requerido para buscar Work Items."),
                        StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);

            var validationError = _requestValidation.FirstError(
                _requestValidation.ValidateProject(project, correlationId),
                _requestValidation.ValidateOptionalPath(searchRequest.AreaPath, "areaPath", correlationId),
                _requestValidation.ValidateOptionalPath(searchRequest.IterationPath, "iterationPath", correlationId),
                _requestValidation.ValidateOptionalPath(resolvedContext.AzurePath, "azurePath", correlationId),
                _requestValidation.ValidateOptionalText(
                    searchRequest.SearchText,
                    "searchText",
                    _requestValidation.MaxSearchTextLength,
                    correlationId));

            if (validationError is not null)
            {
                return Respond(
                    ErrorResponseFactory.ToActionResult(validationError, StatusCodes.Status400BadRequest),
                    StatusCodes.Status400BadRequest);
            }

            try
            {
                var responseBody = await _searchWorkItemsUseCase.ExecuteAsync(
                    new SearchWorkItemsQuery(
                        resolvedContext.Organization,
                        project,
                        searchRequest.AreaPath,
                        searchRequest.IterationPath,
                        searchRequest.SearchText,
                        searchRequest.Top,
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
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status400BadRequest), StatusCodes.Status400BadRequest);
            }
            catch (AzDoRequestException ex)
            {
                var statusCode = ExternalStatusCodeMapper.Map(ex.StatusCode);
                var errorBody = ErrorResponseFactory.AzureDevOps(ex, correlationId);

                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, statusCode), statusCode);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                var errorBody = ErrorResponseFactory.AzureDevOpsTimeout(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status408RequestTimeout), StatusCodes.Status408RequestTimeout);
            }
            catch (Exception ex)
            {
                var errorBody = ErrorResponseFactory.Unexpected(correlationId);
                _errorLogging.LogExceptionWithBodies(
                    _logger,
                    ex,
                    EndpointRoute,
                    correlationId,
                    requestBodyText,
                    errorBody,
                    new { clientApp, resolvedContext.Organization, project });

                return Respond(ErrorResponseFactory.ToActionResult(errorBody, StatusCodes.Status500InternalServerError), StatusCodes.Status500InternalServerError);
            }
        }
    }
}
