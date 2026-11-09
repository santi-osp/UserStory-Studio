# App Settings

## Funcionamiento

En local, Azure Functions Core Tools carga los valores runtime desde `local.settings.json`. En Azure, las mismas claves planas se administran como App Settings de la Function App. `local.settings.example.json` es la plantilla versionada y `local.settings.reference.jsonc` describe jerarquía, defaults, rangos y consecuencias; ninguno de los dos modifica el runtime por sí solo.

El separador `__` representa la jerarquía de configuración: por ejemplo, `AiConnection__OpenAI__ApiKey` se enlaza con `AiConnection:OpenAI:ApiKey`. Las clases Options aplican los defaults operativos cuando una clave opcional falta y los validators rechazan valores fuera de rango o combinaciones inseguras. Las Options se capturan al iniciar el proceso; cualquier cambio de App Settings requiere reiniciar la Function App. Los secretos no deben incluirse en Git, logs, documentación ni mensajes de error.

## Tabla completa

| App Setting | Propósito | Tipo/unidad | Valor actual de referencia | Valores permitidos | Obligatoria | Secreto | Comportamiento si falta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AzureWebJobsStorage` | Storage requerido por el host de Functions. | Cadena de conexión | `UseDevelopmentStorage=true` | Emulador local o cadena válida administrada por Azure. | Sí | Sí | El host no puede iniciar correctamente. |
| `FUNCTIONS_WORKER_RUNTIME` | Selecciona el worker aislado de .NET. | Texto | `dotnet-isolated` | `dotnet-isolated` | Sí | No | El host no selecciona el worker esperado. |
| `FUNCTIONS_EXTENSION_VERSION` | Selecciona la versión mayor del runtime Functions. | Texto | `~4` | Runtime Functions v4 compatible. | Sí | No | El runtime queda incompleto o depende del ambiente. |
| `AiConnection__Provider` | Selecciona un único proveedor IA. | Enumeración | `OpenAI` | `OpenAI` o `N8n`, sin distinguir mayúsculas al enlazar. | Sí | No | Falla el inicio. No existe fallback automático. |
| `AiConnection__TimeoutSeconds` | Timeout por intento contra el proveedor IA. | Entero/segundos | `100` | 1 a 300; la combinación total con retries y demora no puede superar 600000 ms. | No | No | Usa el default tipado `100`. |
| `AiConnection__RetryCount` | Reintentos de errores transitorios IA. | Entero/reintentos | `0` | 0 a 5; solo errores transitorios y dentro del presupuesto total. | No | No | Usa el default tipado `0`. |
| `AiConnection__RetryDelayMilliseconds` | Espera fija antes de un retry IA. | Entero/milisegundos | `250` | 0 a 60000; dentro del presupuesto total de 600000 ms. | No | No | Usa el default tipado `250`. |
| `AiConnection__MaxResponseBodyBytes` | Máximo leído de una respuesta IA. | Entero/bytes | `4194304` | 1 a 8388608. | No | No | Usa el default tipado `4194304`. |
| `AiConnection__MaxPromptLength` | Máximo de caracteres por prompt recibido. | Entero/caracteres | `500000` | 1 a 500000. | No | No | Usa el default tipado `500000`. |
| `AiConnection__MaxModelLength` | Máximo del nombre de modelo solicitado o configurado. | Entero/caracteres | `128` | 1 a 128; el modelo efectivo debe caber en este límite. | No | No | Usa el default tipado `128`. |
| `AiConnection__OpenAI__ApiKey` | Autentica solicitudes al API de OpenAI. | Secreto/texto | `<set-local-openai-api-key>` | Valor real no vacío y no placeholder. | Condicional: OpenAI | Sí | Con `Provider=OpenAI`, falla el inicio. Con N8n se ignora. |
| `AiConnection__OpenAI__BaseUrl` | Base HTTPS del API de OpenAI. | URI absoluta | `https://api.openai.com/` | HTTPS, host válido, sin userinfo ni fragment. | Condicional: OpenAI | No | Con `Provider=OpenAI`, falla el inicio. Con N8n se ignora. |
| `AiConnection__OpenAI__DefaultModel` | Modelo OpenAI cuando el request no envía uno. | Texto | `gpt-4.1-mini` | No vacío, no placeholder y longitud máxima configurada. | Condicional: OpenAI | No | Con `Provider=OpenAI`, falla el inicio. Con N8n se ignora. |
| `AiConnection__N8n__Url` | Webhook HTTPS del proveedor N8n. | URI absoluta | `<set-local-https-n8n-webhook>` | HTTPS, host válido, sin userinfo ni fragment. | Condicional: N8n | Sí | Con `Provider=N8n`, falla el inicio. Con OpenAI se ignora. |
| `AiConnection__N8n__DefaultModel` | Modelo enviado al webhook si el request no envía uno. | Texto | `gpt-4.1-mini` | No vacío, no placeholder y longitud máxima configurada. | Condicional: N8n | No | Con `Provider=N8n`, falla el inicio. Con OpenAI se ignora. |
| `AzureDevOps__Search__DefaultTop` | Cantidad predeterminada de resultados WIQL. | Entero/elementos | `100` | 1 a 200 y menor o igual que `MaxTop`. | No | No | Usa el default tipado `100`. |
| `AzureDevOps__Search__MaxTop` | Máximo solicitado por una búsqueda WIQL. | Entero/elementos | `200` | 1 a 200 y mayor o igual que `DefaultTop`. | No | No | Usa el default tipado `200`. |
| `AzureDevOps__Search__MaxSearchTextLength` | Máximo del texto usado en búsqueda. | Entero/caracteres | `256` | 1 a 256. | No | No | Usa el default tipado `256`. |
| `AzureDevOps__Http__TimeoutSeconds` | Timeout por intento contra Azure DevOps. | Entero/segundos | `100` | 1 a 300; la combinación total con retries y backoff no puede superar 600000 ms. | No | No | Usa el default tipado `100`. |
| `AzureDevOps__Http__RetryCount` | Reintentos de lecturas de metadata transitorias. | Entero/reintentos | `2` | 0 a 5; no se aplica a mutaciones y debe respetar el presupuesto total. | No | No | Usa el default tipado `2`. |
| `AzureDevOps__Http__RetryDelayMilliseconds` | Demora inicial del backoff de metadata. | Entero/milisegundos | `500` | 0 a 60000; backoff acotado y presupuesto total máximo de 600000 ms. | No | No | Usa el default tipado `500`. |
| `AzureDevOps__Defaults__Organization` | Organización fallback para consumidores que admiten contexto ambiental. | Texto | Vacío | Vacío o nombre válido de hasta el límite configurado; no URL. | No | No | Permanece vacío; el endpoint falla si necesita organización explícita. |
| `AzureDevOps__Defaults__Project` | Proyecto fallback, incluido el endpoint de arquitectura. | Texto | Vacío | Vacío o texto válido de hasta el límite configurado. | No | No | Permanece vacío; el endpoint falla si necesita proyecto explícito. |
| `AzureDevOps__Defaults__AreaPath` | Area Path fallback exclusivo de integración de arquitectura. | Texto/ruta | Vacío | Vacío o ruta sin controles de hasta el límite configurado. | No | No | Permanece vacío; arquitectura exige que llegue por request, header o configuración. |
| `AzureDevOps__Defaults__IterationPath` | Iteration Path fallback exclusivo de integración de arquitectura. | Texto/ruta | Vacío | Vacío o ruta sin controles de hasta el límite configurado. | No | No | Permanece vacío; arquitectura exige que llegue por request, header o configuración. |
| `AzureDevOps__Limits__MaxOrganizationLength` | Máximo de organización recibida o configurada. | Entero/caracteres | `256` | 1 a 256. | No | No | Usa el default tipado `256`. |
| `AzureDevOps__Limits__MaxProjectLength` | Máximo de proyecto y textos cortos equivalentes. | Entero/caracteres | `256` | 1 a 256. | No | No | Usa el default tipado `256`. |
| `AzureDevOps__Limits__MaxPathLength` | Máximo de Area, Iteration y Azure Path. | Entero/caracteres | `4000` | 1 a 4000; también limita los defaults de rutas. | No | No | Usa el default tipado `4000`. |
| `AzureDevOps__Limits__MaxWorkItemIds` | Máximo de IDs para consultar comentarios. | Entero/elementos | `200` | 1 a 200. | No | No | Usa el default tipado `200`. |
| `AzureDevOps__Limits__MaxReferenceNameLength` | Máximo de `referenceName` dinámico. | Entero/caracteres | `256` | 1 a 256. | No | No | Usa el default tipado `256`. |
| `AzureDevOps__Limits__ReferenceNameRegexTimeoutMilliseconds` | Timeout de la regex que valida `referenceName`. | Entero/milisegundos | `100` | 1 a 100. | No | No | Usa el default tipado `100`. |
| `AzureDevOps__Queries__ProjectsTop` | Tamaño de página al listar proyectos. | Entero/elementos | `100` | 1 a 100. | No | No | Usa el default tipado `100`. |
| `AzureDevOps__Queries__ClassificationDepth` | Profundidad de nodos de clasificación. | Entero/niveles | `100` | 1 a 100. | No | No | Usa el default tipado `100`. |
| `AzureDevOps__Queries__CommentsTop` | Tamaño de página de comentarios. | Entero/elementos | `200` | 1 a 200. | No | No | Usa el default tipado `200`. |
| `AzureDevOps__Queries__TestPlansTop` | Tamaño de página de Test Plans. | Entero/elementos | `50` | 1 a 50. | No | No | Usa el default tipado `50`. |
| `AzureDevOps__Creation__StaticSuiteNameAttempts` | Intentos para resolver colisiones de nombre de static suite. | Entero/intentos | `3` | 1 a 3. | No | No | Usa el default tipado `3`. |
| `RequestLimits__SmallBodyBytes` | Body máximo de endpoints pequeños. | Entero/bytes | `65536` | 1 a 262144. | No | No | Usa el default tipado `65536`. |
| `RequestLimits__AiBodyBytes` | Body máximo de generación y evaluación IA. | Entero/bytes | `2097152` | 1 a 4194304. | No | No | Usa el default tipado `2097152`. |
| `RequestLimits__WorkItemBodyBytes` | Body máximo de creación de Work Items y Test Cases. | Entero/bytes | `2097152` | 1 a 4194304. | No | No | Usa el default tipado `2097152`. |
| `RequestLimits__ArchitectureBodyBytes` | Body máximo de integración de arquitectura. | Entero/bytes | `2097152` | 1 a 4194304. | No | No | Usa el default tipado `2097152`. |
| `RequestLimits__CvBodyBytes` | Body máximo de análisis de CV. | Entero/bytes | `1048576` | 1 a 2097152. | No | No | Usa el default tipado `1048576`. |
| `RequestValidation__MaxJsonDepth` | Profundidad común de serializers y `JsonDocument`. | Entero/niveles | `32` | 1 a 64. | No | No | Usa el default tipado `32`. |
| `RequestValidation__MaxSecretHeaderLength` | Máximo de headers secretos como PAT. | Entero/caracteres | `1024` | 1 a 1024. | No | No | Usa el default tipado `1024`. |
| `RequestValidation__MaxCorrelationIdLength` | Máximo del correlation ID recibido. | Entero/caracteres | `128` | 1 a 128. | No | No | Usa el default tipado `128`. |
| `Transport__ReadBufferBytes` | Buffer compartido para requests y respuestas IA. | Entero/bytes | `16384` | 1024 a 65536; la lectura nunca supera el límite del body. | No | No | Usa el default tipado `16384`. |
| `WorkItemLimits__MaxTitleLength` | Máximo de títulos de Work Items y Test Cases. | Entero/caracteres | `255` | 1 a 255. | No | No | Usa el default tipado `255`. |
| `WorkItemLimits__MaxDescriptionLength` | Máximo de descripción, criterios y rich text. | Entero/caracteres | `262144` | 1 a 262144; el body acotado sigue siendo el límite global. | No | No | Usa el default tipado `262144`. |
| `WorkItemLimits__MaxTestStepTextLength` | Máximo de acción y resultado esperado por paso. | Entero/caracteres | `16384` | 1 a 16384. | No | No | Usa el default tipado `16384`. |
| `WorkItemLimits__MaxTestCases` | Máximo compartido de Test Cases por operación. | Entero/elementos | `50` | 1 a 50. | No | No | Usa el default tipado `50`. |
| `WorkItemLimits__MaxTestCaseSteps` | Máximo de pasos por Test Case. | Entero/elementos | `100` | 1 a 100. | No | No | Usa el default tipado `100`. |
| `WorkItemLimits__MaxAdditionalFields` | Máximo de campos dinámicos adicionales. | Entero/elementos | `100` | 1 a 100. | No | No | Usa el default tipado `100`. |
| `ArchitectureIntegration__MaxMarkdownLength` | Máximo de Markdown procesado por arquitectura. | Entero/caracteres | `1000000` | 1 a 1000000 y dentro del body acotado. | No | No | Usa el default tipado `1000000`. |
| `CvAnalysis__MaxTextLength` | Máximo de texto de CV aceptado. | Entero/caracteres | `200000` | 1 a 200000 y dentro del body acotado. | No | No | Usa el default tipado `200000`. |
| `CvAnalysis__MaxPromptTextLength` | Máximo de texto de CV incluido en el prompt. | Entero/caracteres | `18000` | 1 a 18000 y menor o igual que `MaxTextLength`. | No | No | Usa el default tipado `18000`. |
| `CvAnalysis__MaxPageCount` | Máximo de páginas declarado para un CV. | Entero/páginas | `1000` | 1 a 1000. | No | No | Usa el default tipado `1000`. |
| `Observability__MaxScalarLogLength` | Máximo de texto escalar sanitizado en logs. | Entero/caracteres | `300` | 1 a 300. | No | No | Usa el default tipado `300`. |
| `Observability__MaxContextArrayItems` | Máximo de elementos de contexto registrados. | Entero/elementos | `20` | 1 a 20. | No | No | Usa el default tipado `20`. |
| `Observability__MaxGenericTextLength` | Límite genérico de truncamiento seguro. | Entero/caracteres | `1000` | 1 a 1000. | No | No | Usa el default tipado `1000`. |
| `Observability__MaxExternalErrorDetailLength` | Máximo de detalle Azure DevOps filtrado para errores de mutación. | Entero/caracteres | `500` | 1 a 500; URLs y marcadores de credenciales se descartan. | No | No | Usa el default tipado `500`. |

## Acceso HTTP sin Function Keys

Los doce triggers HTTP declaran `AuthorizationLevel.Anonymous`. No existe una App Setting, Options, middleware ni configuración frontend para Function Keys, y los consumidores no deben enviar el parámetro `code` ni un header de clave de Functions. OpenAI API Key y el PAT de Azure DevOps son credenciales separadas: la primera permanece exclusivamente en App Settings backend y el PAT conserva su contrato por `x-azdo-pat` cuando corresponde.

El ARM conserva CORS sin wildcard y TLS, pero no configura autenticación de plataforma ni crea o expone claves. CORS solo controla navegadores y no autentica la API. Sin Microsoft Entra ID ni Function Keys, una Function App con acceso público habilitado permite invocaciones desde Internet, incluidos curl, Postman, scripts y servidores. Las validaciones de entrada, límites, errores y permisos posteriores de Azure DevOps siguen aplicando, pero no sustituyen autenticación.

No se verificó el estado efectivo en Azure ni se realizó despliegue. Cualquier consumidor externo, como Mesa de Servicios, N8n, arquitectura o CV, debe retirar la clave de Functions de su configuración conservando rutas, bodies, headers funcionales y PAT existentes.

## Proveedores

### OpenAI

Configura `AiConnection__Provider=OpenAI`. Son obligatorias `AiConnection__OpenAI__ApiKey`, `AiConnection__OpenAI__BaseUrl` y `AiConnection__OpenAI__DefaultModel`. Timeout, retries y límites usan defaults seguros si se omiten. Las variables N8n pueden permanecer vacías o conservar placeholders inequívocos porque no se validan ni consumen cuando OpenAI está seleccionado.

### N8n

Configura `AiConnection__Provider=N8n`. Son obligatorias `AiConnection__N8n__Url` y `AiConnection__N8n__DefaultModel`. Timeout, retries y límites usan defaults seguros si se omiten. Las variables OpenAI pueden permanecer vacías o conservar placeholders inequívocos porque no se validan ni consumen cuando N8n está seleccionado. Nunca se exige configurar ambos proveedores simultáneamente y no existe fallback automático entre ellos.

## Ejemplos seguros

OpenAI local mínimo dentro de `Values`:

```json
{
  "AiConnection__Provider": "OpenAI",
  "AiConnection__OpenAI__ApiKey": "<REEMPLAZAR_SOLO_EN_LOCAL>",
  "AiConnection__OpenAI__BaseUrl": "https://api.openai.com/",
  "AiConnection__OpenAI__DefaultModel": "<MODELO_APROBADO>"
}
```

N8n local mínimo dentro de `Values`:

```json
{
  "AiConnection__Provider": "N8n",
  "AiConnection__N8n__Url": "<REEMPLAZAR_CON_WEBHOOK_HTTPS_LOCAL>",
  "AiConnection__N8n__DefaultModel": "<MODELO_APROBADO>"
}
```

Defaults Azure DevOps vacíos para exigir contexto por request o header:

```json
{
  "AzureDevOps__Defaults__Organization": "",
  "AzureDevOps__Defaults__Project": "",
  "AzureDevOps__Defaults__AreaPath": "",
  "AzureDevOps__Defaults__IterationPath": ""
}
```

Límite operativo personalizado dentro del techo absoluto:

```json
{
  "RequestLimits__AiBodyBytes": "1048576"
}
```

## Errores comunes

- Escribir mal una variable: una clave desconocida no reemplaza la correcta y el runtime puede conservar el default.
- Usar `:` en Azure App Settings en lugar de `__`; en Azure se debe usar, por ejemplo, `AiConnection__Provider`.
- Configurar un número fuera de rango o una combinación de timeout/retries que supere el presupuesto total; la validación fail-fast impide iniciar.
- Usar una URL HTTP; los proveedores solo aceptan HTTPS y rechazan userinfo o fragmentos.
- Dejar el placeholder del proveedor seleccionado sin reemplazar; la validación lo rechaza.
- Configurar un modelo que supere `AiConnection__MaxModelLength`.
- Cambiar una App Setting y olvidar reiniciar la Function App.
- Editar `local.settings.example.json` creyendo que es configuración runtime.
- Incluir secretos en Git, Markdown, logs, bodies, query strings o archivos de ejemplo.
