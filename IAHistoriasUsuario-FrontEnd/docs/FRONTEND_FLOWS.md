# Flujos frontend

## Configuración Azure

El usuario aporta organización y PAT. La SPA mantiene el PAT en memoria y valida la conexión consultando metadata real. Solo una respuesta no vacía establece el estado conectado; al recargar se puede restaurar el marcador no sensible, nunca el PAT.

## Diseño, generación y preview

Las pantallas recogen contexto y campos dinámicos por `referenceName`, construyen prompts frontend y bloquean requests IA si falta contexto requerido. `ApiService.generate` o `generateTestCases` usa headers comunes sin PAT. La preview parsea/valida atómicamente, sanea HTML y mantiene el formulario editable como fuente de verdad para título, descripción y criterios. Los Test Cases generados se conservan en UI hasta que el usuario confirme creación.

## Creación

La creación exige PAT en memoria, metadata vigente y payload canónico `hu`. `ApiService` consulta configuración de campos, valida estados de Test Case contra `System.State` y llama `/create`. Los resultados parciales se muestran sin reintentar automáticamente.

## Evaluación

La pantalla busca Work Items mediante filtros, descarta respuestas tardías y llama `/azdo/hu/evaluate` con PAT. La evaluación estructurada se presenta sin exponer prompt crudo ni URLs de request.

Todas estas llamadas usan el mismo builder de URL. La SPA no consume comentarios, arquitectura, CV ni `/create-test-cases`; consulta la [matriz canónica](../../IAHistoriasUsuario-APIFunction/docs/traceability/endpoint-consumer-matrix.md).

