# Documentación de Procesos: Grupos de Comisiones de Administración

Este documento detalla las validaciones, reglas de negocio y flujos para la gestión de Grupos de Comisiones de Administración. A diferencia de los grupos transaccionales, las comisiones de administración son cobros periódicos que no dependen de la familia de un instrumento ni de una operación puntual.

---

## 1. Crear Grupo de Comisión de Administración

- **Método:** `CrearAdministracionAsync`
- **Endpoint:** `POST /api/grupos-comisiones/administracion`
- **Descripción:** Crea un nuevo grupo de comisiones con flujo de administración. Solo guarda el porcentaje de la comisión (no maneja derechos ni gastos como la versión transaccional).

### Reglas y Validaciones Principales (SOLID)

- **Menor Restricción Estructural:** No se requiere que el grupo posea `TipoOperacion` o `CodigoFamilia`.
- **Validación de Combinación Duplicada (Administración):** Invoca a `ExisteCombinacionGrupoAdministracionAsync` para comprobar si ya existe un grupo activo que coincida en **todos** los siguientes criterios:
  - Misma Moneda (`CodMoneda`).
  - Mismo Tipo de Comisión (`IdTipoComision`).
  - Mismo porcentaje de cobro (truncado a 4 decimales) en su comisión activa de tipo Administración o Adicional.
  - *Si se detecta un grupo activo que iguala estos valores, se rechaza la operación para no duplicar reglas.*
- **Nombre Duplicado:** Valida que no exista en la base de datos ningún grupo que posea la misma `DscGrupoComisiones` de manera idéntica (`GrupoComisionYaExiste`).
- **Validación de Cuentas Asociadas:** Valida la existencia y la vigencia de las cuentas seleccionadas mediante el servicio HTTP externo en `ValidarCuentasAsociadasAsync`.

### Manejo del Proceso (Flujo Interno)

- **Creación Segura:** Todo el proceso opera como un bloque. Si un paso falla, no se guarda información a medias.
- El sistema registra primero los detalles generales del Grupo de Administración.
- Luego de guardarlo, se asocia automáticamente el porcentaje de cobro (dejando en blanco los valores que no aplican, como derechos y gastos).

---

## 2. Actualizar Grupo de Comisión de Administración (PATCH)

- **Método:** `EditarAdministracionAsync`
- **Endpoint:** `PATCH /api/grupos-comisiones/administracion/{id}`
- **Descripción:** Modifica la estructura de un grupo de comisiones de administración (nombre, descripción, o porcentaje).

### Reglas y Validaciones

- Ejecuta las validaciones de duplicidad de la misma manera que en la creación, asegurándose de no compararlo contra sí mismo.
- **Gestión de Cuentas Asociadas:** Si el usuario actualiza las cuentas afectadas por el grupo, el sistema reemplazará la configuración anterior por la nueva selección de cuentas.
- **Actualización del Porcentaje:** El sistema evalúa el historial. Si el porcentaje de cobro indicado es diferente al anterior, el sistema cierra la comisión actual y registra una nueva versión. Así, se preserva la información histórica de cobros.

---

## 3. Impacto en Base de Datos (Modelo de Datos)

### Tablas Afectadas (Escritura)
- `GrupoComisiones`: Información central de cada grupo creado.
- `RelCuentaGrupoComisiones`: Asignación de cuentas específicas al grupo.
- `Comision` y `ComisionCalculo`: Registro donde reside el porcentaje de administración (y su historial si éste es modificado en el tiempo).
