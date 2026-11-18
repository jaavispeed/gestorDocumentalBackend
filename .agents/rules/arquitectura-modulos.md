# Arquitectura del Backend y Módulos de Soporte

Este documento establece la correspondencia del backend con los módulos funcionales del ecosistema.

---

## 1. Módulos del Backend y su Rol

1. **`documentacion/`:**
   - Almacena, clasifica y gestiona los archivos físicos Markdown de la base de conocimiento (`documentacion/CFI`, `Comisiones`, etc.).
   - Sirve como la fuente de verdad tanto para el **Gestor Documental** como para las consultas del **Chatbot**.

2. **`prompts/`:**
   - Mantiene desacoplados los prompts de sistema y de extracción documental (ej: `git-diff-doc.prompt.ts`).
   - Optimización de consumo de tokens y refinamiento técnico.

3. **`chat-ia/`:**
   - Orquestación con modelos LLM (Gemini API).
   - Procesa tanto peticiones de generación/refactor documental (para el desarrollador) como consultas conversacionales (RAG).

4. **`automanual/` (Proyección):**
   - Servicio encargado de orquestar sesiones de **Playwright**.
   - Generación y almacenamiento de capturas de pantalla y transcripción de pasos operativos a Markdown.

---

## 2. Reglas de Integración
* Las rutas de endpoints deben reflejar el dominio funcional (`/api/documentacion`, `/api/chat-ia`, `/api/automanual`).
* La persistencia de documentos generados por AutoManual y Gestor Documental debe converger en el repositorio unificado de documentación técnica.
