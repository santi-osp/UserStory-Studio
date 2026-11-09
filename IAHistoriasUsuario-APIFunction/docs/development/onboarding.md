# Onboarding

1. Lee [visión funcional](../functional/system-overview.md), [capas](../architecture/projects-and-layers.md) y [seguridad](../security/security-architecture.md).
2. Instala .NET 10, Functions Core Tools v4, Node/npm, Chrome y Azurite.
3. Crea `local.settings.json` desde el example sin publicar secretos.
4. Ejecuta restore/build/test backend y `npm ci`, lint, tests y build local frontend.
5. Traza un cambio desde atributo `HttpTrigger` a adapter, Use Case, puerto, gateway y prueba.
6. Para configuración, modifica Options + validator + example + reference + tabla canónica y conserva el total esperado.
7. Para rutas frontend, modifica `api-contract.ts` y usa `ApplicationConfigurationService`; no importes environments en componentes.
8. Antes de entregar, revisa `git diff`, `git diff --staged`, secretos, placeholders, enlaces y `git diff --check`.

No hagas pruebas mutantes contra Azure DevOps real sin autorización. No cambies contratos, PAT, CORS o prompts como efecto lateral de una refactorización.
