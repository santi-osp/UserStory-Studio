# Runbook

## Verificación previa

- Confirmar rama/HEAD y worktrees sin staged inesperado.
- Ejecutar build, tests, lint, cuatro builds Angular, auditorías, parseos y búsqueda de secretos.
- Confirmar 12 triggers `Anonymous`, cero `Function/Admin`, rutas/métodos intactos y 59 settings en paridad.
- Confirmar hash/inclusión de `CvAnalysis.system.md` y ausencia de secretos reales.

## Activación Azure

- Validar y desplegar ARM en el ambiente autorizado.
- Aplicar App Settings desde fuente segura; comprobar startup.
- Verificar CORS y acceso público efectivo por separado.
- Confirmar que Mesa/N8n/CV/otros consumidores no envían credenciales de Functions; luego construir Angular con la base URL confirmada.

## Smoke tests

Probar un request funcional sin credenciales de Functions, CORS desde un origen permitido/no permitido y acceso directo desde un cliente no navegador. Para mutaciones, usar `validate-only` cuando exista o un proyecto controlado con autorización explícita.

## Riesgo operativo

Monitorear volumen, errores y costos porque la API no autentica al consumidor. Las validaciones funcionales, límites y permisos de Azure DevOps deben permanecer activos, pero no sustituyen autenticación.
