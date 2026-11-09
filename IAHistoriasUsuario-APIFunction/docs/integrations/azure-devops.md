# Integración Azure DevOps

Infrastructure construye clientes REST por organización y PAT. Los gateways cubren metadata, campos de tipos, Test Plans/suites, WIQL, detalle para evaluación, comentarios, creación de Work Items/Test Cases y jerarquía de arquitectura. La API versionada configurada es independiente de la versión pública HUIA.

El PAT se recibe en `x-azdo-pat`, se valida por presencia/longitud y se usa en autenticación Basic hacia Azure DevOps. No se acepta en body, query, Options ni logs. Organización y proyecto siguen precedencia body -> headers -> defaults tipados; área/iteración se normalizan antes de construir requests.

La creación usa JSON Patch y una política de campos basada en metadata. Una HU con Test Cases crea relaciones `Tested By` y, si hay plan, una requirement suite. Los Test Cases independientes crean una suite estática y membresía explícita. El estado solicitado solo se aplica si la metadata de `System.State` lo admite; no existe fallback hardcodeado.

Las lecturas idempotentes pueden reintentarse para fallos transitorios con backoff acotado. Mutaciones, IA con costo y creación no se reintentan automáticamente. Redirects están deshabilitados en clientes sensibles para evitar reenviar credenciales a otro host.
