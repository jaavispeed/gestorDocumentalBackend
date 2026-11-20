# Guía de Cierre: Validaciones del Proceso de Verificación (Verifica)

**Módulo de Cierre y Verificación**  
Manual operativo de las 21 validaciones que ejecuta el sistema antes de iniciar el Cierre Diario o Reproceso de Cuentas, organizadas por severidad para identificar con rapidez qué detiene el cierre y cómo resolverlo.

---

## Resumen de Indicadores

- 🛑 **17 Validaciones Bloqueantes:** Detienen el Cierre Diario hasta su corrección.
- ⚠️ **4 Alertas Operativas:** Advertencias preventivas (informativas; omiten o aíslan cuentas específicas sin detener el cierre global).
- 📊 **Total:** 21 Controles Activos.

---

## 1. Validaciones Bloqueantes (17 Controles)

Detienen el inicio del Cierre Diario hasta su corrección.

### 01. Comisión de Administración (COMISION ADC)

- **Descripción:** Comprueba que el concepto de comisión de administración esté habilitado en el sistema.
- **Impacto:** Requisito indispensable para calcular y cobrar las comisiones de administración de las cuentas.
- **Solución:** Configurar el concepto en _Parámetros > Conceptos de Comisión_.

### 02. Estado Maestro de Comisiones

- **Descripción:** Comprueba que el estado maestro para el ciclo de cobro de comisiones exista en el sistema.
- **Impacto:** Permite registrar y dar seguimiento a las comisiones calculadas y provisionadas.
- **Solución:** Registrar el estado `'Comisiones'` en las tablas maestras de estados.

### 03. Porcentaje de IVA Vigente

- **Descripción:** Revisa que el porcentaje oficial del impuesto IVA esté registrado en los parámetros generales.
- **Impacto:** Asegura el cálculo exacto del impuesto en las comisiones facturadas a los clientes.
- **Solución:** Definir el porcentaje de IVA vigente en _Parámetros del Sistema_.

### 04. Cierre de Cuenta Atrasado (Día Anterior)

- **Descripción:** Verifica que cada cuenta tenga su cierre contable al día anterior (`desde - 1 día`), garantizando la continuidad histórica.
- **Impacto:** Evita saltos en el cálculo del Valor Cuota y distorsiones en la rentabilidad diaria del cliente.
- **Solución:** Ejecutar previamente el cierre de las fechas pendientes de la cuenta.

### 05. Cierres de Bolsa sin Asignar ("Palos")

- **Descripción:** Verifica que los folios de compras/ventas institucionales en bolsa no mantengan saldo de títulos sin asignar.
- **Impacto:** Evita descalces entre la posición institucional en bolsa y las cuentas individuales de clientes.
- **Solución:** Asignar el 100% de los títulos restantes a las cuentas de clientes correspondientes.

### 06. Órdenes de Clientes en Estado Vigente

- **Descripción:** Detecta órdenes de compra o venta que continúan en estado 'Vigente' al final del día sin haberse ejecutado ni cancelado.
- **Impacto:** Garantiza que no queden órdenes abiertas o huérfanas al cerrar la jornada.
- **Solución:** Confirmar la ejecución de la orden o anularla/caducarla si no se concretó en mercado.

### 07. Órdenes Pendientes de Liquidar

- **Descripción:** Identifica órdenes cuya fecha de liquidación comprometida es hoy y aún no han sido liquidadas.
- **Impacto:** Asegura la entrega oportuna de dinero y títulos en las fechas valor pactadas.
- **Solución:** Procesar la liquidación de la orden en el módulo de _Transacciones_.

### 08. Asignaciones de Clientes sin Operación

- **Descripción:** Detecta asignaciones de títulos a clientes que aún no han generado su comprobante de operación contable.
- **Impacto:** Evita que una asignación quede flotando sin actualizar la custodia real del cliente.
- **Solución:** Generar la operación definitiva desde el módulo de _Asignaciones_.

### 09. Aportes y Retiros de Dinero Pendientes

- **Descripción:** Valida que las propuestas de ingreso o retiro de dinero con fecha de liquidación en el período hayan sido aprobadas o liberadas.
- **Impacto:** Evita descuadres entre el saldo disponible de caja del cliente y los bancos de la corredora.
- **Solución:** Aprobar o rechazar las propuestas pendientes en _Tesorería > Aportes y Retiros_.

### 10. Prefacturas de Comisiones sin Facturar

- **Descripción:** Revisa si existen prefacturas de comisiones generadas en la fecha que aún no han sido emitidas como factura legal.
- **Impacto:** Garantiza la facturación oportuna de los ingresos de la corredora y el registro de IVA débito fiscal.
- **Solución:** Emitir la factura legal o anular la prefactura en el módulo de _Facturación_.

### 11. Operaciones de Moneda (Spot) sin DTE

- **Descripción:** Verifica operaciones de compra/venta de divisas (Spot) que aún no cuentan con su Documento Tributario Electrónico emitido.
- **Impacto:** Evita incumplimientos normativos y tributarios ante el Servicio de Impuestos Internos (SII).
- **Solución:** Emitir el DTE correspondiente para la operación Spot en curso.

### 12. Dividendos y Eventos de Capital Pendientes

- **Descripción:** Comprueba que los dividendos en dinero, acciones liberadas (crías) o canjes exigibles hayan sido procesados en las cuentas.
- **Impacto:** Garantiza que los clientes reciban oportunamente sus pagos de dividendos y títulos en custodia.
- **Solución:** Procesar el evento corporativo en el módulo de _Eventos de Capital y Dividendos_.

### 13. Tipos de Cambio de Monedas (TC)

- **Descripción:** Comprueba la existencia del tipo de cambio oficial del día para todas las monedas extranjeras con movimientos o saldos.
- **Impacto:** Imprescindible para convertir correctamente las valorizaciones y carteras multimoneda a pesos.
- **Solución:** Ingresar los tipos de cambio oficiales del día en el _Mantenedor de Tipos de Cambio_.

### 14. Precios de Mercado de la Cartera

- **Descripción:** Revisa que todos los instrumentos y acciones en custodia de clientes cuenten con precio de cierre registrado para el día.
- **Impacto:** Garantiza que el valor de los portafolios y el patrimonio de los clientes sea exacto y fidedigno.
- **Solución:** Cargar o importar los precios de cierre del día en el _Publicador de Precios_.

### 15. Valorización Diaria de Renta Fija

- **Descripción:** Comprueba la existencia del cálculo de valorización diaria para los bonos y papeles de intermediación financiera.
- **Impacto:** Asegura el correcto devengo diario de intereses y el valor presente exacto de la renta fija.
- **Solución:** Ejecutar el proceso de cálculo de valorizaciones de _Renta Fija_.

### 16. Fecha de Vencimiento en Renta Fija

- **Descripción:** Valida que todos los instrumentos de Renta Fija en custodia tengan configurada su fecha de vencimiento.
- **Impacto:** Permite proyectar los flujos futuros de pago de capital y calcular indicadores de TIR y duración.
- **Solución:** Completar la fecha de vencimiento en la ficha del instrumento.

### 17. Cortes de Cupón Pendientes de Renta Fija

- **Descripción:** Detecta pagos de cupones de intereses o amortizaciones que vencen en la fecha y aún no han sido abonados a los clientes.
- **Impacto:** Evita atrasos en el pago de intereses a los clientes que poseen bonos en cartera.
- **Solución:** Procesar el corte de cupón en el módulo de _Eventos de Renta Fija_.

---

## 2. Alertas Operativas (4 Advertencias)

Informativas: omiten o aíslan cuentas específicas sin detener el cierre global.

### 18. Cuenta con Apertura Futura (No Operativa)

- **Descripción:** La fecha de apertura oficial de la cuenta es posterior a la fecha del cierre que se está ejecutando.
- **Impacto:** La cuenta se omite automáticamente del lote de cierre sin interrumpir el proceso de las demás cuentas.
- **Solución:** Informativo. No requiere acción si la apertura de la cuenta es en fecha futura.

### 19. Cuenta Marcada como Cerrada en Mantenedor

- **Descripción:** La cuenta fue marcada administrativamente como cerrada por un operador en el mantenedor de cuentas.
- **Impacto:** La cuenta se omite del cierre y no genera nuevos cálculos ni movimientos contables.
- **Solución:** Confirmar si la cuenta debe permanecer inactiva o reactivarla en el mantenedor si requiere operar.

### 20. Cuenta con Bloqueo Preventivo de Cierre

- **Descripción:** La cuenta posee una casilla de bloqueo preventivo activada en su ficha de mantenedor.
- **Impacto:** La cuenta queda excluida del cierre diario mientras mantenga activo este indicador.
- **Solución:** Desmarcar el bloqueo en la ficha de la cuenta si se desea que sea procesada en el cierre.

### 21. Instrumento sin Clasificar en Árbol de Activos

- **Descripción:** Existen instrumentos en custodia que no están asociados a ninguna categoría o rama del árbol de clasificación.
- **Impacto:** El instrumento se agrupará en categorías genéricas en las cartolas y reportes de clientes.
- **Solución:** Clasificar el nemotécnico en la rama correspondiente dentro del _Árbol de Activos_.
