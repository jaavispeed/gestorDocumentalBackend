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
