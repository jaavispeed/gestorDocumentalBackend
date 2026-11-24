import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import type {
  EvidenciaCapturada,
  IAutenticadorWeb,
  IExploradorPantalla,
  OpcionesFlujoQa,
  ResultadoExploracionPantalla,
  ResultadoFlujoQa,
} from './contratos-qa.js';
import { ExploradorInteractivo } from './explorador-interactivo.js';
import { AnalizadorVision } from './vision-analyzer.js';
import {
  autenticarEnPagina,
  capturarPaginaCompleta,
  esRutaDeAccesoPublico,
  extraerElementosInteractivosEnVivo,
  intentarClicPorTexto,
  intentarLoginEnPaginaActual,
  resolverUrlPantalla,
} from './playwright-utils.js';

class AutenticadorPlaywright implements IAutenticadorWeb {
  public async autenticar(
    page: Page,
    context: BrowserContext,
    urlInicioLogin: string,
    authConfig?: any,
  ): Promise<boolean> {
    return autenticarEnPagina(page, context, urlInicioLogin, authConfig);
  }
}

/**
 * Orquestador único y limpio del flujo QA (Principio de Responsabilidad Única - SOLID):
 * 1. Inicia sesión siempre en urlInicioLogin
 * 2. Entra al link de la pantalla objetivo (sin loops hacia login)
 * 3. Interactúa de forma segura con clickeables y detecta cambios de URL
 * 4. Analiza capturas completas con IA y genera casos cada uno con su URL
 */
export class OrquestadorFlujoQa {
  private readonly autenticador: IAutenticadorWeb;
  private readonly explorador: IExploradorPantalla;

  constructor(
    autenticador?: IAutenticadorWeb,
    explorador?: IExploradorPantalla,
  ) {
    this.autenticador = autenticador || new AutenticadorPlaywright();
    this.explorador = explorador || new ExploradorInteractivo();
  }

  public async ejecutar(opciones: OpcionesFlujoQa): Promise<ResultadoFlujoQa> {
    await fs.ensureDir(opciones.directorioCapturas);
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({
        headless: opciones.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      // PASO 1: Siempre iniciar sesión primero en la URL base del cliente
      console.log(pc.cyan(`🔑 [Paso 1/4] Iniciando sesión en: ${opciones.urlInicioLogin}`));
      const autenticadoEnBase = await this.autenticador.autenticar(
        page,
        context,
        opciones.urlInicioLogin,
        opciones.authConfig,
      );

      // PASO 2: Entrar al link de la pantalla objetivo (evitando volver a /login o /sign-in si ya autenticó)
      const urlObjetivo = resolverUrlPantalla(
        opciones.urlInicioLogin,
        opciones.rutaPantalla,
      );
      const esPuertaLogin =
        esRutaDeAccesoPublico(opciones.rutaPantalla) ||
        urlObjetivo.replace(/\/+$/, '') === opciones.urlInicioLogin.trim().replace(/\/+$/, '');

      if (
        !(autenticadoEnBase && esPuertaLogin) &&
        !esPuertaLogin &&
        page.url().replace(/\/+$/, '') !== urlObjetivo.replace(/\/+$/, '')
      ) {
        console.log(pc.blue(`🌐 [Paso 2/4] Entrando a pantalla: ${urlObjetivo}`));
        await page.goto(urlObjetivo, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await intentarLoginEnPaginaActual(page, context, opciones.authConfig, false);
      } else {
        console.log(pc.blue(`🌐 [Paso 2/4] Pantalla activa tras login: ${page.url()}`));
        if (!autenticadoEnBase) {
          await intentarLoginEnPaginaActual(page, context, opciones.authConfig, false);
        }
      }

      const analizador = new AnalizadorVision(
        opciones.geminiApiKey,
        opciones.geminiModel,
      );

      // PASO 3: Explorar clickeables seguros + detectar cambios de URL
      console.log(pc.cyan(`🧭 [Paso 3/4] Explorando elementos interactivos y cambios de URL...`));
      const exploracion =
        opciones.modo === 'faltantes' && opciones.indicacionIa?.trim()
          ? await this.explorarModoFaltantes(page, opciones, analizador)
          : await this.explorador.explorar({
              page,
              urlPantalla: page.url(),
              nombrePantalla: opciones.nombrePantalla,
              directorioCapturas: opciones.directorioCapturas,
            });

      // PASO 4: Generar casos de prueba con Gemini Vision asociando cada caso a su URL exacta
      console.log(
        pc.cyan(
          `🤖 [Paso 4/4] Analizando ${exploracion.capturas.length} captura(s) completa(s) con IA...`,
        ),
      );
      const casosGenerados = await analizador.generarCasosPruebaE2E({
        appName: opciones.nombreApp,
        moduleTitle: 'Pantallas QA',
        sectionTitle: opciones.nombrePantalla,
        route: exploracion.urlPrincipal,
        functionalDescription: opciones.descripcionPantalla,
        indicacionIa: opciones.indicacionIa,
        casosExistentes: opciones.casosExistentes,
        screenshotPath: exploracion.capturas[0]?.rutaLocal,
        screenshotPaths: exploracion.capturas.map((c) => c.rutaLocal),
        capturasConUrl: exploracion.capturas.map((c) => ({
          fileName: c.fileName,
          caption: c.caption,
          url: c.url,
        })),
        fields: exploracion.campos.map((c) => ({
          label: c.label,
          meaning: c.meaning || c.label,
          isRequired: false,
          example: '',
        })),
        actions: exploracion.acciones.map((a) => ({
          name: a.name,
          description: a.description || a.name,
        })),
      });

      await context.close();
      return { exploracion, casosGenerados };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  private async explorarModoFaltantes(
    page: Page,
    opciones: OpcionesFlujoQa,
    analizador: AnalizadorVision,
  ): Promise<ResultadoExploracionPantalla> {
    const urlInicial = page.url();
    const initialPath = path.join(
      opciones.directorioCapturas,
      `01-base-${Date.now()}.png`,
    );
    await capturarPaginaCompleta(page, initialPath);

    const elementos = await extraerElementosInteractivosEnVivo(page);
    const acciones = await analizador.planificarAccionesParaIndicacion({
      screenshotPath: initialPath,
      indicacionIa: opciones.indicacionIa || '',
      elementosVisibles: elementos.map((e) => ({
        etiqueta: e.texto || e.selector,
        selector: e.selector,
        tipo: e.tag,
      })),
    });

    let realizoNavegacion = false;
    for (const act of acciones) {
      try {
        if (act.accion === 'clic') {
          let clicado = false;
          if (act.selector) {
            const loc = page.locator(act.selector).first();
            if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) {
              await loc.click();
              clicado = true;
            }
          }
          if (!clicado && act.textoVisible) {
            const locTxt = page.getByText(act.textoVisible, { exact: false }).first();
            if (await locTxt.isVisible({ timeout: 2500 }).catch(() => false)) {
              await locTxt.click();
              clicado = true;
            }
          }
          if (clicado) {
            realizoNavegacion = true;
            await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
            await page.waitForTimeout(1200);
          }
        } else if (act.accion === 'escribir' && act.selector && act.valor !== undefined) {
          await page.locator(act.selector).first().fill(act.valor);
          realizoNavegacion = true;
          await page.waitForTimeout(400);
        }
      } catch {}
    }

    if (!realizoNavegacion && opciones.indicacionIa) {
      const clicadoPorTexto = await intentarClicPorTexto(page, opciones.indicacionIa);
      if (clicadoPorTexto) {
        realizoNavegacion = true;
      }
    }

    const capturas: EvidenciaCapturada[] = [];
    let rutaFinal = initialPath;
    if (realizoNavegacion) {
      rutaFinal = path.join(
        opciones.directorioCapturas,
        `02-enfoque-${Date.now()}.png`,
      );
      await capturarPaginaCompleta(page, rutaFinal);
      await fs.remove(initialPath).catch(() => {});
      capturas.push({
        fileName: path.basename(rutaFinal),
        caption: `${opciones.nombrePantalla} (Enfoque solicitado)`,
        tipo: 'action',
        url: page.url(),
        rutaLocal: rutaFinal,
      });
    } else {
      capturas.push({
        fileName: path.basename(initialPath),
        caption: `${opciones.nombrePantalla} (Vista actual)`,
        tipo: 'main',
        url: urlInicial,
        rutaLocal: initialPath,
      });
    }

    const urlFinal = capturas[0].url;
    const pantallasDetectadas =
      urlFinal.replace(/\/+$/, '') !== urlInicial.replace(/\/+$/, '')
        ? [
            {
              nombre: `${opciones.nombrePantalla} (${(opciones.indicacionIa || '').slice(0, 30)})`,
              ruta: urlFinal,
              disparador: opciones.indicacionIa,
              capturaFileName: capturas[0].fileName,
            },
          ]
        : [];

    return {
      urlPrincipal: urlFinal,
      capturas,
      pantallasDetectadas,
      campos: [],
      acciones: [],
    };
  }
}
