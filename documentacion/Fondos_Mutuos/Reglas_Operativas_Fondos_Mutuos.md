# Normativa Operativa: Fondos Mutuos

**Guía de Negocio: Modalidades de Ingreso, Estados y Fechas de Liquidación**

---

## 1. Reglas Transversales de Operación

- **Estado Inicial de las Órdenes:**  
  Todas las operaciones de Fondos Mutuos ingresan al sistema en estado **Pendiente**. Esto se debe a que son transacciones no bursátiles que requieren un proceso de confirmación y asignación posterior antes de considerarse vigentes.
- **Configuración Dinámica por Instrumento:**  
  Aspectos operativos clave como los **horarios de apertura y cierre de mercado**, la condición de **valor cuota desconocido** y los **días de retención** están definidos como **atributos configurables propios de cada instrumento**. Esto permite que cada fondo opere según sus propias características comerciales y normativas sin alterar las reglas globales del sistema.

---

## 2. Operatoria de Fondos Mutuos

### A. Inversión (Aporte)
El cliente o ejecutivo ingresa siempre por **Monto de Dinero**. La cantidad de cuotas se calcula automáticamente al precio oficial del fondo.

- **Con Días de Retención (T + DRI):** Si el fondo exige días de retención mínimos, liquida en la fecha de operación más los **días hábiles de retención** correspondientes.
- **Sin Retención y Cuota Desconocida (T + 1):** Si el fondo no tiene días de retención pero su valor cuota se calcula al cierre del día siguiente, liquida en el **siguiente día hábil bancario**.
- **Sin Retención y Cuota Conocida (T + 0):** Si el fondo no tiene retención y su valor cuota ya es conocido, la operación liquida en el **mismo día**.

### B. Rescate
Se puede solicitar retirando un **Monto de dinero** o una cantidad de **Cuotas** (o seleccionando **Rescate Total** para liquidar todo el saldo).

- **Liquidación fija (T + 1):** En rescate de Fondos Mutuos **nunca aplican días de retención**. Toda orden de rescate liquida siempre al **siguiente día hábil bancario (T+1)**.
- **Modalidad de Precio / Límite:** Cuando se solicita un rescate por **Cuotas** o un **Rescate Total**, la orden se registra técnicamente como orden fijada por volumen (tipo *Límite / Cuotas*). Si se solicita por **Monto** de dinero, se registra a precio de *Mercado*.

---

## 3. Cuadro Resumen Operativo

| Operación | ¿Cómo se ingresa? | Tipo de Precio | Fecha de Liquidación |
| :--- | :--- | :--- | :--- |
| **Fondo Mutuo - Inversión** | Por Monto | Mercado | T + Retención \| T + 1 (Cuota Desconocida) \| T + 0 |
| **Fondo Mutuo - Rescate** | Monto, Cuotas o **Rescate Total** | **Límite** (por Cuotas o Rescate Total) / **Mercado** (por Monto) | **T + 1 hábil** (Siempre) |

> **Operación Fuera de Horario:**  
> Si una orden se ingresa con el mercado cerrado y las políticas del sistema permiten diferirla, la fecha de operación se traslada automáticamente al siguiente día hábil, y a partir de esa nueva fecha se calculan los días de liquidación.
