using System.Text.Json;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;

namespace API_HistoriasUsuarioIA_funcion.Tests.Contracts.Serialization;

public sealed class ContractSerializationSmokeTests
{
    [Fact]
    public void CreateAzureDevOpsItemsUseCaseResponse_UsesExpectedJsonNames()
    {
        var value = new CreateAzureDevOpsItemsUseCaseResponse
        {
            HuId = 1,
            HuUrl = "https://example.test/work-items/1",
            Message = "ok"
        };

        AssertJsonProperties(value, "huId", "huUrl", "message");
        AssertJsonPropertiesNotPresent(value, "workItemId", "workItemUrl", "testCases", "suiteId", "id", "url");
    }

    [Fact]
    public void TestPlansResponse_UsesExpectedJsonNames()
    {
        var value = new TestPlansResponse
        {
            Project = "Proyecto",
            TestPlans = [new TestPlanSummary { Id = 1, Name = "Plan" }]
        };

        AssertJsonProperties(value, "project", "testPlans");
    }

    [Fact]
    public void TestPlanSummary_UsesExpectedJsonNames()
    {
        var value = new TestPlanSummary
        {
            Id = 1,
            Name = "Plan"
        };

        AssertJsonProperties(value, "id", "name");
    }

    [Fact]
    public void WorkItemConfigResponse_UsesExpectedJsonNames()
    {
        var value = new WorkItemConfigResponse
        {
            Project = "Proyecto",
            WorkItemType = "User Story",
            Fields = []
        };

        AssertJsonProperties(value, "project", "workItemType", "fields");
    }

    [Fact]
    public void CvAnalysisResponse_UsesExpectedJsonNames()
    {
        var value = new CvAnalysisResponse
        {
            FileName = "cv.pdf",
            Source = "upload",
            PageCount = 1,
            PuntuacionGeneral = 80,
            ModeloUsado = "model"
        };

        AssertJsonProperties(value, "fileName", "source", "pageCount", "puntuacionGeneral", "modeloUsado");
    }

    private static void AssertJsonProperties<T>(T value, params string[] expectedProperties)
    {
        var json = JsonSerializer.Serialize(value, TestOptionsFactory.JsonSerializer.Options);
        using var document = JsonDocument.Parse(json);

        foreach (var propertyName in expectedProperties)
        {
            Assert.True(
                document.RootElement.TryGetProperty(propertyName, out _),
                $"Expected JSON property '{propertyName}' was not found in {json}.");
        }
    }

    private static void AssertJsonPropertiesNotPresent<T>(T value, params string[] forbiddenProperties)
    {
        var json = JsonSerializer.Serialize(value, TestOptionsFactory.JsonSerializer.Options);
        using var document = JsonDocument.Parse(json);

        foreach (var propertyName in forbiddenProperties)
        {
            Assert.False(
                document.RootElement.TryGetProperty(propertyName, out _),
                $"Forbidden JSON property '{propertyName}' was found in {json}.");
        }
    }
}
