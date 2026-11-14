# 🔍 Matriz de Validaciones: CFI Fuera de Rueda (Inversión y Rescate)

Este documento detalla **cada una de las validaciones de negocio y técnicas** que ejecuta el backend en `OrdenTrxService` para las órdenes de **Cuotas de Fondos de Inversión (CFI) Fuera de Rueda** (`IngresarOrdenFondosMutuosInversion` e `IngresarOrdenFondosMutuosRescate`), junto con sus parámetros, fórmulas y códigos de error exactos.

---

## 1. Catálogo Resumido de Validaciones

| # | Validación | Aplica a | Parámetro / Entidad | Error Asociado | Comportamiento / Acción |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **V-CFI-01** | Bifurcación desde Pipeline FFMM | Inversión y Rescate | `CodClaseInstrumento != "FFMM_NAC"` | Desvío a CFI Fuera Rueda | Se ejecutan las reglas especializadas de CFI. |
| **V-CFI-02** | Detección de Fondo Propio | Inversión | `ordenService.GetFondoPropioPorInstrumento` | Clasificación de flujo | Define si la inversión entra por cuotas ($T+0$) o por monto ($T+1$). |
| **V-CFI-03** | Obligatoriedad de Cuotas en Fondo Propio | Inversión (Propio) | `cuotas == null` o `cuotas <= 0` | `OrdenErrors.OrdenCantidadCero` | En fondo propio la entrada es obligatoriamente por cuotas. |
| **V-CFI-04** | **Doble Validación de Monto (Fondo Propio)**| Inversión (Propio) | $\text{Monto} = \text{Cuotas} \times \text{Precio}$ | `OrdenErrors.DobleValidacionMonto` | Compara monto recibido contra cálculo teórico. |
| **V-CFI-05** | Obligatoriedad de Monto en No Propio | Inversión (Terceros) | `monto == null` o `monto <= 0` | `OrdenErrors.OrdenMontoCero` | En fondo de terceros la entrada es por monto de dinero. |
| **V-CFI-06** | **Doble Validación de Cuotas (No Propio)** | Inversión (Terceros) | $\text{Cuotas} = \text{Monto} / \text{Precio}$ | `OrdenErrors.DobleValidacionCuotas` | Compara cuotas recibidas contra $\text{Round}(\text{Monto}/\text{Precio}, 6)$. |
| **V-CFI-07** | Obligatoriedad de Cuotas en Rescate | Rescate | `cuotas == null` o `cuotas <= 0` | `OrdenErrors.OrdenCantidadCero` | En rescate de CFI no se permite rescate libre por monto. |
| **V-CFI-08** | Suficiencia en Cartera (Custodia) | Rescate | `carteraInstrumento.Vigente` | `CarteraErrors.CantidadInsuficiente` | Valida que `CantidadOrden <= CarteraDisponible`. |
| **V-CFI-09** | **Piso Mínimo de Fecha de Liquidación** | Rescate | `fechaLiquidacionFinal < FechaOperacion.Date`| `OrdenErrors.FechaLiquidacionInvalida` | La fecha manual no puede ser anterior a la operación. |
| **V-CFI-10** | **Día Hábil Bancario en Liquidación** | Rescate | `diasFeriadosService.EsDiaHabil` | `OrdenErrors.FechaLiquidacionNoHabil` | La fecha manual debe ser un día hábil bancario. |
| **V-CFI-11** | Horario de Mercado y Parámetro Diferido | Inversión y Rescate | `ValidaHorarioInversion` / `Rescate` | `InstrumentoErrors.HorarioCerrado` | Si cerrado y flag `true` rechaza; si `false` **difiere a $T+1$ hábil**. |
| **V-CFI-12** | Exclusión de Atributos DRI y VCD | Inversión y Rescate | Regla arquitectónica | N/A | A los CFI nunca se les consultan ni aplican DRI ni VCD. |

---

## 2. Detalle de Validaciones Críticas

### 2.1 V-CFI-03 y V-CFI-04: Entrada y Doble Validación en Inversión Fondo Propio
- **Entrada Obligatoria:** Cuotas (`cuotas > 0`). Si no viene, se rechaza inmediatamente:
  $$\text{cuotas} \le 0 \implies \text{Error: Orden.OrdenCantidadCero}$$
- **Cálculo de Monto y Doble Validación:**
  $$\text{MontoOrden} = \text{Round}(\text{cuotas} \times \text{precio}, \text{decimalesMoneda})$$
  *(0 decimales para CLP, 2 decimales para otras monedas, con `AwayFromZero`)*.
- Si en el request se envía `monto > 0`:
  $$\text{Round}(\text{monto}, \text{decimalesMoneda}) \neq \text{MontoOrden} \implies \text{Error: Orden.DobleValidacionMonto(montoRecibido, MontoOrden)}$$
- **Liquidación Inmediata:** Liquida en **$T+0$** ($\text{FechaLiquidacion} = \text{FechaOperacion.Date}$).

### 2.2 V-CFI-05 y V-CFI-06: Entrada y Doble Validación en Inversión Terceros (No Propio)
- **Entrada Obligatoria:** Monto (`monto > 0`). Si no viene, se rechaza inmediatamente:
  $$\text{monto} \le 0 \implies \text{Error: Orden.OrdenMontoCero}$$
- **Cálculo de Cuotas y Doble Validación:**
  $$\text{CantidadOrden} = \text{Round}\left(\frac{\text{monto}}{\text{precio}}, 6, \text{AwayFromZero}\right)$$
- Si en el request se envían `cuotas > 0`:
  $$\text{Round}(\text{cuotas}, 6) \neq \text{CantidadOrden} \implies \text{Error: Orden.DobleValidacionCuotas(cuotasRecibidas, CantidadOrden)}$$
- **Liquidación Estándar:** Liquida en **$T+1$ día hábil** mediante `GetDiaHabilSiguienteInclusivo`.

### 2.3 V-CFI-07: Rescate Exclusivo por Cuotas
A diferencia de los fondos mutuos tradicionales (donde se permite rescatar por monto mediante `flgCantidad = false`), en los CFI Fuera de Rueda el backend exige que la operación se realice invariablemente por cuotas:
- Si `vendeTodo == true`: $\text{CantidadOrden} = \text{CarteraDisponible}$.
- Si `vendeTodo == false`: Requiere $\text{cuotas} > 0$. Si no viene, rechaza con `OrdenErrors.OrdenCantidadCero`.
- El monto bruto se calcula multiplicando: $\text{MontoOrden} = \text{Round}(\text{CantidadOrden} \times \text{precio}, \text{decimalesMoneda})$.
- El tipo de límite precio es siempre Límite (`"L"`).

### 2.4 V-CFI-09 y V-CFI-10: Validación de Fecha de Liquidación Flexible (Rescate)
En el rescate de CFI, el backend permite recibir una `fechaLiquidacion` solicitada por el usuario o frontend (`ResolverYValidarFechaLiquidacionRescateCfiAsync`):
1. **Fecha por Defecto:** Si no se envía fecha, adopta automáticamente el siguiente día hábil ($T+1$).
2. **Validación de Piso Mínimo:**
   $$\text{fechaLiquidacionFinal} < \text{FechaOperacion.Date} \implies \text{Error: Orden.FechaLiquidacionInvalida}(\text{FechaOperacion.Date})$$
3. **Validación de Día Hábil Bancario:**
   $$\neg\text{diasFeriadosService.EsDiaHabil}(\text{fechaLiquidacionFinal}) \implies \text{Error: Orden.FechaLiquidacionNoHabil}$$
