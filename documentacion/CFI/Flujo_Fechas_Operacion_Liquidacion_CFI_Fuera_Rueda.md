# Flujo Operativo y de Liquidación: CFI Fuera de Rueda

Este documento describe la arquitectura técnica, las bifurcaciones de negocio, los parámetros y los flujos de cálculo de fechas de operación y liquidación para **Cuotas de Fondos de Inversión (CFI) negociadas Fuera de Rueda** según el método de resolución en `OrdenTrxService`.

---

## 1. Arquitectura Base y Reutilización (Pipeline Transversal)

Los CFI Fuera de Rueda comparten la **misma tubería transaccional base** que los Fondos Mutuos (FFMM) dentro de `OrdenTrxService`:

- Métodos compartidos: `IngresarOrdenFondosMutuosInversion` e `IngresarOrdenFondosMutuosRescate`.
- Validación de cuentas (bloqueos, estado vigente, permiso de sobregiro).
- Consulta de precios de mercado (`publicadorPrecioService.GetPrecio`).
- Manejo atómico de transacciones de base de datos (`BeginTransactionAsync`, `CommitAsync`, `RollbackAsync`).
- Asignación de estados (`Estado = "P"`, `TipoBolsa = "F"`), conceptos contables (`OperacionConcepto`) y notificación por correo.

> **Regla de Discriminación:**
> Si `instrumento.CodSubClaseInstrumentoNavigation?.CodClaseInstrumento == "FFMM_NAC"` sigue el camino de Fondos Mutuos. De lo contrario, se procesa bajo las reglas de vehículos de inversión alternativa (**CFI Fuera de Rueda**).

---

## 2. Diferenciación de Fechas de Liquidación: FFMM vs CFI Fuera de Rueda

```
¿El instrumento es FFMM_NAC?
├── SÍ (Fondos Mutuos Tradicionales):
│   ├── INVERSIÓN:
│   │   ├── ¿Tiene DRI > 0? ────────────► Liquida en T + DRI días hábiles
│   │   ├── ¿No tiene DRI y tiene VCD? ─► Liquida en T + 1 día hábil
│   │   └── ¿No tiene DRI ni VCD? ──────► Liquida en T + 0
│   └── RESCATE:
│       └── Normativamente fijo ────────► Liquida en T + 1 día hábil (NO aplica DRI)
│
└── NO (CFI Fuera de Rueda):
    ├── INVERSIÓN:
    │   ├── Fondo Propio (esFondoPropio == true) ──► Liquida en T + 0 (Mismo día)
    │   └── Fondo No Propio (Terceros) ────────────► Liquida en T + 1 día hábil
    └── RESCATE:
        └── Base T + 1 día hábil (Permite fechaLiquidacion opcional editable >= T y hábil)
```

---

## 3. Flujo de Inversión en CFI Fuera de Rueda

En inversión, el comportamiento depende del resultado de `ordenService.GetFondoPropioPorInstrumento`:

### 3.1 CFI Fondo Propio

- **Modalidad de Ingreso:** Exclusivamente por **Cuotas** (`cuotas > 0`). Si no viene cuotas, arroja `OrdenErrors.OrdenCantidadCero`.
- **Cálculo de Monto:**
  $$\text{MontoOrden} = \text{Round}(\text{Cuotas} \times \text{Precio}, \text{decimalesMoneda})$$
  _(0 decimales para CLP, 2 decimales para otras monedas)._
- **Doble Validación de Monto:** Si el cliente envía `monto > 0`, se compara contra `MontoOrden`. Si no coinciden, se rechaza con `OrdenErrors.DobleValidacionMonto`.
- **Límite de Precio:** Se fija como Límite (`"L"`).
- **Fecha de Liquidación:** Liquida inmediatamente en **$T+0$** ($\text{FechaLiquidacion} = \text{FechaOperacion.Date}$).

### 3.2 CFI No Propio (Terceros)

- **Modalidad de Ingreso:** Exclusivamente por **Monto** (`monto > 0`). Si no viene monto, arroja `OrdenErrors.OrdenMontoCero`.
- **Cálculo de Cuotas:**
  $$\text{CantidadOrden} = \text{Round}\left(\frac{\text{Monto}}{\text{Precio}}, 6\right)$$
- **Doble Validación de Cuotas:** Si el cliente envía `cuotas > 0`, se compara contra `CantidadOrden`. Si difieren, arroja `OrdenErrors.DobleValidacionCuotas`.
- **Límite de Precio:** Se fija como Mercado (`"M"`).
- **Fecha de Liquidación:** Liquida en **$T+1$ día hábil bancario** a través de `diasFeriadosService.GetDiaHabilSiguienteInclusivo`.

---

## 4. Flujo de Rescate en CFI Fuera de Rueda

A diferencia de los fondos mutuos, el rescate de un CFI se ingresa **siempre por Cuotas**:

### 4.1 Reglas de Cantidad y Monto

- **Por Cuotas (`vendeTodo == false`):** El campo `cuotas` es obligatorio y debe ser $> 0$.
  $$\text{CantidadOrden} = \text{cuotas}$$
- **Vende Todo (`vendeTodo == true`):** Se toma el total disponible en cartera:
  $$\text{CantidadOrden} = \text{CarteraDisponible}$$
- **Cálculo de Monto:**
  $$\text{MontoOrden} = \text{Round}(\text{CantidadOrden} \times \text{Precio}, \text{decimalesMoneda})$$
- **Límite de Precio:** Se fija invariablemente como Límite (`"L"`).

### 4.2 Fecha de Liquidación Flexible y Validaciones

- **Base por Defecto:** Siguiente día hábil tras la operación ($T+1$).
- **Fecha Solicitada por el Usuario:** El request puede enviar una `fechaLiquidacion` específica:
  1. **Piso mínimo:** $\text{FechaLiquidacionFinal} \ge \text{FechaOperacion.Date}$. Si es menor, se rechaza con `OrdenErrors.FechaLiquidacionInvalida`.
  2. **Día Hábil Bancario:** Debe ser un día hábil según el calendario oficial del país (`diasFeriadosService.EsDiaHabil`). Si es inhábil o feriado, se rechaza con `OrdenErrors.FechaLiquidacionNoHabil`.
  3. Si no se especifica fecha, se adopta el default de $T+1$ hábil.

---

## 5. Horarios de Mercado y Diferimiento de Fechas

1. Se consulta el atributo de horario (`AtributoHorarioInversion` o `AtributoHorarioRescate`) propio del CFI.
2. Si el mercado del fondo está cerrado:
   - Si `ValidaHorarioInversion` / `ValidaHorarioRescate` es `true` $\rightarrow$ Rechaza la orden con `InstrumentoErrors.HorarioCerrado`.
   - Si es `false` $\rightarrow$ La `fechaOperacion` se difiere al siguiente día hábil bancario (`diasFeriadosService.GetDiaHabilSiguienteInclusivo`), recalculando la liquidación a partir de esa nueva fecha.
