import fs from 'fs-extra';
import pc from 'picocolors';
import { GoogleGenAI } from '@google/genai';
import {
  InformacionTablaDescubierta,
  TipoCaptura,
  CampoFormularioUsuario,
  AccionPantallaUsuario,
  ElementoVisualPantalla,
} from './tipos.js';
import {
  PROMPT_VISION_PREDETERMINADO,
  obtenerTemperaturaEfectiva,
  cargarConfiguracionPromptSincrono,
} from './config-sistema.js';

export interface EntradaCapturaVision {
  path: string;
  caption: string;
  kind?: TipoCaptura;
  userNote?: string;
}

export interface ResultadoAnalisisVision {
  purpose: string;
  howToUse: string;
  stepByStep?: Array<{
    stepNumber: number;
    title: string;
    description: string;
  }>;
  visualElements?: ElementoVisualPantalla[];
  alerts?: string[];
  tips?: string[];
}

const APENDICE_CONTRATO_JSON = `
FORMATO DE SALIDA OBLIGATORIO (JSON válido, sin texto adicional ni bloques markdown):
{
  "purpose": "Resumen de 2 a 3 líneas del objetivo de negocio de la pantalla",
  "howToUse": "Párrafo claro y práctico explicando cómo usar la pantalla",
  "stepByStep": [
    { "stepNumber": 1, "title": "Título breve del paso", "description": "Acción concreta a realizar" }
  ],
  "visualElements": [
    { "name": "Nombre visible (tabla, columna, KPI, gráfico o filtro)", "type": "Tabla | Columna | Indicador | Filtro | Gráfico | Panel", "description": "Qué muestra y para qué sirve" }
  ],
  "alerts": [
    "Validación, campo obligatorio, restricción o aviso visible en pantalla"
  ],
  "tips": [
    "Consejo práctico para el usuario final basado en la interfaz"
  ]
}`;

export class AnalizadorVision {
  private ai: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private model: string = 'gemini-2.5-flash';
  private explicitApiKey: boolean = false;
  private explicitModel: boolean = false;

  constructor(apiKey?: string, model?: string) {
    if (apiKey) {
      this.apiKey = apiKey;
      this.explicitApiKey = true;
    }
    if (model) {
      this.model = model;
      this.explicitModel = true;
    }
    this.sincronizarEntorno();
  }

  private sincronizarEntorno(): void {
    const envKey = process.env.GEMINI_API_KEY || null;
    const envModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const targetKey = this.explicitApiKey ? this.apiKey : envKey;
    const targetModel = this.explicitModel ? this.model : envModel;

    this.model = targetModel;
    if (targetKey !== this.apiKey || (targetKey && !this.ai)) {
      this.apiKey = targetKey;
      this.ai = targetKey ? new GoogleGenAI({ apiKey: targetKey }) : null;
    } else if (!targetKey) {
      this.ai = null;
    }
  }

  public estaDisponible(): boolean {
    this.sincronizarEntorno();
    return Boolean(this.apiKey && this.ai);
  }

  public obtenerModelo(): string {
    this.sincronizarEntorno();
    return this.model;
  }

  public actualizarConfiguracion(apiKey?: string, model?: string) {
    if (apiKey !== undefined) {
      this.apiKey = apiKey;
      this.explicitApiKey = Boolean(apiKey);
    }
    if (model !== undefined) {
      this.model = model;
      this.explicitModel = Boolean(model);
    }
    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.ai = null;
    }
  }

  public static async probarConexion(
    apiKey?: string,
    model?: string,
  ): Promise<{ success: boolean; model: string; message: string; latencyMs?: number }> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    const targetModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!key) {
      return {
        success: false,
        model: targetModel,
        message: 'No se proporcionó API Key de Gemini.',
      };
    }

    const tInicio = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: 'Responde únicamente con la palabra OK si estás operativo.',
      });
      const latencyMs = Date.now() - tInicio;
      const text = (response.text || '').trim();
      return {
        success: true,
        model: targetModel,
        latencyMs,
        message: `Conexión verificada con ${targetModel} (${latencyMs}ms). Respuesta: "${text || 'OK'}"`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - tInicio;
      return {
        success: false,
        model: targetModel,
        latencyMs,
        message: err.message || 'Error al conectar con la API de Gemini.',
      };
    }
  }

  public async analizarCaptura(opciones: {
    screenshotPath: string;
    screenshots?: EntradaCapturaVision[];
    appName: string;
    moduleTitle: string;
    sectionTitle: string;
    fields?: CampoFormularioUsuario[];
    actions?: AccionPantallaUsuario[];
    tables?: InformacionTablaDescubierta[];
    exploredTabs?: string[];
    customPromptTemplate?: string;
  }): Promise<ResultadoAnalisisVision | null> {
    if (!this.estaDisponible()) return null;

    try {
      const capturasSeleccionadas: EntradaCapturaVision[] =
        opciones.screenshots && opciones.screenshots.length > 0
          ? opciones.screenshots.slice(0, 4)
          : [{ path: opciones.screenshotPath, caption: opciones.sectionTitle, kind: 'main' }];

      const camposTexto =
        opciones.fields && opciones.fields.length > 0
          ? opciones.fields
              .map(
                (f) =>
                  `- ${f.label} (${f.isRequired ? 'Obligatorio' : 'Opcional'}) ${f.options ? `[Opciones: ${f.options.slice(0, 5).join(', ')}]` : ''}`,
              )
              .join('\n')
          : 'No se detectaron campos de formulario directamente.';

      const accionesTexto =
        opciones.actions && opciones.actions.length > 0
          ? opciones.actions.map((a) => `- Botón/Acción: "${a.name}"`).join('\n')
          : 'No se detectaron botones relevantes.';

      const promptPlantilla =
        opciones.customPromptTemplate ||
        cargarConfiguracionPromptSincrono().visionPrompt ||
        PROMPT_VISION_PREDETERMINADO;

      const promptFinal = promptPlantilla
        .replace(/\{\{appName\}\}/g, opciones.appName)
        .replace(/\{\{moduleTitle\}\}/g, opciones.moduleTitle)
        .replace(/\{\{sectionTitle\}\}/g, opciones.sectionTitle)
        .replace(/\{\{fields\}\}/g, camposTexto)
        .replace(/\{\{actions\}\}/g, accionesTexto)
        .concat('\n\n', APENDICE_CONTRATO_JSON);

      const partesContenido: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
      for (let idx = 0; idx < capturasSeleccionadas.length; idx++) {
        const shot = capturasSeleccionadas[idx];
        if (await fs.pathExists(shot.path)) {
          const buffer = await fs.readFile(shot.path);
          partesContenido.push({ text: `[Captura ${idx + 1}: ${shot.caption}]` });
          partesContenido.push({
            inlineData: {
              mimeType: 'image/png',
              data: buffer.toString('base64'),
            },
          });
        }
      }

      partesContenido.push({ text: promptFinal });

      const modeloActivo = this.model || 'gemini-2.5-flash';
      const colaModelos = [modeloActivo, 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

      for (const modeloActual of colaModelos) {
        try {
          const response = await this.ai!.models.generateContent({
            model: modeloActual,
            contents: [{ role: 'user', parts: partesContenido }],
            config: {
              temperature: obtenerTemperaturaEfectiva(),
              responseMimeType: 'application/json',
            },
          });

          const textoRespuesta = response.text || '';
          const jsonLimpio = textoRespuesta
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          const resultado = JSON.parse(jsonLimpio) as ResultadoAnalisisVision;

          console.log(
            pc.green(
              `  ✔ Interpretación por Gemini Vision completada para ${opciones.sectionTitle} (${modeloActual})`,
            ),
          );
          return resultado;
        } catch (err: any) {
          console.warn(`  ⚠ Intento con modelo ${modeloActual} no completado: ${err.message}`);
        }
      }

      return null;
    } catch (err: any) {
      console.warn(`  ⚠ Error general en análisis de visión: ${err.message}`);
      return null;
    }
  }
}
