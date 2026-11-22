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
  - `@Get()` $\rightarrow$ `findAll()`
  - `@Get(':id')` $\rightarrow$ `findOne(@Param('id', ParseUUIDPipe) id: string)`
  - `@Patch(':id')` $\rightarrow$ `update(...)`
  - `@Delete(':id')` $\rightarrow$ `remove(...)`
- Cero dependencias de autenticación/guards en recursos base hasta que el módulo auth sea requerido explícitamente.

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

## 5. Regla Obligatoria de Sincronización de Documentación Interna

Todo cambio, adición, eliminación o refactorización que afecte al backend (nuevos endpoints, cambios de esquemas de BD, modificaciones en servicios, prompts o configuraciones):
1. **Debe actualizar obligatoriamente** los archivos correspondientes en `documentacion/Documentacion_Interna/` (`Arquitectura_Backend.md`, `Catalogo_Endpoints_API.md`, `Flujo_RAG_Vectores_Segmentacion.md`, etc.).
2. La documentación interna debe reflejar **siempre y en todo momento el estado real y vigente** del sistema en producción/desarrollo.
3. Se prohíbe dar por completada una tarea técnica en el backend sin haber verificado y sincronizado la documentación interna asociada.
