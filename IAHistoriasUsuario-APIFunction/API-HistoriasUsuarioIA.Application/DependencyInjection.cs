using API_HistoriasUsuarioIA_funcion.Application.UseCases.AnalyzeCv;
using API_HistoriasUsuarioIA_funcion.Application.Common;
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
using Microsoft.Extensions.DependencyInjection;

namespace API_HistoriasUsuarioIA_funcion.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddTransient<IAnalyzeCvUseCase, AnalyzeCvUseCase>();
        services.AddTransient<IEvaluateWorkItemUseCase, EvaluateWorkItemUseCase>();
        services.AddTransient<IGenerateWorkItemUseCase, GenerateWorkItemUseCase>();
        services.AddTransient<IGenerateTestCasesUseCase, GenerateTestCasesUseCase>();
        services.AddTransient<ICreateAzureDevOpsItemsUseCase, CreateAzureDevOpsItemsUseCase>();
        services.AddTransient<ICreateTestCasesUseCase, CreateTestCasesUseCase>();
        services.AddTransient<IIntegrateArchitectureHuUseCase, IntegrateArchitectureHuUseCase>();
        services.AddTransient<IGetAzdoMetadataUseCase, GetAzdoMetadataUseCase>();
        services.AddTransient<IGetAzdoTestPlansUseCase, GetAzdoTestPlansUseCase>();
        services.AddTransient<IGetAzdoWorkItemConfigUseCase, GetAzdoWorkItemConfigUseCase>();
        services.AddTransient<IGetAzdoWorkItemDiscussionCommentsUseCase, GetAzdoWorkItemDiscussionCommentsUseCase>();
        services.AddTransient<ISearchWorkItemsUseCase, SearchWorkItemsUseCase>();
        services.AddSingleton<JsonPayloadSerializer>();
        services.AddSingleton<TestCaseContentValidator>();
        services.AddSingleton(TimeProvider.System);

        return services;
    }
}
