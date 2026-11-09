# Troubleshooting

| Síntoma | Diagnóstico | Acción segura |
| --- | --- | --- |
| `API_NOT_CONFIGURED` | Environment sin `baseUrl`. | Configurar solo un host confirmado; no usar DLLO como fallback. |
| `401/403` de una operación Azure DevOps | PAT sin permisos, vencido o inválido. | Renovar PAT con permisos mínimos y mantenerlo en memoria/header. |
| `400` PAT requerido | Falta `x-azdo-pat` o excede límite. | Renovar PAT con permisos mínimos y mantenerlo en memoria/header. |
| CORS en navegador | Origen no permitido o backend real distinto. | Comparar origen exacto; `localhost` y `127.0.0.1` son distintos. |
| OptionsValidationException al iniciar | Setting requerida, placeholder, rango o presupuesto inválido. | Revisar `APP_SETTINGS.md`; reiniciar después de corregir. |
| Timeout de creación | Estado remoto ambiguo. | Verificar HU/suite/casos/relaciones antes de repetir. |
| JSON IA inválido | Proveedor no cumplió esquema. | Revisar modelo/prompt aprobado y correlation ID; no exponer raw sensible. |
| `/api/api` | Base y endpoint duplican prefijo. | Base debe terminar en `/api`; rutas empiezan `/v1.0.0`. |
