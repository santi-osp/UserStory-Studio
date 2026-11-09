namespace API_HistoriasUsuarioIA_funcion.Application.Common.AzureDevOps;

/// <summary>Invariantes técnicos de Azure DevOps usados por creación y metadata.</summary>
public static class AzureDevOpsProtocol
{
    public const string ApiVersion = "7.1";
    public const string TestCaseWorkItemType = "Test Case";
    public const string StateReferenceName = "System.State";
    public const string StaticTestSuiteType = "staticTestSuite";
    public const string RequirementTestSuiteType = "requirementTestSuite";
    public const string TestedByForwardRelation = "Microsoft.VSTS.Common.TestedBy-Forward";
}
