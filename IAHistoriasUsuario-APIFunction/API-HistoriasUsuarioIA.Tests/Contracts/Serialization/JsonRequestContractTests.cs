using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;

namespace API_HistoriasUsuarioIA_funcion.Tests.Contracts.Serialization;

public sealed class JsonRequestContractTests
{
    [Fact]
    public void StrictRequest_AcceptsKnownPropertiesCaseInsensitively()
    {
        const string json = """
            {
              "PROMPT": "Genera una HU",
              "systemPrompt": "Contrato",
              "model": null,
              "azdoContext": null
            }
            """;

        var request = JsonSerializer.Deserialize<GenerateWorkItemRequest>(
            json,
            TestOptionsFactory.JsonSerializer.Options);

        Assert.NotNull(request);
        Assert.Equal("Genera una HU", request.Prompt);
        Assert.Null(request.Model);
    }

    [Fact]
    public void StrictRequest_RejectsUnknownProperties()
    {
        const string json = """
            {
              "prompt": "Genera una HU",
              "systemPrompt": "Contrato",
              "metadata": { "source": "external" }
            }
            """;

        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<GenerateWorkItemRequest>(
                json,
                TestOptionsFactory.JsonSerializer.Options));
    }

    [Fact]
    public void StrictRequest_RejectsInvalidPropertyTypes()
    {
        const string json = """
            {
              "prompt": 123,
              "systemPrompt": "Contrato"
            }
            """;

        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<GenerateWorkItemRequest>(
                json,
                TestOptionsFactory.JsonSerializer.Options));
    }

    [Fact]
    public void ArchitectureEnvelope_AllowsDocumentedMarkdownAliasesWithoutMassAssignment()
    {
        const string json = """
            {
              "azdoOrg": "org-demo",
              "azdoProject": "project-demo",
              "iterationPath": "project-demo\\Sprint 1",
              "areaPath": "project-demo\\Team",
              "estructura_backlog_markdown": "# Epic: Demo",
              "metadata": { "source": "controlled-test" }
            }
            """;

        var context = JsonSerializer.Deserialize<IntegracionArquitecturaHURequest>(
            json,
            TestOptionsFactory.JsonSerializer.Options);

        Assert.NotNull(context);
        Assert.Equal("org-demo", context.AzdoOrg);
        Assert.Equal("project-demo", context.AzdoProject);
        Assert.DoesNotContain(
            context.GetType().GetProperties(),
            property => property.Name.Equals("metadata", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ArchitectureMarkdownDto_IgnoresExtensionsAndKeepsOnlyKnownContent()
    {
        const string json = """
            {
              "markdown": "# Epic: Demo",
              "azdoProject": "project-demo",
              "metadata": { "source": "controlled-test" }
            }
            """;

        var request = JsonSerializer.Deserialize<IntegracionArquitecturaHUCreateRequest>(
            json,
            TestOptionsFactory.JsonSerializer.Options);

        Assert.NotNull(request);
        Assert.Equal("# Epic: Demo", request.Markdown);
        Assert.DoesNotContain(
            request.GetType().GetProperties(),
            property => property.Name.Equals("metadata", StringComparison.OrdinalIgnoreCase));
    }
}
