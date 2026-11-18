import path from 'path';
import fs from 'fs-extra';
import { obtenerRutasAutomanual } from './rutas.js';

export interface InfoVariablePrompt {
  token: string;
  label: string;
  description: string;
}

export const VARIABLES_PROMPT_VISION: InfoVariablePrompt[] = [
  { token: '{{appName}}', label: 'Sistema / Cliente', description: 'Nombre de la aplicación o cliente' },
  { token: '{{moduleTitle}}', label: 'Módulo', description: 'Nombre del módulo padre' },
  { token: '{{sectionTitle}}', label: 'Pantalla', description: 'Título de la pantalla capturada' },
  { token: '{{fields}}', label: 'Campos DOM', description: 'Campos y filtros detectados automáticamente' },
  { token: '{{actions}}', label: 'Acciones DOM', description: 'Botones y acciones visibles en pantalla' },
];

export const PROMPT_VISION_PREDETERMINADO = `Eres un redactor técnico experto en documentación de software y experiencia de usuario.
Analiza con atención la captura de pantalla adjunta de la sección "{{sectionTitle}}" perteneciente al módulo "{{moduleTitle}}" del sistema "{{appName}}".

Contexto detectado automáticamente en pantalla:
- Campos y filtros visibles: {{fields}}
- Botones y acciones visibles: {{actions}}

Instrucciones de análisis:
1. Redacta en español claro, directo y sin jerga técnica ni código, pensado para el usuario final.
2. Describe únicamente lo que realmente aparece en la imagen o en el contexto detectado (no inventes botones, campos ni columnas inexistentes).
3. En "purpose", explica en 2 a 3 líneas el objetivo práctico de negocio de esta pantalla.
4. En "howToUse", resume en un párrafo claro cómo operar la pantalla de inicio a fin.
5. En "stepByStep", redacta entre 3 y 5 pasos numerados (según la complejidad real de la vista) que guíen al usuario de principio a fin.
6. En "visualElements", describe las tablas, columnas clave, tarjetas de indicadores (KPI), gráficos, paneles o filtros visibles en la captura y para qué sirven.
7. En "alerts", enumera validaciones, campos obligatorios, estados de alerta o advertencias visibles en pantalla que el usuario deba tener en cuenta.
8. En "tips", aporta de 1 a 3 consejos prácticos de uso diario basados en la interfaz observada.`;

export interface ConfigPromptSistema {
  visionPrompt: string;
}

export function obtenerRutaArchivoConfigSistema(): string {
  const rutas = obtenerRutasAutomanual();
  return path.join(rutas.directorioRaiz, 'datos', 'automanual', 'config', 'system.json');
}

export function cargarConfiguracionPromptSincrono(): ConfigPromptSistema {
  const rutaArchivo = obtenerRutaArchivoConfigSistema();
  try {
    if (fs.existsSync(rutaArchivo)) {
      const data = fs.readJsonSync(rutaArchivo);
      const promptGuardado = typeof data?.ai?.visionPrompt === 'string' ? data.ai.visionPrompt.trim() : '';
      return {
        visionPrompt: promptGuardado || PROMPT_VISION_PREDETERMINADO,
      };
    }
  } catch {}
  return { visionPrompt: PROMPT_VISION_PREDETERMINADO };
}

export async function guardarConfiguracionPrompt(
  promptVision: string,
): Promise<ConfigPromptSistema> {
  const rutaArchivo = obtenerRutaArchivoConfigSistema();
  await fs.ensureDir(path.dirname(rutaArchivo));

  let existente: Record<string, any> = {};
  if (await fs.pathExists(rutaArchivo)) {
    try {
      existente = await fs.readJson(rutaArchivo);
    } catch {
      existente = {};
    }
  }

  const promptEfectivo = promptVision.trim() || PROMPT_VISION_PREDETERMINADO;
  existente.ai = {
    ...existente.ai,
    visionPrompt: promptEfectivo,
  };
  existente.updatedAt = new Date().toISOString();

  await fs.writeJson(rutaArchivo, existente, { spaces: 2 });
  return { visionPrompt: promptEfectivo };
}

export function obtenerTemperaturaEfectiva(): number {
  const raw = process.env.GEMINI_TEMPERATURE;
  if (raw === undefined || raw === '') return 0.2;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.2;
  return Math.min(1, Math.max(0, parsed));
}
