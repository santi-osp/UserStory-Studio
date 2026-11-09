# Configuración

## Backend

La fuente tipada son las clases Options y validators. `local.settings.example.json`, `local.settings.reference.jsonc` y `APP_SETTINGS.md` deben representar exactamente las mismas 59 claves: tres del host y 56 de Options. `ValidateOnStart` falla antes de atender requests si un proveedor requerido, URL, secreto, rango o presupuesto es inválido.

En local, `local.settings.json` es runtime y está ignorado por Git. En Azure, las claves se cargan como App Settings de la Function App y requieren reinicio para que el proceso vuelva a enlazar Options. CORS no es una Options; pertenece a ARM/plataforma. La tabla completa, defaults, rangos y ejemplos está en [APP_SETTINGS.md](../../API-HistoriasUsuarioIA.Function/APP_SETTINGS.md).

## Frontend

Angular usa file replacements de `angular.json`: `environment.local.ts`, `.dev.ts`, `.qa.ts` y `.prod.ts`. `ApplicationConfigurationService` es la única frontera de lectura. `api.baseUrl` varía por ambiente; timeouts, retries y TTL vienen de `environment.shared.ts`.

- Local: base HTTPS `localhost:7071/api` según el environment actual.
- DLLO: base conocida, sin configuración adicional de acceso.
- QA y producción: `baseUrl` nula porque no hay valores confirmados; no existe fallback a DLLO.

El constructor central valida el protocolo según el ambiente y rechaza credenciales embebidas, query/fragment en base, placeholders, `/api/api`, endpoints absolutos y traversal. Preserva los query params funcionales y no agrega credenciales de Azure Functions.

No hay pipeline versionado ni runtime config. El mecanismo comprobable para la base URL es build-time/file replacement; no se requiere variable de CI/CD para Function Keys.
