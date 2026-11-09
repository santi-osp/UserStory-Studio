<div align="center">

<img src="assets/hero.svg" width="100%" alt="UserStory Studio: ideas claras, entregas mejores" />

<br />

# UserStory Studio

**Diseña · Genera · Evalúa · Publica**

Una plataforma para convertir contexto de producto en historias de usuario y casos de prueba, con IA y Azure DevOps.

[![Angular](https://img.shields.io/badge/Angular-20-DD0031?style=for-the-badge&logo=angular&logoColor=white)](IAHistoriasUsuario-FrontEnd/README.md)
[![Azure Functions](https://img.shields.io/badge/Azure_Functions-v4-0062AD?style=for-the-badge&logo=azurefunctions&logoColor=white)](IAHistoriasUsuario-APIFunction/README.md)
[![.NET](https://img.shields.io/badge/.NET-10-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)](IAHistoriasUsuario-APIFunction/README.md)
[![Azure DevOps](https://img.shields.io/badge/Azure_DevOps-integración-0078D7?style=for-the-badge&logo=azuredevops&logoColor=white)](IAHistoriasUsuario-APIFunction/docs/integrations/azure-devops.md)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-2671b4?style=for-the-badge)](LICENSE)

[Explorar el frontend](IAHistoriasUsuario-FrontEnd/README.md) · [Explorar la API](IAHistoriasUsuario-APIFunction/README.md) · [Referencia HTTP](IAHistoriasUsuario-APIFunction/docs/api/http-api-reference.md)

</div>

---

## ✦ La idea

UserStory Studio reúne el trabajo que suele quedar disperso entre prompts, documentos y tableros: preparar el contexto de una historia, generar una primera versión, revisar su calidad y llevarla a Azure DevOps. La interfaz permite editar antes de crear; la API también ofrece capacidades para consumidores externos.

<div align="center"><img src="assets/workflow.gif" width="900" alt="Animación de las cuatro etapas: diseña, genera, revisa y crea" /></div>

| 01 · Diseñar | 02 · Generar | 03 · Evaluar | 04 · Entregar |
| :--- | :--- | :--- | :--- |
| Configurar organización y campos de Azure DevOps; aportar contexto funcional. | Generar historias y casos de prueba con OpenAI o N8n. | Editar una vista previa y evaluar Work Items con hallazgos y recomendaciones. | Crear Work Items, Test Cases y relaciones en Azure DevOps. |

> [!NOTE]
> Además del flujo de la SPA, la API incluye endpoints para comentarios, backlog de arquitectura y análisis de CV. Consulta la [matriz endpoint–consumidor](IAHistoriasUsuario-APIFunction/docs/traceability/endpoint-consumer-matrix.md) para no confundir capacidades de la API con pantallas del frontend.

## ◇ Arquitectura

<div align="center"><img src="assets/architecture.svg" width="100%" alt="Diagrama: personas, Angular, Azure Functions, OpenAI o N8n y Azure DevOps" /></div>

```text
IAHistoriasUsuario-FrontEnd/   Angular 20 · SPA · formularios reactivos · Quill
IAHistoriasUsuario-APIFunction/
  ├─ API-HistoriasUsuarioIA.Function/        HTTP triggers y configuración
  ├─ API-HistoriasUsuarioIA.Application/     Casos de uso y contratos
  ├─ API-HistoriasUsuarioIA.Domain/          Reglas de dominio
  ├─ API-HistoriasUsuarioIA.Infrastructure/  Integraciones externas
  └─ API-HistoriasUsuarioIA.Tests/           Pruebas
assets/                       Gráficos originales de esta presentación
```

La Function se ejecuta con **Azure Functions v4 / .NET 10 isolated worker**. El frontend usa **Angular 20**, componentes standalone y un servicio centralizado para construir las peticiones. Consulta la [arquitectura de la API](IAHistoriasUsuario-APIFunction/docs/architecture/system-architecture.md) y la [arquitectura frontend](IAHistoriasUsuario-FrontEnd/docs/FRONTEND_ARCHITECTURE.md).

## ↗ Ejecutarlo en local

Necesitas **.NET SDK 10**, **Azure Functions Core Tools v4**, **Node.js/npm** y **Azurite** si mantienes `AzureWebJobsStorage=UseDevelopmentStorage=true`. Se requiere una clave del proveedor IA seleccionado para los flujos que lo usan y un PAT de Azure DevOps para las operaciones que consultan o crean Work Items.

**Terminal 1 · API** (desde la raíz del repositorio, PowerShell):

```powershell
cd .\IAHistoriasUsuario-APIFunction
Copy-Item .\API-HistoriasUsuarioIA.Function\local.settings.example.json .\API-HistoriasUsuarioIA.Function\local.settings.json
dotnet restore .\API-HistoriasUsuarioIA-funcion.sln
func host start --script-root .\API-HistoriasUsuarioIA.Function --port 7071 --cors http://localhost:4200
```

Edita los placeholders de `local.settings.json` para tu proveedor. Arranca Azurite si usas el almacenamiento de desarrollo. Para compilar y probar la API: `dotnet build .\API-HistoriasUsuarioIA-funcion.sln` y `dotnet test .\API-HistoriasUsuarioIA-funcion.sln`.

**Terminal 2 · Interfaz** (desde la raíz del repositorio, PowerShell):

```powershell
cd .\IAHistoriasUsuario-FrontEnd
npm ci
npm run start:local
```

Abre `http://localhost:4200`. La configuración `local` apunta a `http://localhost:7071/api`. Para comprobar el frontend: `npm run lint`, `npm run test:ci` (requiere Chrome Headless) y `npm run build:local`. Más detalles en [desarrollo backend](IAHistoriasUsuario-APIFunction/docs/development/local-development.md) y [configuración frontend](IAHistoriasUsuario-FrontEnd/docs/FRONTEND_CONFIGURATION.md).

## 🔒 Seguridad y alcance

> [!WARNING]
> Los endpoints HTTP de la API declaran `AuthorizationLevel.Anonymous`: **CORS no es autenticación** y no protege frente a clientes fuera del navegador. No despliegues públicamente una instancia con proveedores IA o Azure DevOps configurados sin incorporar controles adecuados de acceso, cuotas y protección contra abuso. El PAT introducido en la SPA se mantiene en memoria; no incluyas credenciales reales en Git.

`local.settings.json`, archivos `.env`, dependencias y artefactos generados están excluidos del repositorio. Los parámetros ARM y el entorno de desarrollo son declarativos; **su presencia no demuestra un despliegue activo ni un entorno productivo verificado**. Lee la [arquitectura de seguridad](IAHistoriasUsuario-APIFunction/docs/security/security-architecture.md) antes de publicar una instancia.

## 📚 Documentación

| Interfaz | Servicio |
| :--- | :--- |
| [Flujos de usuario](IAHistoriasUsuario-FrontEnd/docs/FRONTEND_FLOWS.md) | [Visión funcional](IAHistoriasUsuario-APIFunction/docs/functional/system-overview.md) |
| [Configuración](IAHistoriasUsuario-FrontEnd/docs/FRONTEND_CONFIGURATION.md) | [Referencia de 12 endpoints](IAHistoriasUsuario-APIFunction/docs/api/http-api-reference.md) |
| [Pruebas](IAHistoriasUsuario-FrontEnd/docs/FRONTEND_TESTING.md) | [Índice técnico completo](IAHistoriasUsuario-APIFunction/docs/README.md) |

## Licencia

El código y los gráficos originales de este repositorio se distribuyen bajo la [Licencia Apache 2.0](LICENSE). Las dependencias externas conservan sus propias licencias. La licencia no otorga derechos sobre marcas o material de terceros.

<sub>Gráficos SVG y animación GIF originales incluidos en <code>assets/</code>. No se presentan como capturas de una instancia desplegada.</sub>
