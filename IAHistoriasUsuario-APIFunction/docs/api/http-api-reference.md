# Referencia HTTP

La URL pública agrega el prefijo del host `/api`, por ejemplo `https://HOST/api/v1.0.0/generate`. Todas las rutas son `POST`, conservan su contrato y declaran `AuthorizationLevel.Anonymous`. No requieren Function Key ni autenticación Entra.

## Headers comunes

| Header | Uso |
| --- | --- |
| `Content-Type: application/json` | Cuerpos JSON. |
| `x-correlation-id` | Opcional; se acepta solo con caracteres seguros y se devuelve en la respuesta. |
| `x-client-app` | Identificador lógico opcional del consumidor. |
| `x-azdo-pat` | Obligatorio en operaciones Azure DevOps; no aplica a generación IA ni CV. |
| `x-azdo-organization`, `x-azdo-project`, `x-azdo-path` | Alternativas de contexto cuando el body no lo aporta. |

Los errores de aplicación usan `{ "code", "message", "correlationId", "detail"? }`; transporte/JSON/contexto inválido suele ser `400`, timeout controlado `408`, proveedor externo `5xx` y fallo inesperado `500`. Los `401/403` funcionales de Azure DevOps y los demás contratos de error permanecen sin cambios.

## Inventario

| Function | Ruta | IA | Azure DevOps/PAT | Consumidor comprobado en código |
| --- | --- | --- | --- | --- |
| `GenerateWorkItem` | `/v1.0.0/generate` | Sí | No | SPA HUIA, Mesa backend |
| `GenerateTestCases` | `/v1.0.0/generate-test-cases` | Sí | No | SPA HUIA, Mesa backend |
| `CreateAzureDevOpsItems` | `/v1.0.0/create` | No | Sí | SPA HUIA, Mesa backend |
| `CreateTestCases` | `/v1.0.0/create-test-cases` | No | Sí | Mesa backend |
| `GetAzdoMetadata` | `/v1.0.0/azdo/metadata` | No | Sí | SPA HUIA, Mesa backend |
| `GetAzdoWorkItemConfig` | `/v1.0.0/azdo/workitem-config` | No | Sí | SPA HUIA, Mesa backend |
| `GetAzdoTestPlans` | `/v1.0.0/azdo/test-plans` | No | Sí | SPA HUIA, Mesa backend |
| `GetAzdoWorkItemDiscussionComments` | `/v1.0.0/azdo/workitems/discussion/comments` | No | Sí | No localizado |
| `EvaluateWorkItem` | `/v1.0.0/azdo/hu/evaluate` | Sí | Sí | SPA HUIA |
| `SearchWorkItems` | `/v1.0.0/azdo/hu/search` | No | Sí | SPA HUIA |
| `IntegracionArquitecturaHU` | `/v1.0.0/azdo/integracion-arquitectura-hu/create` | No | Sí al crear | Flujo externo no disponible |
| `AnalyzeCvFeedback` | `/v1.0.0/cv/analyze` | Sí | No | Frontend CV no disponible |

## Generación de Work Item

`POST /v1.0.0/generate`

- Request: `prompt` obligatorio; `systemPrompt`, `model` y `azdoContext` opcionales. `azdoContext` no provoca llamadas Azure DevOps.
- Response `200`: `json`, `raw` y `warning` opcional. La salida debe contener un Work Item válido.
- Límites: body IA, prompt y modelo según Options. No PAT.

## Generación de Test Cases

`POST /v1.0.0/generate-test-cases`

- Request: `prompt` y `systemPrompt` obligatorios; `model` opcional.
- Response `200`: el mismo sobre de generación; el JSON interno contiene `suiteTitle` y `testCases[]` con `title`, `state` y `steps[{action,expected}]`.
- No crea elementos ni requiere PAT.

## Creación de Work Item y casos

`POST /v1.0.0/create`

- Request canónico: `azdoOrg`, `azdoProject`, `iterationPath`, `areaPath`, `workItemType`, `hu`, `testCases[]` y `testSuite.planId` opcional. `hu` contiene `title`, `description`, `acceptanceCriteria` y campos dinámicos.
- Headers: PAT obligatorio; organización/proyecto pueden resolverse por body, headers o defaults donde el código lo permite.
- Response: `200` completo o `207 Multi-Status` parcial, con `huId`, `huUrl`, `message`, `operationStatus`, `suite`, `createdTestCases`, `failedTestCases`, `warnings` y `plan`.
- No se reintenta automáticamente; ante timeout se debe verificar Azure DevOps antes de repetir.

## Creación independiente de Test Cases

`POST /v1.0.0/create-test-cases`

- Request: `azdoOrg`, `azdoProject`, `areaPath`, `iterationPath`, `suiteTitle`, `testCases[]`, `testSuite.planId`.
- Crea una suite estática nueva y casos; no acepta HU, requirement suite ni relación `Tested By`.
- Response completo/parcial usa el resultado de creación con suite y casos. PAT obligatorio.

## Metadata

`POST /v1.0.0/azdo/metadata`

- Request opcional: `{ "azdoContext": { "organization", "azurePath" } }`.
- Response `200`: `projects`, `areaPaths`, `iterationPaths`, `projectMetadata[]`.
- PAT y organización obligatorios después de resolver precedencia body -> header -> defaults.

## Configuración de Work Item

`POST /v1.0.0/azdo/workitem-config`

- Request: `azdoProject`, `workItemType`, `azdoContext`.
- Response: `project`, `workItemType`, `fields[]`; cada campo incluye `name`, `referenceName`, `label`, `type`, `required`, `control`, `options`.
- PAT obligatorio. El proyecto puede inferirse de headers o `azurePath`.

## Test Plans

`POST /v1.0.0/azdo/test-plans`

- Request: `azdoProject`, `azdoContext`.
- Response: `project`, `testPlans[{id,name}]` ordenados.
- PAT obligatorio.

## Comentarios

`POST /v1.0.0/azdo/workitems/discussion/comments`

- Request: `azdoProject`, `workItemIds[]` y/o `workItemId`, `azdoContext`.
- Response: `project`, `requestedCount`, `items[]`; cada item incluye conteo y comentarios normalizados con texto, HTML renderizado, autor, fechas, borrado y URL.
- PAT obligatorio; cantidad acotada por `MaxWorkItemIds`.

## Búsqueda

`POST /v1.0.0/azdo/hu/search`

- Request: `azdoProject`, filtros opcionales `areaPath`, `iterationPath`, `searchText`, `top`, `azdoContext`.
- Response: `project`, `count`, `items[{id,title,state,areaPath,iterationPath,workItemType,displayName}]`.
- PAT obligatorio; `top` se normaliza al rango configurado y el texto queda limitado.

## Evaluación

`POST /v1.0.0/azdo/hu/evaluate`

- Request: `workItemId`, `azdoProject`, `requestedModel`, `prompt`, `systemPrompt`, `azdoContext`.
- Recupera el Work Item con PAT y usa IA. Response: identidad y URL del Work Item, tipo, estado, modelo y `evaluation` estructurada.
- No devuelve prompt ni salida cruda del proveedor.

## Arquitectura

`POST /v1.0.0/azdo/integracion-arquitectura-hu/create`

- Body JSON con Markdown en `markdown`, `markdownContent`, `estructura_backlog_markdown` u otro campo textual admitido, más contexto opcional `azdoOrg`, `azdoProject`, `iterationPath`, `areaPath`.
- `x-validate-only: true` o `x-parse-only: true` devuelve `200` con resumen, warnings y preview sin PAT ni mutación.
- En creación exige PAT y contexto completo; crea Epic, Feature e Historias con relaciones padre-hijo.

## CV

`POST /v1.0.0/cv/analyze`

- Request: `fileName`, `text`, `pageCount`, `source`, `model` opcional.
- Response: metadatos, `puntuacionGeneral`, `veredicto`, resumen, fortalezas, mejoras, consejos, campos débiles, errores ortográficos, criterios, `modeloUsado` y `analizadoEnUtc`.
- No recibe archivo binario ni PAT; el consumidor extrae texto antes de llamar.
