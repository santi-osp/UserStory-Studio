# Seguridad

## Capas de control

ARM declara CORS sin wildcard y sin credenciales, limitado al frontend resuelto y orígenes HTTPS adicionales, además de TLS mínimo y FTPS deshabilitado. No declara Easy Auth, Microsoft Entra ID ni otra autenticación de plataforma. Estos son controles declarados, no evidencia del estado efectivo en Azure.

Todos los triggers son `AuthorizationLevel.Anonymous`. Backend y frontend no crean, almacenan, validan ni transmiten Function Keys.

Esta decisión deja los endpoints invocables desde Internet cuando la Function App tiene acceso público. CORS solo restringe navegadores y no impide llamadas desde Postman, curl, scripts o servidores. HTTPS/TLS protege el transporte y los permisos Azure DevOps limitan operaciones posteriores, pero ninguno autentica al consumidor HUIA.

## Credenciales y datos

El PAT de Azure DevOps vive en memoria en la SPA y viaja solo en `x-azdo-pat`; `sessionStorage` conserva únicamente un marcador no sensible de conexión. API keys de OpenAI, webhook N8n, storage y telemetry pertenecen a configuración backend protegida. Ningún secreto debe entrar en Git, Markdown, cuerpos, query, cache keys, toasts o logs.

La política HTML admite contenido controlado para Azure DevOps y el frontend sanea antes de renderizar. JSON de entrada y salidas IA se validan estrictamente. Límites de body, profundidad, texto, Test Cases y respuesta reducen abuso accidental. Redirects están deshabilitados para clientes con credenciales; retries se restringen a lecturas/transitorios y presupuestos acotados.

## Logging seguro

El backend registra endpoint lógico, status, duración y contexto saneado con límites; no debe registrar URL completa, PAT, API keys ni bodies sin filtrar. El frontend no registra requests y usa mensajes estáticos para errores HTTP. Correlation IDs aceptan un alfabeto y longitud acotados.

## Riesgos residuales

- No existe autenticación de llamada en la API; los controles funcionales no evitan consumo o abuso anónimo.
- CORS, TLS y acceso público efectivos no se validaron en Azure.
- Mesa, N8n, CV y otros consumidores externos pueden requerir retirar configuración obsoleta de Function Keys antes de su siguiente despliegue.
