# Documentación de Procesos: Cálculo de Valor Cuota y Patrimonio

Este documento detalla de forma clara y directa cómo se calcula el **Patrimonio**, el **Valor Cuota**, el **Total de Cuotas** y la **Rentabilidad Diaria** de las cuentas de clientes. Este cálculo se realiza de manera automática durante la etapa de **Patrimonio Cuenta** dentro del **Proceso de Cierre Diario**.

---

## 1. ¿Dónde se ejecuta en el Cierre Diario?

- **Servicios involucrados:** `PatrimonioCuentaSysService` &rarr; `CalculosService`
- **Momento de Ejecución:** Se ejecuta en el paso 3 del Cierre Diario (después de cerrar la Cartera y la Caja, y antes del devengo de Comisiones).
- **Propósito:** Consolidar el valor total de la cuenta al final del día y medir su rentabilidad real a través de la unidad de valor cuota.

### Flujo del Cierre Diario (Paso a Paso)
1. **Paso 1 - Cierre Cartera:** Valoriza las acciones e instrumentos a precio de mercado (`cierre_cartera_resumida`).
2. **Paso 2 - Saldo Caja:** Consolida los montos de caja disponibles y las operaciones por cobrar y pagar (`saldo_caja`).
3. **Paso 3 - Patrimonio Cuenta (Aquí ocurre el cálculo):** Reúne la cartera, la caja, los aportes y retiros del día, obtiene el valor cuota de ayer y calcula el nuevo patrimonio, valor cuota y rentabilidad (`patrimonio_cuenta`).
4. **Paso 4 - Devengo de Comisiones:** Provisiona la comisión de administración del día basándose en el patrimonio calculado (no se le resta al patrimonio diario).
5. **Paso 5 - Cierre Cuenta:** Finaliza el día y marca la cuenta como cerrada (`cierre_cuenta`).

---

## 2. Fórmulas de Cálculo (Paso a Paso)

- **Método:** `CalculosService.CalcularValorCuotaPatrimonio`

### 1. Patrimonio de la Cuenta (Hoy)
Depende del parámetro del sistema `TIPO_CALC_RENTAB` en `SIS_PARAMETRO`:
- **Modo Tradicional ('T' - por defecto):** Incluye todo el dinero y activos.
  $$\text{PatrimonioHoy} = \text{SaldoActivo} + \text{SaldoCaja} + (\text{MontoPorCobrar} - \text{MontoPorPagar})$$
- **Modo Saldo ('S'):** Solo considera los activos de cartera.
  $$\text{PatrimonioHoy} = \text{SaldoActivo}$$

### 2. Base de Inversión
Es el capital inicial disponible antes de rendimientos y retiros:
$$\text{BaseInversion} = \text{PatrimonioAyer} + \text{AportesHoy}$$

### 3. Rentabilidad Diaria
Mide cuánto rindió la inversión durante el día descontando los movimientos del cliente:
$$\text{RentabilidadHoy} = \frac{\text{PatrimonioHoy} - \text{RetirosHoy} - \text{BaseInversion}}{\text{BaseInversion}}$$
- Si `BaseInversion = 0`, la rentabilidad es `0`.
- Si `RentabilidadHoy = -1` (la cuenta quedó totalmente en 0), se ajusta a `0`.

### 4. Valor Cuota (Hoy)
Aplica el rendimiento del día sobre el valor cuota del día anterior (el valor cuota inicial base es **100**):
$$\text{ValorCuotaHoy} = \text{ValorCuotaAyer} \times (1 + \text{RentabilidadHoy})$$

### 5. Total de Cuotas (Hoy)
Actualiza la cantidad de unidades que posee el cliente dividiendo el patrimonio por el nuevo valor cuota:
$$\text{TotalCuotasHoy} = \frac{\text{PatrimonioHoy}}{\text{ValorCuotaHoy}}$$
- **Caso cuenta nueva / inactiva:** Si ayer no tenía cuotas (`TotalCuotasAyer = 0`) y hoy no hubo aportes ni retiros, queda en `TotalCuotas = 0` y `ValorCuota = 100`.

### 6. Rentabilidad Porcentual Guardada
Es el porcentaje oficial de rentabilidad del día que se registra en la base de datos:
$$\text{RentabilidadMonCuenta} = \left(\frac{\text{ValorCuotaHoy}}{\text{ValorCuotaAyer}} - 1\right) \times 100$$

*\* Todos los resultados finales se redondean a **4 decimales** usando redondeo bancario exacto (AwayFromZero).*

---

## 3. Ejemplos Prácticos de Negocio (Paso a Paso)

Estos ejemplos reproducen exactamente los escenarios validados en las pruebas unitarias (`CalculadorValorCuotaPatrimonioUnitTest`):

### Caso 1: Apertura de Cuenta (Aporte Inicial de $1.000.000)
- **1. Datos de Ayer:** `PatrimonioAyer = $0`, `ValorCuotaAyer = $100` (valor inicial por defecto), `TotalCuotasAyer = 0`.
- **2. Movimientos de Hoy:** `AportesHoy = $1.000.000`, `RetirosHoy = $0`, `PatrimonioHoy = $1.000.000`.
- **3. Cálculos:**
  - `BaseInversion = $0 + $1.000.000 = $1.000.000`
  - `Rentabilidad = ($1.000.000 - $0 - $1.000.000) / $1.000.000 = 0` (0,0000%)
  - `ValorCuota = $100 * (1 + 0) = 100.0000`
  - `TotalCuotas = $1.000.000 / 100 = 10.000,0000`
- **Resultado Guardado:** **Valor Cuota: 100.0000** | **Cuotas: 10.000,0000** | **Rentabilidad: 0,0000%**

### Caso 2: Ganancia de Mercado (+5%) sin Aportes ni Retiros
- **1. Datos de Ayer:** `PatrimonioAyer = $1.000.000`, `ValorCuotaAyer = $100`, `TotalCuotasAyer = 10.000`.
- **2. Movimientos de Hoy:** `AportesHoy = $0`, `RetirosHoy = $0`, `PatrimonioHoy = $1.050.000` (las acciones subieron $50.000 de valor).
- **3. Cálculos:**
  - `BaseInversion = $1.000.000 + $0 = $1.000.000`
  - `Rentabilidad = ($1.050.000 - $0 - $1.000.000) / $1.000.000 = $50.000 / $1.000.000 = 0.05` (+5,0000%)
  - `ValorCuota = $100 * (1 + 0.05) = 105.0000`
  - `TotalCuotas = $1.050.000 / 105 = 10.000,0000` (la cantidad de cuotas no varía porque no hubo aportes ni retiros)
- **Resultado Guardado:** **Valor Cuota: 105.0000** | **Cuotas: 10.000,0000** | **Rentabilidad: 5,0000%**

### Caso 3: Nuevo Aporte ($500.000) + Ganancia de Mercado ($100.000)
- **1. Datos de Ayer:** `PatrimonioAyer = $1.000.000`, `ValorCuotaAyer = $100`, `TotalCuotasAyer = 10.000`.
- **2. Movimientos de Hoy:** `AportesHoy = $500.000`, `RetirosHoy = $0`, `PatrimonioHoy = $1.600.000` ($1.000.000 inicial + $500.000 aporte + $100.000 ganancia).
- **3. Cálculos:**
  - `BaseInversion = $1.000.000 + $500.000 = $1.500.000`
  - `Rentabilidad = ($1.600.000 - $0 - $1.500.000) / $1.500.000 = $100.000 / $1.500.000 = 0.066667` (+6,6667%)
  - `ValorCuota = $100 * (1 + 0.066667) = 106.6667`
  - `TotalCuotas = $1.600.000 / 106.6667 = 15.000,0000` (las cuotas suben por el nuevo dinero aportado)
- **Resultado Guardado:** **Valor Cuota: 106.6667** | **Cuotas: 15.000,0000** | **Rentabilidad: 6,6667%**

### Caso 4: Retiro de Fondos ($200.000) + Pérdida de Mercado (-$50.000)
- **1. Datos de Ayer:** `PatrimonioAyer = $1.000.000`, `ValorCuotaAyer = $100`, `TotalCuotasAyer = 10.000`.
- **2. Movimientos de Hoy:** `AportesHoy = $0`, `RetirosHoy = $200.000`, `PatrimonioHoy = $750.000` ($1.000.000 inicial - $200.000 retiro - $50.000 desvalorización).
- **3. Cálculos:**
  - `BaseInversion = $1.000.000 + $0 = $1.000.000`
  - `Rentabilidad = ($750.000 - $200.000 - $1.000.000) / $1.000.000 = -$450.000 / $1.000.000 = -0.45` (-45,0000%)
  - `ValorCuota = $100 * (1 - 0.45) = 55.0000`
  - `TotalCuotas = $750.000 / 55.0000 = 13.636,3636`
- **Resultado Guardado:** **Valor Cuota: 55.0000** | **Cuotas: 13.636,3636** | **Rentabilidad: -45,0000%**

### Caso 5: Cuenta Nueva o Inactiva (Sin Patrimonio ni Movimientos)
- **1. Datos de Ayer:** `PatrimonioAyer = $0`, `ValorCuotaAyer = null`, `TotalCuotasAyer = 0`
- **2. Movimientos de Hoy:** `AportesHoy = $0`, `RetirosHoy = $0`, `PatrimonioHoy = $0`
- **3. Cálculos:** Al no existir cuotas previas ni aportes en el día, el sistema preserva los valores base sin calcular división por cero.
- **Resultado Guardado:** **Valor Cuota: 100.0000** | **Cuotas: 0,0000** | **Rentabilidad: 0,0000%**

---

## 4. Impacto en Base de Datos (Modelo de Datos)

### Tablas Consultadas (Lectura)
- `PATRIMONIO_CUENTA`: Obtiene el último registro vigente de ayer (`FechaCierre < FechaHoy` y `EST_PATRIMONIO_CUENTA = 'VIG'`) para leer el valor cuota y cuotas anteriores.
- `CIERRE_CARTERA_RESUMIDA`: Valorización de mercado de las acciones e instrumentos (`ValorMercadoClp`).
- `SALDO_CAJA`: Saldo en caja, cuentas por cobrar y por pagar.
- `OPERACION` / `MOVIMIENTO_CAJA`: Aportes y retiros de dinero o especies con impacto patrimonial.
- `SIS_PARAMETRO`: Parámetro `TIPO_CALC_RENTAB` ('T' Tradicional o 'S' Saldo).

### Tablas Afectadas (Escritura)
- `PATRIMONIO_CUENTA`: Anula registros previos (`ANU`) y guarda en un solo bloque (`VIG`) las columnas:
  - `VALOR_CUOTA_MON_CUENTA`: Valor de la cuota del día.
  - `TOTAL_CUOTAS_MON_CUENTA`: Cantidad de cuotas de la cuenta.
  - `RENTABILIDAD_MON_CUENTA`: Rentabilidad diaria en porcentaje.
  - `PATRIMONIO_MON_CUENTA` / `SALDO_ACTIVO_MON_CUENTA`: Saldos consolidados.
  - `APORTE_MON_CUENTA` y `RETIRO_MON_CUENTA`: Aportes y retiros del día.
