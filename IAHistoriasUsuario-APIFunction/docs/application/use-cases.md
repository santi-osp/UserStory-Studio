# Use Cases

| Use Case | Entrada | Puerto principal | Resultado |
| --- | --- | --- | --- |
| `GenerateWorkItemUseCase` | `GenerateWorkItemCommand` | `IWorkItemGenerationAiGateway` | JSON de Work Item validado |
| `GenerateTestCasesUseCase` | `GenerateTestCasesCommand` | `IWorkItemGenerationAiGateway` | suite/casos validados |
| `CreateAzureDevOpsItemsUseCase` | `CreateAzureDevOpsItemsCommand` | `IAzureDevOpsWorkItemCreationGateway` | creación completa/parcial |
| `CreateTestCasesUseCase` | comando exclusivo | mismo gateway | suite estática/casos |
| `GetAzdoMetadataUseCase` | query de contexto | `IAzureDevOpsMetadataGateway` | proyectos y clasificación |
| `GetAzdoWorkItemConfigUseCase` | proyecto/tipo | `IAzureDevOpsWorkItemConfigGateway` | campos para UI |
| `GetAzdoTestPlansUseCase` | proyecto | `IAzureDevOpsTestPlansGateway` | planes |
| `GetAzdoWorkItemDiscussionCommentsUseCase` | IDs | `IAzureDevOpsWorkItemDiscussionCommentsGateway` | comentarios agregados |
| `SearchWorkItemsUseCase` | filtros | `IAzureDevOpsWorkItemSearchGateway` | selector liviano |
| `EvaluateWorkItemUseCase` | ID/prompts | gateways Azure DevOps e IA | evaluación estructurada |
| `IntegrateArchitectureHuUseCase` | Markdown/contexto | parser y gateway de arquitectura | validación o jerarquía |
| `AnalyzeCvUseCase` | texto/metadatos | `ICvAnalysisAiGateway`, prompt provider | análisis normalizado |

Los adapters HTTP resuelven transporte; los Use Cases no leen headers HTTP, `IConfiguration` ni URLs. Las políticas compartidas validan campos permitidos, HTML, Test Cases y serialización. Application no selecciona secretos: recibe PAT o usa puertos configurados por Infrastructure.
