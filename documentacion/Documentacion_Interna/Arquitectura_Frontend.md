# Documentación Interna: Arquitectura y Componentes del Frontend

Este documento detalla la estructura, flujo reactivo, workspaces y diseño del frontend en Angular 19.

---

## 1. Arquitectura Modular y Workspaces

La aplicación implementa un selector de espacios de trabajo (`/seleccion-espacio`) que da acceso a 3 workspaces especializados:

1. **Gestor Documental (`/gestor-documental/`):**
   - Panel de control (`panel-control`) con métricas y estado del sistema.
   - Gestión de conocimiento (`gestion-conocimiento`): Exploración de árbol documental, visualizador Markdown, editor con control de versiones y modal de carga masiva de archivos `.md`.
   - Generador Doc Diff (`generador-doc-diff`): Transformador inteligente de `git diff`.
   - Generador y Exportador de manuales (`exportador-documentos`).
   - Documentación técnica de la API (`documentacion-api`).

2. **Chatbots Inteligentes (`/chatbot/`):**
   - **`ChatbotDev` (`/chatbot/asistente-dev`):** Asistente enfocado en código, arquitectura, endpoints y validaciones con paneles de atajos y visor documental.
   - **`ChatbotUsuario` (`/chatbot/asistente-usuario`):** Asistente enfocado en procesos funcionales y guía de plataforma, limpio de controles de depuración técnica.
   - **`ChatbotCliente` (`/chatbot/chatbot-cliente`):** Simulador de integración de widget flotante para demostración en sitios web.

3. **AutoManual (`/automanual/`):**
   - Configuración de dominios y credenciales para exploración con Playwright.
   - Lanzador de generación automática de manuales con streaming de logs y vista previa de capturas.

---

## 2. Componentes Compartidos Globales (`src/app/shared/`)

- **`AppSidebar` (`sidebar/`):** Barra lateral estilo macOS / Fluent, colapsable, con soporte multi-workspace inyectado por `ng-content`.
- **`LoaderBackend` (`loader-backend/`):** Alerta global no intrusiva mientras el backend en frío despierta.
- **`InterruptorTema` (`interruptor-tema/`):** Conmutador reactivo entre temas visuales (Cupertino, Fluent, Minimal) y modo claro/oscuro.
- **`ModalAjustesIa` (`modal-ajustes-ia/`):** Modal de configuración para ingresar la API Key de Google Gemini y seleccionar modelos.
- **`NotificacionesFlotantes` (`notificaciones-flotantes/`):** Sistema global de alertas toast automáticas.
- **`ChatbotFlotanteInterno` (`chatbot-flotante-interno/`):** Widget flotante global disponible en toda la aplicación con conocimiento completo de la documentación interna del sistema.

---

## 3. Servicios Clave (`src/app/services/`)

- **`ChatIaService`:** Comunicación HTTP con el backend para endpoints `/api/ia/chat`, `/api/ia/chat/dev`, `/api/ia/chat/usuario` y `/api/ia/chat/interno`.
- **`DocumentacionService`:** Integración con `/documentos` para CRUD, subida multipart, regeneración de embeddings y árbol de directorios.
- **`ConfiguracionIaService`:** Gestión segura de API Keys y modelos activos en localStorage.
- **`NotificacionGlobalService`:** Orquestación reactiva de notificaciones de éxito, advertencia y error.
- **`TemaService`:** Estado reactivo de apariencia visual y modo oscuro persistente.
