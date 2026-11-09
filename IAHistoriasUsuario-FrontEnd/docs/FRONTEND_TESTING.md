# Pruebas frontend

La suite Karma/Jasmine cubre rutas, componentes, editores, prompts, validación, storage, PAT, caches, requests y manejo de errores. Las pruebas de `api-url` y `ApplicationConfigurationService` fijan la matriz HTTP/HTTPS por ambiente, los loopbacks admitidos, el rechazo de HTTP remoto, la composición sin Function Key y la preservación de query params funcionales. `ApiService` comprueba además que una base HTTP local validada llega a `HttpClient`, junto con las ocho operaciones reales y sus headers PAT/no-PAT.

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

Después de cada build inspecciona `dist/front-angular/browser` para confirmar que no reaparezca configuración o inyección de Function Keys. Busca también URLs completas en logs y secretos con patrones conocidos.

Estas pruebas no sustituyen una validación en Network del navegador: no prueban
certificados locales, mixed content ni CORS efectivo. Tampoco validan el acceso
público efectivo en Azure ni OpenAI, N8n o Azure DevOps reales. Esas
verificaciones pertenecen al entorno autorizado correspondiente.
