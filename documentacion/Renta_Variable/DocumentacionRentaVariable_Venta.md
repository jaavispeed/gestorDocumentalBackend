# Documentación de Procesos: Venta en Renta Variable

Este documento detalla las validaciones, reglas de negocio, parámetros utilizados, fórmulas matemáticas, publicación al mercado bursátil y flujos para el ingreso de órdenes de Venta de Renta Variable (Acciones, ETF, CFI) según la lógica en `OrdenTrxService.IngresarOrdenRentaVariableVenta` y `OrdenEndpointDefinition`.

---

## 1. Ingresar Orden de Venta (Renta Variable)

- **Método de Servicio:** `OrdenTrxService.IngresarOrdenRentaVariableVenta`
- **Endpoint:** `POST /api/ordenes/ingresoOrdenRentaVariableVenta`
- **Concepto de Operación:** `VIRV` (`VENTA_RV` en `OperacionConcepto`)
- **Tipo de Movimiento:** `RETIRO`
- **Descripción:** Valida la tenencia en custodia en la cartera online, calcula deducciones de corretaje, derechos de bolsa e IVA, registra la orden y opcionalmente la publica en rueda bursátil.

---

## 2. Parámetros del Request y de Entrada

### 2.1 Parámetros Recibidos en el Request / Método
| Parámetro | Tipo | Requerido | Descripción / Regla |
| :--- | :--- | :--- | :--- |
| `idCuenta` | `decimal` | Sí | Identificador de la cuenta de inversión del cliente. |
| `idInstrumento` | `decimal` | Sí | Identificador del instrumento a vender (debe pertenecer a familia `RV` y estar vigente). |
| `flgVendeTodo` | `string` | Sí | `"S"` para liquidar el 100% de la custodia disponible en cartera, `"N"` para venta parcial. |
| `cantidad` | `decimal?` | Condicional | Cantidad de acciones a vender. Obligatoria si `flgVendeTodo = "N"`. En CLP **debe ser entero**. |
| `precio` | `decimal?` | Condicional | Precio unitario. Obligatorio si `flgLimitePrecio = "L"`. Si es `"M"`, se obtiene de rueda. |
| `monto` | `decimal?` | Condicional | Monto bruto. Obligatorio en venta parcial ($\text{Cantidad} \times \text{Precio}$). |
| `montoTotal` | `decimal?` | Opcional | Monto total a recibir tras deducciones. Se somete a validación con tolerancia. |
| `formaLiq` | `string?` | No | Condición de liquidación: `"CN"` ($T+2$, por defecto), `"PM"` ($T+1$) o `"PH"` ($T+0$). |
| `fechaLiquidacion`| `DateTime?`| No | Fecha manual de liquidación. No puede ser menor a la mínima legal ni caer en día inhábil. |
| `flgLimitePrecio` | `string?` | No | `"L"` (Límite) o `"M"` (Mercado). En "Vende Todo" se fuerza a `"M"`. |
| `codigoAsesoria` | `string?` | No | Código de asesoría asociado. |
| `emailNotificacion`| `string?` | No | Correo adicional para el envío del comprobante de la orden. |

### 2.2 Parámetros de Sistema Consultados (`sis_parametro`)
1. **`HORA_INI_FIN_BOLSARV` / `HORA_BOLSA_RV`:** Horario hábil de rueda bursátil. Si la orden se ingresa con rueda cerrada, se rechaza inmediatamente con `OrdenErrors.FueraDeHorario`.
2. **`IVA`:** Porcentaje de impuesto al valor agregado (ej: 19%) para gravar comisiones y derechos.
3. **`TOLERANCIA_MONTO_TOTAL_RV`:** Porcentaje de tolerancia (base 100) admitido para resolver discrepancias de redondeo en `montoTotal`.
4. **`PUBLICAR_EN_MERCADO_RV`:** Flag para determinar si la orden se despacha a la rueda bursátil.

---

## 3. Flujo Paso a Paso de Validaciones y Cálculos

```
[Request Venta RV]
       │
       ▼
1. Validar Datos Básicos (Cuenta vigente, cliente activo y no bloqueado)
       │
       ▼
2. Consultar Custodia en Cartera Online:
   Verifica existencia de tenencia en cartera para el instrumento y saldo vigente > 0.
   (Error: CarteraErrors.SinSaldoEnCartera o CarteraErrors.CantidadInsuficiente)
       │
       ▼
3. Modalidad de Venta:
   - Si `flgVendeTodo == 'S'`: Cantidad = Total saldo vigente en cartera
   - Si `flgVendeTodo == 'N'`: Cantidad enviada debe ser > 0 y <= saldo vigente en cartera
       │
       ▼
4. Validar Instrumento (Pertenece a familia 'RV' y estado 'VIG')
       │
       ▼
5. Validar Horario de Bolsa (`HORA_BOLSA_RV`) -> Si está cerrado, rechazo inmediato
       │
       ▼
6. Validar Contrato de Operación (`ACC` - Acciones)
       │
       ▼
7. Determinar Precio (Si "L" valida > 0; si "M" consulta último precio en rueda)
       │
       ▼
8. Validar Cantidad y Decimales (En CLP la cantidad debe ser entera: `cantidad % 1 == 0`)
       │
       ▼
9. Doble Validación de Monto Base (en venta parcial):
   Monto Calculado = Cantidad * Precio (Redondeado a 0 decimales CLP, 2 en moneda extranjera)
   Monto Calculado == Monto Recibido (Error: DobleValidacionMontoRentaVariable)
       │
       ▼
10. Evaluar Fondos Propios:
    - Si es Fondo Propio: Comision = 0, Derechos = 0, IVA = 0
    - Si NO es Fondo Propio: Consultar tarifario por cuenta/operación Venta y calcular cobros
       │
       ▼
11. Liquidación y Monto Total de Venta:
    MontoTotal = MontoOrden - Comisión - Derechos - IVA
       │
       ▼
12. Doble Validación de Monto Total con Tolerancia:
    Si viene montoTotal > 0, validar diferencia porcentual <= TOLERANCIA_MONTO_TOTAL_RV
       │
       ▼
13. Persistir en Base de Datos (Transacción: Orden + SolicitudInversion con Gastos = 0)
       │
       ▼
14. Publicar al Mercado Bursátil (Si PUBLICAR_EN_MERCADO_RV == true)
       │
       ▼
15. Enviar Correo de Notificación al Inversionista
```

---

## 4. Fórmulas Matemáticas y Cálculos Financieros

### 4.1 Monto Bruto de la Venta
$$\text{MontoOrden} = \text{Cantidad} \times \text{Precio}$$
- Redondeo: `MidpointRounding.AwayFromZero` a $0$ decimales si la divisa es `CLP`, o a $2$ decimales si es divisa extranjera.

### 4.2 Deducciones Operativas (Si no es Fondo Propio)
$$\text{Comisión} = \text{MontoOrden} \times \frac{\text{PorcentajeComisión}}{100}$$
$$\text{Derechos} = \text{MontoOrden} \times \frac{\text{PorcentajeDerecho}}{100}$$
$$\text{IVA} = (\text{Comisión} + \text{Derechos}) \times \frac{\text{PorcentajeIVA}}{100}$$

### 4.3 Monto Total Líquido a Recibir
En las ventas, todos los recargos operacionales **se descuentan** del valor bruto de las acciones liquidadas:
$$\text{MontoTotal} = \text{MontoOrden} - \text{Comisión} - \text{Derechos} - \text{IVA}$$

### 4.4 Evaluación de Tolerancia
$$\text{Diferencia Porcentual} = \frac{|\text{MontoTotal Recibido} - \text{MontoTotal Calculado}|}{\text{MontoTotal Calculado}} \times 100$$
Se acepta si $\text{Diferencia Porcentual} \le \text{Tolerancia}$. De lo contrario, retorna `OrdenErrors.DobleValidacionMontoTotalRentaVariable`.

---

## 5. Ejemplos de Request y Response

### 5.1 Ejemplo de Request (Body - Venta Parcial a Precio Límite)
```json
{
  "idCuenta": 12345,
  "idInstrumento": 987,
  "cantidad": 1000,
  "precio": 1250.50,
  "monto": 1250500,
  "montoTotal": 1242866,
  "formaLiq": "CN",
  "fechaLiquidacion": "2026-10-28T00:00:00",
  "flgLimitePrecio": "L",
  "flgVendeTodo": "N",
  "codigoAsesoria": "ASES-01",
  "emailNotificacion": "cliente@ejemplo.cl"
}
```

### 5.2 Ejemplo de Response (200 OK)
```json
{
  "idOrden": 84522,
  "codMoneda": "CLP",
  "nemotecnico": "CHILE",
  "cantidad": 1000,
  "precio": 1250.50,
  "comision": 5627,
  "porcComision": 0.45,
  "monto": 1250500,
  "montoTotal": 1242866,
  "fechaLiquidacion": "2026-10-28T00:00:00",
  "fechaOperacion": "2026-10-26T10:30:00",
  "fechaMovimiento": "2026-10-26T00:00:00"
}
```

---

## 6. Despacho a Rueda Bursátil (FIX)

Si `PUBLICAR_EN_MERCADO_RV` está activo:
- Valida que el precio no tenga más de 2 decimales (`precio == Round(precio, 2)`).
- Obtiene el concepto de auditoría `"ENVÍO DE MENSAJES AL MERCADO"`.
- Despacha mensaje a la cola `ToMarketQueue` con:
  - `Action`: `NewOrder`
  - `Side`: `2` (Sell / Venta)
  - `MarketID`: `XSGO-CS`
  - `Symbol`: Nemotécnico del instrumento
  - `Price`, `OrderQty`, `TimeInForce: 'D'`, `SettlType: formaLiq`

---

## 7. Impacto en Base de Datos

- **`Cartera`:** Consulta el saldo vigente disponible antes de admitir la venta.
- **`Orden`:** Registro principal (`id_cuenta`, `id_instrumento`, `cantidad`, `precio`, `monto`, `fecha_operacion`, `fecha_liquidacion`, `forma_liq`, `flg_limite_precio`, `cod_estado = 'VIG'`).
- **`SolicitudInversion`:** Detalle complementario (`comision`, `porc_comision`, `derechos`, `iva`, `monto_total`, `gastos = 0`, `id_operacion_concepto`).
- **`SisRegistroLog`:** Auditoría silenciosa de errores técnicos ante excepciones no controladas antes de ejecutar el rollback.
