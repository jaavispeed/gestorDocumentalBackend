# Documentación Interna: Arquitectura y Módulos del Backend

Este documento detalla la estructura interna, controladores, servicios, flujos de datos y diseño del backend en NestJS.

---

## 1. Módulos del Backend

### 1.1 `AppModule` (`src/app.module.ts`)
- Módulo raíz que orquesta la configuración global (`ConfigModule`) y la conexión a PostgreSQL con TypeORM (`TypeOrmModule`).
- Inyecta de forma global el guard de seguridad `BearerAuthGuard` (passthrough defensivo).
- Registra los submódulos: `DocumentosModule`, `ChatIaModule`, `DocumentacionModule` y `AutomanualModule`.

### 1.2 `DocumentosModule` (`src/documentos/`)
- **Entidades:**
  - `Documento`: Tabla principal con metadatos, categoría, contenido y el enum de segmentación `tipo_usuario` (`DEV`, `USUARIO`).
  - `DocumentoFragmento`: Fragmentos troceados en Markdown con vector embedding de 768 dimensiones.
  - `DocumentoHistorial`: Snapshots automáticos de versiones previas con control de autoría y resumen de cambios.
- **Servicios:**
  - `DocumentosService`: CRUD completo, subida de archivos únicos/múltiples `.md`, validación de duplicados exactos y vectoriales, y recálculo de embeddings.
  - `EmbeddingsService`: Genera vectores usando Google Gemini (`text-embedding-004`).
- **Controlador (`DocumentosController`):**
  - `POST /documentos`: Registro directo en JSON.
  - `POST /documentos/upload`: Carga de archivo individual `.md` con categorización y asignación de `tipoUsuario`.
  - `POST /documentos/upload-multiple`: Carga por lotes de hasta 20 archivos Markdown.
  - `POST /documentos/regenerar-embeddings`: Recálculo masivo de índices vectoriales.

### 1.3 `ChatIaModule` (`src/chat-ia/`)
- **Servicio (`ChatIaService`):**
  - Implementa el flujo RAG: Búsqueda vectorial mediante similitud coseno (`df.embedding <=> $1::vector`) con filtrado estricto por audiencia (`tipoUsuario`), fallback a sistema de archivos físicos, armado de prompts y llamada a Gemini.
  - Soporta método dedicado `procesarMensajeInterno` que lee o prioriza la carpeta `Documentacion_Interna`.
- **Controlador (`ChatIaController`):**
  - `GET /api/estado`: Comprobación de salud y verificación de API Key con Google Gemini.
  - `POST /api/ia/chat/dev`: Chat con perfil técnico desarrollador.
  - `POST /api/ia/chat/usuario`: Chat orientado a cliente/usuario final.
  - `POST /api/ia/chat/interno`: Chat exclusivo para el Chatbot Flotante Interno con conocimiento de todo el proyecto.
  - `POST /api/ia/generar-doc-diff`: Transforma `git diff` crudo en documentación técnica estructurada.
  - `POST /api/ia/compilar-manual`: Compilación de manuales UX unificados.

### 1.4 `AutomanualModule` (`src/automanual/`)
- Automatización integral mediante Playwright (`motor/crawler.ts`, `motor/auto-explorer.ts`, `motor/vision-analyzer.ts`, `motor/ai-synthesizer.ts`).

---

## 2. Convenciones de Desarrollo Backend
1. Idioma español para variables, métodos y comentarios.
2. Nombres canónicos de métodos CRUD: `create`, `findAll`, `findOne`, `update`, `remove`.
3. Inyección limpia de repositorios y tipado ESM (`import type` para evitar ciclos).
4. Manejo centralizado de errores de BD (`handleDBExceptions`).

### Flujo QA AutoManual (Cliente → Pantalla → Evidencias & Casos)
- `PantallaAutomanual` soporta asociación directa a `ClienteAutomanual` (`cliente_id`) con `modulo_id` opcional.
- `RastreadorNavegador` y `AutoExplorer` capturan imágenes de página completa (`fullPage: true`) y `AnalizadorVision` analiza todas las capturas generadas de la pantalla.
- `EjecutorCasosPrueba` (`src/automanual/motor/test-runner.ts`) permite la re-ejecución en 1 clic de los casos guardados en `casos_prueba_automanual`, actualizando `ultimo_resultado`, `detalle_ultimo_fallo`, `captura_evidencia_url` y `ultima_ejecucion`.
- Arquitectura SOLID del motor QA (`src/automanual/motor/`):
  - `contratos-qa.ts`: Interfaces `IAutenticadorWeb`, `IExploradorPantalla` y contratos de datos (`EvidenciaCapturada`, `ResultadoExploracionPantalla`).
  - `explorador-interactivo.ts`: `ExploradorInteractivo` + `RegistroAntiLoop` (profundidad 1, registro de URLs visitadas y firmas clickeadas para evitar loops y salidas de dominio).
  - `orquestador-flujo-qa.ts`: `OrquestadorFlujoQa` ejecuta el flujo lineal en 4 pasos (1. Autenticar en `urlApp`, 2. Abrir link objetivo, 3. Explorar clickeables y cambios de URL, 4. Generar casos con Gemini Vision incluyendo `url_pantalla` por caso).
- Clasificación en Supabase Storage: `clientes/<cliente>/pantallas/<pantalla>/exploracion/<archivo>.png` y `clientes/<cliente>/pantallas/<pantalla>/casos/<codigo-caso>/<archivo>.png`.
