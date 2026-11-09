using API_HistoriasUsuarioIA_funcion.Domain.Policies;
using API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories;

namespace API_HistoriasUsuarioIA_funcion.Tests.Domain.Policies;

public sealed class WorkItemFieldPolicyTests
{
    [Theory]
    [InlineData("System.CreatedBy")]
    [InlineData("System.ChangedBy")]
    [InlineData("System.CreatedDate")]
    [InlineData("System.ChangedDate")]
    [InlineData("System.AuthorizedAs")]
    [InlineData("System.AuthorizedDate")]
    [InlineData("System.Rev")]
    [InlineData("System.Id")]
    [InlineData("System.Watermark")]
    [InlineData("System.State")]
    [InlineData("System.Reason")]
    [InlineData("System.ActivatedBy")]
    [InlineData("System.ActivatedDate")]
    [InlineData("System.ResolvedBy")]
    [InlineData("System.ResolvedDate")]
    [InlineData("System.ClosedBy")]
    [InlineData("System.ClosedDate")]
    [InlineData("Microsoft.VSTS.Common.StateChangeDate")]
    public void ContainsBlockedField_ReturnsTrue_ForBlockedFields(string fieldName)
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy();

        var result = policy.ContainsBlockedField([fieldName]);

        Assert.True(result);
    }

    [Theory]
    [InlineData("System.Title")]
    [InlineData("System.Description")]
    [InlineData("System.AssignedTo")]
    [InlineData("System.Tags")]
    [InlineData("Microsoft.VSTS.Common.AcceptanceCriteria")]
    [InlineData("Custom.Sample.Field")]
    public void ContainsBlockedField_ReturnsFalse_ForAllowedFields(string fieldName)
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy();

        var result = policy.ContainsBlockedField([fieldName]);

        Assert.False(result);
    }

    [Theory]
    [InlineData("assignedTo")]
    [InlineData("startDate")]
    [InlineData("finishDate")]
    [InlineData("valueArea")]
    [InlineData("priority")]
    [InlineData("risk")]
    [InlineData("storyPoints")]
    [InlineData("tipoHU")]
    [InlineData("frenteDeTrabajo")]
    public void ValidateHuFieldNames_RejectsLegacyAliases(string fieldName)
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy();

        var result = policy.ValidateHuFieldNames(["title", fieldName]);

        Assert.False(result.IsValid);
        Assert.Contains("aliases legacy", result.Message);
        Assert.Contains(fieldName, result.InvalidFields);
    }

    [Theory]
    [InlineData("areaPath")]
    [InlineData("iterationPath")]
    [InlineData("workItemType")]
    [InlineData("testCases")]
    [InlineData("testSuite")]
    [InlineData("System.AreaPath")]
    [InlineData("System.IterationPath")]
    [InlineData("System.WorkItemType")]
    [InlineData("System.TeamProject")]
    [InlineData("System.State")]
    [InlineData("System.Reason")]
    public void ValidateHuFieldNames_RejectsInfrastructureFields(string fieldName)
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy();

        var result = policy.ValidateHuFieldNames(["title", fieldName]);

        Assert.False(result.IsValid);
        Assert.Contains("infraestructura", result.Message);
        Assert.Contains(fieldName, result.InvalidFields);
    }

    [Theory]
    [InlineData("title")]
    [InlineData("description")]
    [InlineData("acceptanceCriteria")]
    [InlineData("System.AssignedTo")]
    [InlineData("Microsoft.VSTS.Scheduling.StartDate")]
    [InlineData("Microsoft.VSTS.Scheduling.FinishDate")]
    [InlineData("Microsoft.VSTS.Common.ValueArea")]
    [InlineData("Microsoft.VSTS.Common.Priority")]
    [InlineData("Microsoft.VSTS.Common.Risk")]
    [InlineData("Microsoft.VSTS.Scheduling.StoryPoints")]
    [InlineData("Custom.FrentedeTrabajo")]
    [InlineData("Custom.TipoHU")]
    public void ValidateHuFieldNames_AllowsCanonicalHuFields(string fieldName)
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy();

        var result = policy.ValidateHuFieldNames(["title", fieldName]);

        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("Custom.Safe/../../relations")]
    [InlineData("Custom.Safe~1System.Title")]
    [InlineData("Custom.Field Name")]
    [InlineData("Custom..Field")]
    [InlineData("Custom.Field[")]
    [InlineData("custom.Field")]
    public void ValidateHuFieldNames_RejectsInvalidReferenceNameSyntax(string fieldName)
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy();

        var result = policy.ValidateHuFieldNames(["title", fieldName]);

        Assert.False(result.IsValid);
        Assert.Contains(fieldName, result.InvalidFields);
    }

    [Fact]
    public void ValidateHuFieldNames_UsesConfiguredReferenceNameLength()
    {
        var policy = TestOptionsFactory.CreateWorkItemFieldPolicy(maxReferenceNameLength: 12);

        var result = policy.ValidateHuFieldNames(["title", "Custom.TooLong"]);

        Assert.False(result.IsValid);
        Assert.Contains("Custom.TooLong", result.InvalidFields);
    }
}
