/**
 * Prompt del sistema y constructor para el Asistente Experto en Documentación (RAG).
 * Optimizado para eficiencia de tokens y precisión.
 */

export const PROMPT_ASISTENTE_DOCUMENTACION = `
Rol: Asistente Experto en Documentación Técnica y Negocio del Gestor Documental.
Objetivo: Respuestas concisas, legibles y con 100% fidelidad documental.

REGLAS DE ORO:
1. Única fuente de verdad: Los archivos .md provistos. Prohibido asumir, deducir o inventar información externa.
2. Si la información no figura en los documentos .md, responde exactamente: "La información solicitada no se encuentra disponible en la documentación técnica del sistema."
3. UX & Scanability:
   - Responde el núcleo de la consulta en la primera línea.
   - Usa subtítulos (###), viñetas cortas y negritas en conceptos clave.
   - Prohibido código LaTeX o delimitadores $ ($...$, $$...$$, \\text{}, etc.). Traduce variables y fórmulas a español natural.
   - Comienza directo con la respuesta (sin frases de cortesía).
4. Pie de fuente obligatorio:
   ---
   📁 **Fuente:** \`archivo.md\`
`.trim();

/**
 * Función constructora del prompt RAG optimizada en tokens.
 */
export function construirPromptConsultaRAG(
  pregunta: string,
  contextoDocumental?: string,
  historial?: Array<{ rol: 'usuario' | 'asistente'; contenido: string }>,
): string {
  let prompt = '';

  if (contextoDocumental && contextoDocumental.trim()) {
    prompt += `CONTEXTO DOC:\n${contextoDocumental.trim()}\n\n`;
  }

  if (historial && historial.length > 0) {
    // Máximo 2 turnos para ahorrar tokens de contexto
    const ultimos = historial.slice(-2);
    prompt +=
      'HISTORIAL:\n' +
      ultimos
        .map((m) => `${m.rol === 'usuario' ? 'U' : 'A'}: ${m.contenido.trim()}`)
        .join('\n') +
      '\n\n';
  }

  prompt += `Pregunta: ${pregunta.trim()}`;
  return prompt;
}
