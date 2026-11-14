# 💼 Guía General de Cuotas de Fondos de Inversión (CFI) Fuera de Rueda

Este documento describe la arquitectura, directrices de diseño, reglas de negocio y ciclo de vida de las operaciones sobre **Cuotas de Fondos de Inversión (CFI) negociadas Fuera de Rueda** en la plataforma `GpiWebCb`.

---

## 1. Principio Arquitectónico DRY (Pipeline Compartido con FFMM)

Los CFI Fuera de Rueda **reutilizan el mismo motor transaccional de Fondos Mutuos** (`IngresarOrdenFondosMutuosInversion` e `IngresarOrdenFondosMutuosRescate`), evitando duplicidad de servicios:
- **Discriminación de Instrumento:** Si `CodSubClaseInstrumentoNavigation?.CodClaseInstrumento == "FFMM_NAC"` se bifurca hacia las reglas de Fondos Mutuos tradicionales; en caso contrario, se procesan como vehículos de inversión alternativa (**CFI Fuera de Rueda**).
- **Estado Inicial:** Ingresan como órdenes fuera de rueda en estado **`P` (Pendiente)** y `TipoBolsa = "F"` (Fondos) para posterior asignación y confirmación.
- **Exclusión de Atributos DRI y VCD:** A los CFI **NO se les consultan ni aplican los atributos `DRI` ni `VCD`**. Sus reglas de liquidación dependen exclusivamente de si el fondo es **Propio** o de **Terceros**.

---

## 2. Matriz Comparativa: Fondos Mutuos vs CFI Fuera de Rueda

| Dimensión Operativa | Fondos Mutuos (FFMM) | CFI Fondo Propio | CFI No Propio (Terceros) |
| :--- | :--- | :--- | :--- |
| **Entrada en Inversión** | Obligatorio por **Monto** | Obligatorio por **Cuotas** | Obligatorio por **Monto** |
| **Tipo de Límite Inversión** | Mercado (`"M"`) | Límite (`"L"`) | Mercado (`"M"`) |
| **Liquidación Inversión** | $T+\text{DRI}$, $T+1$ (VCD) o $T+0$ | **$T+0$** (Mismo día hábil) | **$T+1$ día hábil** |
| **Entrada en Rescate** | Por Monto o por Cuotas | Exclusivamente por **Cuotas** | Exclusivamente por **Cuotas** |
| **Tipo de Límite Rescate** | `"L"` (si cuotas) o `"M"` (monto) | Límite (`"L"`) | Límite (`"L"`) |
| **Liquidación Rescate** | Base fija **$T+1$ hábil** | Base **$T+1$ hábil** (Fecha editable $\ge T$) | Base **$T+1$ hábil** (Fecha editable $\ge T$) |

---

## 3. Detección de Fondo Propio (`GetFondoPropioPorInstrumento`)

El sistema evalúa internamente si el instrumento corresponde a un fondo administrado internamente por la corredora:
- **Si es Fondo Propio (`esFondoPropio == true`):**
  - La inversión entra por **Cuotas**.
  - Liquida en **$T+0$**.
  - El precio es de tipo Límite (`"L"`).
- **Si NO es Fondo Propio (`esFondoPropio == false`):**
  - La inversión entra por **Monto**.
  - Liquida en **$T+1$ día hábil**.
  - El precio es de tipo Mercado (`"M"`).

---

## 4. Reglas Específicas de Rescate en CFI

1. **Entrada Estricta por Cuotas:** A diferencia de FFMM, un CFI fuera de rueda no permite ingresar el rescate por monto de dinero libre. La entrada es por cantidad de cuotas (`cuotas > 0`) o mediante rescate total de la custodia (`flgVendeTodo == 'S'`).
2. **Editabilidad de la Fecha de Liquidación:**
   - Por defecto liquida a $T+1$ día hábil siguiente a la `fechaOperacion`.
   - El cliente o asesor puede seleccionar una `fechaLiquidacion` personalizada en el request.
   - **Validación del Backend (`ResolverYValidarFechaLiquidacionRescateCfiAsync`):**
     - La fecha no puede ser anterior a la `fechaOperacion.Date` (`OrdenErrors.FechaLiquidacionInvalida`).
     - Debe corresponder estrictamente a un **día hábil bancario** (`diasFeriadosService.EsDiaHabil`). Si es feriado o fin de semana, se rechaza con `OrdenErrors.FechaLiquidacionNoHabil`.

---

## 5. Horarios de Mercado y Difusión de Fechas

- Cada CFI posee su propio atributo de horario (`AtributoHorarioInversion` y `AtributoHorarioRescate`).
- Si la orden se ingresa con mercado cerrado y el parámetro general (`ValidaHorarioInversion` / `ValidaHorarioRescate`) está inactivo (`false`), la `fechaOperacion` se traslada al **siguiente día hábil**. A partir de esa nueva fecha se calculan las fechas de liquidación ($T+0$ para propios o $T+1$ para no propios).
