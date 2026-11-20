# Reglas de Programación y Código Limpio

## 1. Nomenclatura en Español

- Todas las variables, funciones, parámetros, propiedades de interfaces y comentarios deben escribirse en **español**.
  - Ejemplo correcto: `const rutaDocumentacion = ...`, `obtenerEstado()`, `procesarMensaje(consulta)`.
  - Evitar: `const docPath = ...`, `getStatus()`.

## 2. Buenas Prácticas NestJS

- **Inyección de Dependencias:** Utiliza siempre el sistema de DI nativo de NestJS mediante constructores.
- **Validación con DTOs:** Toda entrada por `Body` o `Query` debe tener su respectivo DTO con decoradores de `class-validator` (`@IsString()`, `@IsOptional()`, etc.).
- **Manejo de Errores:** No uses respuestas manuales `res.status()`. Lanza excepciones estándar de `@nestjs/common` (`NotFoundException`, `BadRequestException`, `ServiceUnavailableException`).
- **Configuración Centralizada:** Accede a variables de entorno a través de `ConfigService` (`@nestjs/config`).

## 3. Simplicidad y Mantenibilidad

- Código directo y modular.
- No sobrecargar con abstracciones innecesarias.
- Mantener la base de datos o almacenamiento de archivos desacoplada de los controladores.
