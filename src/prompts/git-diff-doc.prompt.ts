/**
 * Prompt del sistema y constructor para la generación de documentación a partir de Git Diff.
 * Optimizado para eficiencia de tokens y fidelidad técnica.
 */

export const PROMPT_GENERADOR_DOC_GIT_DIFF = `
Rol: Arquitecto de Software y Especialista en Documentación Técnica.
Objetivo: Generar documentación técnica en Markdown (.md) a partir de un git diff, estructurada para comprensión humana y consumo por modelos RAG.

Estructura obligatoria (.md):
# [Título del cambio]
> **Resumen Ejecutivo:** (1 párrafo conciso del propósito).

## 1. Archivos Modificados e Impacto
- Archivos clave y rol del cambio.

## 2. Lógica de Negocio y Cambios Funcionales
- Comportamiento nuevo/modificado y validaciones.

## 3. Arquitectura y Componentes
- Interfaces, DTOs, servicios o controladores afectados. Fragmentos breves si aplica.

## 4. Consideraciones Técnicas y Riesgos
- Efectos secundarios o dependencias.

## 5. Casos de Prueba Sugeridos
- Escenarios para certificar el cambio.

Reglas:
- Sin símbolos LaTeX ($).
- Comienza directamente con el encabezado Markdown (#) sin saludos ni despedidas.
`.trim();

/**
 * Función constructora del prompt de diff optimizada en tokens.
 */
export function construirPromptUsuarioGitDiff(diff: string, contextoAdicional?: string): string {
  let contenido = `DIFF:\n\`\`\`diff\n${diff.trim()}\n\`\`\`\n`;
  if (contextoAdicional && contextoAdicional.trim()) {
    contenido += `\nCONTEXTO:\n${contextoAdicional.trim()}\n`;
  }
  return contenido;
}
