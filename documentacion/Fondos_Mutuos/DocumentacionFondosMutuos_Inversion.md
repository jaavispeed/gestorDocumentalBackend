# Documentación de Procesos: Inversión en Fondos Mutuos

Este documento detalla las validaciones, parámetros de entrada y sistema, reglas de negocio, fórmulas matemáticas y flujos para el ingreso de órdenes de Inversión de Fondos Mutuos según la lógica implementada en `OrdenTrxService.IngresarOrdenFondosMutuosInversion` y `OrdenEndpointDefinition`.

---

## 1. Ingresar Orden de Inversión (Fondos Mutuos)

- **Método de Servicio:** `OrdenTrxService.IngresarOrdenFondosMutuosInversion`
- **Endpoint:** `POST /api/ordenes/ingresoOrdenFondosMutuosInversion`
- **Concepto de Operación:** `INVERSION` (`COMPRA INVERSION FM` con `idOperacionConcepto = 774`)
- **Tipo de Movimiento:** `I` (Ingreso / Inversión)
- **Tipo de Bolsa:** `F` (Fondos)
- **Descripción:** Genera una orden de suscripción en fondos mutuos nacionales, calculando la cantidad estimada de cuotas y proyectando la fecha de liquidación según la presencia de días de retención (`DRI`) o cuota desconocida (`VCD`).

---

## 2. Parámetros de Entrada y de Sistema

### 2.1 Parámetros Recibidos en el Request / Método

| Parámetro           | Tipo       | Requerido   | Descripción / Regla                                                                                                  |
| :------------------ | :--------- | :---------- | :------------------------------------------------------------------------------------------------------------------- |
| `idCuenta`          | `decimal`  | Sí          | Identificador de la cuenta de inversión.                                                                             |
| `idInstrumento`     | `decimal`  | Sí          | Identificador del fondo mutuo (debe pertenecer a subclase `FFMM_NAC` con `CodigoFamilia == "FFMM"` y estar vigente). |
| `monto`             | `decimal?` | Sí          | Monto a invertir en la moneda del fondo (o CLP si cotiza en UF). Debe ser $> 0$.                                     |
| `cuotas`            | `decimal?` | Opcional    | Cuotas esperadas por el cliente. Si viene $> 0$, activa la **Doble Validación de Cuotas**.                           |
| `TipoOperacion`     | `string?`  | No          | Código de operación: `INVERSION` (por defecto), `INVMLTEXT`, `APV_APO`, `APV_TR_IN`.                                 |
| `IdContraparte`     | `decimal?` | Condicional | Identificador de la contraparte externa. **Obligatorio** si `TipoOperacion == "INVMLTEXT"`.                          |
| `codigoAsesoria`    | `string?`  | No          | Código de asesoría asociado a la orden para seguimiento comercial.                                                   |
| `emailNotificacion` | `string?`  | No          | Correo electrónico para el envío del comprobante de ingreso.                                                         |

### 2.2 Parámetros de Sistema y Atributos Consultados

1. **`ValidaHorarioInversion` (`sis_parametro`):**
   - Si el horario de mercado del fondo está cerrado y este parámetro es `true`: la orden **se rechaza** (`InstrumentoErrors.HorarioCerrado`).
   - Si es `false`: se acepta y la `fechaOperacion` **se difiere automáticamente al siguiente día hábil bancario**.
2. **`HorarioInversion` (Atributo de Instrumento):** Ventana horaria de recepción de órdenes para el fondo.
3. **`DRI` (Días de Retención de Inversión - Atributo):** Días hábiles bancarios a sumar para calcular la fecha de liquidación.
4. **`VCD` (Valor Cuota Desconocido - Atributo):** Si no hay DRI, indica si liquida en $T+1$ hábil (con VCD) o en $T+0$ (sin VCD).

---

## 3. Flujo Paso a Paso de Validaciones y Cálculos

```
[Request Inversión FFMM]
       │
       ▼
1. Validar Tipo de Operación y Contraparte (`ValidarPorTipoOperacionInversion`):
   - Verifica que el tipo sea uno de: `INVERSION`, `INVMLTEXT`, `APV_APO`, `APV_TR_IN`
   - Si es `INVMLTEXT`, valida que `IdContraparte` esté informado y vigente
       │
       ▼
2. Validar Cuenta y Saldo Disponible (Sobregiro):
   - Cuenta activa, no bloqueada y cliente vigente
   - Si `FlgMovDescubiertos != 'S'`, valida que el saldo de caja disponible cubra el monto
       │
       ▼
3. Obtener Precio Oficial de Cuota:
   - Consulta `publicadorPrecioService.GetPrecio(..., ultimoPrecio: "S")`
   - Si no existe o es <= 0, retorna `OrdenErrors.PrecioMercadoNoEncontrado`
       │
       ▼
4. Cálculo de Cuotas y Doble Validación:
   - Cuotas Calculadas = Round(Monto / Precio, 6, AwayFromZero)
   - Si `cuotas > 0`, compara que Round(cuotas, 6) == Cuotas Calculadas.
     (Si difieren, rechaza con `OrdenErrors.DobleValidacionCuotas`)
   - Tipo de límite precio se fija en Mercado ("M")
       │
       ▼
5. Validar Horario de Mercado del Fondo (`AtributoHorarioInversion`):
   - Si cerrado y `ValidaHorarioInversion == true` -> Rechazo inmediato
   - Si cerrado y `ValidaHorarioInversion == false` -> FechaOperacion = Siguiente día hábil
       │
       ▼
6. Resolver Fecha de Liquidación:
   - Si tiene DRI > 0: FechaLiquidacion = FechaOperacion + DRI días hábiles
   - Si NO tiene DRI y tiene VCD: FechaLiquidacion = FechaOperacion + 1 día hábil
   - Si NO tiene DRI y NO tiene VCD: FechaLiquidacion = FechaOperacion (T+0)
       │
       ▼
7. Construir y Persistir Orden (Transacción BD):
   - `FlgLimitePrecio = "M"`, `FormaLiq = "PH"`, `TipoBolsa = "F"`, `Estado = "P"` (Pendiente)
   - `Comision = 0`, `Gastos = 0`, `MontoTotal = MontoOrden`
       │
       ▼
8. Notificar Ingreso de Orden por Correo al Cliente
```

---

## 4. Fórmulas Matemáticas y Cálculos

### 4.1 Cálculo de Cuotas Estimadas

$$\text{CantidadOrden} = \text{Round}\left(\frac{\text{MontoOrden}}{\text{Precio}}, 6\right)$$

### 4.2 Doble Validación de Cuotas

Si en la solicitud se especifica el campo `cuotas`:
$$\text{CuotasRecibidas} = \text{Round}(\text{cuotas}, 6)$$
Si $\text{CuotasRecibidas} \neq \text{CantidadOrden}$, la transacción se aborta arrojando:
$$\text{OrdenErrors.DobleValidacionCuotas}(\text{CuotasRecibidas}, \text{CantidadOrden})$$

### 4.3 Determinación de la Fecha de Liquidación

$$ \text{FechaLiquidación} =
\begin{cases}
\text{FechaOperacion} + \text{DRI días hábiles}, & \text{si } \text{DRI} > 0 \\
\text{FechaOperacion} + 1 \text{ día hábil}, & \text{si } \text{DRI} = 0 \text{ y existe } \text{VCD} \\
\text{FechaOperacion} \ (T+0), & \text{si } \text{DRI} = 0 \text{ y no existe } \text{VCD}
\end{cases}$$

---

## 5. Ejemplos de Request y Response

### 5.1 Ejemplo de Request (Body)
```json
{
  "idCuenta": 12345,
  "idInstrumento": 987,
  "monto": 500000,
  "cuotas": 401.929237,
  "codTipoOperacion": "INVERSION",
  "codigoAsesoria": "ASES-01",
  "emailNotificacion": "cliente@ejemplo.cl"
}
```

### 5.2 Ejemplo de Response (200 OK)
```json
{
  "idOrden": 84530,
  "codMoneda": "CLP",
  "nemotecnico": "FM-MONEY-MARKET",
  "cantidad": 401.929237,
  "precio": 1244.00,
  "comision": 0,
  "porcComision": 0,
  "monto": 500000,
  "montoTotal": 500000,
  "fechaLiquidacion": "2026-10-27T00:00:00",
  "fechaOperacion": "2026-10-26T11:00:00",
  "fechaMovimiento": "2026-10-26T00:00:00"
}
```

---

## 6. Impacto en Base de Datos

- **`Orden`:** Inserta la orden con `TipoBolsa = "F"`, `FormaLiq = "PH"`, `FlgLimitePrecio = "M"`, `CodEstado = "P"`.
- **`SolicitudInversion`:** Registro cabecera vinculado con `IdOperacionConcepto = 774`, `Comision = 0`, `Gastos = 0`.
- **`SisRegistroLog`:** Captura silenciosa de errores técnicos ante excepciones imprevistas previo rollback transaccional.
$$
