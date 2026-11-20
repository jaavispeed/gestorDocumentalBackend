# 💼 Guía General de Fondos Mutuos (FFMM)

Este documento describe la arquitectura, reglas generales de negocio, parámetros de sistema, fórmulas matemáticas y ciclo de vida compartido para las operaciones de Fondos Mutuos (**Inversión** y **Rescate**) en la plataforma Gestor Documental.

---

## 1. Visión General del Módulo

A diferencia de Renta Variable (donde las operaciones se ejecutan en bolsa a precio y cantidad fija conocida), los Fondos Mutuos son vehículos de inversión colectiva no bursátiles (`tipoBolsa = "F"`):

- **Inversión (Suscripción / Aporte):** `COMPRA` / `INVERSION` (`flgTipoMovimiento = 'I'`)
- **Rescate (Liquidación / Retiro):** `VENTA` / `RESCATE` (`flgTipoMovimiento = 'E'`)
- **Estado Inicial:** Ingresan en estado **`P` (Pendiente)** a la espera del cierre de operaciones y asignación contable con cuota definitiva.
- **Cuota y Precisión:** Las cuotas de Fondos Mutuos manejan hasta **6 decimales** (`Math.Round(cuotas, 6)`).

---

## 2. Parámetros del Sistema y Configuración

| Parámetro / Atributo                  | Origen               | Descripción y Uso                                                                                                 | Comportamiento                                                                                                                                                      |
| :------------------------------------ | :------------------- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ValidaHorarioInversion`              | `sis_parametro`      | Flag booleano de sistema para evaluar si se bloquea la orden cuando el horario de mercado del fondo está cerrado. | Si es `true`, rechaza con `InstrumentoErrors.HorarioCerrado`. Si es `false`, permite ingresar la orden difiriendo la fecha de operación al **siguiente día hábil**. |
| `ValidaHorarioRescate`                | `sis_parametro`      | Similar a inversión, pero para el proceso de rescate.                                                             | Si es `true`, rechaza. Si es `false`, difiere al **siguiente día hábil**.                                                                                           |
| `HorarioInversion` / `HorarioRescate` | Atributo Instrumento | Define la ventana horaria (apertura y cierre) configurada individualmente para el fondo.                          | Consultada dinámicamente mediante `atributoService.GetHorarioInversionRescatePorInstrumento`.                                                                       |
| `DRI` (Días Retención Inversión)      | Atributo Instrumento | Cantidad de días hábiles bancarios adicionales requeridos para liquidar una inversión.                            | Exclusivo de Inversión. En Rescate **NO aplica**.                                                                                                                   |
| `VCD` (Valor Cuota Desconocido)       | Atributo Instrumento | Atributo que señala si el fondo opera con valor cuota desconocido.                                                | En ausencia de DRI, define si liquida en $T+1$ (si tiene VCD) o en $T+0$ (si no tiene VCD).                                                                         |

---

## 3. Tipos de Operación Soportados

El sistema admite subtipos normativos y tributarios tanto para Inversión como para Rescate:

### En Inversión (`ValidarPorTipoOperacionInversion`)

- `INVERSION`: Suscripción ordinaria (por defecto).
- `INVMLTEXT`: Inversión con Mercado Libre de Transferencia externo (exige `idContraparte`).
- `APV_APO`: Ahorro Previsional Voluntario - Aporte.
- `APV_TR_IN`: APV - Traspaso Interno/Entrada.

### En Rescate (`ValidarPorTipoOperacionRescate`)

- `RESCATE`: Retiro ordinario (por defecto).
- `RESCMLTEXT`: Rescate con MLT externo (exige `idContraparte`).
- `APV_RET`: Ahorro Previsional Voluntario - Retiro.
- `APV_TR_EG`: APV - Traspaso Externo/Salida.

---

## 4. Reglas de Cálculo de Fechas de Liquidación

### 4.1 Inversión (Compra / Suscripción)

La fecha se proyecta sobre días hábiles bancarios a partir de la `fechaOperacion` según los atributos del instrumento:

1. **Con DRI (`DRI > 0`):** Liquida a **$T + \text{DRI}$ días hábiles**.
2. **Sin DRI y con VCD:** Liquida a **$T+1$ día hábil**.
3. **Sin DRI y sin VCD:** Liquida a **$T+0$** (mismo día de operación).

### 4.2 Rescate (Venta / Liquidación)

- En Fondos Mutuos, **en el rescate NUNCA aplica DRI**.
- La fecha de liquidación se fija normativamente en **$T+1$ día hábil** siguiente a la `fechaOperacion`.

---

## 5. Cuotas, Precios y Doble Validación

- **Precio Oficial:** Se consulta el último precio de cierre publicado (`publicadorPrecioService.GetPrecio(..., ultimoPrecio: "S")`).
- **Inversión:**
  - El usuario ingresa `monto`.
  - El sistema calcula $\text{Cuotas} = \text{Round}\left(\frac{\text{Monto}}{\text{Precio}}, 6\right)$.
  - Si el usuario envía `cuotas > 0`, se efectúa **Doble Validación de Cuotas** (`OrdenErrors.DobleValidacionCuotas`).
- **Rescate:**
  - Permite rescate por cuotas (`flgCantidad = true`), por monto (`flgCantidad = false`) o total (`flgVendeTodo = "S"`).
  - Incluye **Doble Validación cruzada**: si es por cuotas valida el monto; si es por monto valida las cuotas calculadas.

---

## 6. Persistencia y Notificaciones

- Se crea una `SolicitudInversion` asociada a una `Orden` con `FormaLiq = "PH"` (Pago Hoy en fondos), `TipoBolsa = "F"` y `Gastos = 0`, `Comision = 0`.
- Si la orden se ingresa con éxito, se despacha un correo de confirmación al inversionista informando identificador de orden, fondo, cuotas, precio estimado y fecha de liquidación.
