# Documentación de Procesos: Compra en Renta Variable

Este documento detalla las validaciones, reglas de negocio, parámetros utilizados, fórmulas matemáticas, publicación al mercado bursátil y flujos para el ingreso de órdenes de Compra de Renta Variable (Acciones, ETF, CFI) según la lógica en `OrdenTrxService.IngresarOrdenRentaVariableCompra` y `OrdenEndpointDefinition`.

---

## 1. Ingresar Orden de Compra (Renta Variable)

- **Método de Servicio:** `OrdenTrxService.IngresarOrdenRentaVariableCompra`
- **Endpoint:** `POST /api/ordenes/ingresoOrdenRentaVariableCompra`
- **Concepto de Operación:** `CIRV` (`COMPRA_RV` en `OperacionConcepto`)
- **Tipo de Movimiento:** `INVERSION`
- **Descripción:** Valida la disponibilidad de fondos, calcula comisiones e impuestos, registra la orden en estado Vigente/Pendiente y opcionalmente la publica en rueda bursátil.

---

## 2. Parámetros del Request y de Entrada

### 2.1 Parámetros Recibidos en el Request / Método
| Parámetro | Tipo | Requerido | Descripción / Regla |
| :--- | :--- | :--- | :--- |
| `idCuenta` | `decimal` | Sí | Identificador de la cuenta de inversión del cliente. |
| `idInstrumento` | `decimal` | Sí | Identificador del instrumento (debe pertenecer a familia `RV` y estar vigente). |
| `cantidad` | `decimal?` | Sí | Cantidad de títulos o acciones a comprar. Mayor a 0. En CLP **debe ser un número entero**. |
| `precio` | `decimal?` | Condicional | Precio unitario. Obligatorio si `flgLimitePrecio = "L"`. Si es `"M"`, se obtiene de mercado. |
| `monto` | `decimal?` | Sí | Monto bruto de la orden ($\text{Cantidad} \times \text{Precio}$). |
| `montoTotal` | `decimal?` | Opcional | Monto total con comisiones, derechos e IVA. Se somete a validación con tolerancia. |
| `formaLiq` | `string?` | No | Condición de liquidación: `"CN"` ($T+2$, por defecto), `"PM"` ($T+1$) o `"PH"` ($T+0$). |
| `fechaLiquidacion`| `DateTime?`| No | Fecha manual de liquidación. No puede ser menor a la mínima legal ni caer en día inhábil. |
| `flgLimitePrecio` | `string?` | No | `"L"` (Límite) o `"M"` (Mercado). Por defecto: `"M"`. |
| `codigoAsesoria` | `string?` | No | Código de asesoría asociado para trazabilidad comercial. |
| `emailNotificacion`| `string?` | No | Correo adicional para el envío del comprobante de la orden. |

### 2.2 Parámetros de Sistema Consultados (`sis_parametro`)
1. **`HORA_INI_FIN_BOLSARV` / `HORA_BOLSA_RV`:** Rango horario de rueda bursátil. Si la hora del sistema está fuera de rango, la orden se rechaza inmediatamente con `OrdenErrors.FueraDeHorario`.
2. **`IVA`:** Porcentaje de impuesto al valor agregado (ej: 19%) para tasar comisiones y derechos.
3. **`TOLERANCIA_MONTO_TOTAL_RV`:** Porcentaje base 100 de tolerancia para admitir diferencias por redondeo en `montoTotal`.
4. **`PUBLICAR_EN_MERCADO_RV`:** Flag para determinar si la orden se envía a rueda vía Azure Service Bus.

---

## 3. Flujo Paso a Paso de Validaciones y Cálculos

```
[Request Compra RV]
       │
       ▼
1. Validar Datos Básicos (Cuenta vigente, no bloqueada, cliente activo)
       │
       ▼
2. Validar Saldo Disponible (Si la cuenta no permite sobregiro `FlgMovDescubiertos != 'S'`, 
   el saldo de caja debe cubrir el monto de la compra)
       │
       ▼
3. Validar Instrumento (Pertenece a familia 'RV' y estado 'VIG')
       │
       ▼
4. Validar Horario de Bolsa (`HORA_BOLSA_RV`) -> Si está cerrado, rechazo inmediato
       │
       ▼
5. Validar Contrato de Operación (`ACC` - Acciones)
       │
       ▼
6. Determinar Precio (Si "L" valida > 0; si "M" consulta último precio en rueda)
       │
       ▼
7. Validar Cantidad y Decimales (En CLP cantidad debe ser entera: `cantidad % 1 == 0`)
       │
       ▼
8. Doble Validación de Monto Base:
   Monto Calculado = Cantidad * Precio (Redondeado a 0 decimales CLP, 2 en moneda extranjera)
   Monto Calculado == Monto Recibido (Error: DobleValidacionMontoRentaVariable)
       │
       ▼
9. Evaluar Fondos Propios:
   - Si es Fondo Propio: Comision = 0, Derechos = 0, IVA = 0
   - Si NO es Fondo Propio: Obtener tarifas por cuenta y calcular Comisiones, Derechos e IVA
       │
       ▼
10. Liquidación y Monto Total de Compra:
    MontoTotal = MontoOrden + Comisión + Derechos + IVA
       │
       ▼
11. Doble Validación de Monto Total con Tolerancia:
    Si viene montoTotal > 0, validar diferencia porcentual <= TOLERANCIA_MONTO_TOTAL_RV
       │
       ▼
12. Persistir en Base de Datos (Transacción: Orden + SolicitudInversion con Gastos = 0)
       │
       ▼
13. Publicar al Mercado Bursátil (Si PUBLICAR_EN_MERCADO_RV == true)
       │
       ▼
14. Enviar Correo de Notificación al Inversionista
```

---

## 4. Fórmulas Matemáticas y Cálculos Financieros

### 4.1 Monto Bruto de la Orden
$$\text{MontoOrden} = \text{Cantidad} \times \text{Precio}$$
- Redondeo: `MidpointRounding.AwayFromZero` a $0$ decimales si la divisa es `CLP`, o a $2$ decimales si es divisa extranjera.

### 4.2 Cobros Operativos (Si no es Fondo Propio)
$$\text{Comisión} = \text{MontoOrden} \times \frac{\text{PorcentajeComisión}}{100}$$
$$\text{Derechos} = \text{MontoOrden} \times \frac{\text{PorcentajeDerecho}}{100}$$
$$\text{IVA} = (\text{Comisión} + \text{Derechos}) \times \frac{\text{PorcentajeIVA}}{100}$$

### 4.3 Monto Total de la Compra
En las compras, todos los recargos operacionales **se suman** al costo de los títulos:
$$\text{MontoTotal} = \text{MontoOrden} + \text{Comisión} + \text{Derechos} + \text{IVA}$$

### 4.4 Evaluación de Tolerancia
$$\text{Diferencia Porcentual} = \frac{|\text{MontoTotal Recibido} - \text{MontoTotal Calculado}|}{\text{MontoTotal Calculado}} \times 100$$
Se acepta si $\text{Diferencia Porcentual} \le \text{Tolerancia}$. De lo contrario, retorna `OrdenErrors.DobleValidacionMontoTotalRentaVariable`.

---

## 5. Ejemplos de Request y Response

### 5.1 Ejemplo de Request (Body)
```json
{
  "idCuenta": 12345,
  "idInstrumento": 987,
  "cantidad": 1000,
  "precio": 1250.50,
  "monto": 1250500,
  "montoTotal": 1258134,
  "formaLiq": "CN",
  "fechaLiquidacion": "2026-10-28T00:00:00",
  "flgLimitePrecio": "L",
  "codigoAsesoria": "ASES-01",
  "emailNotificacion": "cliente@ejemplo.cl"
}
```

### 5.2 Ejemplo de Response (200 OK)
```json
{
  "idOrden": 84521,
  "codMoneda": "CLP",
  "nemotecnico": "CHILE",
  "cantidad": 1000,
  "precio": 1250.50,
  "comision": 5627,
  "porcComision": 0.45,
  "monto": 1250500,
  "montoTotal": 1258134,
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
  - `Side`: `1` (Buy / Compra)
  - `MarketID`: `XSGO-CS`
  - `Symbol`: Nemotécnico del instrumento
  - `Price`, `OrderQty`, `TimeInForce: 'D'`, `SettlType: formaLiq`

---

## 7. Impacto en Base de Datos

- **`Orden`:** Registro principal (`id_cuenta`, `id_instrumento`, `cantidad`, `precio`, `monto`, `fecha_operacion`, `fecha_liquidacion`, `forma_liq`, `flg_limite_precio`, `cod_estado = 'VIG'`).
- **`SolicitudInversion`:** Detalle complementario (`comision`, `porc_comision`, `derechos`, `iva`, `monto_total`, `gastos = 0`, `id_operacion_concepto`).
- **`SisRegistroLog`:** En caso de fallas imprevistas, se registra la traza del error de forma silenciosa previa reversa transaccional (`rollback`).
