# Reglas del Proyecto Backend (NestJS)

Este proyecto sigue una arquitectura modular en NestJS enfocada en legibilidad, simplicidad y mantenibilidad.

## Estándares Generales

1. **Idioma del Código:**
   - Nombres de variables, métodos, funciones y comentarios en **español**.
   - Se respetan únicamente las palabras reservadas del lenguaje y convenciones del framework (ej: `get`, `post`, `controller`, `service`, `module`, `dto`).

2. **Estructura Modular de NestJS:**
   - Separación estricta de responsabilidades:
     - **Controller:** Maneja exclusivamente las peticiones HTTP, rutas, códigos de estado y validación de entrada.
     - **Service:** Contiene la lógica de negocio y llamadas externas (lectura de disco, API de Gemini, etc.).
     - **Prompts (`src/prompts/`):** Prompts desacoplados por feature y optimizados estrictamente en tokens (ver `optimizacion-tokens.md`).
     - **DTOs (`common/dto` o `<modulo>/dto`):** Tipado estricto y validaciones con `class-validator` y `class-transformer`.
     - **Module:** Agrupa y exporta los controladores y servicios correspondientes.

3. **Código Legible y Entendible:**
   - Prefiere nombres autoexplicativos sobre nombres abreviados o crípticos.
   - Métodos cortos con una única responsabilidad.
   - Manejo adecuado de excepciones HTTP nativas de NestJS (`BadRequestException`, `NotFoundException`, `InternalServerErrorException`).

4. **[Arquitectura y Separación por Módulo](./arquitectura-modulos.md):**
   - El backend provee servicios desacoplados para los 3 pilares del ecosistema: **Gestor Documental** (dev/código), **AutoManual** (Playwright/procesos) y **Chatbot** (consumo/RAG).
   - Los documentos generados convergen en el repositorio central de documentación.
   - **Segmentación por Audiencia (`DEV` vs `USUARIO`):** Toda documentación y búsqueda RAG debe restringirse según el tipo de usuario para responder con la precisión y el tono adecuados (ver `reglas-desarrollo-backend.md`).
