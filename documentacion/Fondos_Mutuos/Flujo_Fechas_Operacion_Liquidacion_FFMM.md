# Flujo de Fechas de Operación y Liquidación en Fondos Mutuos

Este documento detalla la lógica centralizada para el cálculo de la **Fecha de Operación** y **Fecha de Liquidación** dentro de los métodos de ingreso de órdenes para Fondos Mutuos (Inversión y Rescate) en la clase `OrdenTrxService`.

## 1. Regla General: Centralización en la Fecha de Operación

Toda la lógica de fechas parte de un concepto fundamental: **El cálculo de la Fecha de Liquidación siempre depende y parte de la Fecha de Operación**. Esto garantiza que cualquier cambio o desfase en la operación (como encontrarse con el mercado cerrado) desplace automáticamente toda la cadena de liquidación, manteniendo la coherencia.

## 2. Determinación de la Fecha de Operación (Mercado Abierto vs. Cerrado)

Tanto en inversiones como en rescates (`IngresarOrdenFondosMutuosInversion` e `IngresarOrdenFondosMutuosRescate`), lo primero que se hace es evaluar el estado del horario de mercado del instrumento:

- **Mercado Abierto:** La fecha de operación es HOY (`fechaActual`).
- **Mercado Cerrado:** Para no bloquear las órdenes, la fecha de operación se traslada automáticamente al **siguiente día hábil** (Mañana).

```csharp
DateTime fechaOperacion = mercadoAbierto
    ? fechaActual
    : await diasFeriadosService.GetDiaHabilSiguienteInclusivo(
        _optionsP.CodigoPais,
        fechaActual.Date.AddDays(1)
    );
```

---

## 3. Cálculo de la Fecha de Liquidación según tipo de Orden

Una vez que la `Fecha de Operación` está definida, el comportamiento para calcular la liquidación difiere levemente dependiendo de si se trata de un rescate o una inversión.

### A. Rescates (IngresarOrdenFondosMutuosRescate)

Para los rescates, la regla es fija: **Fecha de Operación + 1 día hábil**. 
Como partimos de la `fechaOperacion` ya calculada, si el mercado estaba cerrado y la operación se pasó para mañana, la liquidación será "mañana + 1 día hábil".

```csharp
DateTime fechaLiquidacion = await diasFeriadosService.GetDiaHabilSiguienteInclusivo(
    _optionsP.CodigoPais,
    fechaOperacion.Date.AddDays(1)
);
```

> **Modalidad de Precio y Rescate Total:**
> En los rescates de Fondos Mutuos, el indicador de límite de precio (`FlgLimitePrecio`) clasifica si la orden es por monto o por cuotas:
> - **Rescate Total (`flgVendeTodo == 'S'`)**: Al rescatar todo el saldo disponible, se opera sobre la totalidad de las cuotas, marcándose como **Límite (`'L'`)** (lo que representa orden fijada por cantidad/cuotas).
> - **Rescate por Cuotas (`flgCantidad == true`)**: Se marca como **Límite (`'L'`)**.
> - **Rescate por Monto (`flgCantidad == false`)**: Se marca como **Mercado (`'M'`)**.

### B. Inversiones (IngresarOrdenFondosMutuosInversion)

Las inversiones en Fondos Mutuos se delegan en el método `CalcularFechaLiquidacionInversionFondoAsync`, pasando la `fechaOperacion` como punto de partida. La liquidación se resuelve según las siguientes reglas:

1. **Días de Retención (DRI > 0):**
   - Si el instrumento tiene configurado el atributo `DRI` con un valor numérico mayor a cero, se proyectan exactamente esa cantidad de días hábiles bancarios a partir de la fecha de operación:
   $$\text{FechaLiquidacion} = \text{ProyectarDiasHabiles}(\text{fechaOperacion}, \text{DRI})$$

2. **Sin Días de Retención (DRI = 0 o nulo) y Cuota Desconocida (VCD):**
   - Si el instrumento **NO** tiene días de retención pero tiene asociado el atributo `VCD` (*Valor Cuota Desconocido*), requiere esperar al cierre y cálculo de cuota del día siguiente, por lo que liquida a **$T+1$ día hábil**:
   $$\text{FechaLiquidacion} = \text{ProyectarDiasHabiles}(\text{fechaOperacion}, 1)$$

3. **Sin Días de Retención (DRI = 0 o nulo) y Cuota Conocida (sin VCD):**
   - Si el instrumento **NO** tiene días de retención y tampoco tiene atributo de cuota desconocida, la operación se liquida en el mismo día (**$T+0$**):
   $$\text{FechaLiquidacion} = \text{fechaOperacion.Date}$$

De esta manera, las inversiones respetan los plazos exigidos por el fondo según la naturaleza de su cuota y sus días de retención.

## 4. Control de Bloqueo Fuera de Horario (Parámetros del Sistema)

Aunque la lógica permite trasladar las fechas al día hábil siguiente cuando el mercado está cerrado, esto está condicionado estrictamente por parámetros del sistema (\sis_parametro\). Estos parámetros dictan si el negocio permite ingresar órdenes diferidas o si simplemente se debe bloquear la operación hasta que el mercado vuelva a abrir.

Se validan los siguientes parámetros según la pantalla:
- **Inversión (Aporte):** \VALIDA_HORARIO_INVERSION\
- **Rescate:** \VALIDA_HORARIO_RESCATE\
- **Rescate con Reinversión:** \VALIDA_HORARIO_INSTRUMENTO\

### Comportamiento según el valor del parámetro:

1. **Parámetro Activo ('S' o ausente):** 
   - El sistema **bloquea** estrictamente la operación si el mercado se encuentra cerrado.
   - En la interfaz, la alerta se muestra en color rojo (\error\) con el texto: *"Cerrado - Fuera de horario"*.
   - No se permite avanzar con el formulario (botón Generar deshabilitado o bloqueado por validación).

2. **Parámetro Inactivo ('N'):** 
   - El sistema **permite diferir** la orden. La fecha de operación pasará al siguiente día hábil (y por ende la de liquidación se adaptará como fue explicado en los puntos anteriores).
   - En la interfaz, la alerta se muestra en color amarillo/naranja (\moderate / warning\) con el texto: *"Cerrado - La operación pasará al siguiente día hábil"*.
   - Se permite continuar y generar la orden con normalidad.

Esta flexibilidad permite activar o desactivar el bloqueo por horario en caliente desde la base de datos sin necesidad de redesplegar el código, adaptando instantáneamente las validaciones visuales y de persistencia.
