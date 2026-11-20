# 🔍 Matriz de Validaciones: Renta Variable (Compra y Venta)

Este documento detalla **cada una de las validaciones de negocio y técnicas** que ejecuta el backend en `OrdenTrxService` para las órdenes de **Compra** (`IngresarOrdenRentaVariableCompra`) y **Venta** (`IngresarOrdenRentaVariableVenta`) de Renta Variable, junto con sus parámetros, fórmulas y códigos de error exactos.

---

## 1. Catálogo Resumido de Validaciones

| #           | Validación                                         | Aplica a       | Parámetro / Entidad                                   | Error Asociado                                                     | Comportamiento / Acción                                         |
| :---------- | :------------------------------------------------- | :------------- | :---------------------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------- |
| **V-RV-01** | Instrumento Pertenece a Renta Variable             | Compra y Venta | `CodigoFamilia == "RV"`                               | `InstrumentoErrors.InstrumentoNoEsRentaVariable`                   | Rechaza si no es Renta Variable.                                |
| **V-RV-02** | Estado Vigente del Instrumento                     | Compra y Venta | `CodEstado == "VIG"`                                  | `InstrumentoErrors.InstrumentoNoVigente`                           | Rechaza si el título está suspendido o inactivo.                |
| **V-RV-03** | Horario de Rueda Bursátil                          | Compra y Venta | `HORA_BOLSA_RV` / `HORA_INI_FIN_BOLSARV`              | `OrdenErrors.FueraDeHorario`                                       | **Rechazo inmediato** si está fuera de horario (no se agenda).  |
| **V-RV-04** | Habilitación por Contrato de Operación             | Compra y Venta | `contratoOperacionService` (`ACC`)                    | `ContratoOperacionErrors.NoPuedeOperarPorContrato`                 | Rechaza si el cliente no tiene contrato para operar Acciones.   |
| **V-RV-05** | Saldo de Caja y Permiso de Sobregiro               | Compra         | `cuenta.FlgMovDescubiertos == 'S'`                    | Error de saldo insuficiente                                        | Si no permite sobregiro, valida que `SaldoCaja >= MontoCompra`. |
| **V-RV-06** | Tenencia en Custodia (Cartera)                     | Venta          | `carteraInstrumento.Vigente`                          | `CarteraErrors.CantidadInsuficiente`                               | Valida que `CantidadVenta <= SaldoDisponible`.                  |
| **V-RV-07** | Cantidad Entera en Mercado Local (CLP)             | Compra y Venta | Moneda `CLP` (`cantidad % 1 == 0`)                    | `OrdenErrors.CantidadNoDecimales`                                  | En CLP no se permiten fracciones de acciones.                   |
| **V-RV-08** | Límite de Precio y Consulta de Mercado             | Compra y Venta | `flgLimitePrecio` (`"L"` vs `"M"`)                    | `OrdenErrors.OrdenPrecioCero` / `PrecioMercadoNoEncontrado`        | En "L" valida `precio > 0`; en "M" consulta precio de rueda.    |
| **V-RV-09** | **Doble Validación de Monto Base**                 | Compra y Venta | $\text{Monto} = \text{Cantidad} \times \text{Precio}$ | `OrdenErrors.DobleValidacionMontoRentaVariable`                    | Compara monto recibido contra cálculo teórico.                  |
| **V-RV-10** | **Doble Validación de Monto Total con Tolerancia** | Compra y Venta | `TOLERANCIA_MONTO_TOTAL_RV`                           | `OrdenErrors.DobleValidacionMontoTotalRentaVariable`               | Permite discrepancia porcentual $\le \text{Tolerancia}$.        |
| **V-RV-11** | Fecha y Plazo de Liquidación                       | Compra y Venta | `diasFeriadosService` y `formaLiq`                    | `OrdenErrors.FechaLiquidacionInvalida` / `FechaLiquidacionNoHabil` | Debe ser día hábil y $\ge$ fecha mínima calculada.              |
| **V-RV-12** | Decimales de Precio para Envío a Bolsa             | Compra y Venta | `PUBLICAR_EN_MERCADO_RV == true`                      | `OrdenErrors.PrecioInvalidoPublicacionMercado`                     | El precio no puede tener más de 2 decimales para bolsa.         |

---

## 2. Detalle de Validaciones Críticas

### 2.1 V-RV-03: Horario de Rueda Bursátil (`HORA_BOLSA_RV`)

- **Regla:** Se consulta el rango horario en `sis_parametro` mediante `horaBolsaRvParametro.GetHoraBolsaRv()`.
- **Diferencia Fundamental con Fondos Mutuos:** En fondos mutuos, si el mercado está cerrado se puede trasladar la orden al día siguiente. En Renta Variable **la orden se rechaza de inmediato**:
  $$\text{horaActual} < \text{RangoInicial} \lor \text{horaActual} > \text{RangoFinal} \implies \text{Error: Orden.FueraDeHorario}$$

### 2.2 V-RV-07: Cantidad Entera en CLP

- **Regla:** En el mercado local en pesos chilenos, las acciones se transan por unidades enteras:
  $$\text{instrumento.CodMoneda} == \text{"CLP"} \land (\text{cantidad} \bmod 1 \neq 0) \implies \text{Error: Orden.CantidadNoDecimales}$$

### 2.3 V-RV-09: Doble Validación de Monto Base

- **Fórmula:**
  $$\text{MontoCalculado} = \text{Round}(\text{Cantidad} \times \text{Precio}, \text{decimalesMoneda})$$
  _(0 decimales para CLP, 2 decimales para monedas extranjeras, con `MidpointRounding.AwayFromZero`)_.
- Si $\text{MontoCalculado} \neq \text{Round}(\text{montoRecibido}, \text{decimalesMoneda})$, se rechaza con `OrdenErrors.DobleValidacionMontoRentaVariable(recibido, calculado)`.

### 2.4 V-RV-10: Doble Validación de Monto Total con Tolerancia

- **Parámetro:** `TOLERANCIA_MONTO_TOTAL_RV` (porcentaje base 100 en `sis_parametro`).
- **Motor:** `calculosService.ValidarMontoTotalConTolerancia(montoRecibido, montoCalculado, codMoneda, tolerancia)`:
  1. Si ambos montos normalizados coinciden exactamente $\rightarrow$ **Válido**.
  2. Si difieren y $\text{tolerancia} > 0$:
     $$\text{DiferenciaPorcentual} = \frac{|\text{montoRecibido} - \text{montoCalculado}|}{\text{montoCalculado}} \times 100$$
     - Si $\text{DiferenciaPorcentual} \le \text{tolerancia} \rightarrow$ **Válido** (se acepta la orden fijando el monto liquidado por el sistema).
     - Si $\text{DiferenciaPorcentual} > \text{tolerancia} \rightarrow$ **Rechazo** con `OrdenErrors.DobleValidacionMontoTotalRentaVariable(recibido, esperado)`.
- **Propósito:** Previene rechazos provocados por discrepancias residuales de redondeo de comisiones de corretaje, derechos de bolsa e IVA entre frontend y backend.

### 2.5 V-RV-11: Fecha de Liquidación Mínima y Día Hábil

- El sistema proyecta la fecha mínima según la condición pactada:
  - `PH`: $T+0$ (mismo día hábil)
  - `PM`: $T+1$ (siguiente día hábil)
  - `CN`: $T+2$ (segundo día hábil)
- Si el usuario suministra `fechaLiquidacion`:
  $$\text{fechaLiquidacion} < \text{fechaLiquidacionMinima} \implies \text{Error: Orden.FechaLiquidacionInvalida}$$
  $$\neg\text{EsDiaHabil}(\text{fechaLiquidacion}) \implies \text{Error: Orden.FechaLiquidacionNoHabil}$$

### 2.6 V-RV-12: Decimales de Precio para Envío a Bolsa

- Si el parámetro `PUBLICAR_EN_MERCADO_RV` está activo (`true`), el estándar del mercado bursátil prohíbe órdenes con más de 2 decimales en el precio:
  $$\text{precioOrden} \neq \text{Round}(\text{precioOrden}, 2) \implies \text{Error: Orden.PrecioInvalidoPublicacionMercado}$$
