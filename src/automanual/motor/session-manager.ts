import { chromium, Page } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import { ConfiguracionAutenticacion } from './tipos.js';

export class GestorSesionPlaywright {
  public obtenerRutaSesion(directorioCliente: string): string {
    return path.join(directorioCliente, 'session.json');
  }

  public tieneSesion(directorioCliente: string): boolean {
    return fs.existsSync(this.obtenerRutaSesion(directorioCliente));
  }

  public async iniciarSesionYContinuar(
    urlApp: string,
    directorioCliente: string,
    configAuth?: ConfiguracionAutenticacion,
  ): Promise<string> {
    await fs.ensureDir(directorioCliente);
    const rutaSesion = this.obtenerRutaSesion(directorioCliente);

    console.log(`\nIniciando sesión con Playwright para: ${urlApp}`);
    console.log('Lanzando navegador Chromium visible en pantalla...');

    let browser;
    try {
      browser = await chromium.launch({
        headless: false,
        args: [
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
        ],
      });
    } catch (launchErr: any) {
      console.error(`Error al lanzar Chromium: ${launchErr.message}`);
      throw launchErr;
    }

    const context = await browser.newContext({
      viewport: null,
    });

    const page = await context.newPage();

    page.on('close', async () => {
      try {
        const cookies = await context.cookies();
        if (cookies && cookies.length > 0) {
          await context.storageState({ path: rutaSesion });
          console.log(`Sesión y cookies capturadas antes del cierre.`);
        }
      } catch {}
    });

    try {
      console.log(`Navegando a ${urlApp}...`);
      await page.goto(urlApp, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.bringToFront();
      await page.waitForTimeout(1500);
    } catch (navErr: any) {
      console.error(`No se pudo acceder a la URL "${urlApp}": ${navErr.message}`);
      await page.waitForTimeout(6000).catch(() => {});
      await browser.close().catch(() => {});
      throw new Error(`Error de conexión con ${urlApp}: ${navErr.message}`);
    }

    const ssoSelector =
      configAuth?.ssoTriggerSelector ||
      "button:has-text('Iniciar Sesión'), button:has-text('Iniciar sesión segura'), [data-login-sso]";
    const ssoBtn = page.locator(ssoSelector).first();
    if (await ssoBtn.isVisible().catch(() => false)) {
      console.log('Detectado botón de acceso inicial. Avanzando a formulario...');
      await ssoBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    if (configAuth?.username && configAuth?.password) {
      console.log('Rellenando credenciales configuradas para este cliente...');
      await this.rellenarCredenciales(page, configAuth);
    } else {
      console.log('Ingresa tus credenciales en la ventana abierta de Chromium.');
    }

    let targetHost = 'localhost';
    try {
      targetHost = new URL(urlApp).hostname;
    } catch {}

    const initialUrl = page.url();
    const loginExitoso = await this.esperarFinLogin(
      page,
      targetHost,
      initialUrl,
      180000,
      rutaSesion,
      context,
    );

    if (loginExitoso) {
      console.log('¡Inicio de sesión detectado exitosamente!');
      await page.waitForTimeout(3000);
      try {
        await context.storageState({ path: rutaSesion });
        console.log(`Sesión guardada en ${path.basename(rutaSesion)}`);
      } catch {}
    } else {
      try {
        await context.storageState({ path: rutaSesion });
      } catch {}
    }

    await browser.close().catch(() => {});
    return rutaSesion;
  }

  private async rellenarCredenciales(
    page: Page,
    auth: ConfiguracionAutenticacion,
  ): Promise<void> {
    try {
      const userSel =
        auth.userSelector ||
        "input[name*='User' i], input[type='email'], input[name*='user' i], input[name*='email' i], input[type='text']:not([type='password'])";
      const passSel = auth.passwordSelector || "input[name*='Pass' i], input[type='password']";

      const userField = page.locator(userSel).first();
      await userField.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

      if (await userField.isVisible().catch(() => false)) {
        await userField.fill(auth.username!);
        console.log('  ✔ Usuario ingresado');
      }

      const passField = page.locator(passSel).first();
      if (await passField.isVisible().catch(() => false)) {
        await passField.fill(auth.password!);
        console.log('  ✔ Contraseña ingresada');
      }

      await page.waitForTimeout(500);

      const btnSel =
        auth.submitSelector ||
        "button[type='submit'], button:has-text('Ingresar'), button:has-text('Iniciar'), button:has-text('Login'), input[type='submit']";
      const submitBtn = page.locator(btnSel).first();
      if (await submitBtn.isVisible().catch(() => false)) {
        console.log('  ✔ Clic en botón de envío');
        await submitBtn.click().catch(() => {});
      }
    } catch (err: any) {
      console.warn(`Aviso en auto-completado de credenciales: ${err.message}`);
    }
  }

  private async esperarFinLogin(
    page: Page,
    targetHost: string,
    initialUrl: string,
    maxWaitMs: number,
    rutaSesion: string,
    context: any,
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        if (page.isClosed()) {
          return false;
        }

        const currentUrl = page.url();
        const currentHost = new URL(currentUrl).hostname;

        const isBackOnMainHost = currentHost.includes(targetHost) || targetHost.includes(currentHost);
        const passInputsCount = await page.locator("input[type='password']").count().catch(() => 0);
        const isLoginPath = /login|signin|sign-in|auth\/account/i.test(currentUrl);

        if (isBackOnMainHost && passInputsCount === 0 && !isLoginPath && currentUrl !== initialUrl) {
          await context.storageState({ path: rutaSesion }).catch(() => {});
          return true;
        }

        if (currentUrl.includes('/callback') && passInputsCount === 0) {
          await context.storageState({ path: rutaSesion }).catch(() => {});
          return true;
        }
      } catch {}

      await new Promise((r) => setTimeout(r, 800));
    }

    return false;
  }
}
