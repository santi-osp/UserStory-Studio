# Proyectos y capas

| Proyecto | Responsabilidad | Dependencias permitidas |
| --- | --- | --- |
| `Domain` | Políticas puras de campos y contenido HTML. | Ningún proyecto interno. |
| `Application` | Modelos, comandos/queries, Use Cases, puertos, serialización y validaciones compartidas. | Domain. |
| `Infrastructure` | OpenAI/N8n, Azure DevOps REST, parser, factories, seguridad de transporte y archivos de prompt. | Application y Domain. |
| `Function` | Triggers HTTP, límites de body, resolución de contexto, respuestas, logging, Options operativas y composición. | Application e Infrastructure. |
| `Tests` | Un único proyecto xUnit organizado por capa y componente, con soporte compartido separado en `TestSupport`. | Los cuatro proyectos productivos. |

La dirección principal es `Function -> Application -> Domain`; Infrastructure entra por inversión de dependencias al implementar interfaces de Application. `Program.cs` compone `AddApplication`, `AddInfrastructure` y `AddValidatedOperationalOptions`. Los Use Cases y gateways son transitorios; serializador, validadores compartidos, proveedor de prompts, ejecutor IA y políticas inmutables usan singleton cuando corresponde.

Las nueve familias de Options son `AiConnection`, `AzureDevOps`, `RequestLimits`, `RequestValidation`, `Transport`, `WorkItemLimits`, `ArchitectureIntegration`, `CvAnalysis` y `Observability`. Todas se enlazan una vez y usan `ValidateOnStart`; una configuración inválida debe impedir el arranque.

Las carpetas de `API-HistoriasUsuarioIA.Tests` reflejan estas capas sin crear proyectos paralelos por tipo de prueba. Los namespaces conservan la raíz `API_HistoriasUsuarioIA_funcion.Tests`; por ejemplo, las pruebas de Azure DevOps están en `Infrastructure/AzureDevOps` y las de configuración del host en `Function/Configuration`. `TestSupport` aloja únicamente utilidades compartidas sin escenarios xUnit.
