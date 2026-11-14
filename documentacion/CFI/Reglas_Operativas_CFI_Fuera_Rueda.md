# Normativa Operativa: CFI Fuera de Rueda

**Guía de Negocio: Modalidades de Ingreso, Estados, Parámetros y Fechas de Liquidación para Cuotas de Fondos de Inversión (CFI) Fuera de Rueda**

---

## 1. Reglas Transversales de Operación

- **Reutilización Transaccional:** Se procesan a través de los mismos endpoints y métodos de `OrdenTrxService` que Fondos Mutuos (`IngresarOrdenFondosMutuosInversion` e `IngresarOrdenFondosMutuosRescate`), bifurcándose por no pertenecer a la clase `FFMM_NAC`.
- **Estado Inicial de las Órdenes:** Todas las operaciones de CFI fuera de rueda ingresan al sistema en estado **Pendiente (`P`)** con `TipoBolsa = "F"`. Al ser transacciones no bursátiles, requieren un ciclo de confirmación y asignación posterior.
- **Configuración Dinámica por Instrumento:** Los horarios de apertura y cierre de mercado están definidos como **atributos configurables de cada instrumento**.
- **Exclusión de Atributos DRI y VCD:** En los CFI **no aplican** los atributos de días de retención (`DRI`) ni de cuota desconocida (`VCD`), rigiéndose por la clasificación de fondo propio vs terceros.

---

## 2. Operatoria de CFI Fuera de Rueda

### A. Inversión (Compra / Suscripción)
La forma de ingreso y el plazo de liquidación dependen de si el fondo es propio de la corredora o de terceros:

- **Fondo Propio ($T+0$):**
  - **Entrada:** Exclusivamente por **Cuotas** (`cuotas > 0`).
  - **Tipo de Precio:** Límite (`"L"`).
  - **Liquidación:** Inmediata en el **mismo día de operación ($T+0$)**.
  - **Doble Validación:** Si se envía monto, se valida contra $\text{Round}(\text{Cuotas} \times \text{Precio})$.

- **Fondo No Propio / Terceros ($T+1$):**
  - **Entrada:** Exclusivamente por **Monto** (`monto > 0`).
  - **Tipo de Precio:** Mercado (`"M"`).
  - **Liquidación:** En el **siguiente día hábil bancario ($T+1$)**.
  - **Doble Validación:** Si se envían cuotas, se valida contra $\text{Round}(\text{Monto} / \text{Precio}, 6)$.

### B. Rescate (Venta / Liquidación)
A diferencia de los fondos mutuos, el rescate de un CFI se ingresa **siempre por Cuotas** (o seleccionando "Vende Todo"):

- **Entrada:** Siempre por **Cuotas** (`cuotas > 0` o `flgVendeTodo = "S"`).
- **Tipo de Precio:** Siempre Límite (`"L"`).
- **Liquidación Flexible:** Por defecto liquida al **siguiente día hábil ($T+1$)**. El usuario puede seleccionar una fecha posterior deseada, siempre que corresponda a un **día hábil bancario** y sea mayor o igual a la fecha de operación.

---

## 3. Cuadro Resumen Operativo

| Operación | ¿Cómo se ingresa? | Tipo de Precio | Fecha de Liquidación | Doble Validación Aplicable |
| :--- | :--- | :--- | :--- | :--- |
| **CFI Fuera de Rueda - Fondo Propio (Inversión)** | Por **Cuotas** | Límite (`"L"`) | **$T + 0$** (Mismo día) | Valida monto recibido contra $\text{Cuotas} \times \text{Precio}$ |
| **CFI Fuera de Rueda - Fondo Terceros (Inversión)** | Por **Monto** | Mercado (`"M"`) | **$T + 1$ hábil** | Valida cuotas recibidas contra $\text{Monto} / \text{Precio}$ |
| **CFI Fuera de Rueda - Rescate** | Siempre por **Cuotas** | Límite (`"L"`) | **$T + 1$ hábil** (o fecha hábil elegida $\ge T$) | Monto calculado $\text{Cuotas} \times \text{Precio}$ |

---

## 4. Parámetros de Sistema Involucrados

- **`ValidaHorarioInversion` / `ValidaHorarioRescate` (`sis_parametro`):**
  - Si el horario está cerrado y el parámetro está en `true`: la orden se rechaza de inmediato con error `InstrumentoErrors.HorarioCerrado`.
  - Si el parámetro está en `false`: la orden se acepta y su `fechaOperacion` se traslada automáticamente al siguiente día hábil bancario.
- **`HorarioInversion` / `HorarioRescate` (Atributo Instrumento):** Define el rango horario operativo configurado para cada fondo.
