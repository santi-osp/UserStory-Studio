# Integración de arquitectura

`IntegracionArquitecturaHU` recibe JSON con Markdown de backlog. El adapter extrae texto de las claves compatibles, limita tamaño y delega al parser. La preparación cuenta Epics, Features e Historias funcionales/no funcionales/desconocidas, genera warnings y preview.

Con `x-validate-only` o `x-parse-only` verdadero, retorna la preparación sin exigir PAT ni tocar Azure DevOps. En modo creación exige organización, proyecto, área, iteración y PAT; crea jerarquía padre-hijo sin retries automáticos.

El consumidor N8n/arquitectos no está disponible en los repositorios inspeccionados. Ya no debe configurar una Function Key; debe seguir enviando los headers funcionales y el PAT cuando corresponda. No se verificó ni migró ese flujo y no debe considerarse end-to-end listo.
