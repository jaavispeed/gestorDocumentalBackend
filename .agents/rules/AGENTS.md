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
     - **DTOs (`common/dto` o `<modulo>/dto`):** Tipado estricto y validaciones con `class-validator` y `class-transformer`.
     - **Module:** Agrupa y exporta los controladores y servicios correspondientes.

3. **Código Legible y Entendible:**
   - Prefiere nombres autoexplicativos sobre nombres abreviados o crípticos.
   - Métodos cortos con una única responsabilidad.
   - Manejo adecuado de excepciones HTTP nativas de NestJS (`BadRequestException`, `NotFoundException`, `InternalServerErrorException`).
