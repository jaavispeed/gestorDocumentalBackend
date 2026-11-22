# Arquitectura General del Sistema: Gestor Documental & IA

Este documento describe la arquitectura global, diseño modular, responsabilidades e integración de todo el ecosistema (Frontend y Backend).

---

## 1. Visión General del Proyecto

El sistema es una plataforma integral de gestión documental, ingeniería de prompts, vectorización semántica (RAG) y automatización con IA basada en Google Gemini.

### Pilares del Ecosistema:
1. **Gestor Documental (Dev & Knowledge Base):**
   - Gestión centralizada de documentos Markdown (.md) y persistencia en PostgreSQL con pgvector.
   - Generación de documentación técnica automática a partir de `git diff`.
   - Exportación estructurada a PDF, HTML y Word.
2. **AutoManual (Playwright & UX Automation):**
   - Explorador autónomo y crawler de aplicaciones web mediante Playwright.
   - Captura de pantallas en alta definición y análisis multimodal con IA.
   - Compilación y síntesis de manuales de usuario interactivos y paso a paso.
3. **Chatbot Inteligente (RAG Multi-Audiencia):**
   - Motor semántico asistido por pgvector (distancia coseno y embeddings Gemini de 768 dimensiones).
   - Segmentación estricta por tipo de audiencia (`DEV`, `USUARIO` e `INTERNO`).
   - Widget flotante global para asistencia técnica interna continua sobre el código y la arquitectura del sistema.

---

## 2. Pila Tecnológica (Tech Stack)

### Backend
- **Framework:** NestJS 11 con Node.js en formato ESM (`"type": "module"`).
- **ORM & Base de Datos:** TypeORM sobre PostgreSQL con la extensión `vector` (`pgvector`).
- **Inteligencia Artificial:** SDK oficial `@google/genai` (Google Gemini 2.5 / 3 Flash & Embeddings text-embedding-004).
- **Automatización de Navegador:** Playwright (Chromium headless) para AutoManual.

### Frontend
- **Framework:** Angular 19+ (Standalone Components, Signals reactivas, zoneless/hybrid).
- **Estilos:** Tailwind CSS con temas dinámicos (macOS Cupertino & Windows Fluent) y soporte completo Dark Mode.
- **Renderizado de Documentación:** `marked` para Markdown enriquecido con estilos de código y tablas.
- **PWA & Offline:** Almacenamiento local de credenciales de IA y soporte responsivo para móviles y escritorio.

---

## 3. Topología de Comunicación y Endpoints

```
[ Frontend Angular ]
        │
        ├── POST /api/ia/chat/dev ─────────► [ ChatIaController ] ──► RAG Vectorial (DEV)
        ├── POST /api/ia/chat/usuario ─────► [ ChatIaController ] ──► RAG Vectorial (USUARIO)
        ├── POST /api/ia/chat/interno ─────► [ ChatIaController ] ──► RAG Vectorial (INTERNO / Filesystem)
        ├── CRUD /documentos ──────────────► [ DocumentosController ] ──► PostgreSQL (pgvector)
        └── POST /api/automanual/ejecutar ─► [ AutomanualController ] ──► Playwright Engine
```
