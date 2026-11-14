# Condiciones de Liquidación (Plazos Bursátiles)

> Guía rápida para entender cuándo se hace efectivo el intercambio de dinero y valores en una operación financiera.

---

## 💡 ¿Qué es y para qué sirve?

Cuando realizas una compra o venta de instrumentos financieros, la operación no siempre se liquida en el mismo instante. La **Condición de Liquidación** es el acuerdo que define la fecha exacta en que:

- **El comprador entrega el dinero** y recibe sus títulos o cuotas.
- **El vendedor entrega los títulos** y recibe su dinero disponible en cuenta.

> [!IMPORTANT]
> Todos los plazos se calculan estrictamente en **días hábiles bancarios**, descontando fines de semana y feriados oficiales.

---

## ⏱️ Términos y Plazos del Mercado

| Modalidad          |  Sigla   |          Plazo           | ¿Cómo funciona para el usuario?                                                                                                                                       |
| :----------------- | :------: | :----------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contado Normal** | **`CN`** | **$T + 2$ días hábiles** | **Modalidad estándar del mercado.** Si operas un lunes, el dinero y los títulos se liquidan efectivamente el miércoles. Es la opción más común y con mayor liquidez.  |
| **Pago Mañana**    | **`PM`** |  **$T + 1$ día hábil**   | **Liquidación acelerada.** Si operas un lunes, la operación se liquida el martes al cierre bancario.                                                                  |
| **Pago Hoy**       | **`PH`** | **$T + 0$ (Mismo día)**  | **Liquidación inmediata.** El cargo o abono de dinero y la custodia se ejecutan durante la misma jornada. Requiere contar con los fondos o títulos libres en el acto. |

---

## 📅 Ejemplo Práctico de Calendario

Si realizas una operación el **jueves a las 11:00 AM**:

- Con **`PH` (Pago Hoy):** Se liquida el mismo **jueves**.
- Con **`PM` (Pago Mañana):** Se liquida el **viernes**.
- Con **`CN` (Contado Normal):** Salta el fin de semana y se liquida el **lunes siguiente** ($T+2$ días hábiles).

---

## 🔧 Referencia Técnica Rápida

- **Parámetro frontend / API:** `formaLiq` (`"CN"`, `"PM"`, `"PH"`).
- **Protocolo Bursátil:** Tag FIX `SettlType`.
- **Persistencia:** Columna `FormaLiq` y `FechaLiquidacion` en la tabla `Orden`.
