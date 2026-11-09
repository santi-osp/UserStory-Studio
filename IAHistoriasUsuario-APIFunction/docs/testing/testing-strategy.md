# Estrategia de pruebas

## Backend

`API-HistoriasUsuarioIA.Tests` es el único proyecto de pruebas de la solución. Continúa siendo un proyecto xUnit SDK-style: los archivos `.cs` se incluyen recursivamente y su organización principal sigue la capa y el sistema productivo bajo prueba.

```text
API-HistoriasUsuarioIA.Tests/
├── Application/
│   ├── Common/
│   ├── DependencyInjection/
│   └── UseCases/
├── Contracts/
│   └── Serialization/
├── Domain/
│   └── Policies/
├── Function/
│   ├── Configuration/
│   ├── Helpers/
│   └── Security/
├── Infrastructure/
│   ├── Ai/
│   │   ├── Gateways/
│   │   └── Providers/
│   ├── AzureDevOps/
│   └── DependencyInjection/
├── TestSupport/
│   └── Factories/
├── API-HistoriasUsuarioIA.Tests.csproj
└── GlobalUsings.cs
```

Los namespaces conservan la raíz definida por el proyecto, `API_HistoriasUsuarioIA_funcion.Tests`, y añaden la ruta de la carpeta. Por ejemplo:

- `Application/UseCases/AiUseCaseProviderParityTests.cs` usa `API_HistoriasUsuarioIA_funcion.Tests.Application.UseCases`;
- `Function/Configuration/ConfigurationInventoryTests.cs` usa `API_HistoriasUsuarioIA_funcion.Tests.Function.Configuration`;
- `Infrastructure/AzureDevOps/AzDoServiceCreatePatchTests.cs` usa `API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.AzureDevOps`;
- `TestSupport/Factories/TestOptionsFactory.cs` usa `API_HistoriasUsuarioIA_funcion.Tests.TestSupport.Factories`.

`TestSupport` contiene soporte pequeño reutilizado por varias capas y no clases con `[Fact]` o `[Theory]`. Las fakes, handlers y streams que pertenecen a una sola clase permanecen privados junto a esa prueba; una factory o builder nuevo solo debe extraerse cuando tenga consumidores reales en varias pruebas y una responsabilidad estable.

### Cobertura funcional de la suite

La suite contiene pruebas unitarias, de contratos, configuración, seguridad, serialización, integración interna entre capas, smoke estructural, providers IA, gateways de Azure DevOps y Azure Functions. Entre otras cosas valida Options/validators y `ValidateOnStart`, paridad de las 59 App Settings, DI, selección de proveedor sin fallback, prompts, JSON estricto, políticas HTML/campos, patches de Azure DevOps y consumidores operativos.

`HttpTriggerAuthorizationTests` inspecciona los 12 triggers compilados y exige `AuthorizationLevel.Anonymous`. Las pruebas de configuración comprueban la paridad de Options/App Settings y el ARM se revisa estáticamente. Estas pruebas no llaman Azure DevOps, OpenAI, N8n ni Azure desplegado; tampoco constituyen pruebas end-to-end ni prueban la configuración efectiva de Azure.

### Convenciones

- Agrega la prueba en la carpeta de la capa y el componente productivo que ejerce; no la clasifiques primero como `UnitTests`, `IntegrationTests` o `SecurityTests`.
- Nombra la clase por el sistema bajo prueba y conserva nombres de escenarios que expresen condición y resultado.
- Usa `[Fact]` para un escenario y `[Theory]` para el mismo comportamiento con varios datos.
- Mantén Arrange, Act y Assert visibles cuando ayuden a leer el escenario.
- Aísla red, tiempo, logging y proveedores mediante fakes locales; no uses servicios externos reales.
- Coloca datos o fixtures reutilizables en `TestSupport/Data` o `TestSupport/Fixtures` solo cuando existan y sean compartidos. No crees carpetas vacías.
- Reutiliza `TestOptionsFactory` para la configuración estable ya centralizada; no introduzcas estado global mutable ni una infraestructura genérica de testing.

### Ejecución

Desde la raíz del backend:

```powershell
dotnet restore .\API-HistoriasUsuarioIA-funcion.sln
dotnet build .\API-HistoriasUsuarioIA-funcion.sln -c Release --no-restore
dotnet test .\API-HistoriasUsuarioIA-funcion.sln -c Release --no-build
```

Validación dirigida por namespace o nombre:

```powershell
dotnet test .\API-HistoriasUsuarioIA.Tests\API-HistoriasUsuarioIA.Tests.csproj `
  -c Release --no-build `
  --filter "FullyQualifiedName~API_HistoriasUsuarioIA_funcion.Tests.Infrastructure.AzureDevOps"

dotnet test .\API-HistoriasUsuarioIA.Tests\API-HistoriasUsuarioIA.Tests.csproj `
  -c Release --no-build `
  --filter "FullyQualifiedName~CreateHuWithTestCases"
```

Cobertura XML mediante el collector ya referenciado por el proyecto:

```powershell
dotnet test .\API-HistoriasUsuarioIA.Tests\API-HistoriasUsuarioIA.Tests.csproj `
  -c Release --no-build `
  --collect:"XPlat Code Coverage"
```

La reorganización se verificó con 230 pruebas descubiertas, 230 aprobadas, 0 fallidas y 0 omitidas, tanto antes como después. La cobertura también permaneció idéntica: 2671/8562 líneas (31,19 %) y 928/3209 ramas (28,91 %); una reorganización física no pretende aumentar artificialmente estas cifras.

## Frontend

Karma/Jasmine cubre componentes, prompts, estado, PAT, servicios e interceptores. Las pruebas de URL cubren ambiente local/desplegado, query params funcionales, rutas externas/traversal y configuración inválida. Las pruebas de configuración recorren todas las rutas de `API_ENDPOINTS`; las pruebas de `ApiService` demuestran que sus ocho operaciones usan esa frontera.

```powershell
npm ci
npm ls --all
npm run lint
npm run test:ci
npm run build:local
npm run build:dev
npm run build:qa
npm run build:prod
npm run audit:ci
npm audit
```

Las cifras frontend se deben tomar de la última ejecución, no de este documento. Las pruebas locales no demuestran CORS ni acceso público efectivos en Azure, ni contratos end-to-end con OpenAI, N8n o Azure DevOps reales.
