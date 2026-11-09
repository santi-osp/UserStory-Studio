# Configuración frontend

`angular.json` usa file replacements para `local`, `dev`, `qa` y `production/prod`. `environment.model.ts` tipa `api.baseUrl`, timeout, retries y TTL. Los valores operativos compartidos viven en `environment.shared.ts`; no existe runtime config ni App Setting de Web App que altere el bundle.

| Ambiente | Base | Resultado |
| --- | --- | --- |
| local | `http://localhost:7071/api` | Usa la Function local por HTTP |
| develop/DLLO | URL Function DLLO conocida | Usa la base configurada |
| calidad/QA | `null` | `API_NOT_CONFIGURED` |
| production | `null` | `API_NOT_CONFIGURED` |

`ApplicationConfigurationService` valida límites y expone `buildEndpoint`.
`buildApiUrl` es la frontera única para validar protocolo y construir URLs. HTTPS
se admite en todos los ambientes; HTTP solo se admite cuando el ambiente efectivo
es `local` y el hostname normalizado por `URL` es exactamente `localhost`,
`127.0.0.1` o `::1`. No se admiten hosts remotos, subdominios de `localhost`,
direcciones LAN, privadas ni otros protocolos bajo esa excepción.

El helper rechaza además credenciales/query/fragment en la base, placeholders,
endpoints absolutos, network paths, traversal, `/api/api` y fragmentos. Preserva
el protocolo configurado y los query params funcionales del endpoint; no cambia
automáticamente entre HTTP y HTTPS ni agrega credenciales de Azure Functions.

## Ejecución local y CORS

Desde `IAHistoriasUsuario-APIFunction/API-HistoriasUsuarioIA.Function`:

```powershell
func host start --port 7071 --cors http://localhost:4200
```

Desde el frontend:

```powershell
npm run start:local
```

Esta combinación produce frontend `http://localhost:4200` hacia backend
`http://localhost:7071`. Para HTTPS local se requiere configurar la base HTTPS y
arrancar Core Tools con `--useHttps`, un certificado explícito mediante `--cert`
y, cuando corresponda, `--password`; el certificado debe ser válido o confiable.
El origen CORS debe coincidir con el protocolo real del frontend.

CORS no decide si una URL HTTP es aceptable y no sustituye autenticación. La
política de contenido mixto tampoco puede eludirse: un frontend HTTPS puede ser
bloqueado por el navegador al llamar un backend HTTP.

El repositorio no contiene pipeline versionado ni requiere token replacement para una Function Key. Consulta [seguridad canónica](../../IAHistoriasUsuario-APIFunction/docs/security/security-architecture.md) para el riesgo residual del acceso anónimo.
