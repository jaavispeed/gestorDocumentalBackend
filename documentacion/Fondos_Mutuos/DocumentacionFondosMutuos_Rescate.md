# Documentación de Procesos: Rescate en Fondos Mutuos

Este documento detalla las validaciones, parámetros de entrada y sistema, reglas de negocio, fórmulas matemáticas y flujos para el ingreso de órdenes de Rescate de Fondos Mutuos según la lógica implementada en `OrdenTrxService.IngresarOrdenFondosMutuosRescate` y `OrdenEndpointDefinition`.

---

## 1. Ingresar Orden de Rescate (Fondos Mutuos)

- **Método de Servicio:** `OrdenTrxService.IngresarOrdenFondosMutuosRescate`
- **Endpoint:** `POST /api/ordenes/ingresoOrdenFondosMutuosRescate`
- **Concepto de Operación:** `RESCATE` (`VENTA RESCATE FM` con `idOperacionConcepto = 776`)
- **Tipo de Movimiento:** `E` (Egreso / Retiro)
- **Tipo de Bolsa:** `F` (Fondos)
- **Descripción:** Genera una orden de liquidación/retiro sobre cuotas de un fondo mutuo nacional, permitiendo modalidades por monto, por cantidad de cuotas o por venta total de la custodia.

---

## 2. Parámetros de Entrada y de Sistema

### 2.1 Parámetros Recibidos en el Request / Método
| Parámetro | Tipo | Requerido | Descripción / Regla |
| :--- | :--- | :--- | :--- |
| `idCuenta` | `decimal` | Sí | Identificador de la cuenta de inversión. |
| `idInstrumento` | `decimal` | Sí | Identificador del fondo mutuo (debe pertenecer a subclase `FFMM_NAC` con `CodigoFamilia == "FFMM"` y estar vigente). |
| `monto` | `decimal?` | Condicional | Monto a rescatar. Requerido si `flgCantidad = false` y `flgVendeTodo != "S"`. |
| `cuotas` | `decimal?` | Condicional | Cuotas a rescatar. Requerido si `flgCantidad = true` y `flgVendeTodo != "S"`. |
| `flgVendeTodo` | `string` | Sí | `"S"` para rescatar el 100% de la custodia disponible en cartera, `"N"` para rescate parcial. |
| `flgCantidad` | `bool` | Sí | `true` si el rescate se especifica por **Cuotas**, `false` si es por **Monto**. |
| `TipoOperacion` | `string?` | No | Código de operación: `RESCATE` (por defecto), `RESCMLTEXT`, `APV_RET`, `APV_TR_EG`. |
| `IdContraparte` | `decimal?` | Condicional | Identificador de contraparte externa. **Obligatorio** si `TipoOperacion == "RESCMLTEXT"`. |
| `codigoAsesoria` | `string?` | No | Código de asesoría asociado a la orden. |
| `emailNotificacion`| `string?` | No | Correo electrónico para el envío del comprobante de ingreso. |

### 2.2 Parámetros de Sistema y Atributos Consultados
1. **`ValidaHorarioRescate` (`sis_parametro`):**
   - Si el horario de mercado del fondo está cerrado y este parámetro es `true`: la orden **se rechaza** (`InstrumentoErrors.HorarioCerrado`).
   - Si es `false`: se acepta y la `fechaOperacion` **se traslada al siguiente día hábil bancario**.
2. **`HorarioRescate` (Atributo de Instrumento):** Ventana horaria límite para recibir rescates en el fondo.
3. **Regla de Exclusión de DRI:** En los rescates de Fondos Mutuos **NO aplica el atributo DRI**. La fecha de liquidación es normativamente **$T+1$ día hábil**.

---

## 3. Flujo Paso a Paso de Validaciones y Cálculos

```
[Request Rescate FFMM]
       │
       ▼
1. Validar Tipo de Operación y Contraparte (`ValidarPorTipoOperacionRescate`):
   - Tipos permitidos: `RESCATE`, `RESCMLTEXT`, `APV_RET`, `APV_TR_EG`
   - Si es `RESCMLTEXT`, valida que `IdContraparte` exista y sea válido
       │
       ▼
2. Validar Cuenta y Saldo en Cartera Online:
   - Verifica que el cliente posea saldo vigente en custodia para el fondo (`CarteraInstrumentos`)
       │
       ▼
3. Obtener Precio Oficial de Cuota:
   - Consulta `publicadorPrecioService.GetPrecio(..., ultimoPrecio: "S")`
       │
       ▼
4. Modalidad de Rescate y Cálculos:
   a) Vende Todo (`flgVendeTodo == 'S'`):
      CantidadOrden = Total disponible en cartera
      MontoOrden = Round(CantidadOrden * Precio, decimalesMoneda)
      FlgLimitePrecio = "L"
   b) Por Cuotas (`flgCantidad == true`):
      CantidadOrden = cuotas
      MontoCalculado = Round(cuotas * Precio, decimalesMoneda)
      Doble Validación de Monto: Compara MontoCalculado == Monto Recibido
      FlgLimitePrecio = "L"
   c) Por Monto (`flgCantidad == false`):
      MontoOrden = monto
      CantidadOrden = Round(monto / Precio, 6)
      Doble Validación de Cuotas: Si cuotas > 0, compara CantidadOrden == Round(cuotas, 6)
      FlgLimitePrecio = "M"
       │
       ▼
5. Validar Suficiencia de Custodia:
   - Valida que `CantidadOrden <= CarteraInstrumento.Vigente`
   - Si supera el saldo en cartera, rechaza con `CarteraErrors.CantidadInsuficiente`
       │
       ▼
6. Validar Horario de Mercado del Fondo (`AtributoHorarioRescate`):
   - Si cerrado y `ValidaHorarioRescate == true` -> Rechazo inmediato
   - Si cerrado y `ValidaHorarioRescate == false` -> FechaOperacion = Siguiente día hábil
       │
       ▼
7. Resolver Fecha de Liquidación:
   - FechaLiquidacion = FechaOperacion + 1 día hábil bancario (T+1)
       │
       ▼
8. Construir y Persistir Orden (Transacción BD):
   - `FormaLiq = "PH"`, `TipoBolsa = "F"`, `Estado = "P"` (Pendiente)
   - `Comision = 0`, `Gastos = 0`, `MontoTotal = MontoOrden`
       │
       ▼
9. Notificar Ingreso de Orden por Correo al Cliente
```

---

## 4. Fórmulas Matemáticas y Doble Validación

### 4.1 Rescate Total ("Vende Todo")
$$\text{CantidadOrden} = \text{CarteraDisponible}$$
$$\text{MontoOrden} = \text{Round}(\text{CantidadOrden} \times \text{Precio}, \text{decimalesMoneda})$$
*(Donde `decimalesMoneda` es 0 para CLP y 2 para USD/UF con `MidpointRounding.AwayFromZero`)*.

### 4.2 Rescate por Cuotas (`flgCantidad = true`)
$$\text{CantidadOrden} = \text{cuotas}$$
$$\text{MontoCalculado} = \text{Round}(\text{CantidadOrden} \times \text{Precio}, \text{decimalesMoneda})$$
- Si se envía `monto`: se valida que $\text{Round}(\text{monto}, \text{decimalesMoneda}) = \text{MontoCalculado}$. Si difieren, arroja `OrdenErrors.DobleValidacionMonto`.

### 4.3 Rescate por Monto (`flgCantidad = false`)
$$\text{MontoOrden} = \text{monto}$$
$$\text{CantidadOrden} = \text{Round}\left(\frac{\text{MontoOrden}}{\text{Precio}}, 6\right)$$
- Si se envían `cuotas > 0`: se valida que $\text{Round}(\text{cuotas}, 6) = \text{CantidadOrden}$. Si difieren, arroja `OrdenErrors.DobleValidacionCuotas`.

### 4.4 Fecha de Liquidación
$$\text{FechaLiquidacion} = \text{FechaOperacion} + 1 \text{ día hábil bancario} \ (T+1)$$

---

## 5. Ejemplos de Request y Response

### 5.1 Ejemplo de Request (Body - Rescate por Cuotas)
```json
{
  "idCuenta": 12345,
  "idInstrumento": 987,
  "monto": 500000,
  "cuotas": 401.929237,
  "flgVendeTodo": "N",
  "flgCantidad": true,
  "codTipoOperacion": "RESCATE",
  "codigoAsesoria": "ASES-01",
  "emailNotificacion": "cliente@ejemplo.cl"
}
```

### 5.2 Ejemplo de Response (200 OK)
```json
{
  "idOrden": 84531,
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

- **`Cartera`:** Valida y descuenta disponibilidad de custodia.
- **`Orden`:** Registro principal con `FlgTipoMovimiento = 'E'`, `TipoBolsa = "F"`, `FormaLiq = "PH"`, `CodEstado = "P"`.
- **`SolicitudInversion`:** Cabecera con `IdOperacionConcepto = 776`, `Comision = 0`, `Gastos = 0`.
- **`SisRegistroLog`:** Auditoría técnica silenciosa de excepciones imprevistas.
