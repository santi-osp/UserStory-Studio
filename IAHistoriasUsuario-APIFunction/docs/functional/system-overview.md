# Visión funcional

HUIA reúne flujos de diseño y operación de Work Items para personas que preparan o refinan trabajo en Azure DevOps. El frontend HUIA permite configurar organización y PAT temporal, consultar metadata del proyecto, diseñar un Work Item, pedir generación o refinamiento con IA, editar la vista previa y crear el resultado. La API también expone integraciones que no están presentes en esa SPA.

## Capacidades

- Generación: `generate` devuelve JSON de un Work Item; `generate-test-cases` devuelve título de suite y Test Cases de múltiples pasos. El proveedor activo es OpenAI o N8n, sin fallback automático.
- Refinamiento: el frontend construye prompts funcionales, valida el JSON devuelto y conserva la vista editable como fuente de creación.
- Evaluación: busca Work Items con WIQL, recupera el detalle seleccionado y devuelve una evaluación IA estructurada con puntaje, hallazgos, riesgos, preguntas y versión sugerida.
- Creación: `create` materializa una HU u otro tipo permitido, Test Cases opcionales, relaciones `Tested By`, estados solicitados y una requirement suite cuando hay plan. Puede retornar éxito parcial.
- Test Cases independientes: `create-test-cases` crea una suite estática nueva y sus casos, sin HU ficticia ni relación `Tested By`.
- Metadata: lista proyectos y rutas de área/iteración; `workitem-config` devuelve campos por `referenceName`; `test-plans` lista planes.
- Discusión: consulta comentarios de uno o varios Work Items.
- Arquitectura: analiza Markdown de backlog y, fuera de `validate-only`/`parse-only`, crea jerarquía Epic-Feature-Historia en Azure DevOps.
- CV: analiza texto extraído de una hoja de vida con el prompt funcional protegido y devuelve evaluación normalizada.

## Reglas funcionales relevantes

El PAT llega por `x-azdo-pat`, se utiliza solo para Azure DevOps y no forma parte de los requests de generación puramente IA. Los cuerpos JSON rechazan propiedades desconocidas en los modelos de entrada estrictos. Los campos dinámicos de Work Items se resuelven contra la metadata real; los desconocidos o no permitidos se rechazan. Las mutaciones no se reintentan automáticamente porque un timeout no demuestra rollback.

La SPA HUIA consume ocho rutas: generación, generación de Test Cases, creación, metadata, configuración de Work Item, Test Plans, evaluación y búsqueda. No consume directamente creación independiente de Test Cases, comentarios, arquitectura o CV. Esos endpoints se preservan para otros consumidores.
