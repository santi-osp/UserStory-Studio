# Arquitectura frontend

La aplicación usa Angular standalone y carga perezosamente cinco pantallas: diseñar Work Item, crear desde texto, previsualizar, configuración Azure y evaluar HU. `AppConfig` registra router, correlation interceptor y error interceptor.

La dirección principal es componente -> servicio funcional -> `ApiService` -> `ApplicationConfigurationService`/HttpClient. Los componentes no importan environments. `api-contract.ts` concentra las ocho rutas consumidas; `api-url.ts` valida base y construye URL. OpenAI y Azure DevOps no se llaman directamente desde componentes.

`AzdoConfigService` mantiene organización/contexto y PAT. El PAT permanece en memoria; storage solo contiene estado no sensible según las claves centralizadas. `PreviewHistoryService` conserva borradores/historial funcional y nunca URLs completas. Los prompts de Work Items permanecen en `src/app/prompts/work-items` y se validan con specs de contrato.

La documentación canónica de endpoints, modelos, seguridad e integraciones vive en el [repositorio backend](../../IAHistoriasUsuario-APIFunction/docs/README.md); este documento describe únicamente decisiones Angular.
