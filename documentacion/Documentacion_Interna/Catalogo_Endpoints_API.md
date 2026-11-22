# Documentación Interna: Catálogo de Endpoints de la API

Este documento contiene la especificación completa de todos los endpoints disponibles en el backend.

---

## 1. Módulo Chat & RAG (`/api/ia`)

| Método | Endpoint | Descripción | Audiencia |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/estado` | Verifica el estado de salud y conectividad con la API de Gemini | Pública / Admin |
| `POST` | `/api/ia/chat` | Chat polimórfico con soporte para parámetro `tipoUsuario` | General |
| `POST` | `/api/ia/chat/dev` | Asistente técnico que responde sobre documentación de arquitectura y código | Desarrolladores |
| `POST` | `/api/ia/chat/usuario` | Asistente de negocio que responde guías de usuario sin código ni tecnicismos | Usuarios / Clientes |
| `POST` | `/api/ia/chat/interno` | Asistente interno con conocimiento completo de la documentación del proyecto | Equipo Interno |
| `POST` | `/api/ia/generar-doc-diff` | Genera documentación Markdown a partir de cambios de Git Diff | Desarrolladores |
| `POST` | `/api/ia/compilar-manual` | Sintetiza manuales UX interactivos en un solo documento Markdown | Desarrolladores / UX |

---

## 2. Módulo de Documentos (`/documentos`)

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/documentos` | Lista todos los documentos activos en base de datos con conteo de fragmentos y vectores |
| `GET` | `/documentos/:id` | Obtiene el detalle completo de un documento y sus fragmentos |
| `POST` | `/documentos` | Crea un documento directamente en JSON especificando `tipoUsuario` (`DEV` o `USUARIO`) |
| `POST` | `/documentos/upload` | Sube un archivo físico `.md` con multipart/form-data |
| `POST` | `/documentos/upload-multiple` | Sube hasta 20 archivos físicos `.md` simultáneamente con categorización automática |
| `PATCH` | `/documentos/:id` | Actualiza título, contenido o categoría creando snapshot en historial |
| `DELETE` | `/documentos/:id` | Borrado lógico (soft-delete) del documento |
| `PATCH` | `/documentos/:id/restaurar` | Restaura un documento eliminado |
| `GET` | `/documentos/:id/historial` | Lista las versiones previas archivadas de un documento |
| `POST` | `/documentos/regenerar-embeddings` | Fuerza la regeneración masiva de vectores para todos los documentos |
| `POST` | `/documentos/:id/regenerar-embeddings` | Regenera los vectores de un documento específico |
| `POST` | `/documentos/sugerir-feature` | Sugiere automáticamente la categoría basada en heurística y vectores |
| `GET` | `/documentos/estructura/carpetas` | Devuelve el catálogo jerárquico unificado de carpetas y archivos |

---

## 3. Módulo AutoManual (`/api/automanual`)

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/api/automanual/ejecutar` | Inicia la sesión de exploración web automatizada con Playwright |
| `POST` | `/api/automanual/probar-ia` | Valida el modelo multimodal para análisis de capturas de pantalla |
| `POST` | `/api/automanual/subir-logo` | Almacena el logo institucional para personalización de manuales |
| `GET` | `/api/automanual/configuracion` | Obtiene la configuración activa del motor de exploración |
| `POST` | `/api/automanual/configuracion` | Actualiza rutas, cookies y parámetros de exploración |
