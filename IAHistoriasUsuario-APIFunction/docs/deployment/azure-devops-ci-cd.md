# Azure DevOps CI/CD

No hay YAML, scripts de pipeline ni definición Classic Release versionada en estos repositorios. Por ello no se afirma una asociación verificable de ramas, variable groups, token replacement o tareas de despliegue. La rama inspeccionada es `feature/NuevasFunciones`; los nombres ARM distinguen DLLO y PRBS donde existen parámetros.

Un pipeline real debe ejecutar las validaciones documentadas, obtener los secretos backend desde un almacén/variable protegida y compilar el frontend con su environment. No debe inyectar ni sustituir Function Keys en el bundle.

La validación de ARM debe usar `az deployment group validate` en el resource group correcto antes del deployment. Después debe separar evidencia de código, validación de plantilla, despliegue exitoso y smoke tests efectivos. La definición externa del pipeline no fue inspeccionada.
