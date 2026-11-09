# Matriz endpoint-consumidor

| Consumidor | Endpoints | Repositorio/config accesible | Envío requerido | Estado |
| --- | --- | --- | --- | --- |
| SPA HUIA | generate, generate-test-cases, create, metadata, workitem-config, test-plans, evaluate, search | `IAHistoriasUsuario-FrontEnd` | Sin credencial de Functions; conserva PAT funcional | Implementado en este cambio; Azure pendiente |
| Mesa de Servicios backend | metadata, workitem-config, test-plans, generate, generate-test-cases, create, create-test-cases | `LaMesa/MesaServicios-BackEnd`, Options y cliente tipado inspeccionados previamente | Retirar configuración obsoleta de Function Key; conservar contratos | Repositorio externo no actualizado |
| Frontend CV | cv/analyze | No localizado | Sin credencial de Functions | No verificable; bloqueo externo |
| Flujo N8n de arquitectura | integracion-arquitectura-hu/create | Flujo no disponible | Sin credencial de Functions; conservar headers funcionales | No actualizado; bloqueo externo |
| Llamadas de arquitectos | arquitectura | No se localizaron scripts/Postman | Sin credencial de Functions | Inventario incompleto externo |
| Comentarios | workitems/discussion/comments | Sin consumidor localizado | Sin credencial de Functions; PAT cuando aplique | Consumidor pendiente |

La ausencia de referencia Angular no autoriza eliminar un endpoint. Los consumidores externos deben conservar rutas, bodies, PAT y headers funcionales existentes. Con acceso público habilitado, todos los endpoints pueden invocarse desde Internet sin autenticación; CORS no bloquea clientes no navegador.
