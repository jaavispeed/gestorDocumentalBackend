# Documentación Interna: Motor RAG, Vectores y Segmentación por Audiencia

Este documento detalla el funcionamiento del flujo de Generación Aumentada por Recuperación (RAG), almacenamiento de embeddings en PostgreSQL y aislamiento por tipo de usuario.

---

## 1. Flujo de Ingesta y Vectorización

1. **Subida / Edición:** Un documento Markdown es subido o actualizado mediante `DocumentosController`.
2. **Chunking Semántico:** `dividirMarkdownPorSecciones` divide el archivo Markdown según títulos H1/H2/H3 manteniendo el contexto de cada sección y descartando fragmentos residuales.
3. **Generación de Embeddings:** `EmbeddingsService` consume el modelo de embeddings de Gemini (`text-embedding-004`) y genera vectores densos de 768 dimensiones.
4. **Persistencia:** Los vectores se guardan en la tabla `documento_fragmentos` en la columna `embedding` (tipo `vector(768)`).

---

## 2. Consulta y Búsqueda Semántica Vectorial

Cuando un usuario envía una pregunta a través del chat:
1. Se genera el vector embedding de la pregunta en tiempo real.
2. Se ejecuta una consulta en PostgreSQL ordenando por distancia coseno (`df.embedding <=> $1::vector ASC`).
3. **Cláusula de Filtrado Estricto:**
   - Si la consulta proviene de `/api/ia/chat/dev`: `AND (d.tipo_usuario = 'DEV' OR d.tipo_usuario IS NULL)`
   - Si la consulta proviene de `/api/ia/chat/usuario`: `AND (d.tipo_usuario = 'USUARIO')`
   - Si la consulta proviene de `/api/ia/chat/interno`: Busca en los documentos de la base de conocimiento interna del proyecto (`Documentacion_Interna`).
4. Se inyectan los fragmentos de mayor similitud en el prompt del sistema optimizado en tokens.
5. Google Gemini genera la respuesta final con citas exactas al documento fuente.
