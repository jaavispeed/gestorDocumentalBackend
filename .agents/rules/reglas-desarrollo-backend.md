# Reglas de Desarrollo del Backend (TypeORM y NestJS)

Este documento define las reglas y estándares de desarrollo para la creación de entidades, controladores, servicios y persistencia de base de datos en el backend.

---

## 1. Entidades TypeORM

- **Sin sufijo en nombres de clases:**
  - Usar nombres limpios en singular: `Documento`, `Categoria`, `Producto`, `DocumentoFragmento` (NO usar sufijos como `Entity`).
  - Nombre de archivo: `[recurso].entity.ts` (ej. `documento.entity.ts`).
- **Decorador `@Entity()`:**
  - Usar `@Entity()` limpio sin forzar nombres de tabla manuales.
- **Tipos de columnas:**
  - `@PrimaryGeneratedColumn('uuid')` o `'increment'` según corresponda al recurso.
  - `@Column('text')` para cadenas y contenidos de texto.
  - `@CreateDateColumn({ type: 'timestamptz' })` y `@UpdateDateColumn({ type: 'timestamptz' })` para auditoría temporal.
- **Relaciones TypeORM en ESM:**
  - Referenciar entidades en relaciones mediante nombres en string y tipos con `import type` para evitar dependencias circulares en Node ESM:
    ```typescript
    @ManyToOne('Documento', 'fragmentos', { onDelete: 'CASCADE' })
    documento: Documento;
    ```

---

## 2. Servicios (`[recurso].service.ts`)

- **Nombres canónicos de métodos CRUD:**
  - `create(dto)`
  - `findAll()`
  - `findOne(id)`
  - `update(id, dto)`
  - `remove(id)`
- **Inyección de Repositorios:**
  - `@InjectRepository(NombreClase) private readonly [recurso]Repository: Repository<NombreClase>`.
- **Manejo de Errores DB:**
  - Declarar siempre el logger del servicio: `private readonly logger = new Logger('RecursoService');`.
  - Implementar método centralizado `handleDBExceptions(error: any)`:
    ```typescript
    private handleDBExceptions(error: any) {
      if (error.code === '23505') {
        throw new BadRequestException(error.detail || 'El registro ya existe');
      }
      this.logger.error(error);
      throw new InternalServerErrorException(
        'Error inesperado, revise los logs del servidor',
      );
    }
    ```
  - Envolver operaciones de escritura (`create`, `update`, `remove`) en bloques `try / catch (error: any)` delegando a `this.handleDBExceptions(error)`.

---

## 3. Controladores (`[recurso].controller.ts`)

- Rutas de recurso en plural: `@Controller('documentos')`.
- Métodos del controlador homólogos al servicio:
  - `@Post()` $\rightarrow$ `create(@Body() dto: CreateDto)`
  - `@Get()` $\rightarrow$ `findAll(@Query() paginacionDto: PaginacionDto)` con soporte de paginación de backend
  - `@Get(':id')` $\rightarrow$ `findOne(@Param('id', ParseUUIDPipe) id: string)`
  - `@Patch(':id')` $\rightarrow$ `update(...)`
  - `@Delete(':id')` $\rightarrow$ `remove(...)`
- Cero dependencias de autenticación/guards en recursos base hasta que el módulo auth sea requerido explícitamente.

---

## 3.1. Estándar Obligatorio de Paginación en Endpoints GET (Listados)

Para optimizar el rendimiento y el consumo de memoria:
- Todo endpoint `@Get()` que retorne listas o colecciones de registros (especialmente documentos y catálogos de base de conocimiento) debe admitir parámetros de consulta mediante `PaginacionDto` (`pagina`, `limite`, `busqueda`, etc.).
- Las respuestas paginadas deben devolver la estructura canónica `RespuestaPaginada<T>` con su metadata correspondiente (`total`, `pagina`, `limite`, `totalPaginas`, `tienePaginaSiguiente`, `tienePaginaAnterior`), manteniendo fallback retrocompatible en caso de consultas sin parámetros específicos.

---

## 4. Segmentación Documental y Asistentes IA por Tipo de Usuario

Para garantizar la precisión de las respuestas del modelo y la seguridad contextual del conocimiento almacenado:
- **Columna `tipo_usuario`:**
  - Toda entidad o registro documental debe tiparse estrictamente mediante el enum `TipoUsuarioDocumento`: `'DEV'` o `'USUARIO'`.
  - **`DEV`**: Documentación técnica, endpoints, esquemas de base de datos, flujos de integración, contratos de API, validaciones y arquitectura de software.
  - **`USUARIO`**: Guías de usuario, manuales de procedimiento, reglas de negocio explicadas amigablemente y soporte operativo de la plataforma (sin tecnicismos de código ni exposición de endpoints internos).
- **Filtrado RAG Vectorial y Endpoints del Chatbot:**
  - El motor RAG vectorial debe aplicar aislamiento mediante `WHERE d.tipo_usuario = $tipoUsuario`.
  - Se exponen endpoints dedicados y desacoplados:
    - `POST /api/ia/chat/dev`: Consume contexto técnico y responde con el System Prompt de Desarrollador (`PROMPT_ASISTENTE_DOCUMENTACION`).
    - `POST /api/ia/chat/usuario`: Consume contexto funcional y responde con el System Prompt de Guía de Usuario (`PROMPT_ASISTENTE_USUARIO`).
    - `POST /api/ia/chat/interno`: Consume la base de conocimiento interno (`documentacion/Documentacion_Interna/`) y responde con el System Prompt de Arquitectura Interna (`PROMPT_ASISTENTE_INTERNO`).
    - `POST /api/ia/chat`: Mantiene retrocompatibilidad admitiendo el campo opcional `tipoUsuario: 'DEV' | 'USUARIO' | 'INTERNO'`.

---

## 5. Prevención Rigurosa de SQL Injection y Uso de TypeORM

Para blindar la base de datos contra vulnerabilidades de inyección SQL (SQL Injection):
- **Uso Estricto del ORM y QueryBuilder Parametrizado:**
  - Toda consulta a la base de datos debe realizarse a través de la API estándar de TypeORM (`find`, `findOne`, `create`, `save`, `softDelete`, etc.) o mediante `createQueryBuilder`.
  - En `createQueryBuilder`, **NUNCA** concatenar variables ni valores directos en las cláusulas SQL (prohibido: `.where(\`d.estado = '${estado}'\`)`).
  - Utilizar **exclusivamente parámetros nombrados** con sanitización y binding automático: `.where('d.estado = :estado', { estado })`, `.andWhere('d.categoria = :categoria', { categoria })`.
- **Consultas Nativas Crudas (`repository.query(...)`):**
  - Se restringen únicamente a operaciones vectoriales especializadas de `pgvector` (operador de distancia `<=>`).
  - En caso de requerirse `query(...)`, es mandatorio usar **Placeholders Posicionales Sanitizados** (`$1`, `$2`, `$3`) pasando el arreglo de valores como segundo argumento `repository.query(sql, [param1, param2])`.
  - Queda terminantemente prohibido interpolar cadenas en templates literales dentro de sentencias SQL crudas.
- **Validación de Duplicados y Estado de Registros:**
  - Toda verificación de duplicidad (por nombre de archivo, contenido exacto o similitud vectorial semántica) debe evaluar únicamente registros con estado vigente (`estado = 'ACTIVO'` y `fecha_eliminacion IS NULL`).
  - Si un documento idéntico o con el mismo nombre se encuentra en estado `ELIMINADO` (soft delete), **NO** debe considerarse conflicto ni bloquear la subida del nuevo archivo.

---

## 6. Regla Obligatoria de Sincronización de Documentación Interna

Todo cambio, adición, eliminación o refactorización que afecte al backend (nuevos endpoints, cambios de esquemas de BD, modificaciones en servicios, prompts o configuraciones):
1. **Debe actualizar obligatoriamente** los archivos correspondientes en `documentacion/Documentacion_Interna/` (`Arquitectura_Backend.md`, `Catalogo_Endpoints_API.md`, `Flujo_RAG_Vectores_Segmentacion.md`, etc.).
2. La documentación interna debe reflejar **siempre y en todo momento el estado real y vigente** del sistema en producción/desarrollo.
3. Se prohíbe dar por completada una tarea técnica en el backend sin haber verificado y sincronizado la documentación interna asociada.
