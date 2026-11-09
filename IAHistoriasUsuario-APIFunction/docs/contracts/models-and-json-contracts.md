# Modelos y contratos JSON

Los DTO de entrada principales usan `JsonUnmappedMemberHandling.Disallow`; una propiedad desconocida produce `400`. La serialización web usa camelCase. Las claves dinámicas solo se admiten donde existe `JsonExtensionData`, concretamente en `WorkItemFields`.

## Tipos compartidos

- `AzdoContextPayload`: `organization`, `azurePath`.
- `WorkItemFields`: `title`, `description`, `acceptanceCriteria` y campos adicionales. `ToValueMap` conserva escalares y JSON para que la política los resuelva por alias, nombre o `referenceName`.
- `TestCaseFields`: `title`, `state`, `steps[]`; cada paso exige `action` y `expected`.
- `TestSuitePayload`: `planId` positivo cuando se solicita asociación.
- `ErrorResponse`: `code`, `message`, `correlationId`, `detail` opcional. No expone stack traces ni credenciales.

## Generación

`GenerateWorkItemRequest` recibe prompt, system prompt, modelo y contexto opcional. `GenerateTestCasesRequest` separa el contrato exclusivo de casos. Ambos devuelven `GenerateWorkItemUseCaseResponse` con `json` normalizado, `raw` del proveedor y warning opcional; el frontend mantiene `rawJson`/`parsed` como estado técnico, no como contrato de creación.

## Creación

`CreateWorkItemPayload` es el contrato canónico de `/create` y requiere la propiedad `hu`. `WorkItemPayload` existe como modelo interno/compatibilidad, pero el endpoint valida el contrato canónico. `CreateTestCasesPayload` no contiene HU ni tipo de suite. Las respuestas detallan éxito completo o parcial y distinguen suite, plan, casos creados, fallos por índice/fase y warnings.

## Consulta y evaluación

Metadata devuelve listas agregadas y metadata por proyecto. Work Item Config devuelve únicamente campos seleccionados para UI, con `referenceName` como identidad estable. Search devuelve items livianos. Evaluate devuelve una estructura amplia: resumen, score/nivel, readiness, hallazgos, riesgos, ambigüedades, faltantes, edge cases, dependencias, seguridad, observabilidad, recomendaciones, preguntas, criterios sugeridos, versión mejorada, prioridad y conclusión.

## Arquitectura y CV

Arquitectura admite varias claves de texto por compatibilidad del integrador; el parser genera un resumen y una preparación antes de mutar. CV recibe texto ya extraído y devuelve un esquema en español normalizado. El system prompt de CV permanece en `API-HistoriasUsuarioIA.Function/Prompts/Cv/CvAnalysis.system.md` y se copia a output/publish por el `.csproj`.

Los límites exactos de cuerpos, texto, arreglos y profundidad se configuran en las 59 App Settings; consulta [APP_SETTINGS.md](../../API-HistoriasUsuarioIA.Function/APP_SETTINGS.md).
