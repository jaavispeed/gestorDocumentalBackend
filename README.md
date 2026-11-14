# Gestor Documental - Backend

Backend desarrollado con [NestJS](https://nestjs.com/) y TypeScript para el sistema de Gestor Documental. Proporciona endpoints para la consulta conversacional asistida por IA (Google Gemini) y la gestión de la base de conocimiento en formato Markdown.

## Requisitos

- Node.js (versión 20 o superior recomendada)
- Clave de API de Google Gemini (opcional si el cliente suministra su propia clave)

## Configuración de Entorno

Copia el archivo `.env.example` a `.env` y configura tus variables:

```bash
PORT=3000
GEMINI_API_KEY=tu_clave_gemini_aqui
GEMINI_MODELO=gemini-2.5-flash
```

## Instalación

```bash
npm install
```

## Ejecución

### Modo desarrollo (con recarga automática)

```bash
npm run start:dev
```

### Modo producción

```bash
npm run build
npm run start:prod
```

## Endpoints Principales

- `GET /api/estado`: Devuelve el estado del servidor, el modelo de IA activo y si tiene clave configurada.
- `POST /api/ia/chat`: Procesa consultas del asistente conversacional con contexto documental.
- `GET /api/documentacion`: Devuelve el catálogo y la estructura de carpetas y archivos `.md`.
- `GET /api/documentacion/detalle?ruta=...`: Obtiene el contenido de un archivo Markdown específico.
