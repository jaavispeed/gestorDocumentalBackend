import { chromium, Browser } from 'playwright';
import fs from 'fs-extra';
import { ModuloCliente, ConfiguracionAutenticacion } from './tipos.js';

export interface OpcionesDescubrimiento {
  appUrl: string;
  initialRoute?: string;
  storageStatePath?: string;
  authConfig?: ConfiguracionAutenticacion;
  headless?: boolean;
}

export class DescubridorNavegacion {
  public async descubrir(opciones: OpcionesDescubrimiento): Promise<ModuloCliente[]> {
    const targetUrl = opciones.initialRoute
      ? new URL(opciones.initialRoute, opciones.appUrl).toString()
      : opciones.appUrl;

    console.log(`Iniciando auto-descubrimiento en vivo en: ${targetUrl}`);

    const browser: Browser = await chromium.launch({
      headless: opciones.headless !== false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const contextOptions: any = {
        viewport: { width: 1440, height: 900 },
      };

      if (opciones.storageStatePath && (await fs.pathExists(opciones.storageStatePath))) {
        contextOptions.storageState = opciones.storageStatePath;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(2000);
      } catch (err: any) {
        console.warn(`Aviso al cargar URL inicial: ${err.message}`);
      }

      const currentUrl = page.url();
      const isLogin =
        /login|signin|sign-in|auth\/account/i.test(currentUrl) ||
        (await page.$("input[type='password']")) !== null;

      if (isLogin && opciones.authConfig?.username && opciones.authConfig?.password) {
        console.log('Sesión requerida detectada. Autenticando para acceder a menús...');

        const ssoSelector =
          opciones.authConfig.ssoTriggerSelector ||
          "button:has-text('Iniciar Sesión'), button:has-text('Iniciar sesión segura'), [data-login-sso]";
        const ssoBtn = page.locator(ssoSelector).first();
        if (await ssoBtn.isVisible().catch(() => false)) {
          await ssoBtn.click().catch(() => {});
          await page.waitForTimeout(2500);
        }

        const userSel =
          opciones.authConfig.userSelector ||
          "input[name*='User' i], input[type='email'], input[name*='user' i], input[type='text']:not([type='password'])";
        const passSel =
          opciones.authConfig.passwordSelector || "input[name*='Pass' i], input[type='password']";

        const userField = page.locator(userSel).first();
        await userField.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        if (await userField.isVisible().catch(() => false)) {
          await userField.fill(opciones.authConfig.username);
        }

        const passField = page.locator(passSel).first();
        if (await passField.isVisible().catch(() => false)) {
          await passField.fill(opciones.authConfig.password);
        }

        await page.waitForTimeout(400);

        const btnSel =
          opciones.authConfig.submitSelector ||
          "button[type='submit'], button:has-text('Ingresar'), button:has-text('Iniciar'), input[type='submit']";
        const submitBtn = page.locator(btnSel).first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click().catch(() => {});
        }

        await page.waitForTimeout(5000);
        if (opciones.storageStatePath) {
          await context.storageState({ path: opciones.storageStatePath }).catch(() => {});
        }
      }

      if (page.url().includes('/auth')) {
        await page.waitForTimeout(3000);
      }

      await page
        .waitForSelector("mat-nav-list, nav, aside, .sidebar, .menu, [role='navigation'], .mat-drawer", {
          timeout: 5000,
        })
        .catch(() => null);

      const menuRaw = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(
            "aside a, .sidebar a, nav a, mat-nav-list a, .menu a, [role='navigation'] a",
          ),
        );

        const simpleLinks = links
          .map((l) => ({
            text: (l.innerText || l.textContent || '').trim().replace(/\s+/g, ' '),
            href: l.href,
          }))
          .filter(
            (l) =>
              l.text.length > 2 &&
              l.href &&
              !l.href.includes('#') &&
              !l.href.includes('javascript:') &&
              !l.href.includes('logout'),
          );

        return { type: 'links', links: simpleLinks };
      });

      function slugificar(t: string): string {
        return t
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-');
      }

      const modulosFinales: ModuloCliente[] = [];
      const moduloPrincipal: ModuloCliente = {
        id: 'principal',
        name: 'Vistas del Sistema',
        title: 'Vistas del Sistema',
        description: 'Pantallas detectadas en la plataforma.',
        sections: [],
      };

      const rutasVistas = new Set<string>();

      for (const l of menuRaw.links || []) {
        let route = l.href;
        try {
          const u = new URL(l.href, opciones.appUrl);
          route = u.pathname + u.search;
        } catch {}

        if (rutasVistas.has(route)) continue;
        rutasVistas.add(route);

        moduloPrincipal.sections.push({
          id: slugificar(l.text),
          name: l.text,
          title: l.text,
          route,
          menuPath: ['Menú', l.text],
          description: `Pantalla de ${l.text}.`,
        });
      }

      if (moduloPrincipal.sections.length > 0) {
        modulosFinales.push(moduloPrincipal);
      }

      console.log(`Auto-descubrimiento completado: ${modulosFinales.length} módulos detectados.`);
      return modulosFinales;
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
