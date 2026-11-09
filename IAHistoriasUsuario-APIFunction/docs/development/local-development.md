# Desarrollo local

## Backend

```powershell
Copy-Item .\API-HistoriasUsuarioIA.Function\local.settings.example.json `
  .\API-HistoriasUsuarioIA.Function\local.settings.json
dotnet restore .\API-HistoriasUsuarioIA-funcion.sln
dotnet build .\API-HistoriasUsuarioIA-funcion.sln -c Release --no-restore
func start --script-root .\API-HistoriasUsuarioIA.Function --port 7071 --useHttps --cors http://localhost:4200
```

Configura solo el proveedor IA seleccionado y usa Azurite cuando `AzureWebJobsStorage=UseDevelopmentStorage=true`. Los triggers son anónimos tanto localmente como en Azure; no agregues autenticación local sustituta.

Ejemplo local sin key y sin PAT, limitado a validación funcional de generación:

```powershell
Invoke-RestMethod -Method Post `
  -Uri 'https://localhost:7071/api/v1.0.0/generate' `
  -ContentType 'application/json' `
  -Body '{"prompt":"ejemplo","systemPrompt":"devuelve JSON"}'
```

No ejecutes contra OpenAI, N8n o Azure DevOps reales para smoke tests automatizados.

## Frontend

```powershell
npm ci
npm run start:local
```

`environment.local.ts` usa HTTPS en `7071`. Angular corre en `http://localhost:4200` y debe coincidir con CORS de Core Tools.
