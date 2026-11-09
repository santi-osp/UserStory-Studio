# Decisiones técnicas

1. Los doce triggers usan `AuthorizationLevel.Anonymous`; no existe compatibilidad dual con Function Keys.
2. No se implementa Easy Auth, Microsoft Entra ID ni autenticación alternativa.
3. ARM no crea ni expone Function Keys y conserva CORS/TLS sin presentarlos como autenticación.
4. Angular usa build-time environments y `ApplicationConfigurationService`; las URLs contienen solo base, ruta y parámetros funcionales.
5. El PAT de Azure DevOps y la API Key de OpenAI conservan sus contratos separados.
6. El acceso anónimo desde Internet es un riesgo residual aceptado cuando la Function App tiene acceso público.
7. El PAT viaja solo en `x-azdo-pat` y se conserva en memoria en la SPA; el marcador de conexión no sensible puede persistirse en sesión.
8. OpenAI y N8n comparten una abstracción, pero se selecciona exactamente uno y no hay fallback automático.
9. Las mutaciones no se reintentan; las lecturas solo usan retries acotados dentro del presupuesto de tiempo.
10. Los modelos de entrada usan JSON estricto y las salidas IA se validan antes de exponerse o crear elementos.
11. `CvAnalysis.system.md` es una entrada funcional copiada al build/publish, no documentación.
12. La tabla de 59 App Settings vive en `APP_SETTINGS.md`; no existe una App Setting para Function Keys.

Riesgos aceptados: los endpoints quedan públicos sin autenticación de llamada; los consumidores externos pueden requerir limpieza de configuración obsoleta; no existe evidencia de configuración efectiva en Azure; QA y producción no tienen backend confirmado en los environments versionados.
