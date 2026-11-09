# Arquitectura del sistema

## Vista general

```mermaid
flowchart LR
    U[Usuario] --> SPA[Angular HUIA]
    EXT[Consumidores externos] --> PLAT[Azure Functions platform]
    SPA --> PLAT
    PLAT --> FN[Function adapters]
    FN --> APP[Application Use Cases]
    APP --> DOM[Domain policies]
    APP --> PORTS[Application gateways]
    INF[Infrastructure adapters] -. implementa .-> PORTS
    INF --> AZDO[Azure DevOps REST]
    INF --> AI[OpenAI o N8n]
    FN --> AIH[Application Insights]
```

Angular concentra rutas en `api-contract.ts`, configuración en `ApplicationConfigurationService` y transporte en `ApiService`. La Function valida transporte, cuerpo, headers y contexto, transforma el request en un comando/query y delega. Application orquesta reglas sin conocer HTTP. Domain contiene políticas de campos y HTML. Infrastructure implementa proveedores IA, parser de arquitectura y adaptadores REST de Azure DevOps.

## Acceso HTTP

```mermaid
sequenceDiagram
    participant C as Cliente
    participant R as Functions runtime
    participant F as Function
    C->>R: HTTPS + request funcional
    R->>R: trigger Anonymous
    R->>F: ejecuta trigger
    F->>F: valida JSON, contexto y PAT cuando aplica
    F-->>C: respuesta + x-correlation-id
```

No hay autenticación de plataforma ni Function Key en el contrato. ARM declara CORS y TLS, pero CORS no protege frente a clientes no navegador. El estado efectivo y el acceso público deben probarse en Azure.

## Observabilidad

Application Insights se registra en `Program.cs`. Cada Function usa nombres lógicos de endpoint y correlation ID; `ErrorLoggingHelper` sanea y limita contexto. PAT, API keys y cuerpos sensibles no deben registrarse. El frontend transforma errores HTTP sin reutilizar la URL completa.
