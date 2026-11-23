import { chromium, Browser } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import {
  ConfiguracionAutoExploracion,
  CapturaPantalla,
  SeccionCliente,
} from './tipos.js';
import { InspectorDom, InspeccionPaginaEnVivo } from './dom-inspector.js';
import { AutoExplorer } from './auto-explorer.js';

export interface ResultadoRastreo {
  screenshots: CapturaPantalla[];
  liveDom: InspeccionPaginaEnVivo;
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

    if (storageStatePath && (await fs.pathExists(storageStatePath))) {
      contextOptions.storageState = storageStatePath;
    }

    const context = await this.browser!.newContext(contextOptions);
    const page = await context.newPage();
    let screenshots: CapturaPantalla[] = [];

    // =========================================================================
    // PASO 1: SIEMPRE IR PRIMERO A LA URL BASE (LOGIN) Y AUTENTICAR SI ES NECESARIO
    // =========================================================================
    console.log(pc.cyan(`\n  🔑 [Paso 1/2] Iniciando en la URL principal: ${baseUrl}`));
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Comprobar si hay botón SSO o campos de login
      const ssoSelector =
        authConfig?.ssoTriggerSelector ||
        "button:has-text('Iniciar Sesión'), button:has-text('Iniciar sesión segura'), [data-login-sso]";
      const ssoBtn = page.locator(ssoSelector).first();
      if (await ssoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(pc.cyan('  → Detectado botón de acceso SSO. Avanzando a login...'));
        await ssoBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }

      const passSel =
        authConfig?.passwordSelector ||
        "input[name*='Pass' i], input[type='password']";
      const passField = page.locator(passSel).first();
      const hayPasswordVisible = await passField.isVisible({ timeout: 2000 }).catch(() => false);

      if (hayPasswordVisible && authConfig?.username && authConfig?.password) {
        console.log(pc.yellow(`  🔐 Ingresando credenciales para "${authConfig.username}"...`));
        
        const userSel =
          authConfig.userSelector ||
          "input[name*='User' i], input[type='email'], input[name*='user' i], input[name*='email' i], input[type='text']:not([type='password'])";
        const userField = page.locator(userSel).first();
        if (await userField.isVisible().catch(() => false)) {
          await userField.fill(authConfig.username);
        }
        await passField.fill(authConfig.password);
        await page.waitForTimeout(500);

        const btnSel =
          authConfig.submitSelector ||
          "button[type='submit'], button:has-text('Ingresar'), button:has-text('Iniciar'), button:has-text('Login'), input[type='submit']";
        const submitBtn = page.locator(btnSel).first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click().catch(() => {});
          console.log(pc.green('  ✔ Formulario de autenticación enviado. Esperando sesión...'));
          await page.waitForTimeout(5000);
        }

        // Guardar la sesión actualizada para no perderla
        if (storageStatePath) {
          await context.storageState({ path: storageStatePath }).catch(() => {});
        }
      } else {
        console.log(pc.green('  ✔ Sesión ya activa o no requiere rellenar login.'));
      }
    } catch (err: any) {
      console.log(pc.yellow(`  ⚠ Aviso en paso inicial de autenticación: ${err.message}`));
    }

    // =========================================================================
    // PASO 2: NAVEGAR DIRECTAMENTE A LA RUTA DE LA PANTALLA YA AUTENTICADO
    // =========================================================================
    const targetUrl = new URL(section.route, baseUrl).toString();
    console.log(pc.blue(`  🌐 [Paso 2/2] Navegando ya autenticado a pantalla: ${targetUrl}...`));

    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
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

    await page.waitForTimeout(2000);

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
          await page.waitForTimeout(1500);
        }
      } catch {}
    }

    let liveDom = await this.domInspector.inspeccionarPagina(page);

    const mainShotName = `01-vista-principal.png`;
    const mainShotPath = path.join(screenshotsDir, mainShotName);
    await page.screenshot({ path: mainShotPath, fullPage: false });
    screenshots.push({
      fileName: mainShotName,
      caption: liveDom.pageTitle || `Vista general: ${section.title}`,
      kind: 'main',
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
                  await page.screenshot({ path: shotPath });
                }
              } else {
                await page.screenshot({ path: shotPath });
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
    return { screenshots, liveDom };
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
