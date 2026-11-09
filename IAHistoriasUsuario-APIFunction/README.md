# HUIA API Function

Backend HTTP de HUIA para generar, evaluar y crear Work Items y Test Cases; consultar metadata, Test Plans, comentarios y búsquedas en Azure DevOps; importar backlog de arquitectura; y analizar hojas de vida. La solución usa Azure Functions v4, .NET 10 isolated worker y cinco proyectos: Domain, Application, Infrastructure, Function y Tests.

Los doce endpoints son `POST` y declaran `AuthorizationLevel.Anonymous`. No requieren Function Key ni autenticación Entra. El ARM conserva CORS sin wildcard y TLS, pero CORS no autentica: con acceso público habilitado, cualquier cliente de Internet puede invocar los endpoints y llegar a sus validaciones funcionales.

## Inicio rápido

Requisitos: .NET SDK 10, Azure Functions Core Tools v4, Azurite para `UseDevelopmentStorage=true` y, para el frontend, Node/npm y Chrome Headless.

```powershell
Copy-Item .\API-HistoriasUsuarioIA.Function\local.settings.example.json `
  .\API-HistoriasUsuarioIA.Function\local.settings.json
dotnet restore .\API-HistoriasUsuarioIA-funcion.sln
dotnet build .\API-HistoriasUsuarioIA-funcion.sln -c Release --no-restore
func start --script-root .\API-HistoriasUsuarioIA.Function --port 7071 --useHttps --cors http://localhost:4200
```

Reemplaza únicamente los placeholders del proveedor seleccionado en `local.settings.json`. No publiques ese archivo.

## Documentación

- [Índice técnico](docs/README.md)
- [Referencia HTTP](docs/api/http-api-reference.md)
- [Arquitectura y seguridad](docs/architecture/system-architecture.md)
- [Configuración](docs/configuration/configuration-overview.md)
- [App Settings canónicas](API-HistoriasUsuarioIA.Function/APP_SETTINGS.md)
- [Matriz endpoint-consumidor](docs/traceability/endpoint-consumer-matrix.md)
- [Desarrollo local](docs/development/local-development.md)
- [Despliegue y operación](docs/deployment/deployment-architecture.md)

## Estado de despliegue

El código y ARM son declarativos. Este repositorio no prueba que las 59 App Settings, CORS o el acceso público estén aplicados en Azure. QA y producción no tienen valores confirmados en el frontend.
