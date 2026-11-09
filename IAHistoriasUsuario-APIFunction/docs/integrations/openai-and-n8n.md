# OpenAI y N8n

`AiConnection__Provider` selecciona exactamente `OpenAI` o `N8n`. `AiJsonGenerator` elige el cliente registrado y nunca intenta el otro proveedor como fallback. Los gateways de generación, evaluación y CV usan la misma abstracción, con prompts y contratos específicos.

OpenAI recibe Bearer API key, URL base HTTPS y modelo. N8n recibe un webhook HTTPS y modelo. Ambos pasan por `AiHttpExecutor`, que aplica timeout, límites de respuesta, retries solo para fallos transitorios y un presupuesto total máximo. Los redirects se rechazan y las respuestas se leen con tamaño acotado.

Los requests pueden proponer modelo dentro de longitud permitida; si falta, se usa el default del proveedor seleccionado. Las salidas deben ser JSON y se validan contra el contrato funcional antes de retornar. Claves, webhooks, prompts con datos sensibles y cuerpos completos no deben registrarse.

