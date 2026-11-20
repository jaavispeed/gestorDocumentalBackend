# Documentación de Procesos: Grupos de Comisiones Transaccionales

Este documento detalla las validaciones, reglas de negocio y flujos para la gestión (creación y actualización) de Grupos de Comisiones Transaccionales, gestionado principalmente por `GrupoComisionTrxService` y `GrupoComisionSysService`.

---

## 1. Crear Grupo de Comisión Transaccional

- **Método:** `CrearTransaccionalAsync`
- **Endpoint:** `POST /api/grupos-comisiones/transaccional`
- **Descripción:** Crea un nuevo grupo de comisiones con flujo transaccional. Además de crear el grupo base, genera el registro de la comisión activa asociada (con valores para porcentaje de comisión, derecho y gasto).

### Reglas y Validaciones Principales (SOLID)

- **Campos Requeridos:** El `TipoOperacion` y la `CodigoFamilia` no pueden ser nulos ni estar vacíos (`TipoOperacionRequerida`, `FamiliaRequerida`).
- **Validación de Combinación Duplicada:** El sistema evalúa a través de `ExisteCombinacionGrupoTransaccionalAsync` si ya existe un grupo activo que coincida en **todos** los siguientes criterios:
  - Mismo Tipo de Operación y Familia de Instrumento (`TipoOperacion`, `CodigoFamilia`).
  - Misma Clase y Subclase de Instrumento (`CodClaseInstrumento`, `IdSubClaseInstrumentoTipoGrupo`).
  - Misma Contraparte (`IdContraparte`) y Moneda (`CodMoneda`).
  - Mismo Tipo de Comisión (`IdTipoComision`).
  - Igual porcentaje de comisión, porcentaje de derechos y monto de gastos (truncados a 4 decimales) en sus comisiones activas.
  - _Si coinciden absolutamente todos, se rechaza la operación informando del grupo original._
- **Nombre Duplicado:** Valida que no exista en la base de datos ningún grupo (transaccional o no) que posea la misma `DscGrupoComisiones`, la misma `CodigoFamilia` y el mismo tipo de instrumento (`GrupoComisionYaExiste`).
- **Validación de Cuentas Asociadas:** Valida a través del endpoint si existen las cuentas ingresadas que aplican o se excluyen de la comisión (`ValidarCuentasAsociadasAsync`).

### Manejo del Proceso (Flujo Interno)

- **Creación Todo en Uno:** El sistema se asegura de que toda la operación sea segura. Si falla alguna validación, no se guarda nada a medias.
- Primero, guarda los datos principales del Grupo de Comisión.
- Inmediatamente después de crearlo con éxito, asocia y guarda los valores económicos (Porcentaje de Comisión, Derechos y Gastos).
- Si ambas cosas ocurren sin problemas, los cambios se confirman y quedan disponibles.

---

## 2. Actualizar Grupo de Comisión Transaccional (PATCH)

- **Método:** `EditarTransaccionalAsync`
- **Endpoint:** `PATCH /api/grupos-comisiones/transaccional/{id}`
- **Descripción:** Aplica cambios parciales a un grupo de comisión transaccional. Revalida la lógica de negocio considerando los nuevos valores y actualiza los registros históricos de las comisiones en caso de ser necesario.

### Reglas y Validaciones

- Vuelve a comprobar las mismas reglas de validación de creación (combinación duplicada y nombre duplicado), omitiendo el grupo actual para permitir que mantenga sus propios datos.
- **Gestión de Cuentas Asociadas:** Si la edición incluye cambios en las cuentas (por ejemplo, agregar nuevas o quitar existentes), el sistema actualiza de forma automática esta lista, garantizando siempre que las cuentas nuevas estén vigentes y habilitadas.
- **Actualización de Valores (Comisiones en Cascada):** El sistema consulta el historial. Si detecta que hubo una variación en el porcentaje de cobro, en el derecho o en el gasto respecto al valor anterior, cerrará automáticamente el periodo de la comisión actual y generará un registro nuevo con los valores actualizados. De esta forma, mantiene la auditoría intacta de lo que se cobró en el pasado.

---

## 3. Impacto en Base de Datos (Modelo de Datos)

### Tablas Afectadas (Escritura)

- `GrupoComisiones`: Información central de cada grupo creado.
- `RelCuentaGrupoComisiones`: Registro de asignación para saber qué cuentas específicas aplican o se excluyen del grupo.
- `Comision` y `ComisionCalculo`: Registro histórico donde se guardan los porcentajes y montos efectivos cobrados a los clientes.
