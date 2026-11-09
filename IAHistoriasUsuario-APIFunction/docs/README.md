# Documentación técnica HUIA

Este corpus fue reconstruido desde atributos `HttpTrigger`, modelos JSON, Use Cases, gateways, políticas, DI, Options/validators, archivos de configuración, ARM, Angular y pruebas del worktree. El código ejecutable prevalece si aparece una divergencia.

## Mapa de lectura

- Funcional: [visión del sistema](functional/system-overview.md).
- Arquitectura: [sistema](architecture/system-architecture.md), [proyectos y capas](architecture/projects-and-layers.md), [flujos](architecture/request-flows.md) y [decisiones](architecture/technical-decisions.md).
- Contratos: [API HTTP](api/http-api-reference.md) y [modelos JSON](contracts/models-and-json-contracts.md).
- Aplicación: [Use Cases](application/use-cases.md).
- Integraciones: [Azure DevOps](integrations/azure-devops.md), [OpenAI/N8n](integrations/openai-and-n8n.md), [arquitectura](integrations/architecture-integration.md) y [CV](integrations/cv-analysis.md).
- Configuración: [visión general](configuration/configuration-overview.md) y [tabla canónica de 59 App Settings](../API-HistoriasUsuarioIA.Function/APP_SETTINGS.md).
- Seguridad: [arquitectura de seguridad](security/security-architecture.md).
- Desarrollo: [local](development/local-development.md) y [onboarding](development/onboarding.md).
- Calidad: [estrategia de pruebas](testing/testing-strategy.md).
- Entrega: [arquitectura](deployment/deployment-architecture.md) y [CI/CD conocido](deployment/azure-devops-ci-cd.md).
- Operación: [troubleshooting](operations/troubleshooting.md) y [runbook](operations/runbook.md).
- Trazabilidad: [endpoint-consumidor](traceability/endpoint-consumer-matrix.md) y [fuentes de configuración](traceability/configuration-source-matrix.md).
- Términos: [glosario](glossary.md).

Las afirmaciones de estado distinguen cuatro niveles: declarado en código/ARM, comprobado localmente, pendiente de Azure y pendiente de consumidor externo. No se infiere estado efectivo de Azure a partir de una plantilla.
