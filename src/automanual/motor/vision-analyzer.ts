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
  urlPantalla?: string;
  capturaFileName?: string;
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
    const envModel =
      process.env.GEMINI_MODELO || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
      this.apiKey = apiKey || null;
      this.explicitApiKey = Boolean(apiKey);
    }
    if (model !== undefined) {
      this.model = model || this.model;
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
    indicacionIa?: string;
    casosExistentes?: Array<{ codigo?: string; titulo: string }>;
    screenshotPath?: string;
    screenshotPaths?: string[];
    capturasConUrl?: Array<{ fileName: string; caption: string; url?: string }>;
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

      const instruccionFeedback = opciones.indicacionIa?.trim()
        ? `\nMENSAJE / ENFOQUE PRIORITARIO DEL QA PARA ESTA EJECUCIÓN:\n"${opciones.indicacionIa.trim()}"\nCéntrate específicamente en identificar, analizar y generar casos de prueba para lo que el QA indicó en este mensaje.\n`
        : '';

      const siguientesCodigo = `CP-${String((opciones.casosExistentes?.length || 0) + 1).padStart(2, '0')}`;
      const instruccionExistentes =
        opciones.casosExistentes && opciones.casosExistentes.length > 0
          ? `\nCASOS DE PRUEBA YA GUARDADOS EN BASE DE DATOS (NO REPETIR):\n${opciones.casosExistentes
              .map((c) => `- [${c.codigo || 'CP'}] ${c.titulo}`)
              .join('\n')}\nREGLA ESTRICTA: NO vuelvas a generar ninguno de los casos anteriores ni duplicados. Genera ÚNICAMENTE casos NUEVOS que falten para complementar la cobertura, continuando la numeración desde ${siguientesCodigo}.\n`
          : '';

      const mapaCapturasTexto =
        opciones.capturasConUrl && opciones.capturasConUrl.length > 0
          ? `\nCAPTURAS Y URLS DETECTADAS POR PLAYWRIGHT (en orden):\n${opciones.capturasConUrl
              .slice(0, 6)
              .map(
                (c, i) =>
                  `- Imagen ${i + 1} (${c.fileName}): "${c.caption}" | URL: ${c.url || opciones.route}`,
              )
              .join('\n')}\n`
          : '';

      const promptCasos = `Actúa como un Ingeniero QA Senior especializado en pruebas automatizadas E2E con Playwright.
Analiza la pantalla "${opciones.sectionTitle}" (ruta: "${opciones.route}") del módulo "${opciones.moduleTitle}" en la aplicación "${opciones.appName}".
${instruccionFuncional}${instruccionFeedback}${instruccionExistentes}${mapaCapturasTexto}
Elementos detectados en la interfaz:
Campos de entrada:
${camposTexto}

Botones y acciones:
${accionesTexto}

INSTRUCCIONES:
Genera entre 2 y 5 casos de prueba automatizados para validar exhaustivamente las vistas y sub-URLs capturadas respetando cualquier directiva obligatoria anterior.
Cada caso debe indicar exactamente en "urlPantalla" la URL de la captura correspondiente y en "capturaFileName" el nombre de archivo de esa captura.
Cada caso de prueba debe tener una secuencia ordenada de pasos ejecutables por Playwright ('navegar', 'escribir', 'clic', 'seleccionar', 'esperar_visible').

RESPONDE ÚNICAMENTE CON UN ARREGLO JSON VÁLIDO CON ESTA ESTRUCTURA (sin bloques markdown ni explicaciones):
[
  {
    "codigo": "CP-01",
    "titulo": "Carga inicial y visibilidad de componentes",
    "urlPantalla": "${opciones.capturasConUrl?.[0]?.url || opciones.route}",
    "capturaFileName": "${opciones.capturasConUrl?.[0]?.fileName || ''}",
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

      const rutasImagenes = (
        opciones.screenshotPaths && opciones.screenshotPaths.length > 0
          ? opciones.screenshotPaths
          : opciones.screenshotPath
            ? [opciones.screenshotPath]
            : []
      ).slice(0, 6);

      for (const rutaImg of rutasImagenes) {
        if (rutaImg && (await fs.pathExists(rutaImg))) {
          const buffer = await fs.readFile(rutaImg);
          partesContenido.push({
            inlineData: {
              mimeType: 'image/png',
              data: buffer.toString('base64'),
            },
          });
        }
      }

      partesContenido.push({ text: promptCasos });

      const modeloActivo = this.model || 'gemini-2.5-flash';
      const colaModelos = Array.from(
        new Set([modeloActivo, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']),
      );

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
          const parsed = JSON.parse(texto);
          const casos: CasoPruebaGeneradoIa[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.casos)
              ? parsed.casos
              : Array.isArray(parsed?.testCases)
                ? parsed.testCases
                : [];

          if (casos.length > 0) {
            console.log(pc.green(`  ✔ ${casos.length} casos de prueba generados con IA (${mod}) para ${opciones.sectionTitle}`));
            return casos;
          }
          console.log(pc.yellow(`  ⚠ ${mod} devolvió una respuesta vacía o sin casos válidos.`));
        } catch (err: any) {
          console.log(pc.yellow(`  ⚠ Fallo al generar casos con ${mod}: ${err.message}`));
        }
      }

      return [];
    } catch (err: any) {
      console.log(pc.red(`  ✖ Error general en generación de casos de prueba con IA: ${err.message}`));
      return [];
    }
  }

  /**
   * Analiza una captura completa cuando un caso de prueba falla durante su re-ejecución con Playwright.
   */
  public async analizarFalloPrueba(opciones: {
    tituloCaso: string;
    errorTecnico: string;
    screenshotPath: string;
  }): Promise<string | null> {
    this.sincronizarEntorno();
    if (!this.estaDisponible() || !(await fs.pathExists(opciones.screenshotPath))) {
      return null;
    }

    try {
      const buffer = await fs.readFile(opciones.screenshotPath);
      const response = await this.ai!.models.generateContent({
        model: this.model || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: buffer.toString('base64'),
                },
              },
              {
                text: `Actúa como QA Senior. El caso de prueba "${opciones.tituloCaso}" falló en Playwright con el error: "${opciones.errorTecnico}".
Observando la captura completa de la pantalla en el momento del fallo, explica en máximo 2 líneas claras qué se ve en la pantalla y por qué pudo fallar (ej. sesión expirada, modal abierto, texto distinto, botón oculto).`,
              },
            ],
          },
        ],
        config: { temperature: 0.2 },
      });

      return (response.text || '').trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Planifica acciones concretas de Playwright para llegar a la sección/módulo/modal
   * que el QA indicó que faltó en la pantalla actual.
   */
  public async planificarAccionesParaIndicacion(opciones: {
    screenshotPath: string;
    indicacionIa: string;
    elementosVisibles: Array<{ etiqueta: string; selector?: string; tipo: string }>;
  }): Promise<
    Array<{
      accion: 'clic' | 'escribir' | 'esperar_tiempo';
      selector?: string;
      textoVisible?: string;
      valor?: string;
      descripcion: string;
    }>
  > {
    this.sincronizarEntorno();
    if (!this.estaDisponible() || !(await fs.pathExists(opciones.screenshotPath))) {
      return [];
    }

    try {
      const buffer = await fs.readFile(opciones.screenshotPath);
      const listaElementos = opciones.elementosVisibles
        .slice(0, 60)
        .map((e) => `- [${e.tipo}] "${e.etiqueta}"${e.selector ? ` (selector: ${e.selector})` : ''}`)
        .join('\n');

      const prompt = `Actúa como Ingeniero QA automatizando con Playwright.
El QA indicó lo siguiente que faltó probar o mostrar en la pantalla:
"${opciones.indicacionIa}"

Observando la captura completa actual y los elementos interactivos detectados en el DOM:
${listaElementos || '(Sin elementos detectados)'}

Indica los pasos mínimos necesarios para navegar/abrir/mostrar esa parte que faltó (por ejemplo hacer clic en un botón, menú, pestaña o enlace).
Si ya está visible en la captura actual y no se requiere ningún clic previo, devuelve [].

RESPONDE ÚNICAMENTE CON UN ARREGLO JSON VÁLIDO:
[
  {
    "accion": "clic",
    "textoVisible": "Texto exacto visible del botón o menú",
    "selector": "selector CSS opcional si es claro",
    "descripcion": "Abrir el módulo o sección solicitada"
  }
]`;

      const response = await this.ai!.models.generateContent({
        model: this.model || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: buffer.toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const texto = (response.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(texto);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
      console.log(pc.yellow(`  ⚠ No se pudieron planificar acciones previas con IA: ${err.message}`));
      return [];
    }
  }

  /**
   * Analiza en tiempo real la captura actual de Playwright y los elementos visibles del DOM
   * para encontrar de forma genérica el elemento real cuando un selector técnico falla.
   */
  public async resolverPasoConVision(opciones: {
    screenshotPath: string;
    tituloCaso?: string;
    urlActual?: string;
    textoPantalla?: string;
    accion: string;
    descripcion: string;
    selectorIntentado?: string;
    valor?: string;
    elementosEnVivo: Array<{ tag: string; texto: string; selector: string; role?: string }>;
  }): Promise<{
    encontrado: boolean;
    selector?: string;
    textoVisible?: string;
    motivoBloqueo?: string;
  }> {
    this.sincronizarEntorno();
    if (!this.estaDisponible() || !(await fs.pathExists(opciones.screenshotPath))) {
      return { encontrado: false };
    }

    try {
      const buffer = await fs.readFile(opciones.screenshotPath);
      const lista = opciones.elementosEnVivo
        .slice(0, 80)
        .map((e) => `- <${e.tag}${e.role ? ` role="${e.role}"` : ''}> texto="${e.texto}" | selector="${e.selector}"`)
        .join('\n');

      const prompt = `Actúa como QA Senior observando Playwright en vivo.
Caso de prueba en ejecución: "${opciones.tituloCaso || ''}"
URL actual del navegador: "${opciones.urlActual || ''}"
Textos visibles principales en pantalla:
${(opciones.textoPantalla || '').slice(0, 1200) || '(No extraídos)'}

Paso automatizado cuyo selector técnico falló:
- Acción: "${opciones.accion}"
- Descripción del paso: "${opciones.descripcion}"
- Selector que falló: "${opciones.selectorIntentado || 'ninguno'}"
- Valor a usar: "${opciones.valor || ''}"

Elementos interactivos visibles detectados actualmente en la pantalla:
${lista || '(No se detectaron elementos interactivos)'}

Observa la captura completa de la pantalla y la lista real de elementos:
1. Si el elemento que busca el paso SÍ está en pantalla (por ejemplo es un mat-select, un div/button[role="combobox"], un menú o tiene un texto/selector distinto al que falló), indica "encontrado": true y devuelve el "selector" exacto de la lista o su "textoVisible" exacto.
2. Si la pantalla muestra que ese elemento definitivamente NO está disponible (por ejemplo, hay un modal de login bloqueando o estamos en otra pantalla), indica "encontrado": false y explica brevemente en "motivoBloqueo".

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO:
{
  "encontrado": true,
  "selector": "selector CSS exacto si aplica",
  "textoVisible": "texto visible exacto si aplica",
  "motivoBloqueo": ""
}`;

      const response = await this.ai!.models.generateContent({
        model: this.model || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: buffer.toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const texto = (response.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(texto);
      return {
        encontrado: Boolean(parsed?.encontrado),
        selector: parsed?.selector || undefined,
        textoVisible: parsed?.textoVisible || undefined,
        motivoBloqueo: parsed?.motivoBloqueo || undefined,
      };
    } catch {
      return { encontrado: false };
    }
  }
}
