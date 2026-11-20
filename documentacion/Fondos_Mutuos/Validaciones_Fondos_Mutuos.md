# 🔍 Matriz de Validaciones: Fondos Mutuos (Inversión y Rescate)

Este documento detalla **cada una de las validaciones de negocio y técnicas** que ejecuta el backend en `OrdenTrxService` para las órdenes de **Inversión** (`IngresarOrdenFondosMutuosInversion`) y **Rescate** (`IngresarOrdenFondosMutuosRescate`) de Fondos Mutuos, junto con sus parámetros, fórmulas y códigos de error exactos.

---

## 1. Catálogo Resumido de Validaciones

| #           | Validación                                 | Aplica a            | Parámetro / Entidad                                                        | Error Asociado                                               | Comportamiento / Acción                                                                                |
| :---------- | :----------------------------------------- | :------------------ | :------------------------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **V-FM-01** | Subclase Nacional Fondos Mutuos            | Inversión y Rescate | `CodClaseInstrumento == "FFMM_NAC"`                                        | Bifurcación técnica                                          | Si no es `FFMM_NAC`, el flujo se bifurca hacia **CFI Fuera de Rueda**.                                 |
| **V-FM-02** | Familia del Instrumento                    | Inversión y Rescate | `CodigoFamilia == "FFMM"`                                                  | `InstrumentoErrors.InstrumentoNoEsFondoMutuo`                | Rechaza si no pertenece a la familia Fondos Mutuos.                                                    |
| **V-FM-03** | Tipos de Operación Permitidos              | Inversión           | `TipoOperacion` (`INVERSION`, `INVMLTEXT`, etc.)                           | `TipoOperacionErrors.IncompatibleInversion`                  | Valida que el código pertenezca al catálogo permitido.                                                 |
| **V-FM-04** | Tipos de Operación Permitidos              | Rescate             | `TipoOperacion` (`RESCATE`, `RESCMLTEXT`, etc.)                            | `TipoOperacionErrors.IncompatibleRescate`                    | Valida que el código pertenezca al catálogo permitido.                                                 |
| **V-FM-05** | Exigencia de Contraparte Externa           | Inversión y Rescate | `TipoOperacion == "INVMLTEXT"` o `"RESCMLTEXT"`                            | Error de validación contraparte                              | Exige que `IdContraparte` esté informado y vigente.                                                    |
| **V-FM-06** | Saldo de Caja y Sobregiro                  | Inversión           | `cuenta.FlgMovDescubiertos == 'S'`                                         | Error saldo insuficiente                                     | Si no permite sobregiro, valida que `SaldoCaja >= MontoInversion`.                                     |
| **V-FM-07** | Saldo en Cartera (Custodia)                | Rescate             | `carteraInstrumento.Vigente`                                               | `CarteraErrors.CantidadInsuficiente`                         | Valida que `CantidadOrden <= CarteraDisponible`.                                                       |
| **V-FM-08** | Horario de Mercado y Parámetro Diferido    | Inversión           | `ValidaHorarioInversion` y `HorarioInversion`                              | `InstrumentoErrors.HorarioCerrado`                           | Si cerrado y flag `true` rechaza; si `false` **difiere a $T+1$ hábil**.                                |
| **V-FM-09** | Horario de Mercado y Parámetro Diferido    | Rescate             | `ValidaHorarioRescate` y `HorarioRescate`                                  | `InstrumentoErrors.HorarioCerrado`                           | Si cerrado y flag `true` rechaza; si `false` **difiere a $T+1$ hábil**.                                |
| **V-FM-10** | **Doble Validación de Cuotas (Inversión)** | Inversión           | $\text{Cuotas} = \text{Monto} / \text{Precio}$                             | `OrdenErrors.DobleValidacionCuotas`                          | Compara cuotas enviadas contra $\text{Round}(\text{Monto}/\text{Precio}, 6)$.                          |
| **V-FM-11** | **Doble Validación Cruzada (Rescate)**     | Rescate             | Si cuotas $\rightarrow$ valida monto; Si monto $\rightarrow$ valida cuotas | `OrdenErrors.DobleValidacionMonto` / `DobleValidacionCuotas` | Garantiza consistencia matemática en rescates parciales.                                               |
| **V-FM-12** | Liquidación por DRI vs VCD                 | Inversión           | Atributos `DRI` y `VCD`                                                    | Regla de liquidación                                         | Con DRI $\rightarrow T+\text{DRI}$; Sin DRI y VCD $\rightarrow T+1$; Sin DRI ni VCD $\rightarrow T+0$. |
| **V-FM-13** | Exclusión de DRI en Rescate                | Rescate             | Normativa de Rescate                                                       | Regla fija                                                   | En rescates de FFMM **nunca aplica DRI** (fijo en **$T+1$ hábil**).                                    |

---

## 2. Detalle de Validaciones Críticas

### 2.1 V-FM-08 y V-FM-09: Horario de Mercado y Parámetros Diferidos

A diferencia de Renta Variable (donde estar fuera de horario produce un rechazo tajante), en Fondos Mutuos existe la opción de recepcionar la orden fuera de horario difiriendo la fecha de operación:

- Se consulta el atributo `HorarioInversion` o `HorarioRescate` del fondo.
- Si `MercadoAbierto == false`:
  - Se consulta `ValidaHorarioInversion` (o `ValidaHorarioRescate`) en `sis_parametro`.
  - **Si el parámetro está activo (`true`):** La orden se rechaza de inmediato (`InstrumentoErrors.HorarioCerrado`).
  - **Si el parámetro está inactivo (`false`):** La orden **se acepta** y el sistema recalcula automáticamente:
    $$\text{FechaOperacion} = \text{diasFeriadosService.GetDiaHabilSiguienteInclusivo}(\text{fechaActual} + 1 \text{ día})$$

### 2.2 V-FM-10: Doble Validación de Cuotas en Inversión

La inversión siempre se solicita por monto de dinero. Las cuotas son proyectadas:
$$\text{CantidadOrden} = \text{Round}\left(\frac{\text{monto}}{\text{precio}}, 6, \text{MidpointRounding.AwayFromZero}\right)$$
Si el request incluye el campo opcional `cuotas > 0`:
$$\text{cuotasRecibidas} = \text{Round}(\text{cuotas}, 6, \text{AwayFromZero})$$
$$\text{cuotasRecibidas} \neq \text{CantidadOrden} \implies \text{Error: Orden.DobleValidacionCuotas}(\text{cuotasRecibidas}, \text{CantidadOrden})$$

### 2.3 V-FM-11: Doble Validación Cruzada en Rescate

- **Caso A (Rescate por Cuotas `flgCantidad = true`):**
  $$\text{CantidadOrden} = \text{cuotas}$$
  $$\text{MontoCalculado} = \text{Round}(\text{CantidadOrden} \times \text{precio}, \text{decimalesMoneda})$$
  Si viene `monto > 0`:
  $$\text{Round}(\text{monto}, \text{decimalesMoneda}) \neq \text{MontoCalculado} \implies \text{Error: Orden.DobleValidacionMonto}$$
- **Caso B (Rescate por Monto `flgCantidad = false`):**
  $$\text{MontoOrden} = \text{monto}$$
  $$\text{CantidadOrden} = \text{Round}\left(\frac{\text{monto}}{\text{precio}}, 6\right)$$
  Si viene `cuotas > 0`:
  $$\text{Round}(\text{cuotas}, 6) \neq \text{CantidadOrden} \implies \text{Error: Orden.DobleValidacionCuotas}$$

### 2.4 V-FM-12 y V-FM-13: Reglas de Liquidación (Inversión DRI vs Rescate T+1)

- **En Inversión:**
  - Si el fondo posee el atributo de días de retención `DRI > 0`:
    $$\text{FechaLiquidación} = \text{FechaOperacion} + \text{DRI días hábiles}$$
  - Si no posee DRI y posee el atributo `VCD` (Valor Cuota Desconocido):
    $$\text{FechaLiquidación} = \text{FechaOperacion} + 1 \text{ día hábil}$$
  - Si no posee DRI ni VCD (Cuota Conocida):
    $$\text{FechaLiquidación} = \text{FechaOperacion} \ (T+0)$$
- **En Rescate:**
  - **Normativa Absoluta:** No se consulta DRI.
  - La liquidación base es invariablemente **$T+1$ día hábil bancario** posterior a `FechaOperacion`.
