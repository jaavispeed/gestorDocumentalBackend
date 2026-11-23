import path from 'path';
import fs from 'fs-extra';
import { obtenerRutasAutomanual } from './rutas.js';

export interface InfoVariablePrompt {
  token: string;
  label: string;
  description: string;
}

export const VARIABLES_PROMPT_VISION: InfoVariablePrompt[] = [
  {
    token: '{{appName}}',
    label: 'Sistema / Cliente',
    description: 'Nombre de la aplicación o cliente',
  },
  {
    token: '{{moduleTitle}}',
    label: 'Módulo',
    description: 'Nombre del módulo padre',
  },
  {
    token: '{{sectionTitle}}',
    label: 'Pantalla',
    description: 'Título de la pantalla capturada',
  },
  {
    token: '{{fields}}',
    label: 'Campos DOM',
    description: 'Campos y filtros detectados automáticamente',
  },
  {
    token: '{{actions}}',
    label: 'Acciones DOM',
    description: 'Botones y acciones visibles en pantalla',
  },
];

export const PROMPT_VISION_PREDETERMINADO = `Eres un Ingeniero de Calidad de Software (QA Automation) y Documentador Técnico Senior.
Analiza con rigor la captura de pantalla adjunta correspondiente a la pantalla "{{sectionTitle}}" del módulo "{{moduleTitle}}" en el sistema "{{appName}}".

Contexto técnico detectado por Playwright en el DOM:
- Campos de entrada, selects y filtros: {{fields}}
- Botones, disparadores y acciones interactivas: {{actions}}

Directivas obligatorias de análisis y QA:
1. Precisión Absoluta: Describe única y exclusivamente lo visible en la captura y los selectores reales detectados. No inventes elementos inexistentes.
2. Propósito de la Pantalla ("purpose"): Define en 2 líneas el objetivo operativo y de negocio de la pantalla.
3. Operación Funcional ("howToUse"): Explica de forma concisa cómo debe operar el usuario esta vista de principio a fin.
4. Flujo de Prueba E2E ("stepByStep"): Diseña entre 3 y 5 pasos secuenciales y ejecutables que un tester o Playwright deba seguir para validar el funcionamiento de esta vista (ej: 1. Ingresar datos requeridos, 2. Aplicar filtros, 3. Disparar acción principal).
5. Radiografía de Elementos ("visualElements"): Identifica tablas de datos, columnas principales, badges de estado, tarjetas KPI y paneles de navegación indicando su rol funcional.
6. Validaciones y Criterios de Aceptación ("alerts"): Enumera validaciones requeridas, campos obligatorios (*), estados de error posibles y alertas de confirmación esperadas.
7. Buenas Prácticas y Consejos ("tips"): Detalla 2 a 3 recomendaciones prácticas de uso y atajos operativos.

El resultado debe ser un JSON estricto sin bloques markdown adicionales.`;

export interface ConfigPromptSistema {
  visionPrompt: string;
}

export function obtenerRutaArchivoConfigSistema(): string {
  const rutas = obtenerRutasAutomanual();
  return path.join(
    rutas.directorioRaiz,
    'datos',
    'automanual',
    'config',
    'system.json',
  );
}

export function cargarConfiguracionPromptSincrono(): ConfigPromptSistema {
  const rutaArchivo = obtenerRutaArchivoConfigSistema();
  try {
    if (fs.existsSync(rutaArchivo)) {
      const data = fs.readJsonSync(rutaArchivo);
      const promptGuardado =
        typeof data?.ai?.visionPrompt === 'string'
          ? data.ai.visionPrompt.trim()
          : '';
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
