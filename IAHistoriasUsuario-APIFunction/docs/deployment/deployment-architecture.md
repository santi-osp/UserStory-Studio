# Arquitectura de despliegue

El ARM backend actual no crea la Function App: configura el recurso hijo `web` de una app existente para CORS, TLS, FTPS y depuración remota. Requiere nombre de Function, origen frontend y orígenes adicionales. No configura autenticación, no crea Function Keys, no administra App Settings y no expone secretos.

El ARM frontend crea una Web App sobre un App Service Plan existente, con HTTPS only, HTTP/2, TLS mínimo 1.2 y FTPS deshabilitado. Existen parámetros DLLO y PRBS en el frontend; QA/producción Angular permanecen sin URL confirmada. No hay parámetro PROD inventado.

## Orden de entrega

1. Validar ARM en la suscripción y confirmar que recursos externos/planes existen.
2. Configurar las 59 App Settings backend desde almacenamiento seguro y reiniciar.
3. Desplegar backend y verificar CORS, HTTPS/TLS y acceso público efectivo.
4. Retirar cualquier configuración externa obsoleta de Function Keys en consumidores.
5. Compilar y desplegar Angular con la base URL del ambiente.
6. Probar CORS en navegador y una solicitud funcional sin credenciales de Functions por cada consumidor.
7. Confirmar por separado que PAT, OpenAI y otros secretos backend conservan sus contratos.

Ningún paso fue ejecutado contra Azure durante este trabajo. La presencia de ARM o environments solo prueba intención declarativa. Sin Entra ID ni Function Keys, una app con acceso público permite llamadas desde clientes no navegador; CORS no las bloquea.
