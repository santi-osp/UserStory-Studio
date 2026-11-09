using System.Text;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Abstractions;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;

/// <summary>
/// Orquesta la preparacion del prompt, analisis con IA y normalizacion de la respuesta de CV.
/// </summary>
public sealed class AnalyzeCvUseCase : IAnalyzeCvUseCase
{
    private static readonly string[] RequiredCriteria =
    [
        "Formato tipo Harvard",
        "Clara, concisa y concreta",
        "Describe tanto el ser como el hacer del candidato",
        "Incluye experiencia y rol desempenado",
        "No excede 1 o 2 paginas",
        "Describe herramientas y nivel de dominio",
        "Incluye hobbies o intereses",
        "Indica la ciudad en la que se encuentra"
    ];

    private readonly ICvAnalysisAiGateway _aiGateway;
    private readonly ILogger<AnalyzeCvUseCase> _logger;
    private readonly CvAnalysisOptions _limits;
    private readonly JsonPayloadSerializer _jsonSerializer;

    public AnalyzeCvUseCase(
        ICvAnalysisAiGateway aiGateway,
        ILogger<AnalyzeCvUseCase> logger,
        IOptions<CvAnalysisOptions> limits,
        JsonPayloadSerializer jsonSerializer)
    {
        _aiGateway = aiGateway;
        _logger = logger;
        _limits = limits.Value;
        _jsonSerializer = jsonSerializer;
    }

    public async Task<CvAnalysisResponse> ExecuteAsync(
        AnalyzeCvCommand command,
        CancellationToken cancellationToken)
    {
        var normalizedRequest = NormalizeRequest(command);
        var prompt = BuildPrompt(normalizedRequest, out var textWasTruncated);

        _logger.LogInformation(
            "Inicio analisis CV. CorrelationId: {CorrelationId}. ClientApp: {ClientApp}. Source: {Source}. PageCount: {PageCount}. Model: {Model}. TextChars: {TextChars}. PromptChars: {PromptChars}. TextTruncated: {TextTruncated}",
            command.CorrelationId,
            command.ClientApp,
            normalizedRequest.Source,
            normalizedRequest.PageCount,
            string.IsNullOrWhiteSpace(normalizedRequest.Model) ? "(default)" : normalizedRequest.Model,
            normalizedRequest.Text.Length,
            prompt.Length,
            textWasTruncated);

        var aiResult = await _aiGateway.AnalyzeAsync(
            prompt,
            normalizedRequest.Model,
            cancellationToken);

        CvAnalysisAiResult? parsedAnalysis;
        try
        {
            parsedAnalysis = JsonSerializer.Deserialize<CvAnalysisAiResult>(
                aiResult.JsonPayloadText,
                _jsonSerializer.Options);
        }
        catch (JsonException exception)
        {
            _logger.LogWarning(
                "Respuesta de IA invalida para analisis CV. CorrelationId: {CorrelationId}. Model: {Model}. JsonChars: {JsonChars}. ExceptionType: {ExceptionType}",
                command.CorrelationId,
                aiResult.Model,
                aiResult.JsonPayloadText.Length,
                exception.GetType().Name);

            throw new CvAnalysisInvalidResponseException(exception);
        }

        if (parsedAnalysis is null)
        {
            _logger.LogWarning(
                "Respuesta de IA vacia para analisis CV. CorrelationId: {CorrelationId}. Model: {Model}. JsonChars: {JsonChars}",
                command.CorrelationId,
                aiResult.Model,
                aiResult.JsonPayloadText.Length);

            throw new CvAnalysisInvalidResponseException();
        }

        var response = BuildResponse(normalizedRequest, parsedAnalysis, aiResult.Model);

        _logger.LogInformation(
            "Analisis CV completado. CorrelationId: {CorrelationId}. Score: {Score}. Strengths: {Strengths}. Improvements: {Improvements}. SpellingErrors: {SpellingErrors}. Criteria: {Criteria}.",
            command.CorrelationId,
            response.PuntuacionGeneral,
            response.Fortalezas.Count,
            response.OportunidadesMejora.Count,
            response.ErroresOrtograficos.Count,
            response.EvaluacionPorCriterio.Count);

        return response;
    }

    private static CvAnalysisRequest NormalizeRequest(AnalyzeCvCommand command)
    {
        return new CvAnalysisRequest
        {
            FileName = string.IsNullOrWhiteSpace(command.FileName)
                ? "archivo-sin-nombre"
                : command.FileName.Trim(),
            Source = string.IsNullOrWhiteSpace(command.Source)
                ? "github-pages"
                : command.Source.Trim(),
            PageCount = command.PageCount is > 0 ? command.PageCount : null,
            Text = command.Text?.Trim() ?? string.Empty,
            Model = string.IsNullOrWhiteSpace(command.Model) ? null : command.Model.Trim()
        };
    }

    private string BuildPrompt(CvAnalysisRequest request, out bool textWasTruncated)
    {
        var cvText = TruncateCvText(request.Text, out textWasTruncated);

        var builder = new StringBuilder();
        builder.AppendLine("Analiza la siguiente hoja de vida para una jornada de seleccion orientada a estudiantes proximos a practicas.");
        builder.AppendLine("Entrega una evaluacion util, clara y accionable segun los criterios definidos.");
        builder.AppendLine();
        builder.AppendLine($"fileName: {request.FileName}");
        builder.AppendLine($"source: {request.Source}");
        builder.AppendLine($"pageCountReportado: {(request.PageCount.HasValue ? request.PageCount.Value.ToString() : "no informado")}");
        builder.AppendLine();
        builder.AppendLine("Criterios esperados:");

        foreach (var criterion in RequiredCriteria)
            builder.AppendLine($"- {criterion}");

        if (textWasTruncated)
        {
            builder.AppendLine();
            builder.AppendLine($"Nota: el texto fue truncado a {_limits.MaxPromptTextLength} caracteres para mantener el analisis dentro de limites operativos.");
        }

        builder.AppendLine();
        builder.AppendLine("Texto de la hoja de vida:");
        builder.AppendLine("<<<CV_TEXT>>>");
        builder.AppendLine(cvText);
        builder.AppendLine("<<<END_CV_TEXT>>>");

        return builder.ToString().Trim();
    }

    private string TruncateCvText(string text, out bool truncated)
    {
        if (text.Length <= _limits.MaxPromptTextLength)
        {
            truncated = false;
            return text;
        }

        truncated = true;
        return text[.._limits.MaxPromptTextLength];
    }

    private static CvAnalysisResponse BuildResponse(
        CvAnalysisRequest request,
        CvAnalysisAiResult analysis,
        string model)
    {
        var score = ClampScore(analysis.PuntuacionGeneral);
        var strengths = NormalizeItems(analysis.Fortalezas);
        var improvements = NormalizeItems(analysis.OportunidadesMejora);
        var tips = NormalizeItems(analysis.ConsejosPracticos);
        var missingOrWeak = NormalizeItems(analysis.CamposFaltantesODebiles);
        var spellingErrors = NormalizeOrthographyIssues(analysis.ErroresOrtograficos);
        var criteria = NormalizeCriteria(analysis.EvaluacionPorCriterio);

        return new CvAnalysisResponse
        {
            FileName = request.FileName,
            Source = request.Source,
            PageCount = request.PageCount,
            PuntuacionGeneral = score,
            Veredicto = ResolveVerdict(analysis.Veredicto, score),
            ResumenEvaluacion = string.IsNullOrWhiteSpace(analysis.ResumenEvaluacion)
                ? "Analisis generado sin resumen explicito; revisar recomendaciones y criterios."
                : analysis.ResumenEvaluacion.Trim(),
            Fortalezas = strengths,
            OportunidadesMejora = improvements,
            ConsejosPracticos = tips,
            CamposFaltantesODebiles = missingOrWeak,
            ErroresOrtograficos = spellingErrors,
            EvaluacionPorCriterio = criteria,
            ModeloUsado = model,
            AnalizadoEnUtc = DateTime.UtcNow.ToString("O")
        };
    }

    private static string ResolveVerdict(string verdict, int score)
    {
        if (!string.IsNullOrWhiteSpace(verdict))
            return verdict.Trim();

        if (score >= 80)
            return "Alta recomendacion";

        if (score >= 60)
            return "Recomendacion media";

        return "Baja recomendacion";
    }

    private static int ClampScore(int score) => Math.Clamp(score, 0, 100);

    private static IReadOnlyList<string> NormalizeItems(IEnumerable<string>? items)
    {
        if (items is null)
            return [];

        var results = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item))
                continue;

            var trimmed = item.Trim();
            if (seen.Add(trimmed))
                results.Add(trimmed);
        }

        return results;
    }

    private static IReadOnlyList<CvCriterioEvaluacion> NormalizeCriteria(
        IEnumerable<CvCriterioEvaluacion>? criteria)
    {
        if (criteria is null)
            return [];

        var normalized = new List<CvCriterioEvaluacion>();

        foreach (var criterion in criteria)
        {
            if (string.IsNullOrWhiteSpace(criterion.Criterio))
                continue;

            normalized.Add(new CvCriterioEvaluacion
            {
                Criterio = criterion.Criterio.Trim(),
                Estado = NormalizeStatus(criterion.Estado),
                Puntaje = ClampScore(criterion.Puntaje),
                Observacion = criterion.Observacion?.Trim() ?? string.Empty
            });
        }

        return normalized;
    }

    private static IReadOnlyList<CvErrorOrtografico> NormalizeOrthographyIssues(
        IEnumerable<CvErrorOrtografico>? issues)
    {
        if (issues is null)
            return [];

        var normalized = new List<CvErrorOrtografico>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var issue in issues)
        {
            if (string.IsNullOrWhiteSpace(issue.TextoOriginal))
                continue;

            var textoOriginal = issue.TextoOriginal.Trim();
            var sugerencia = issue.Sugerencia?.Trim() ?? string.Empty;
            var contexto = issue.Contexto?.Trim() ?? string.Empty;
            var key = $"{textoOriginal}|{sugerencia}|{contexto}";

            if (!seen.Add(key))
                continue;

            normalized.Add(new CvErrorOrtografico
            {
                TextoOriginal = textoOriginal,
                Sugerencia = sugerencia,
                Contexto = contexto
            });
        }

        return normalized;
    }

    private static string NormalizeStatus(string status)
    {
        var normalized = string.IsNullOrWhiteSpace(status)
            ? string.Empty
            : status.Trim().ToLowerInvariant();

        return normalized switch
        {
            "cumple" => "cumple",
            "parcial" => "parcial",
            "no_cumple" => "no_cumple",
            _ => "parcial"
        };
    }
}
