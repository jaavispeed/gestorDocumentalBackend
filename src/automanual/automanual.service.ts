import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as path from 'path';
import fs from 'fs-extra';
import { obtenerRutasAutomanual } from './motor/rutas.js';
import { ConfiguracionCliente } from './motor/tipos.js';
import { ComandanteDocumentacion } from './motor/comandante-documentacion.js';
import { MotorPlantillas } from './motor/template-engine.js';
import { generarCssTema } from './motor/theme.js';
import { AnalizadorVision } from './motor/vision-analyzer.js';
import {
  cargarConfiguracionPromptSincrono,
  guardarConfiguracionPrompt,
  obtenerTemperaturaEfectiva,
  PROMPT_VISION_PREDETERMINADO,
  VARIABLES_PROMPT_VISION,
} from './motor/config-sistema.js';
import { OpcionesGeneracionDto } from './dto/ejecutar-generacion.dto.js';
import { GuardarConfigSistemaDto } from './dto/config-sistema.dto.js';
import { ProbarIaDto } from './dto/probar-ia.dto.js';

export interface ResumenCliente {
  id: string;
  name: string;
  appUrl: string;
  theme: any;
  hasSession: boolean;
  hasManual: boolean;
}

@Injectable()
export class AutomanualService {
  private rutas = obtenerRutasAutomanual();
  private comandante = new ComandanteDocumentacion();
  private motorPlantillas = new MotorPlantillas();

  private estaGenerando = false;
  private logsActuales: string[] = [];

  constructor() {
    void this.asegurarDirectorioClientes();
  }

  private async asegurarDirectorioClientes(): Promise<void> {
    await fs.ensureDir(this.rutas.directorioClientes);
    await fs.ensureDir(this.rutas.directorioDocs);
  }

  public async obtenerClientes(): Promise<ResumenCliente[]> {
    await this.asegurarDirectorioClientes();
    const entradas = await fs.readdir(this.rutas.directorioClientes, { withFileTypes: true });
    const clientes: ResumenCliente[] = [];

    for (const entrada of entradas) {
      if (entrada.isDirectory() && !entrada.name.startsWith('_')) {
        const rutaConfig = path.join(this.rutas.directorioClientes, entrada.name, 'config.json');
        const rutaSesion = path.join(this.rutas.directorioClientes, entrada.name, 'session.json');
        const rutaManual = path.join(this.rutas.directorioDocs, entrada.name, 'index.html');

        if (await fs.pathExists(rutaConfig)) {
          try {
            const config = await fs.readJson(rutaConfig);
            clientes.push({
              id: entrada.name,
              name: config.name || entrada.name,
              appUrl: config.appUrl,
              theme: config.theme,
              hasSession: await fs.pathExists(rutaSesion),
              hasManual: await fs.pathExists(rutaManual),
            });
          } catch {}
        }
      }
    }

    return clientes;
  }

  private normalizarConfiguracion(config: any): ConfiguracionCliente {
    if (!config) return config;
    if (Array.isArray(config.modules)) {
      config.modules = config.modules.map((mod: any) => {
        const nombreModulo = mod.name || mod.title || mod.id || 'Módulo';
        return {
          ...mod,
          name: nombreModulo,
          title: nombreModulo,
          sections: Array.isArray(mod.sections)
            ? mod.sections.map((sec: any) => {
                const nombreSec = sec.name || sec.title || sec.id || 'Pantalla';
                return {
                  ...sec,
                  name: nombreSec,
                  title: nombreSec,
                };
              })
            : [],
        };
      });
    }
    return config;
  }

  public async obtenerCliente(id: string): Promise<ConfiguracionCliente> {
    const rutaConfig = path.join(this.rutas.directorioClientes, id, 'config.json');
    if (!(await fs.pathExists(rutaConfig))) {
      throw new NotFoundException(`Cliente "${id}" no encontrado`);
    }

    const config = await fs.readJson(rutaConfig);
    const normalizado = this.normalizarConfiguracion(config);
    const rutaSesion = path.join(this.rutas.directorioClientes, id, 'session.json');
    const rutaManual = path.join(this.rutas.directorioDocs, id, 'index.html');

    return {
      ...normalizado,
      hasSession: await fs.pathExists(rutaSesion),
      hasManual: await fs.pathExists(rutaManual),
    };
  }

  public async guardarCliente(config: any): Promise<{ success: boolean; client: ConfiguracionCliente }> {
    if (!config.id || !config.name || !config.appUrl) {
      throw new BadRequestException('Faltan campos obligatorios (id, name, appUrl)');
    }

    const normalizado = this.normalizarConfiguracion(config);
    const rutaCliente = path.join(this.rutas.directorioClientes, config.id);
    await fs.ensureDir(rutaCliente);
    await fs.writeJson(path.join(rutaCliente, 'config.json'), normalizado, { spaces: 2 });

    const logoPredeterminado = path.join(this.rutas.directorioClientes, '_default', 'default-logo.svg');
    const logoDestino = path.join(rutaCliente, 'default-logo.svg');
    if (!(await fs.pathExists(logoDestino)) && (await fs.pathExists(logoPredeterminado))) {
      await fs.copy(logoPredeterminado, logoDestino);
    }

    return { success: true, client: normalizado };
  }

  public async eliminarCliente(id: string): Promise<{ success: boolean; message: string }> {
    const rutaCliente = path.join(this.rutas.directorioClientes, id);
    if (!(await fs.pathExists(rutaCliente))) {
      throw new NotFoundException(`Cliente "${id}" no existe`);
    }
    await fs.remove(rutaCliente);

    const rutaDocs = path.join(this.rutas.directorioDocs, id);
    if (await fs.pathExists(rutaDocs)) {
      await fs.remove(rutaDocs);
    }

    return { success: true, message: `Cliente "${id}" eliminado correctamente` };
  }

  public async obtenerFlujoLogo(id: string) {
    const rutaCliente = path.join(this.rutas.directorioClientes, id);
    const rutaConfig = path.join(rutaCliente, 'config.json');
    let rutaLogo = path.join(this.rutas.directorioClientes, '_default', 'default-logo.svg');

    if (await fs.pathExists(rutaConfig)) {
      const config = await fs.readJson(rutaConfig);
      if (config.theme?.logoPath) {
        const candidato = path.join(rutaCliente, path.basename(config.theme.logoPath));
        if (await fs.pathExists(candidato)) {
          rutaLogo = candidato;
        }
      }
    }

    const ext = path.extname(rutaLogo).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    return {
      stream: fs.createReadStream(rutaLogo),
      contentType,
      path: rutaLogo,
    };
  }

  public async guardarLogo(id: string, base64: string, fileName: string) {
    if (!base64 || !fileName) {
      throw new BadRequestException('Faltan datos de la imagen (base64, fileName)');
    }

    const rutaCliente = path.join(this.rutas.directorioClientes, id);
    const rutaConfig = path.join(rutaCliente, 'config.json');
    if (!(await fs.pathExists(rutaConfig))) {
      throw new NotFoundException(`Cliente "${id}" no encontrado`);
    }

    const config = await fs.readJson(rutaConfig);
    const prevLogo = config.theme?.logoPath || 'default-logo.svg';

    const ext = path.extname(fileName).toLowerCase() || '.png';
    const cleanFileName = `logo${ext}`;
    const targetFile = path.join(rutaCliente, cleanFileName);

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(targetFile, buffer);

    config.theme = config.theme || {
      primaryColor: '#0071e3',
      secondaryColor: '#1d1d1f',
      fontFamily: 'sans-serif',
      logoPath: cleanFileName,
    };
    config.theme.logoPath = cleanFileName;
    await fs.writeJson(rutaConfig, config, { spaces: 2 });

    const clientDocsDir = path.join(this.rutas.directorioDocs, id);
    const clientAssetsDir = path.join(clientDocsDir, 'assets');
    if (await fs.pathExists(clientAssetsDir)) {
      await fs.copy(targetFile, path.join(clientAssetsDir, cleanFileName));

      const newHomeHtml = this.motorPlantillas.generarPortada(config, 0);
      await fs.writeFile(path.join(clientDocsDir, 'index.html'), newHomeHtml, 'utf-8');

      const themeCss = generarCssTema(config.theme);
      await fs.writeFile(path.join(clientAssetsDir, 'theme.css'), themeCss, 'utf-8');

      const actualizarHtmls = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await actualizarHtmls(fullPath);
          } else if (entry.isFile() && entry.name === 'index.html' && dir !== clientDocsDir) {
            let content = await fs.readFile(fullPath, 'utf-8');
            const prevBase = path.basename(prevLogo);
            content = content.replace(new RegExp(`assets/${prevBase}`, 'g'), `assets/${cleanFileName}`);
            content = content.replace(/assets\/default-logo\.svg/g, `assets/${cleanFileName}`);
            await fs.writeFile(fullPath, content, 'utf-8');
          }
        }
      };

      await actualizarHtmls(clientDocsDir);
    }

    return {
      success: true,
      logoPath: cleanFileName,
      logoUrl: `/api/automanual/clientes/${id}/logo?t=${Date.now()}`,
    };
  }

  public async iniciarLogin(clienteId: string) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso en ejecución.');
    }

    this.estaGenerando = true;
    this.logsActuales = [`Iniciando ventana de Playwright para el cliente "${clienteId}"...`];

    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.logsActuales.push(texto);
    };

    void (async () => {
      try {
        await this.comandante.iniciarSesionCliente(clienteId);
        this.logsActuales.push('✔ Proceso de login finalizado.');
      } catch (err: any) {
        this.logsActuales.push(`✖ Error al abrir Playwright: ${err.message}`);
      } finally {
        console.log = originalLog;
        this.estaGenerando = false;
      }
    })();

    return { success: true, message: 'Ventana de Playwright abierta en pantalla.' };
  }

  public async descubrirRutas(clienteId: string) {
    this.logsActuales = [`Iniciando auto-descubrimiento para "${clienteId}"...`];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.logsActuales.push(texto);
    };

    try {
      const configActualizada = await this.comandante.descubrirRutasCliente(clienteId);
      this.logsActuales.push(
        `✔ Auto-descubrimiento completado: ${configActualizada.modules?.length || 0} módulos encontrados.`,
      );
      return { success: true, modules: configActualizada.modules };
    } catch (err: any) {
      this.logsActuales.push(`✖ Error en auto-descubrimiento: ${err.message}`);
      throw err;
    } finally {
      console.log = originalLog;
    }
  }

  public async iniciarGeneracion(clienteId: string, opciones: OpcionesGeneracionDto) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso de generación o login en curso.');
    }

    this.estaGenerando = true;
    this.logsActuales = [`Iniciando generación para ${clienteId}...`];

    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.logsActuales.push(texto);
    };

    void (async () => {
      try {
        const esCompleto = opciones.moduleId || opciones.sectionId ? false : opciones.all !== false;

        await this.comandante.ejecutarGeneracion({
          client: clienteId,
          all: esCompleto,
          section: opciones.sectionId,
          module: opciones.moduleId,
          headless: opciones.visibleBrowser === false,
        });

        this.logsActuales.push('✔ ¡Manual generado con éxito!');
      } catch (err: any) {
        this.logsActuales.push(`✖ Error en generación: ${err.message}`);
      } finally {
        console.log = originalLog;
        this.estaGenerando = false;
      }
    })();

    return { success: true, message: 'Generación iniciada.' };
  }

  public obtenerEstadoGeneracion() {
    return {
      isGenerating: this.estaGenerando,
      logs: this.logsActuales,
    };
  }

  public async obtenerConfiguracionSistema() {
    const clientes = await this.obtenerClientes();
    const promptConfig = cargarConfiguracionPromptSincrono();
    const apiKey = process.env.GEMINI_API_KEY || '';
    const hasApiKey = Boolean(apiKey && apiKey.length > 5);

    const apiKeyMasked = hasApiKey
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
      : '';

    return {
      system: {
        version: '2.0.0-gestor',
        nodeVersion: process.version,
        platform: process.platform,
        totalClients: clientes.length,
        docsPath: this.rutas.directorioDocs,
      },
      ai: {
        hasApiKey,
        apiKeyMasked,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        temperature: obtenerTemperaturaEfectiva(),
        visionPrompt: promptConfig.visionPrompt,
        defaultVisionPrompt: PROMPT_VISION_PREDETERMINADO,
        promptVariables: VARIABLES_PROMPT_VISION,
      },
      availableModels: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recomendado)', description: 'Rápido, multimodal y de alta precisión.' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Ultra-rápido para análisis ágil.' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Modelo multimodal estable.' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Máxima profundidad de análisis y razonamiento.' },
      ],
    };
  }

  public async guardarConfiguracionSistema(dto: GuardarConfigSistemaDto) {
    if (dto.ai.apiKey) {
      process.env.GEMINI_API_KEY = dto.ai.apiKey;
    }
    if (dto.ai.model) {
      process.env.GEMINI_MODEL = dto.ai.model;
    }
    if (dto.ai.temperature !== undefined) {
      process.env.GEMINI_TEMPERATURE = String(dto.ai.temperature);
    }
    if (dto.ai.visionPrompt !== undefined) {
      await guardarConfiguracionPrompt(dto.ai.visionPrompt);
    }

    return { success: true, message: 'Configuración de Gemini AI actualizada.' };
  }

  public async obtenerModelos(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    const modelosPorDefecto = [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recomendado)', description: 'Rápido, multimodal y de alta precisión.' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Ultra-rápido para análisis ágil.' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Modelo multimodal estable.' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Máxima profundidad de análisis y razonamiento.' },
    ];

    if (!key) {
      return { models: modelosPorDefecto, fromGoogle: false };
    }

    return { models: modelosPorDefecto, fromGoogle: true };
  }

  public async probarConexionIa(dto: ProbarIaDto) {
    return AnalizadorVision.probarConexion(dto.apiKey, dto.model);
  }
}
