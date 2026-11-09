# HUIA Frontend

SPA Angular 20 para diseñar, generar, refinar, previsualizar, evaluar y crear Work Items/Test Cases en Azure DevOps. Usa componentes standalone, formularios reactivos, Quill para contenido enriquecido y un `ApiService` central.

## Desarrollo

```powershell
npm ci
npm run start:local
```

`npm run start:local` selecciona `environment.local.ts`, cuya base es
`http://localhost:7071/api`. Inicia la Function desde su directorio mediante:

```powershell
func host start --port 7071 --cors http://localhost:4200
```

El frontend admite también HTTPS local si se configura una URL `https` y Core
Tools usa un certificado local explícito y confiable, por ejemplo con
`--useHttps --cert <ruta-al-certificado.pfx> --password <password>`. No se
presupone que HTTPS local funcione sin certificado. El origen indicado en CORS
debe coincidir exactamente con el protocolo real del frontend.

La excepción HTTP solo aplica al ambiente `local` y a `localhost`, `127.0.0.1`
o `::1`. DLLO, QA y producción exigen HTTPS. Un frontend servido por HTTPS no
puede depender de un backend HTTP: el navegador puede bloquear esa combinación
como contenido mixto. CORS y la validación de protocolo son controles distintos.
Los endpoints no requieren Function Key.

```powershell
npm run lint
npm run test:ci
npm run build:local
npm run build:dev
npm run build:qa
npm run build:prod
```

## Configuración desplegada

Los environments se seleccionan por file replacement. DLLO conserva la URL confirmada; QA y producción mantienen `baseUrl:null` y no usan fallback. No existe una propiedad, placeholder ni sustitución de CI/CD para Function Keys.

`ApplicationConfigurationService` es la única frontera de configuración. Construye todas las URLs internas con la base y la ruta, preservando query params funcionales. El frontend no agrega credenciales de Azure Functions. El PAT de Azure DevOps permanece separado y se envía solo por `x-azdo-pat` cuando aplica.

## Documentación

- [Arquitectura](docs/FRONTEND_ARCHITECTURE.md)
- [Configuración](docs/FRONTEND_CONFIGURATION.md)
- [Flujos](docs/FRONTEND_FLOWS.md)
- [Pruebas](docs/FRONTEND_TESTING.md)
- API canónica: [backend HTTP](../IAHistoriasUsuario-APIFunction/docs/api/http-api-reference.md)
- Seguridad canónica: [backend security](../IAHistoriasUsuario-APIFunction/docs/security/security-architecture.md)
- App Settings: [backend APP_SETTINGS](../IAHistoriasUsuario-APIFunction/API-HistoriasUsuarioIA.Function/APP_SETTINGS.md)

No se desplegó ni se verificó CORS o acceso público efectivo. Sin Entra ID ni Function Keys, el backend desplegado con acceso público puede ser invocado desde clientes no navegador; CORS no autentica. Mesa y otros consumidores externos quedan fuera de este repositorio.
