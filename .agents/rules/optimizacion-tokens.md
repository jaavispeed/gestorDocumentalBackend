# Regla de Optimización de Tokens en Prompts

Toda directiva, plantilla, constructor o instrucción de sistema para modelos de Inteligencia Artificial en este proyecto DEBE diseñarse bajo el principio de **eficiencia de tokens** sin degradar la precisión funcional ni la calidad de la respuesta.

## Principios Obligatorios de Optimización de Tokens

### 1. Concisión en Instrucciones de Sistema (System Instructions)

- Eliminar la palabrería y la redundancia retórica ("Por favor", "Ten en cuenta", frases de cortesía o explicaciones sobreexplicadas).
- Formular directivas claras, directas e imperativas mediante listas con viñetas concisas.
- Definir restricciones ("reglas negativas") de forma quirúrgica en lugar de repetir prohibiciones en varios párrafos.

### 2. Poda de Contexto RAG y Entradas

- **Límite de historial:** Enviar únicamente los últimos turnos esenciales de conversación (máximo 2 a 3 turnos). No arrastrar historiales extensos innecesarios.
- **Normalización de entradas:** Limpiar espacios en blanco excesivos (`trim()`), líneas vacías consecutivas redundantes o comentarios inútiles en diffs o payloads antes de inyectarlos en el prompt.
- **Contexto selectivo:** Enriquecer con documentación solo lo estrictamente necesario. Si el diff o pregunta es puntual, evitar saturar con documentos ajenos a la consulta.

### 3. Delimitación Estricta de Salida (Output Tokens)

- Configurar siempre `maxOutputTokens` acorde a la tarea (ej: respuestas conversacionales ~1024-2048 tokens; generación de documentos ~3072-4096 tokens).
- Indicar al modelo que **no genere preámbulos ni despedidas** ("Aquí tienes el resultado:", "Espero te sirva"), exigiendo que la respuesta comience directamente con el contenido útil. Esto ahorra tokens de salida (que son los más lentos y costosos).

### 4. Modularidad de Archivos de Prompts

- Cada prompt debe residir en su propio archivo dentro de `src/prompts/<feature>.prompt.ts`.
- Las funciones constructoras (`construirPrompt...`) deben encargarse de sanitizar y compactar la información antes del ensamblado final.
