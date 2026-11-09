# Matriz de fuentes de configuración

| Configuración | Fuente de verdad | Runtime | Secreto | Estado |
| --- | --- | --- | --- | --- |
| 56 valores de negocio/operación | Options + validators | Function App Settings / `local.settings.json` | Algunos | Paridad automatizada |
| 3 valores del host | example/reference/host | Function App Settings / local | Storage sí | Paridad automatizada |
| CORS | ARM `web.cors`; CLI local | Azure/Core Tools | No | Declarado/local documentado |
| `api.baseUrl` frontend | environment por file replacement | Bundle Angular | No | DLLO conocido; QA/prod null |
| Timeouts/retries/TTL frontend | `environment.shared.ts` | Bundle Angular | No | Tipado y validado |
| PAT Azure DevOps | entrada del usuario | Memoria frontend/header | Sí | No persistido |

No se crea una tercera fuente runtime para Angular. App Settings del App Service frontend no cambian JavaScript ya compilado. No existe configuración de Function Key o autenticación Entra en estos artefactos.
