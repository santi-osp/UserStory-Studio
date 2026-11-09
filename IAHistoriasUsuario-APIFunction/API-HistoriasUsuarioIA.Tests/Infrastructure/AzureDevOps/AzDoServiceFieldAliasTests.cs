using System.Reflection;
using API_HistoriasUsuarioIA_funcion;

namespace API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.AzureDevOps;

public sealed class AzDoServiceFieldAliasTests
{
    [Theory]
    [InlineData("System.Title", "Titulo", "title")]
    [InlineData("System.Description", "Descripcion", "description")]
    [InlineData("Microsoft.VSTS.Common.ValueArea", "Value Area", "valueArea")]
    [InlineData("Microsoft.VSTS.Common.BusinessValue", "Business Value", "businessValue")]
    [InlineData("Microsoft.VSTS.Scheduling.StoryPoints", "Story Points", "storyPoints")]
    [InlineData("Custom.TipoHU", "Tipo HU", "tipoHU")]
    [InlineData("Custom.FrenteDeTrabajo", "Frente de trabajo", "frenteDeTrabajo")]
    public void BuildFieldAlias_DerivesAliasFromReferenceNameLastSegment(
        string referenceName,
        string label,
        string expectedAlias)
    {
        Assert.Equal(expectedAlias, BuildFieldAlias(referenceName, label));
    }

    [Theory]
    [InlineData("Microsoft.VSTS.Common.BacklogPriority", "Priority", "backlogPriority")]
    [InlineData("Microsoft.VSTS.Common.Severity", "Risk", "severity")]
    public void BuildFieldAlias_DoesNotMapDistinctFieldsAsEquivalent(
        string referenceName,
        string label,
        string expectedAlias)
    {
        Assert.Equal(expectedAlias, BuildFieldAlias(referenceName, label));
    }

    [Fact]
    public void BuildFieldAlias_UsesLabelOnlyWhenReferenceNameIsEmpty()
    {
        Assert.Equal("valueArea", BuildFieldAlias(string.Empty, "Value Area"));
    }

    private static string BuildFieldAlias(string referenceName, string label)
    {
        var method = typeof(AzDoService).GetMethod(
            "BuildFieldAlias",
            BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(method);

        return Assert.IsType<string>(method.Invoke(null, [referenceName, label]));
    }
}
