import { chromium, Browser, Page, Locator } from 'playwright';
import path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import pc from 'picocolors';
import type {
  CasoPruebaAutomanual,
  ResultadoEjecucionQa,
} from '../entities/caso-prueba-automanual.entity.js';
import { AnalizadorVision } from './vision-analyzer.js';
import {
  autenticarEnPagina,
  capturarPaginaCompleta,
  esRutaDeAccesoPublico,
  extraerElementosInteractivosEnVivo,
  intentarLoginEnPaginaActual,
  resolverUrlPantalla,
} from './playwright-utils.js';

export interface ResultadoCasoEjecucion {
  casoId: string;
  codigo?: string;
  titulo: string;
  resultado: ResultadoEjecucionQa;
  detalleFallo?: string;
  screenshotLocalPath?: string;
  duracionMs: number;
}

export class EjecutorCasosPrueba {
  private visionAnalyzer = new AnalizadorVision();

  public async ejecutarCasosDePantalla(opciones: {
    baseUrl: string;
    rutaPantalla: string;
    storageStatePath?: string;
    authConfig?: any;
    casos: CasoPruebaAutomanual[];
    evidenciasDir: string;
    headless?: boolean;
    geminiApiKey?: string;
    geminiModel?: string;
  }): Promise<ResultadoCasoEjecucion[]> {
    this.visionAnalyzer.actualizarConfiguracion(
      opciones.geminiApiKey,
      opciones.geminiModel,
    );
    if (!opciones.casos || opciones.casos.length === 0) {
      return [];
    }

    await fs.ensureDir(opciones.evidenciasDir);
    const resultados: ResultadoCasoEjecucion[] = [];
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({
        headless: opciones.headless !== false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const contextOptions: any = {
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
      };

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      // 1. Autenticación inicial en la URL base del cliente si es necesaria
      const autenticadoEnBase = await autenticarEnPagina(
        page,
        context,
        opciones.baseUrl,
        opciones.authConfig,
      );

      // 2. Navegar a la pantalla objetivo solo si es una ruta de negocio (no regresar a /sign-in o /login si ya autenticamos)
      const rutaLimpia = (opciones.rutaPantalla || '').trim();
      const urlObjetivo = resolverUrlPantalla(opciones.baseUrl, rutaLimpia);
      const esRutaLoginORaiz =
        esRutaDeAccesoPublico(rutaLimpia) ||
        this.normalizarUrlComparacion(urlObjetivo) === this.normalizarUrlComparacion(opciones.baseUrl);

      if (
        !(autenticadoEnBase && esRutaLoginORaiz) &&
        !esRutaLoginORaiz &&
        this.normalizarUrlComparacion(page.url()) !== this.normalizarUrlComparacion(urlObjetivo)
      ) {
        console.log(pc.blue(`  🌐 Navegando a pantalla: ${urlObjetivo}`));
        await page.goto(urlObjetivo, {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);

        // Si al entrar a la ruta directa apareció un formulario de password, autenticarse
        await intentarLoginEnPaginaActual(page, context, opciones.authConfig, false);
      } else {
        console.log(pc.cyan(`  📍 URL activa para pruebas: ${page.url()}`));
        if (!autenticadoEnBase) {
          await intentarLoginEnPaginaActual(page, context, opciones.authConfig, false);
        }
      }

      const urlPostLogin = page.url();
      let necesitaReiniciarRuta = false;

      for (const caso of opciones.casos) {
        const tInicio = Date.now();
        console.log(
          pc.cyan(`  ▶ Ejecutando caso [${caso.codigo || 'QA'}]: ${caso.titulo}`),
        );

        let resultado: ResultadoEjecucionQa = 'PASS';
        let detalleFallo: string | undefined;
        const shotName = `re-run-${caso.id.slice(0, 8)}-${Date.now()}.png`;
        const shotPath = path.join(opciones.evidenciasDir, shotName);

        try {
          const destinoBaseCaso = caso.urlPantalla
            ? resolverUrlPantalla(opciones.baseUrl, caso.urlPantalla)
            : esRutaLoginORaiz
              ? urlPostLogin
              : urlObjetivo;

          const puedeNavegarACaso =
            !(autenticadoEnBase && esRutaDeAccesoPublico(destinoBaseCaso));

          // Navegar si el caso tiene una URL propia distinta de la actual (o si el caso anterior falló)
          if (
            puedeNavegarACaso &&
            (necesitaReiniciarRuta || Boolean(caso.urlPantalla)) &&
            this.normalizarUrlComparacion(page.url()) !== this.normalizarUrlComparacion(destinoBaseCaso)
          ) {
            await page.goto(destinoBaseCaso, {
              waitUntil: 'domcontentloaded',
              timeout: 25000,
            });
            await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
            await intentarLoginEnPaginaActual(
              page,
              context,
              opciones.authConfig,
            );
          }

          const pasos = [...(caso.pasos || [])].sort(
            (a, b) => (a.orden || 0) - (b.orden || 0),
          );

          for (const paso of pasos) {
            await this.ejecutarPaso(page, paso, opciones.baseUrl, destinoBaseCaso, caso.titulo);
          }

          if (caso.resultadoEsperado) {
            await this.verificarAsercion(page, caso.resultadoEsperado, caso.titulo);
          }

          necesitaReiniciarRuta = false;
          await capturarPaginaCompleta(page, shotPath);
          console.log(pc.green(`    ✔ PASS: ${caso.titulo} (${page.url()})`));
        } catch (err: any) {
          resultado = 'FAIL';
          necesitaReiniciarRuta = true;
          const errorTecnico = err?.message || 'Error desconocido durante la ejecución';
          await capturarPaginaCompleta(page, shotPath).catch(() => {});

          const analisisIa = await this.visionAnalyzer.analizarFalloPrueba({
            tituloCaso: caso.titulo,
            errorTecnico,
            screenshotPath: shotPath,
          });

          detalleFallo = analisisIa
            ? `${errorTecnico} | Análisis IA: ${analisisIa}`
            : errorTecnico;

          console.log(pc.red(`    ✖ FAIL: ${caso.titulo} -> ${detalleFallo}`));
        }

        resultados.push({
          casoId: caso.id,
          codigo: caso.codigo,
          titulo: caso.titulo,
          resultado,
          detalleFallo,
          screenshotLocalPath: (await fs.pathExists(shotPath))
            ? shotPath
            : undefined,
          duracionMs: Date.now() - tInicio,
        });
      }

      await context.close();
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return resultados;
  }

  private async ejecutarPaso(
    page: Page,
    paso: any,
    baseUrl: string,
    urlPantalla: string,
    tituloCaso?: string,
  ): Promise<void> {
    const timeout = paso.timeoutMs || 8000;
    const accion = (paso.accion || '').toLowerCase();

    switch (accion) {
      case 'navegar': {
        const valorRaw = (paso.valor || '').trim();
        const destino = valorRaw
          ? resolverUrlPantalla(baseUrl, valorRaw)
          : urlPantalla;
        const vuelveAPuertaLogin =
          esRutaDeAccesoPublico(destino) &&
          !esRutaDeAccesoPublico(page.url());

        if (
          !vuelveAPuertaLogin &&
          this.normalizarUrlComparacion(page.url()) !== this.normalizarUrlComparacion(destino)
        ) {
          await page.goto(destino, { waitUntil: 'domcontentloaded', timeout });
          await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        }
        break;
      }
      case 'esperar_visible': {
        const el = await this.localizarConRespaldoIa(page, paso, tituloCaso);
        await el.waitFor({ state: 'visible', timeout });
        break;
      }
      case 'esperar_tiempo': {
        const ms = Number(paso.valor) || 1000;
        await page.waitForTimeout(ms);
        break;
      }
      case 'clic': {
        const el = await this.localizarConRespaldoIa(page, paso, tituloCaso);
        await el.waitFor({ state: 'visible', timeout });
        await el.click();
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        break;
      }
      case 'escribir': {
        const el = await this.localizarConRespaldoIa(page, paso, tituloCaso);
        await el.waitFor({ state: 'visible', timeout });
        await el.fill(paso.valor ?? '');
        break;
      }
      case 'seleccionar': {
        const el = await this.localizarConRespaldoIa(page, paso, tituloCaso);
        await el.waitFor({ state: 'visible', timeout });
        const tag = await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => '');
        if (tag === 'select') {
          await el.selectOption(paso.valor ?? '');
        } else {
          // Soporte genérico para dropdowns no nativos (mat-select, role="combobox", etc.)
          await el.click();
          if (paso.valor) {
            await page.waitForTimeout(400);
            const opcion = page
              .locator('[role="option"], mat-option, li, .dropdown-item')
              .filter({ hasText: paso.valor })
              .first();
            if (await opcion.isVisible({ timeout: 3000 }).catch(() => false)) {
              await opcion.click();
            }
          }
        }
        break;
      }
      case 'marcar_checkbox': {
        const el = await this.localizarConRespaldoIa(page, paso, tituloCaso);
        await el.waitFor({ state: 'visible', timeout });
        await el.check();
        break;
      }
      case 'assert_texto': {
        const texto = paso.valor || '';
        if (texto) {
          await page
            .getByText(texto, { exact: false })
            .first()
            .waitFor({ state: 'visible', timeout });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Intenta localizar un elemento por su selector técnico y, si falla, analiza la pantalla
   * en vivo con Gemini Vision + DOM real para encontrar el elemento correcto genéricamente.
   */
  private async localizarConRespaldoIa(
    page: Page,
    paso: any,
    tituloCaso?: string,
  ): Promise<Locator> {
    const selector = (paso.selector || '').trim();
    if (selector) {
      const locDirecto = page.locator(selector).first();
      if (await locDirecto.isVisible({ timeout: 2500 }).catch(() => false)) {
        return locDirecto;
      }
    }

    // Si falló el selector técnico, consultar a la IA viendo la pantalla actual de Playwright
    const tmpShot = path.join(os.tmpdir(), `resolve-${Date.now()}.png`);
    try {
      await capturarPaginaCompleta(page, tmpShot).catch(() => {});
      const elementosEnVivo = await extraerElementosInteractivosEnVivo(page);
      const textoPantalla = await page
        .evaluate(() => (document.body?.innerText || '').trim().slice(0, 1200))
        .catch(() => '');

      const resolucion = await this.visionAnalyzer.resolverPasoConVision({
        screenshotPath: tmpShot,
        tituloCaso,
        urlActual: page.url(),
        textoPantalla,
        accion: paso.accion || 'interactuar',
        descripcion: paso.descripcion || '',
        selectorIntentado: selector,
        valor: paso.valor,
        elementosEnVivo,
      });

      if (resolucion.encontrado) {
        if (resolucion.selector) {
          const locIa = page.locator(resolucion.selector).first();
          if (await locIa.isVisible({ timeout: 2500 }).catch(() => false)) {
            console.log(pc.cyan(`    🤖 IA resolvió elemento en vivo: ${resolucion.selector}`));
            return locIa;
          }
        }
        if (resolucion.textoVisible) {
          const locTxt = page.getByText(resolucion.textoVisible, { exact: false }).first();
          if (await locTxt.isVisible({ timeout: 2500 }).catch(() => false)) {
            console.log(pc.cyan(`    🤖 IA resolvió elemento por texto: "${resolucion.textoVisible}"`));
            return locTxt;
          }
        }
      } else if (resolucion.motivoBloqueo) {
        throw new Error(resolucion.motivoBloqueo);
      }
    } finally {
      await fs.remove(tmpShot).catch(() => {});
    }

    // Fallback final al locator original para que Playwright reporte el timeout estándar
    return page.locator(selector || 'body').first();
  }

  private async verificarAsercion(
    page: Page,
    criterio: {
      tipo?: string;
      selector?: string;
      valorEsperado?: string;
    },
    tituloCaso?: string,
  ): Promise<void> {
    if (!criterio || !criterio.tipo) return;
    switch (criterio.tipo) {
      case 'selector_visible': {
        const el = await this.localizarConRespaldoIa(
          page,
          {
            accion: 'esperar_visible',
            descripcion: 'Verificar elemento principal esperado en pantalla',
            selector: criterio.selector || 'body',
            valor: criterio.valorEsperado,
          },
          tituloCaso,
        );
        await el.waitFor({ state: 'visible', timeout: 8000 });
        break;
      }
      case 'texto_presente': {
        if (criterio.valorEsperado) {
          await page
            .getByText(criterio.valorEsperado, { exact: false })
            .first()
            .waitFor({ state: 'visible', timeout: 8000 });
        }
        break;
      }
      case 'url_contiene': {
        if (criterio.valorEsperado) {
          const urlActual = page.url();
          if (!urlActual.includes(criterio.valorEsperado)) {
            throw new Error(
              `URL actual "${urlActual}" no contiene "${criterio.valorEsperado}"`,
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private normalizarUrlComparacion(url: string): string {
    return (url || '').trim().replace(/\/+$/, '');
  }
}
