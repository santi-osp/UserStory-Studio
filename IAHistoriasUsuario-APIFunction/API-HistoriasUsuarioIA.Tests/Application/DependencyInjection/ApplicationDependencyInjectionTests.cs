using API_HistoriasUsuarioIA_funcion.Application;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateAzureDevOpsItems;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.CreateTestCases;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.EvaluateWorkItem;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateWorkItem;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GenerateTestCases;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoMetadata;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoTestPlans;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemConfig;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.GetAzdoWorkItemDiscussionComments;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.IntegrateArchitectureHu;
using API_HistoriasUsuarioIA_funcion.Application.UseCases.SearchWorkItems;
using API_HistoriasUsuarioIA_funcion.Application.Common;
using Microsoft.Extensions.DependencyInjection;

namespace API_HistoriasUsuarioIA_funcion.Tests.Application.DependencyInjection;

public sealed class ApplicationDependencyInjectionTests
{
    public static TheoryData<Type> TransientUseCases => new()
    {
        typeof(IAnalyzeCvUseCase),
        typeof(IEvaluateWorkItemUseCase),
        typeof(IGenerateWorkItemUseCase),
        typeof(IGenerateTestCasesUseCase),
        typeof(ICreateAzureDevOpsItemsUseCase),
        typeof(ICreateTestCasesUseCase),
        typeof(IIntegrateArchitectureHuUseCase),
        typeof(IGetAzdoMetadataUseCase),
        typeof(IGetAzdoTestPlansUseCase),
        typeof(IGetAzdoWorkItemConfigUseCase),
        typeof(IGetAzdoWorkItemDiscussionCommentsUseCase),
        typeof(ISearchWorkItemsUseCase)
    };

    [Theory]
    [MemberData(nameof(TransientUseCases))]
    public void AddApplication_RegistersUseCasesAsTransient(Type serviceType)
    {
        var services = new ServiceCollection();

        services.AddApplication();

        var descriptor = Assert.Single(services, service => service.ServiceType == serviceType);
        Assert.Equal(ServiceLifetime.Transient, descriptor.Lifetime);
    }

    [Fact]
    public void AddApplication_RegistersSharedSerializationAndValidationAsSingletons()
    {
        var services = new ServiceCollection();

        services.AddApplication();

        var serializer = Assert.Single(services, service => service.ServiceType == typeof(JsonPayloadSerializer));
        var validator = Assert.Single(services, service => service.ServiceType == typeof(TestCaseContentValidator));
        Assert.Equal(ServiceLifetime.Singleton, serializer.Lifetime);
        Assert.Equal(ServiceLifetime.Singleton, validator.Lifetime);
    }
}
