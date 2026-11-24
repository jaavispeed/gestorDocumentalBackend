import { chromium, Browser } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import {
  ConfiguracionAutoExploracion,
  CapturaPantalla,
  PantallaDetectadaPorUrl,
  SeccionCliente,
} from './tipos.js';
import { InspectorDom, InspeccionPaginaEnVivo } from './dom-inspector.js';
import { AutoExplorer } from './auto-explorer.js';
import {
  autenticarEnPagina,
  capturarPaginaCompleta,
  esRutaDeAccesoPublico,
  intentarClicPorTexto,
  intentarLoginEnPaginaActual,
  resolverUrlPantalla,
} from './playwright-utils.js';

export interface ResultadoRastreo {
  screenshots: CapturaPantalla[];
  liveDom: InspeccionPaginaEnVivo;
  pantallasDetectadas: PantallaDetectadaPorUrl[];
}

export class RastreadorNavegador {
  private browser: Browser | null = null;
  private domInspector: InspectorDom;
  private autoExplorer: AutoExplorer;

  constructor() {
    this.domInspector = new InspectorDom();
    this.autoExplorer = new AutoExplorer(this.domInspector);
  }

  public async iniciar(headless: boolean = true): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  public async cerrar(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  public async capturarSeccion(
    baseUrl: string,
    section: SeccionCliente,
    screenshotsDir: string,
    storageStatePath?: string,
    autoExploreConfig?: boolean | ConfiguracionAutoExploracion,
    authConfig?: any,
  ): Promise<ResultadoRastreo> {
    if (!this.browser) {
      await this.iniciar();
    }

    await fs.ensureDir(screenshotsDir);

    const contextOptions: any = {
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
    };

    const context = await this.browser!.newContext(contextOptions);
    const page = await context.newPage();
    let screenshots: CapturaPantalla[] = [];

    // =========================================================================
    // PASO 1: SIEMPRE IR PRIMERO A LA URL BASE (LOGIN) Y AUTENTICAR SI ES NECESARIO
    // =========================================================================
    console.log(pc.cyan(`\n  🔑 [Paso 1/2] Iniciando en la URL principal: ${baseUrl}`));
    const autenticadoEnBase = await autenticarEnPagina(page, context, baseUrl, authConfig);

    // =========================================================================
    // PASO 2: NAVEGAR DIRECTAMENTE A LA RUTA DE LA PANTALLA YA AUTENTICADO
    // (Si la ruta es raíz o puerta de login como /sign-in y ya autenticamos, conservar la vista actual)
    // =========================================================================
    const rutaSec = (section.route || '').trim();
    const targetUrl = resolverUrlPantalla(baseUrl, rutaSec);
    const esRutaLoginORaiz =
      esRutaDeAccesoPublico(rutaSec) ||
      targetUrl.replace(/\/+$/, '') === baseUrl.trim().replace(/\/+$/, '');

    if (
      !(autenticadoEnBase && esRutaLoginORaiz) &&
      !esRutaLoginORaiz &&
      page.url().replace(/\/+$/, '') !== targetUrl.replace(/\/+$/, '')
    ) {
      console.log(pc.blue(`  🌐 [Paso 2/2] Navegando ya autenticado a pantalla: ${targetUrl}...`));
      try {
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      } catch (err: any) {
        console.log(
          pc.yellow(`  ⚠ Aviso al cargar ${targetUrl}: ${err.message}`),
        );
      }

      if (section.waitForSelector) {
        await page
          .waitForSelector(section.waitForSelector, { timeout: 6000 })
          .catch(() => {});
      }

      await page.waitForTimeout(1200);

      await intentarLoginEnPaginaActual(page, context, authConfig);
    } else {
      console.log(pc.blue(`  🌐 [Paso 2/2] Pantalla actual tras autenticación: ${page.url()}`));
    }

    // Si la ruta es raíz '/' o similar y el título de la pantalla sugiere otro módulo, intentar abrir por texto
    if (
      (!section.route || section.route === '/' || section.route === baseUrl) &&
      section.title &&
      !/inicio|bienvenida|login|home/i.test(section.title)
    ) {
      const clicado = await intentarClicPorTexto(page, section.title);
      if (clicado) {
        console.log(pc.cyan(`    🧭 Navegación automática por texto hacia "${clicado}"`));
      }
    }

    if (section.menuPath && section.menuPath.length > 0) {
      try {
        const lastMenuLabel = section.menuPath[section.menuPath.length - 1];
        const targetItem = page
          .locator('mat-list-item, a, button, .nav-item')
          .filter({ hasText: lastMenuLabel })
          .first();
        if (!(await targetItem.isVisible({ timeout: 1500 }))) {
          const parentLabel = section.menuPath[0];
          const parentItem = page
            .locator('mat-list-item, button, .menu-header, aside button')
            .filter({ hasText: parentLabel })
            .first();
          if (await parentItem.isVisible({ timeout: 1500 })) {
            await parentItem.click();
            await page.waitForTimeout(600);
          }
        }
        if (await targetItem.isVisible({ timeout: 1500 })) {
          await targetItem.click();
          await page.waitForTimeout(1200);

    await intentarLoginEnPaginaActual(page, context, authConfig);
        }
      } catch {}
    }

    let liveDom = await this.domInspector.inspeccionarPagina(page);

    const mainShotName = `01-vista-principal.png`;
    const mainShotPath = path.join(screenshotsDir, mainShotName);
    await capturarPaginaCompleta(page, mainShotPath);
    const urlPrincipalCapturada = page.url();
    console.log(pc.cyan(`    📍 URL capturada: ${urlPrincipalCapturada}`));
    screenshots.push({
      fileName: mainShotName,
      caption: liveDom.pageTitle || `Vista general: ${section.title}`,
      kind: 'main',
      url: urlPrincipalCapturada,
    });
    console.log(
      pc.green(`    📸 Capturada vista principal -> ${mainShotName}`),
    );

    const effectiveExploreConfig =
      section.autoExplore !== undefined
        ? section.autoExplore
        : autoExploreConfig;

    const explored = await this.autoExplorer.explore({
      page,
      screenshotsDir,
      initialDom: liveDom,
      existingScreenshots: screenshots,
      config: effectiveExploreConfig,
    });
    screenshots = explored.screenshots;
    liveDom = explored.liveDom;
    const pantallasDetectadas = explored.pantallasDetectadas || [];

    if (section.actions && section.actions.length > 0) {
      for (const action of section.actions) {
        try {
          if (action.triggerSelector) {
            console.log(
              pc.cyan(
                `    ⚡ Disparando acción manual: "${action.name}" (${action.triggerSelector})...`,
              ),
            );
            const trigger = page.locator(action.triggerSelector);
            if (await trigger.isVisible({ timeout: 4000 })) {
              await trigger.click();
              await page.waitForTimeout(600);

              if (action.waitForSelector) {
                await page.waitForSelector(action.waitForSelector, {
                  timeout: 4000,
                });
              }

              const nextIndex = String(screenshots.length + 1).padStart(2, '0');
              const shotName = `${nextIndex}-${slugificar(action.name)}.png`;
              const shotPath = path.join(screenshotsDir, shotName);

              if (action.captureSelector) {
                const targetEl = page.locator(action.captureSelector);
                if (await targetEl.isVisible()) {
                  await targetEl.screenshot({ path: shotPath });
                } else {
                  await page.screenshot({ path: shotPath, fullPage: true });
                }
              } else {
                await page.screenshot({ path: shotPath, fullPage: true });
              }

              const modalDom = await this.domInspector.inspeccionarPagina(page);
              liveDom = this.domInspector.fusionarInspecciones(
                liveDom,
                modalDom,
              );

              screenshots.push({
                fileName: shotName,
                caption: action.description || action.name,
                kind: 'action',
              });
              console.log(pc.green(`    📸 Capturada acción -> ${shotName}`));
            }
          }
        } catch {
          console.log(
            pc.yellow(
              `    ⚠ Acción "${action.name}" no encontrada en esta pantalla.`,
            ),
          );
        }
      }
    }

    await context.close();
    return { screenshots, liveDom, pantallasDetectadas };
  }
}

function slugificar(texto: string): string {
  return texto
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}
