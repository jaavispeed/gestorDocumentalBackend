# Gestor Documental - Backend

Backend desarrollado con [NestJS](https://nestjs.com/), TypeScript, TypeORM y PostgreSQL (`pgvector`) para el sistema de Gestor Documental con arquitectura RAG.

---

## Requisitos

- **Node.js** (versión 20 o superior recomendada)
- **Docker** y **Docker Compose** (para levantar PostgreSQL con `pgvector`)
- Clave de API de Google Gemini (para el asistente IA)

---

## Configuración de Entorno

Copia el archivo `.env.example` a `.env` y ajusta las variables si es necesario:

```bash
PORT=3000
GEMINI_API_KEY=tu_clave_gemini_aqui
GEMINI_MODELO=gemini-2.5-flash

# Base de datos
DB_NAME=gestordocumental
DB_PASSWORD=postgres
```

---

## Levantar la Base de Datos con Docker

Dentro del directorio `gestor-documental-backend`:

### 1. Iniciar el contenedor de PostgreSQL con `pgvector`
```bash
docker compose up -d
```

### 2. Verificar el estado del contenedor
```bash
docker compose ps
```

### 3. Ver los logs de la base de datos
```bash
docker compose logs -f db
# o directamente por el nombre del contenedor:
docker logs -f gestor_db
```

### 4. Detener el contenedor
```bash
docker compose down
```

> **Nota:** El contenedor se inicializa automáticamente con la extensión `vector` habilitada gracias a `init-pgvector.sql`.

---

## Instalación y Ejecución del Backend

```bash
# Instalar dependencias
npm install

# Modo desarrollo
npm run start:dev

# Compilar
npm run build

# Modo producción
npm run start:prod
```

---

## Endpoints de la Base de Datos (Documentos & RAG)

### 1. Subir un archivo `.md` físico (Recomendado para el Frontend)
- **`POST /documentos/upload`**
- **Content-Type:** `multipart/form-data`
- **Campos:**
  - `file`: Archivo Markdown (`.md`).
  - `categoria` (opcional): Categoría o carpeta lógica (ej. `Finanzas`, `CFI`).
- **Headers opcionales:**
  - `x-gemini-key`: Clave API de Gemini si el usuario la provee desde el frontend.
- **Acción:**
  1. Guarda el documento en la tabla `documento`.
  2. Ejecuta *chunking* inteligente por encabezados (`#`, `##`, `###`).
  3. Genera embeddings vectoriales de 768 dimensiones con Gemini.
  4. Guarda los fragmentos y vectores en `documento_fragmento`.

### 2. Crear documento vía JSON directo
- **`POST /documentos`**
- **Body (JSON):**
  ```json
  {
    "titulo": "Guía de Inicio",
    "nombreArchivo": "guia.md",
    "categoria": "General",
    "contenido": "# Guía de Inicio\n\nEste es el contenido en markdown..."
  }
  ```

### 3. Listar todos los documentos
- **`GET /documentos`**: Retorna el listado completo de documentos registrados en Postgres.

### 4. Consultar un documento con sus vectores
- **`GET /documentos/:id`**: Retorna el documento junto con todos sus fragmentos y estado vectorial.

### 5. Eliminar un documento
- **`DELETE /documentos/:id`**: Elimina el documento y todos sus vectores asociados en cascada.

---

## Otros Endpoints

- `GET /api/estado`: Devuelve el estado del servidor y configuración de IA.
- `POST /api/ia/chat`: Procesa consultas del asistente conversacional con contexto documental.
- `GET /api/documentacion`: Catálogo de archivos locales.
- `GET /api/documentacion/detalle?ruta=...`: Contenido de archivo local.
