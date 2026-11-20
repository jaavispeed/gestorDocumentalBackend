# 📈 Guía General de Renta Variable (Acciones, ETF, CFI)

Este documento describe la arquitectura, reglas generales de negocio, parámetros de sistema, fórmulas matemáticas y ciclo de vida compartido para las operaciones de Renta Variable (**Compra** y **Venta**) en la plataforma Gestor Documental.

---

## 1. Visión General del Módulo

A diferencia de otros instrumentos como Fondos Mutuos (que operan bajo aportes y rescates valorizados a cuota de cierre desconocida), Renta Variable opera en rueda bursátil en tiempo real bajo las modalidades de:

- **Compra** (`CIRV` / `COMPRA_RV`)
- **Venta** (`VIRV` / `VENTA_RV`)

Los instrumentos administrados corresponden principalmente a **Acciones** (`ACC`), **ETF** y **Cuotas de Fondos de Inversión (CFI)** transados en rueda bursátil.

---

## 2. Parámetros del Sistema (`sis_parametro`)

El comportamiento operativo, cálculo de impuestos, tolerancias y publicación hacia el mercado dependen de los siguientes parámetros configurados en el sistema:

| Código Parámetro                         | Tipo          | Descripción y Uso                                                                                                                                                                                                | Valor Referencial / Regla |
| :--------------------------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------ |
| `HORA_INI_FIN_BOLSARV` / `HORA_BOLSA_RV` | RANGO_HORARIO | Determina el horario de apertura y cierre de la rueda bursátil. Si la orden se ingresa fuera de este rango, **se rechaza de inmediato** con error `OrdenErrors.FueraDeHorario` (no se difiere al día siguiente). | Ej: `09:30 - 16:00`       |
| `IVA`                                    | NUMERICO      | Porcentaje de IVA aplicable sobre la suma de comisiones de corretaje y derechos de bolsa.                                                                                                                        | Ej: `19` (19%)            |
| `TOLERANCIA_MONTO_TOTAL_RV`              | NUMERICO      | Porcentaje de tolerancia (base 100) permitido en la **doble validación de monto total** entre lo enviado por el cliente y lo calculado por el motor de liquidación.                                              | Ej: `1` (1%)              |
| `PUBLICAR_EN_MERCADO_RV`                 | BOOLEAN       | Indica si la orden debe despacharse automáticamente a la rueda bursátil (vía Azure Service Bus / protocolo FIX). Si es `false`, se guarda internamente en el sistema sin envío a bolsa.                          | `true` / `false`          |

---

## 3. Condiciones y Plazos de Liquidación

La fecha de liquidación se calcula a partir de la fecha de operación (`fechaOperacion`), proyectando únicamente sobre **días hábiles** (descartando fines de semana y feriados según tabla `DiaFeriado` y código de país):

| Código (`formaLiq`) | Glosa          | Plazo de Liquidación | Regla Operativa                                                                        |
| :------------------ | :------------- | :------------------- | :------------------------------------------------------------------------------------- |
| `PH`                | Pago Hoy       | $T+0$                | La liquidación financiera ocurre el mismo día hábil de la transacción.                 |
| `PM`                | Pago Mañana    | $T+1$                | La liquidación financiera ocurre al siguiente día hábil.                               |
| `CN`                | Contado Normal | $T+2$                | Plazo estándar por defecto del mercado bursátil chileno (segundo día hábil posterior). |

> **Validación de Fecha:** Si el usuario suministra una `fechaLiquidacion`, el sistema valida que no sea menor a la fecha mínima calculada (`fechaLiquidacionFinal >= fechaLiquidacionMinima`) y que corresponda estrictamente a un día hábil bancario.

---

## 4. Tipos de Precio y Regla de Cantidades

### 4.1 Tipo de Precio (`flgLimitePrecio`)

- **Precio Límite (`"L"`):** El usuario ingresa explícitamente el precio unitario (`precio > 0`). Si `PUBLICAR_EN_MERCADO_RV` está activo, el precio no puede exceder 2 decimales (`precio == Round(precio, 2)`).
- **Precio Mercado (`"M"`):** El usuario no ingresa el precio. El servicio consulta el último precio publicado en rueda para el instrumento y fecha del sistema (`publicadorPrecioService.GetPrecio(..., ultimoPrecio: "S")`). Si no existe precio vigente, la orden se rechaza (`OrdenErrors.PrecioMercadoNoEncontrado`).

### 4.2 Cantidad según Moneda

- **Mercado Local en Pesos Chilenos (`CLP`):** La cantidad de acciones **debe ser estrictamente entera** (`cantidad % 1 == 0`). No existen fracciones de acciones en el mercado accionario local.
- **Moneda Extranjera (USD, etc.):** Se admiten decimales según las reglas del instrumento y su mercado de origen.

---

## 5. Esquema de Comisiones, Derechos, IVA y Fondos Propios

### 5.1 Regla de Excepción: Fondos Propios

Antes de buscar tarifarios, el sistema consulta `ordenService.GetFondoPropioPorInstrumento(idInstrumento)`:

- Si el instrumento es un **Fondo Propio**, **NO SE APLICAN COMISIONES NI DERECHOS** (`porcComision = 0`, `porcDerecho = 0`, `iva = 0`).
- Si **NO es Fondo Propio**, se consultan las comisiones vigentes asignadas a la cuenta del cliente (`comisionService.GetComisionesAplicablesPorOperacionAsync`) según clase de instrumento y familia `RV`.

### 5.2 Estructura de Cobros

1. **Comisión Corredora (`Comision`):** $\text{MontoOrden} \times \frac{\text{PorcentajeComision}}{100}$
2. **Derechos de Bolsa (`Derechos`):** $\text{MontoOrden} \times \frac{\text{PorcentajeDerecho}}{100}$
3. **IVA (`Iva`):** $(\text{Comision} + \text{Derechos}) \times \frac{\text{PorcentajeIva}}{100}$
4. **Gastos Operacionales (`Gastos = 0`):** En las órdenes individuales de renta variable **no se aplican gastos** (`gastos = 0`), ya que estos se facturan consolidados una vez al día por mercado en el proceso nocturno.

---

## 6. Motor de Doble Validación y Tolerancia

El backend realiza dos niveles obligatorios de validación matemática:

### Nivel 1: Doble Validación de Monto Base

$$\text{Monto Calculado} = \text{Cantidad} \times \text{Precio}$$

- En `CLP`: Redondeado a $0$ decimales (`AwayFromZero`).
- En moneda extranjera: Redondeado a $2$ decimales (`AwayFromZero`).
- Si `Monto Calculado != Monto Recibido`, la orden se rechaza con `OrdenErrors.DobleValidacionMontoRentaVariable`.

### Nivel 2: Doble Validación de Monto Total con Tolerancia

Cuando el cliente envía `montoTotal` (monto neto tras comisiones e impuestos):

1. El backend calcula `montoTotalCalculado` mediante `calculosService.CalcularLiquidacionRentaVariable`.
2. Normaliza ambos valores según moneda ($0$ decimales en CLP, $2$ decimales en otras divisas).
3. Si difieren, evalúa la discrepancia porcentual contra el parámetro `TOLERANCIA_MONTO_TOTAL_RV` mediante `calculosService.ValidarMontoTotalConTolerancia`:
   $$\text{Diferencia Porcentual} = \frac{|\text{Monto Recibido} - \text{Monto Calculado}|}{\text{Monto Calculado}} \times 100$$
4. Si $\text{Diferencia Porcentual} \le \text{Tolerancia}$, la orden es aceptada y se fija el monto total calculado por el sistema. Si supera la tolerancia (o la tolerancia es 0 y los montos difieren), se rechaza con `OrdenErrors.DobleValidacionMontoTotalRentaVariable`.

---

## 7. Despacho Bursátil al Mercado (FIX / Azure Service Bus)

Si `PUBLICAR_EN_MERCADO_RV` está activo (`true`), al comprometerse la transacción local, el sistema crea un mensaje bursátil con concepto "ENVÍO DE MENSAJES AL MERCADO" y lo publica a Azure Service Bus (`ToMarketQueue`):

- **MarketID:** `XSGO-CS` (Bolsa de Santiago - Renta Variable)
- **Side:** `1` para Compra (`Buy`), `2` para Venta (`Sell`)
- **TimeInForce:** `D` (Day / Válido por el día de rueda)
- **OrdType:** `L` (Limit) o `M` (Market)

---

## 8. Notificaciones por Correo Electrónico

Al finalizar la transacción, se despacha la confirmación mediante `emailSenderMethods.SendEmailNotificacionOrden`, informando folio de orden, cuenta, nemotécnico, cantidad, precio, montos y fecha de liquidación al correo del cliente y al correo adicional informado.
