# Análisis de CV

El endpoint recibe texto y metadatos; no parsea PDF ni binarios. `AnalyzeCvUseCase` limita el texto incluido en el prompt, carga `CvAnalysis.system.md`, invoca el proveedor IA activo y valida la respuesta antes de normalizar score, veredicto, listas, errores ortográficos, criterios, modelo y timestamp UTC.

`CvAnalysis.system.md` es un recurso funcional. El proyecto Function usa `Prompts/**/*.md` con `CopyToOutputDirectory` y `CopyToPublishDirectory=PreserveNewest`; no debe moverse, renombrarse ni convertirse en documentación.

No se localizó el frontend de evaluación de hojas de vida. Ese consumidor debe invocar la misma ruta y contrato sin Function Key. Su configuración y prueba real quedan como bloqueo externo.
