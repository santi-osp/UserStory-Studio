using System.Reflection;
using System.Text;
using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.Options;
using API_HistoriasUsuarioIA_funcion.Infrastructure.Ai;

namespace API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration;

public sealed class ConfigurationInventoryTests
{
    private static readonly string[] HostKeys =
    [
        "AzureWebJobsStorage",
        "FUNCTIONS_WORKER_RUNTIME",
        "FUNCTIONS_EXTENSION_VERSION"
    ];

    private static readonly HashSet<string> RequiredDeploymentSelections = new(StringComparer.Ordinal)
    {
        "AiConnection__Provider",
        "AiConnection__OpenAI__ApiKey",
        "AiConnection__OpenAI__BaseUrl",
        "AiConnection__OpenAI__DefaultModel",
        "AiConnection__N8n__Url",
        "AiConnection__N8n__DefaultModel"
    };

    private static readonly string[] LegacyKeys =
    [
        "AUTH_ENABLED",
        "AUTH_TENANT_ID",
        "CORS_ALLOWED_ORIGINS",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "N8N_WEBHOOK_URL",
        "AZDO_ORGANIZATION",
        "AZDO_PROJECT"
    ];

    private static readonly IReadOnlyDictionary<string, ConsumerEvidence> ProductionConsumers =
        new Dictionary<string, ConsumerEvidence>(StringComparer.Ordinal)
        {
            ["AiConnection__Provider"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/AiJsonGenerator.cs", "_options.Provider"),
            ["AiConnection__TimeoutSeconds"] = new("API-HistoriasUsuarioIA.Infrastructure/DependencyInjection.cs", "options.TimeoutSeconds"),
            ["AiConnection__RetryCount"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/AiHttpExecutor.cs", "_options.RetryCount"),
            ["AiConnection__RetryDelayMilliseconds"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/AiHttpExecutor.cs", "_options.RetryDelayMilliseconds"),
            ["AiConnection__MaxResponseBodyBytes"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/AiHttpExecutor.cs", "_options.MaxResponseBodyBytes"),
            ["AiConnection__MaxPromptLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_ai.MaxPromptLength"),
            ["AiConnection__MaxModelLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_ai.MaxModelLength"),
            ["AiConnection__OpenAI__ApiKey"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/OpenAiJsonProvider.cs", "providerOptions.ApiKey"),
            ["AiConnection__OpenAI__BaseUrl"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/OpenAiJsonProvider.cs", "providerOptions.BaseUrl"),
            ["AiConnection__OpenAI__DefaultModel"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/OpenAiJsonProvider.cs", "providerOptions.DefaultModel"),
            ["AiConnection__N8n__Url"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/N8nJsonProvider.cs", "providerOptions.Url"),
            ["AiConnection__N8n__DefaultModel"] = new("API-HistoriasUsuarioIA.Infrastructure/Ai/N8nJsonProvider.cs", "providerOptions.DefaultModel"),
            ["AzureDevOps__Search__DefaultTop"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_options.Search.DefaultTop"),
            ["AzureDevOps__Search__MaxTop"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_options.Search.MaxTop"),
            ["AzureDevOps__Search__MaxSearchTextLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_azureDevOps.Search.MaxSearchTextLength"),
            ["AzureDevOps__Http__TimeoutSeconds"] = new("API-HistoriasUsuarioIA.Infrastructure/DependencyInjection.cs", "options.Http.TimeoutSeconds"),
            ["AzureDevOps__Http__RetryCount"] = new("API-HistoriasUsuarioIA.Infrastructure/AzureDevOps/AzureDevOpsArchitectureWorkItemGateway.cs", "_httpOptions.RetryCount"),
            ["AzureDevOps__Http__RetryDelayMilliseconds"] = new("API-HistoriasUsuarioIA.Infrastructure/AzureDevOps/AzureDevOpsArchitectureWorkItemGateway.cs", "_httpOptions.RetryDelayMilliseconds"),
            ["AzureDevOps__Defaults__Organization"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestContextHelpers.cs", "defaults.Organization"),
            ["AzureDevOps__Defaults__Project"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestContextHelpers.cs", "defaults.Project"),
            ["AzureDevOps__Defaults__AreaPath"] = new("API-HistoriasUsuarioIA.Function/Functions/IntegracionArquitecturaHUFunction.cs", "defaults.AreaPath"),
            ["AzureDevOps__Defaults__IterationPath"] = new("API-HistoriasUsuarioIA.Function/Functions/IntegracionArquitecturaHUFunction.cs", "defaults.IterationPath"),
            ["AzureDevOps__Limits__MaxOrganizationLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_azureDevOps.Limits.MaxOrganizationLength"),
            ["AzureDevOps__Limits__MaxProjectLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_azureDevOps.Limits.MaxProjectLength"),
            ["AzureDevOps__Limits__MaxPathLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_azureDevOps.Limits.MaxPathLength"),
            ["AzureDevOps__Limits__MaxWorkItemIds"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_azureDevOps.Limits.MaxWorkItemIds"),
            ["AzureDevOps__Limits__MaxReferenceNameLength"] = new("API-HistoriasUsuarioIA.Infrastructure/DependencyInjection.cs", "limits.MaxReferenceNameLength"),
            ["AzureDevOps__Limits__ReferenceNameRegexTimeoutMilliseconds"] = new("API-HistoriasUsuarioIA.Infrastructure/DependencyInjection.cs", "limits.ReferenceNameRegexTimeoutMilliseconds"),
            ["AzureDevOps__Queries__ProjectsTop"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_options.Queries.ProjectsTop"),
            ["AzureDevOps__Queries__ClassificationDepth"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_options.Queries.ClassificationDepth"),
            ["AzureDevOps__Queries__CommentsTop"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_options.Queries.CommentsTop"),
            ["AzureDevOps__Queries__TestPlansTop"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_options.Queries.TestPlansTop"),
            ["AzureDevOps__Creation__StaticSuiteNameAttempts"] = new("API-HistoriasUsuarioIA.Infrastructure/DependencyInjection.cs", ".Creation.StaticSuiteNameAttempts"),
            ["RequestLimits__SmallBodyBytes"] = new("API-HistoriasUsuarioIA.Function/Functions/AzdoMetadataFunction.cs", "_requestLimits.SmallBodyBytes"),
            ["RequestLimits__AiBodyBytes"] = new("API-HistoriasUsuarioIA.Function/Functions/GenerateWorkItemFunction.cs", "_requestLimits.AiBodyBytes"),
            ["RequestLimits__WorkItemBodyBytes"] = new("API-HistoriasUsuarioIA.Function/Functions/CreateAzureDevOpsItemsFunction.cs", "_requestLimits.WorkItemBodyBytes"),
            ["RequestLimits__ArchitectureBodyBytes"] = new("API-HistoriasUsuarioIA.Function/Functions/IntegracionArquitecturaHUFunction.cs", "_requestLimits.ArchitectureBodyBytes"),
            ["RequestLimits__CvBodyBytes"] = new("API-HistoriasUsuarioIA.Function/Functions/AnalyzeCvFunction.cs", "_requestLimits.CvBodyBytes"),
            ["RequestValidation__MaxJsonDepth"] = new("API-HistoriasUsuarioIA.Application/Common/Serialization/JsonPayloadSerializer.cs", "options.Value.MaxJsonDepth"),
            ["RequestValidation__MaxSecretHeaderLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_requestValidation.MaxSecretHeaderLength"),
            ["RequestValidation__MaxCorrelationIdLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_requestValidation.MaxCorrelationIdLength"),
            ["Transport__ReadBufferBytes"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_transport.ReadBufferBytes"),
            ["WorkItemLimits__MaxTitleLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_workItems.MaxTitleLength"),
            ["WorkItemLimits__MaxDescriptionLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_workItems.MaxDescriptionLength"),
            ["WorkItemLimits__MaxTestStepTextLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_workItems.MaxTestStepTextLength"),
            ["WorkItemLimits__MaxTestCases"] = new("API-HistoriasUsuarioIA.Application/Common/TestCaseContentValidator.cs", "_limits.MaxTestCases"),
            ["WorkItemLimits__MaxTestCaseSteps"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_workItems.MaxTestCaseSteps"),
            ["WorkItemLimits__MaxAdditionalFields"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_workItems.MaxAdditionalFields"),
            ["ArchitectureIntegration__MaxMarkdownLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_architecture.MaxMarkdownLength"),
            ["CvAnalysis__MaxTextLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_cv.MaxTextLength"),
            ["CvAnalysis__MaxPromptTextLength"] = new("API-HistoriasUsuarioIA.Application/UseCases/AnalyzeCv/AnalyzeCvUseCase.cs", "_limits.MaxPromptTextLength"),
            ["CvAnalysis__MaxPageCount"] = new("API-HistoriasUsuarioIA.Function/Helpers/RequestValidationHelper.cs", "_cv.MaxPageCount"),
            ["Observability__MaxScalarLogLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/ErrorLoggingHelper.cs", "_options.MaxScalarLogLength"),
            ["Observability__MaxContextArrayItems"] = new("API-HistoriasUsuarioIA.Function/Helpers/ErrorLoggingHelper.cs", "_options.MaxContextArrayItems"),
            ["Observability__MaxGenericTextLength"] = new("API-HistoriasUsuarioIA.Function/Helpers/ErrorLoggingHelper.cs", "_options.MaxGenericTextLength"),
            ["Observability__MaxExternalErrorDetailLength"] = new("API-HistoriasUsuarioIA.Infrastructure/AzDoServiceFactory.cs", "_observability.MaxExternalErrorDetailLength")
        };

    [Fact]
    public void ExampleReferenceAndOptionsExposeTheSameConfigurationInventory()
    {
        var exampleText = File.ReadAllText(ConfigurationPath("local.settings.example.json"));
        var referenceText = File.ReadAllText(ConfigurationPath("local.settings.reference.jsonc"));

        AssertNoDuplicatePropertyNames(exampleText, allowComments: false);
        AssertNoDuplicatePropertyNames(referenceText, allowComments: true);

        using var example = JsonDocument.Parse(exampleText);
        using var reference = JsonDocument.Parse(referenceText, JsonOptionsWithComments());

        var exampleValues = example.RootElement.GetProperty("Values");
        var exampleKeys = exampleValues.EnumerateObject()
            .Select(property => property.Name)
            .ToHashSet(StringComparer.Ordinal);
        var referenceEntries = CollectReferenceEntries(reference.RootElement);
        var optionsDefaults = CollectOptionsDefaults();
        var expectedKeys = optionsDefaults.Keys
            .Concat(HostKeys)
            .ToHashSet(StringComparer.Ordinal);

        Assert.Equal(59, expectedKeys.Count);
        Assert.True(expectedKeys.SetEquals(exampleKeys), DescribeSetDifference(expectedKeys, exampleKeys, "esperadas", "example"));
        Assert.True(expectedKeys.SetEquals(referenceEntries.Keys), DescribeSetDifference(expectedKeys, referenceEntries.Keys, "esperadas", "reference"));

        foreach (var legacyKey in LegacyKeys)
            Assert.DoesNotContain(legacyKey, exampleKeys);

        foreach (var (key, defaultValue) in optionsDefaults)
        {
            if (RequiredDeploymentSelections.Contains(key))
            {
                Assert.Equal(JsonValueKind.Null, referenceEntries[key].GetProperty("default").ValueKind);
                continue;
            }

            var configured = exampleValues.GetProperty(key).GetString();
            Assert.Equal(ToConfigurationString(defaultValue), configured);
            Assert.Equal(ToConfigurationString(defaultValue), ToJsonScalarString(referenceEntries[key].GetProperty("default")));
        }

        foreach (var hostKey in HostKeys)
        {
            Assert.Equal(
                exampleValues.GetProperty(hostKey).GetString(),
                ToJsonScalarString(referenceEntries[hostKey].GetProperty("default")));
        }
    }

    [Fact]
    public void ReferenceDocumentsEverySettingAndSecretsUsePlaceholders()
    {
        using var reference = JsonDocument.Parse(
            File.ReadAllText(ConfigurationPath("local.settings.reference.jsonc")),
            JsonOptionsWithComments());
        using var example = JsonDocument.Parse(File.ReadAllText(ConfigurationPath("local.settings.example.json")));

        var entries = CollectReferenceEntries(reference.RootElement);
        var exampleValues = example.RootElement.GetProperty("Values");
        var requiredMetadata = new[]
        {
            "appSetting", "purpose", "type", "default", "minimum", "maximum", "required",
            "secret", "conditionalProvider", "optional", "absoluteCeiling", "invalidConsequence"
        };

        foreach (var (key, entry) in entries)
        {
            foreach (var propertyName in requiredMetadata)
                Assert.True(entry.TryGetProperty(propertyName, out _), $"{key} no documenta {propertyName}.");

            Assert.False(string.IsNullOrWhiteSpace(entry.GetProperty("purpose").GetString()), $"{key} no tiene proposito.");
            Assert.False(string.IsNullOrWhiteSpace(entry.GetProperty("invalidConsequence").GetString()), $"{key} no explica la consecuencia invalida.");

            if (entry.GetProperty("type").GetString() == "integer")
            {
                var minimum = entry.GetProperty("minimum").GetInt64();
                var maximum = entry.GetProperty("maximum").GetInt64();
                var absoluteCeiling = entry.GetProperty("absoluteCeiling").GetInt64();
                var defaultValue = entry.GetProperty("default").GetInt64();
                Assert.True(minimum <= defaultValue && defaultValue <= maximum,
                    $"{key} tiene un default fuera de su rango documentado.");
                Assert.Equal(maximum, absoluteCeiling);
            }

            if (!entry.GetProperty("secret").GetBoolean())
                continue;

            var value = exampleValues.GetProperty(key).GetString() ?? string.Empty;
            var isSafeLocalEmulator = key == "AzureWebJobsStorage"
                && value == "UseDevelopmentStorage=true";
            Assert.True(isSafeLocalEmulator || IsPlaceholder(value), $"{key} debe usar un placeholder, no un secreto real.");
        }

        Assert.Equal("HttpTrigger AuthorizationLevel.Anonymous",
            reference.RootElement.GetProperty("Authentication").GetProperty("Owner").GetString());
        Assert.Equal("ARM web.cors",
            reference.RootElement.GetProperty("Cors").GetProperty("AzureOwner").GetString());
    }

    [Fact]
    public void MarkdownContainsExactlyTheSameSettingsAndReferenceValues()
    {
        using var example = JsonDocument.Parse(File.ReadAllText(ConfigurationPath("local.settings.example.json")));
        var exampleValues = example.RootElement.GetProperty("Values");
        var markdown = File.ReadAllText(ConfigurationPath("APP_SETTINGS.md"));
        var markdownEntries = CollectMarkdownEntries(markdown);
        var expectedKeys = exampleValues.EnumerateObject()
            .Select(property => property.Name)
            .ToHashSet(StringComparer.Ordinal);

        Assert.True(expectedKeys.SetEquals(markdownEntries.Keys),
            DescribeSetDifference(expectedKeys, markdownEntries.Keys, "example", "Markdown"));
        Assert.Equal(59, markdownEntries.Count);

        foreach (var property in exampleValues.EnumerateObject())
        {
            var expected = property.Value.GetString() ?? string.Empty;
            var documented = markdownEntries[property.Name];
            Assert.Equal(expected.Length == 0 ? "Vacío" : expected, documented);
        }

        Assert.Contains("## Funcionamiento", markdown, StringComparison.Ordinal);
        Assert.Contains("## Proveedores", markdown, StringComparison.Ordinal);
        Assert.Contains("### OpenAI", markdown, StringComparison.Ordinal);
        Assert.Contains("### N8n", markdown, StringComparison.Ordinal);
        Assert.Contains("## Ejemplos seguros", markdown, StringComparison.Ordinal);
        Assert.Contains("## Errores comunes", markdown, StringComparison.Ordinal);
        Assert.Contains("## Acceso HTTP sin Function Keys", markdown, StringComparison.Ordinal);
        Assert.Contains("AuthorizationLevel.Anonymous", markdown, StringComparison.Ordinal);
    }

    [Fact]
    public void EveryConfigurableOptionHasExplicitProductionConsumerEvidence()
    {
        var optionKeys = CollectOptionsDefaults().Keys.ToHashSet(StringComparer.Ordinal);
        Assert.True(optionKeys.SetEquals(ProductionConsumers.Keys),
            DescribeSetDifference(optionKeys, ProductionConsumers.Keys, "Options", "consumer map"));

        var root = FindSolutionRoot();
        foreach (var (key, evidence) in ProductionConsumers)
        {
            var path = Path.Combine(root, evidence.RelativePath.Replace('/', Path.DirectorySeparatorChar));
            Assert.True(File.Exists(path), $"{key}: no existe consumidor {evidence.RelativePath}.");
            var source = File.ReadAllText(path);
            Assert.Contains(evidence.Marker, source, StringComparison.Ordinal);
        }
    }

    private static Dictionary<string, object?> CollectOptionsDefaults()
    {
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        AddOptions(result, RequestLimitsOptions.SectionName, new RequestLimitsOptions());
        AddOptions(result, RequestValidationOptions.SectionName, new RequestValidationOptions());
        AddOptions(result, TransportOptions.SectionName, new TransportOptions());
        AddOptions(result, WorkItemLimitsOptions.SectionName, new WorkItemLimitsOptions());
        AddOptions(result, ArchitectureIntegrationOptions.SectionName, new ArchitectureIntegrationOptions());
        AddOptions(result, CvAnalysisOptions.SectionName, new CvAnalysisOptions());
        AddOptions(result, ObservabilityOptions.SectionName, new ObservabilityOptions());
        AddOptions(result, AiConnectionOptions.SectionName, new AiConnectionOptions());
        AddOptions(result, AzureDevOpsOptions.SectionName, new AzureDevOpsOptions());
        return result;
    }

    private static void AddOptions(IDictionary<string, object?> result, string prefix, object instance)
    {
        foreach (var property in instance.GetType().GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            if (!property.CanRead || !property.CanWrite)
                continue;

            var key = $"{prefix}__{property.Name}";
            var value = property.GetValue(instance);
            if (IsConfigurationScalar(property.PropertyType))
            {
                Assert.True(result.TryAdd(key, value), $"Clave Options duplicada: {key}");
                continue;
            }

            Assert.NotNull(value);
            AddOptions(result, key, value!);
        }
    }

    private static bool IsConfigurationScalar(Type type) =>
        type == typeof(string)
        || type == typeof(bool)
        || type == typeof(int)
        || type == typeof(long)
        || type == typeof(double)
        || type == typeof(decimal)
        || type.IsEnum;

    private static Dictionary<string, JsonElement> CollectReferenceEntries(JsonElement root)
    {
        var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        Visit(root);
        return result;

        void Visit(JsonElement element)
        {
            if (element.ValueKind != JsonValueKind.Object)
                return;

            if (element.TryGetProperty("appSetting", out var appSetting))
            {
                var key = appSetting.GetString();
                Assert.False(string.IsNullOrWhiteSpace(key));
                Assert.True(result.TryAdd(key!, element), $"appSetting duplicada en reference: {key}");
                return;
            }

            foreach (var property in element.EnumerateObject())
                Visit(property.Value);
        }
    }

    private static Dictionary<string, string> CollectMarkdownEntries(string markdown)
    {
        var lines = markdown.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var headerIndex = Array.FindIndex(lines, line => line.StartsWith("| App Setting |", StringComparison.Ordinal));
        Assert.True(headerIndex >= 0, "APP_SETTINGS.md no contiene la tabla canonica.");

        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = headerIndex + 2; index < lines.Length; index++)
        {
            var line = lines[index];
            if (!line.StartsWith('|'))
                break;

            var columns = line.Split('|').Skip(1).SkipLast(1).Select(value => value.Trim()).ToArray();
            Assert.Equal(8, columns.Length);
            var key = RemoveCodeTicks(columns[0]);
            Assert.True(result.TryAdd(key, NormalizeReferenceValue(columns[3])), $"Clave duplicada en Markdown: {key}");
        }

        return result;
    }

    private static string NormalizeReferenceValue(string value) =>
        string.Equals(value, "Vacío", StringComparison.Ordinal)
            ? value
            : RemoveCodeTicks(value);

    private static string RemoveCodeTicks(string value) =>
        value.Length >= 2 && value[0] == '`' && value[^1] == '`'
            ? value[1..^1]
            : value;

    private static void AssertNoDuplicatePropertyNames(string json, bool allowComments)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        var reader = new Utf8JsonReader(bytes, new JsonReaderOptions
        {
            CommentHandling = allowComments ? JsonCommentHandling.Skip : JsonCommentHandling.Disallow,
            AllowTrailingCommas = allowComments
        });
        var objectProperties = new Stack<HashSet<string>>();

        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.StartObject)
                objectProperties.Push(new HashSet<string>(StringComparer.Ordinal));
            else if (reader.TokenType == JsonTokenType.EndObject)
                objectProperties.Pop();
            else if (reader.TokenType == JsonTokenType.PropertyName)
            {
                var propertyName = reader.GetString()!;
                Assert.True(objectProperties.Peek().Add(propertyName), $"Propiedad JSON duplicada: {propertyName}");
            }
        }

        Assert.Empty(objectProperties);
    }

    private static JsonDocumentOptions JsonOptionsWithComments() => new()
    {
        CommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private static string ConfigurationPath(string fileName) =>
        Path.Combine(FindSolutionRoot(), "API-HistoriasUsuarioIA.Function", fileName);

    private static string FindSolutionRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "API-HistoriasUsuarioIA-funcion.sln")))
                return directory.FullName;
            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException("No se encontro la raiz de la solucion.");
    }

    private static bool IsPlaceholder(string value) =>
        value.StartsWith('<')
        && value.EndsWith('>')
        && value.Length > 2;

    private static string ToConfigurationString(object? value) => value switch
    {
        null => string.Empty,
        bool boolean => boolean ? "true" : "false",
        IFormattable formattable => formattable.ToString(null, System.Globalization.CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty
    };

    private static string ToJsonScalarString(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString() ?? string.Empty,
        JsonValueKind.Number => value.GetRawText(),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Null => string.Empty,
        _ => throw new InvalidOperationException($"Valor default no escalar: {value.ValueKind}.")
    };

    private static string DescribeSetDifference(
        IEnumerable<string> expected,
        IEnumerable<string> actual,
        string expectedName,
        string actualName)
    {
        var expectedSet = expected.ToHashSet(StringComparer.Ordinal);
        var actualSet = actual.ToHashSet(StringComparer.Ordinal);
        return $"Solo {expectedName}: {string.Join(", ", expectedSet.Except(actualSet).Order())}; "
            + $"solo {actualName}: {string.Join(", ", actualSet.Except(expectedSet).Order())}.";
    }

    private sealed record ConsumerEvidence(string RelativePath, string Marker);
}
