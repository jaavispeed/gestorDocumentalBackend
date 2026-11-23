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

export interface CasoPruebaGeneradoIa {
  codigo: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  criterioAsercion?: {
    tipo: 'selector_visible' | 'texto_presente' | 'url_contiene';
    selector?: string;
    valorEsperado?: string;
  };
  pasos: Array<{
    orden: number;
    accion: 'navegar' | 'escribir' | 'clic' | 'seleccionar' | 'esperar_visible';
    descripcion: string;
    selector?: string;
    valor?: string;
  }>;
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
  ): Promise<{
    success: boolean;
    model: string;
    message: string;
    latencyMs?: number;
  }> {
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
          : [
              {
                path: opciones.screenshotPath,
                caption: opciones.sectionTitle,
                kind: 'main',
              },
            ];

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
          ? opciones.actions
              .map((a) => `- Botón/Acción: "${a.name}"`)
              .join('\n')
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

      const partesContenido: Array<{
        inlineData?: { mimeType: string; data: string };
        text?: string;
      }> = [];
      for (let idx = 0; idx < capturasSeleccionadas.length; idx++) {
        const shot = capturasSeleccionadas[idx];
        if (await fs.pathExists(shot.path)) {
          const buffer = await fs.readFile(shot.path);
          partesContenido.push({
            text: `[Captura ${idx + 1}: ${shot.caption}]`,
          });
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
      const colaModelos = [
        modeloActivo,
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
      ];

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
          console.warn(
            `  ⚠ Intento con modelo ${modeloActual} no completado: ${err.message}`,
          );
        }
      }

      return null;
    } catch (err: any) {
      console.warn(`  ⚠ Error general en análisis de visión: ${err.message}`);
      return null;
    }
  }

  /**
   * Genera casos de prueba E2E (QA) con Gemini analizando la imagen de la pantalla y los elementos descubiertos en el DOM.
   */
  public async generarCasosPruebaE2E(opciones: {
    appName: string;
    moduleTitle: string;
    sectionTitle: string;
    route: string;
    functionalDescription?: string;
    screenshotPath?: string;
    fields?: CampoFormularioUsuario[];
    actions?: AccionPantallaUsuario[];
    tables?: any[];
  }): Promise<CasoPruebaGeneradoIa[]> {
    this.sincronizarEntorno();
    if (!this.estaDisponible()) {
      return [];
    }

    try {
      const camposTexto =
        opciones.fields && opciones.fields.length > 0
          ? opciones.fields
              .map((f) => `- Campo: "${f.label}" (descripción/significado: ${f.meaning || 'dato de formulario'})`)
              .join('\n')
          : 'No se detectaron campos de entrada.';

      const accionesTexto =
        opciones.actions && opciones.actions.length > 0
          ? opciones.actions
              .map((a) => `- Botón/Acción: "${a.name}" (${a.description || 'acción en pantalla'})`)
              .join('\n')
          : 'No se detectaron botones relevantes.';

      const instruccionFuncional = opciones.functionalDescription?.trim()
        ? `\nDIRECTIVA OBLIGATORIA DEL USUARIO / REGLA DE NEGOCIO:\n"${opciones.functionalDescription}"\nDEBES RESPETAR ESTRICTAMENTE ESTA DIRECTIVA (por ejemplo, si indica "solo capturar textos" o "no probar formularios", genera exclusivamente casos acordes a esa directriz).\n`
        : '';

      const promptCasos = `Actúa como un Ingeniero QA Senior especializado en pruebas automatizadas E2E con Playwright.
Analiza la pantalla "${opciones.sectionTitle}" (ruta: "${opciones.route}") del módulo "${opciones.moduleTitle}" en la aplicación "${opciones.appName}".
${instruccionFuncional}
Elementos detectados en la interfaz:
Campos de entrada:
${camposTexto}

Botones y acciones:
${accionesTexto}

INSTRUCCIONES:
Genera entre 2 y 4 casos de prueba automatizados para validar exhaustivamente esta pantalla respetando cualquier directiva obligatoria anterior.
Cada caso de prueba debe tener una secuencia ordenada de pasos ejecutables por Playwright ('navegar', 'escribir', 'clic', 'seleccionar', 'esperar_visible').

RESPONDE ÚNICAMENTE CON UN ARREGLO JSON VÁLIDO CON ESTA ESTRUCTURA (sin bloques markdown ni explicaciones):
[
  {
    "codigo": "CP-01",
    "titulo": "Carga inicial y visibilidad de componentes",
    "descripcion": "Verifica que la pantalla cargue correctamente y los elementos principales estén visibles.",
    "criterioAsercion": {
      "tipo": "selector_visible",
      "selector": "body"
    },
    "pasos": [
      {
        "orden": 1,
        "accion": "navegar",
        "descripcion": "Navegar a la ruta de la pantalla",
        "valor": "${opciones.route}"
      },
      {
        "orden": 2,
        "accion": "esperar_visible",
        "descripcion": "Esperar a que cargue el contenedor principal",
        "selector": "main"
      }
    ]
  }
]`;

      const partesContenido: Array<{
        inlineData?: { mimeType: string; data: string };
        text?: string;
      }> = [];

      if (opciones.screenshotPath && (await fs.pathExists(opciones.screenshotPath))) {
        const buffer = await fs.readFile(opciones.screenshotPath);
        partesContenido.push({
          inlineData: {
            mimeType: 'image/png',
            data: buffer.toString('base64'),
          },
        });
      }

      partesContenido.push({ text: promptCasos });

      const modeloActivo = this.model || 'gemini-2.5-flash';
      const colaModelos = [modeloActivo, 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

      for (const mod of colaModelos) {
        try {
          const response = await this.ai!.models.generateContent({
            model: mod,
            contents: [{ role: 'user', parts: partesContenido }],
            config: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          });

          const texto = (response.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const casos = JSON.parse(texto) as CasoPruebaGeneradoIa[];
          if (Array.isArray(casos) && casos.length > 0) {
            console.log(pc.green(`  ✔ ${casos.length} casos de prueba generados con IA (${mod}) para ${opciones.sectionTitle}`));
            return casos;
          }
        } catch (err: any) {
          console.warn(`  ⚠ Fallo al generar casos con ${mod}: ${err.message}`);
        }
      }

      return [];
    } catch (err: any) {
      console.warn(`  ⚠ Error general en generación de casos de prueba con IA: ${err.message}`);
      return [];
    }
  }
}
