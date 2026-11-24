import { Page, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';

/**
 * Indica de forma genérica si una URL o ruta corresponde a una puerta de entrada/login.
 */
export function esRutaDeAccesoPublico(urlORuta?: string): boolean {
  const limpio = (urlORuta || '').trim().toLowerCase();
  if (!limpio || limpio === '/') return true;
  try {
    const pathname = /^https?:\/\//i.test(limpio)
      ? new URL(limpio).pathname.toLowerCase()
      : limpio.split('?')[0].split('#')[0];
    const normalizado = pathname.replace(/\/+$/, '') || '/';
    return (
      normalizado === '/' ||
      /\/(login|sign-in|signin|auth|sso|bienvenida|portal)$/.test(normalizado)
    );
  } catch {
    return false;
  }
}

/**
 * Resuelve la URL destino preservando subpaths o rutas hash (#/) de la app base.
 */
export function resolverUrlPantalla(baseUrl: string, ruta?: string): string {
  const rutaLimpia = (ruta || '').trim();
  if (!rutaLimpia) return baseUrl;
  if (/^https?:\/\//i.test(rutaLimpia)) return rutaLimpia;

  try {
    const base = new URL(baseUrl);
    if (rutaLimpia.startsWith('#')) {
      return `${base.origin}${base.pathname}${rutaLimpia}`;
    }
    if (base.hash && base.hash.startsWith('#/')) {
      const rutaSinSlash = rutaLimpia.startsWith('/') ? rutaLimpia : `/${rutaLimpia}`;
      return `${base.origin}${base.pathname}#${rutaSinSlash}`;
    }
    return new URL(rutaLimpia, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

/**
 * Intenta completar el formulario o modal de login en la página actual usando las credenciales recibidas en el POST.
 */
export async function intentarLoginEnPaginaActual(
  page: Page,
  _context: BrowserContext,
  authConfig?: any,
  permitirSso = false,
  baseUrlOrigen?: string,
): Promise<boolean> {
  if (!authConfig?.username || !authConfig?.password) {
    return false;
  }

  if (permitirSso) {
    const passYaVisible = await page
      .locator("input[type='password']:visible")
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (!passYaVisible) {
      const ssoSelector =
        authConfig?.ssoTriggerSelector ||
        "button:has-text('Iniciar Sesión'), button:has-text('Iniciar sesión'), button:has-text('Ingresar con'), [data-login-sso]";
      const ssoBtn = page.locator(ssoSelector).first();
      if (await ssoBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log(pc.cyan('  → Detectado botón de acceso SSO. Avanzando a login...'));
        await ssoBtn.click().catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
    }
  }

  const passSel =
    authConfig?.passwordSelector ||
    "input[type='password']:visible, input[name*='Pass' i]:visible, input[placeholder*='Contraseña' i]:visible, input[placeholder*='Password' i]:visible";
  const passField = page.locator(passSel).first();
  const hayPasswordVisible = await passField.isVisible({ timeout: 3500 }).catch(() => false);

  if (!hayPasswordVisible) {
    return false;
  }

  console.log(pc.yellow(`  🔐 Login detectado. Ingresando credenciales para "${authConfig.username}"...`));

  const userSel =
    authConfig.userSelector ||
    "input[type='email']:visible, input[name*='User' i]:visible, input[name*='user' i]:visible, input[name*='email' i]:visible, input[name*='rut' i]:visible, input[name*='login' i]:visible, input[placeholder*='Usuario' i]:visible, input[placeholder*='Correo' i]:visible, input[placeholder*='Email' i]:visible, input[type='text']:visible";
  const userField = page.locator(userSel).first();
  if (await userField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await userField.click().catch(() => {});
    await userField.fill(authConfig.username);
  }
  await passField.click().catch(() => {});
  await passField.fill(authConfig.password);
  await page.waitForTimeout(300);

  const btnSel =
    authConfig.submitSelector ||
    "button[type='submit']:visible, button:has-text('Ingresar'):visible, button:has-text('Iniciar sesión'):visible, button:has-text('Iniciar'):visible, button:has-text('Acceder'):visible, button:has-text('Entrar'):visible, button:has-text('Login'):visible, input[type='submit']:visible";
  const submitBtn = page.locator(btnSel).first();
  if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await submitBtn.click().catch(() => {});
  } else {
    await passField.press('Enter').catch(() => {});
  }

  console.log(pc.green('  ✔ Formulario de autenticación enviado. Esperando acceso...'));
  await passField.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

  // Si el login redirigió a un dominio SSO externo o ruta transitoria (/auth, /callback), esperar a que termine la redirección
  if (baseUrlOrigen) {
    await page
      .waitForURL(
        (u) =>
          u.origin === baseUrlOrigen &&
          !u.search.includes('code=') &&
          !/\/(auth|callback|oauth|oidc)\/?$/i.test(u.pathname),
        { timeout: 15000 },
      )
      .catch(() => {});
  }

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  console.log(pc.cyan(`  📍 URL tras login: ${page.url()}`));

  return true;
}

/**
 * Ejecuta el flujo de autenticación en la URL base si hay un formulario de login o botón SSO visible.
 */
export async function autenticarEnPagina(
  page: Page,
  context: BrowserContext,
  baseUrl: string,
  authConfig?: any,
): Promise<boolean> {
  try {
    const baseUrlOrigen = new URL(baseUrl).origin;
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const logueado = await intentarLoginEnPaginaActual(
      page,
      context,
      authConfig,
      true,
      baseUrlOrigen,
    );
    if (!logueado) {
      console.log(pc.green('  ✔ Sesión ya activa o pantalla sin login visible.'));
    }
    return logueado;
  } catch (err: any) {
    console.log(pc.yellow(`  ⚠ Aviso en autenticación previa: ${err.message}`));
    return false;
  }
}

/**
 * Extrae elementos interactivos y textos visibles en vivo para resolución genérica guiada por IA.
 */
export async function extraerElementosInteractivosEnVivo(
  page: Page,
): Promise<Array<{ tag: string; texto: string; selector: string; role?: string }>> {
  return page
    .evaluate(() => {
      const resultado: Array<{ tag: string; texto: string; selector: string; role?: string }> = [];
      const els = document.querySelectorAll(
        'a, button, select, mat-select, ng-select, input, textarea, [role="combobox"], [role="button"], [role="tab"], [role="menuitem"], [role="option"], mat-list-item, .p-dropdown, li',
      );

      els.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const texto = (
          htmlEl.innerText ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          el.getAttribute('formcontrolname') ||
          el.getAttribute('name') ||
          ''
        )
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 100);

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || undefined;
        let selector = tag;
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.getAttribute('data-testid')) {
          selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
        } else if (el.getAttribute('formcontrolname')) {
          selector = `${tag}[formcontrolname="${el.getAttribute('formcontrolname')}"]`;
        } else if (el.getAttribute('name')) {
          selector = `${tag}[name="${el.getAttribute('name')}"]`;
        } else if (el.getAttribute('aria-label')) {
          selector = `${tag}[aria-label="${el.getAttribute('aria-label')}"]`;
        } else if (role) {
          selector = `${tag}[role="${role}"]`;
        }

        if (texto || el.id || role || tag === 'select' || tag === 'mat-select') {
          resultado.push({ tag, texto, selector, role });
        }
      });

      return resultado.slice(0, 80);
    })
    .catch(() => []);
}

/**
 * Toma una captura completa real (fullPage: true) incluso en SPAs con contenedores internos
 * de scroll (ej. h-dvh overflow-hidden + div.overflow-y-auto en Angular/Tailwind).
 */
export async function capturarPaginaCompleta(
  page: Page,
  outputPath: string,
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Expandir temporalmente contenedores internos scrolleables para capturar todo el contenido
  const restaurar = await page.evaluate(() => {
    const modificados: Array<{
      el: HTMLElement;
      height: string;
      maxHeight: string;
      overflow: string;
      overflowY: string;
    }> = [];

    const todos = Array.from(document.querySelectorAll<HTMLElement>('*'));
    for (const el of todos) {
      if (el === document.documentElement || el === document.body) continue;
      const style = window.getComputedStyle(el);
      const esScrolleable =
        (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'hidden') &&
        el.scrollHeight > el.clientHeight + 20 &&
        el.clientHeight > 120;

      if (esScrolleable || (style.height === `${window.innerHeight}px` && style.overflow === 'hidden')) {
        modificados.push({
          el,
          height: el.style.height,
          maxHeight: el.style.maxHeight,
          overflow: el.style.overflow,
          overflowY: el.style.overflowY,
        });
        el.style.height = 'auto';
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
        el.style.overflowY = 'visible';
      }
    }

    if (document.body.style.overflow === 'hidden' || window.getComputedStyle(document.body).overflow === 'hidden') {
      modificados.push({
        el: document.body,
        height: document.body.style.height,
        maxHeight: document.body.style.maxHeight,
        overflow: document.body.style.overflow,
        overflowY: document.body.style.overflowY,
      });
      document.body.style.height = 'auto';
      document.body.style.overflow = 'visible';
    }

    return modificados.length > 0;
  });

  try {
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    if (restaurar) {
      await page.evaluate(() => {
        // Reloading inline styles back is unnecessary if page navigates, but we clean up safely
        document.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
          if (el.style.maxHeight === 'none' && el.style.overflowY === 'visible') {
            el.style.height = '';
            el.style.maxHeight = '';
            el.style.overflow = '';
            el.style.overflowY = '';
          }
        });
      }).catch(() => {});
    }
  }
}

/**
 * Busca elementos interactivos por texto (ideal cuando la ruta sola deja en bienvenida
 * o el QA menciona el nombre de un módulo/botón en texto natural).
 */
export async function intentarClicPorTexto(
  page: Page,
  textoObjetivo: string,
): Promise<string | null> {
  const limpio = (textoObjetivo || '').trim();
  if (!limpio) return null;

  // 1. Intento directo con el texto completo
  const candidatos = [limpio];

  // 2. Extraer frases clave o palabras relevantes si viene en una oración (ej. "faltó mostrar el módulo Comisiones")
  const palabrasIgnoradas = new Set([
    'falto', 'faltó', 'mostrar', 'abrir', 'ver', 'probar', 'ir', 'al', 'a', 'la', 'el',
    'los', 'las', 'de', 'del', 'en', 'un', 'una', 'modulo', 'módulo', 'pantalla',
    'seccion', 'sección', 'boton', 'botón', 'menu', 'menú', 'opcion', 'opción', 'que', 'no', 'se',
  ]);
  const tokens = limpio
    .split(/[\s,.;:!?()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !palabrasIgnoradas.has(t.toLowerCase()));

  for (const tok of tokens) {
    if (!candidatos.includes(tok)) candidatos.push(tok);
  }

  for (const texto of candidatos) {
    const loc = page
      .locator('a, button, [role="button"], [role="tab"], [role="menuitem"], mat-list-item, [routerLink], li, .nav-item')
      .filter({ hasText: texto })
      .first();

    if (await loc.isVisible({ timeout: 1200 }).catch(() => false)) {
      await loc.click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return texto;
    }
  }

  return null;
}
