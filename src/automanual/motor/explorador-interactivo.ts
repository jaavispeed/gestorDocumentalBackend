import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import type { Page } from 'playwright';
import type {
  EvidenciaCapturada,
  IExploradorPantalla,
  ResultadoExploracionPantalla,
} from './contratos-qa.js';
import type { PantallaDetectadaPorUrl } from './tipos.js';
import {
  capturarPaginaCompleta,
  esRutaDeAccesoPublico,
} from './playwright-utils.js';

const REGEX_ACCION_PELIGROSA =
  /\b(guardar|grabar|confirmar|eliminar|borrar|quitar|desvincular|anular|rechazar|aprobar|autorizar|enviar|procesar|ejecutar|cierre|transferir|pagar|liquidar|comprar|vender|reversar|cerrar\s+sesi[óo]n|logout|sign\s*out|salir|exportar|descargar|imprimir|delete|trash|remove)\b/i;

const SELECTOR_CLICKEABLES =
  'a[href], button:not([disabled]), [role="button"], [role="tab"], [role="menuitem"], [routerLink], mat-card, .card, div[class*="cursor-pointer"]';

const SELECTOR_DIALOGO =
  "mat-dialog-container, [role='dialog'], .modal.show, .p-dialog, gpi-modal, .ant-modal-content";

/**
 * Control estricto anti-loop: evita visitar dos veces la misma URL o el mismo elemento.
 */
export class RegistroAntiLoop {
  private readonly urlsVisitadas = new Set<string>();
  private readonly elementosClickeados = new Set<string>();

  constructor(urlInicial: string) {
    this.marcarUrlVisitada(urlInicial);
  }

  public normalizarUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname.replace(/\/+$/, '')}${u.hash}`.toLowerCase();
    } catch {
      return (url || '').trim().replace(/\/+$/, '').toLowerCase();
    }
  }

  public yaVisitoUrl(url: string): boolean {
    return this.urlsVisitadas.has(this.normalizarUrl(url));
  }

  public marcarUrlVisitada(url: string): void {
    this.urlsVisitadas.add(this.normalizarUrl(url));
  }

  public yaClickeo(firma: string): boolean {
    return this.elementosClickeados.has(firma.toLowerCase());
  }

  public marcarClickeado(firma: string): void {
    this.elementosClickeados.add(firma.toLowerCase());
  }
}

/**
 * Explorador interactivo con responsabilidad única:
 * entra a la pantalla actual, recorre clickeables seguros sin caer en loops,
 * captura modales y cambios de URL registrando cada link exacto.
 */
export class ExploradorInteractivo implements IExploradorPantalla {
  public async explorar(opciones: {
    page: Page;
    urlPantalla: string;
    nombrePantalla: string;
    directorioCapturas: string;
    maxInteracciones?: number;
  }): Promise<ResultadoExploracionPantalla> {
    const { page, urlPantalla, nombrePantalla, directorioCapturas } = opciones;
    const maxInteracciones = opciones.maxInteracciones ?? 12;

    await fs.ensureDir(directorioCapturas);

    const capturas: EvidenciaCapturada[] = [];
    const pantallasDetectadas: PantallaDetectadaPorUrl[] = [];
    const antiLoop = new RegistroAntiLoop(urlPantalla);
    const originApp = this.obtenerOriginSeguro(urlPantalla);
    let contadorShots = 1;

    const siguienteNombre = (etiqueta: string): string => {
      const idx = String(contadorShots++).padStart(2, '0');
      return `${idx}-${slugificar(etiqueta)}.png`;
    };

    // 1. Captura completa inicial de la pantalla actual
    const shotInicialName = siguienteNombre('vista-principal');
    const shotInicialPath = path.join(directorioCapturas, shotInicialName);
    await capturarPaginaCompleta(page, shotInicialPath);
    const urlPrincipal = page.url();
    antiLoop.marcarUrlVisitada(urlPrincipal);

    capturas.push({
      fileName: shotInicialName,
      caption: `${nombrePantalla} (Vista Principal)`,
      tipo: 'main',
      url: urlPrincipal,
      rutaLocal: shotInicialPath,
    });

    const contextoDom = await this.extraerResumenDom(page);

    // 2. Descubrir elementos clickeables seguros visibles en la vista principal
    const candidatos = await this.obtenerCandidatosClickeables(page, maxInteracciones);

    for (const item of candidatos) {
      if (capturas.length >= maxInteracciones + 1) break;

      const firma = `${item.tag}|${item.texto}`;
      if (antiLoop.yaClickeo(firma)) continue;
      if (REGEX_ACCION_PELIGROSA.test(item.texto)) continue;

      antiLoop.marcarClickeado(firma);

      try {
        // Asegurar que estamos en la vista base antes de intentar el siguiente clic
        if (antiLoop.normalizarUrl(page.url()) !== antiLoop.normalizarUrl(urlPrincipal)) {
          await this.volverAPantallaPrincipal(page, urlPrincipal);
        }

        const locator = page
          .locator(SELECTOR_CLICKEABLES)
          .filter({ hasText: item.texto })
          .first();

        if (!(await locator.isVisible({ timeout: 1000 }).catch(() => false))) {
          continue;
        }

        const urlAntes = page.url();
        await locator.click({ timeout: 2500 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(800);

        const urlDespues = page.url();
        const originDespues = this.obtenerOriginSeguro(urlDespues);

        // Protección anti-loop y anti-salida de la app
        if (originApp && originDespues && originDespues !== originApp) {
          console.log(pc.gray(`    ↩ Clic en "${item.texto}" salió del dominio. Regresando...`));
          await this.volverAPantallaPrincipal(page, urlPrincipal);
          continue;
        }

        if (
          antiLoop.normalizarUrl(urlDespues) !== antiLoop.normalizarUrl(urlAntes) &&
          !antiLoop.yaVisitoUrl(urlDespues) &&
          !esRutaDeAccesoPublico(urlDespues)
        ) {
          antiLoop.marcarUrlVisitada(urlDespues);
          const shotName = siguienteNombre(`url-${item.texto}`);
          const shotPath = path.join(directorioCapturas, shotName);
          await capturarPaginaCompleta(page, shotPath);

          const tituloSubvista = await this.obtenerTituloActual(page, item.texto);
          console.log(
            pc.cyan(`    🧭 Cambio de URL detectado [${item.texto}] -> ${urlDespues}`),
          );

          capturas.push({
            fileName: shotName,
            caption: `${tituloSubvista} (${item.texto})`,
            tipo: 'subview',
            url: urlDespues,
            rutaLocal: shotPath,
            disparador: item.texto,
          });

          pantallasDetectadas.push({
            nombre: tituloSubvista,
            ruta: urlDespues,
            disparador: item.texto,
            capturaFileName: shotName,
          });

          // Volver a la pantalla principal (profundidad = 1 para nunca entrar en loop)
          await this.volverAPantallaPrincipal(page, urlPrincipal);
        } else {
          // Si no cambió URL, verificar si abrió un modal/diálogo o pestaña nueva
          const dialogoAbierto = await page
            .locator(SELECTOR_DIALOGO)
            .first()
            .isVisible({ timeout: 500 })
            .catch(() => false);

          if (dialogoAbierto) {
            const shotName = siguienteNombre(`modal-${item.texto}`);
            const shotPath = path.join(directorioCapturas, shotName);
            await capturarPaginaCompleta(page, shotPath);

            capturas.push({
              fileName: shotName,
              caption: `Modal / Interacción: ${item.texto}`,
              tipo: 'modal',
              url: page.url(),
              rutaLocal: shotPath,
              disparador: item.texto,
            });

            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(400);
          }
        }
      } catch {
        // Si falló el clic puntual, continuar de forma resiliente
      }
    }

    return {
      urlPrincipal,
      capturas,
      pantallasDetectadas,
      campos: contextoDom.campos,
      acciones: contextoDom.acciones,
    };
  }

  private async volverAPantallaPrincipal(page: Page, urlPrincipal: string): Promise<void> {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (
      page.url().replace(/\/+$/, '').toLowerCase() !==
      urlPrincipal.replace(/\/+$/, '').toLowerCase()
    ) {
      await page.goto(urlPrincipal, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }

  private async obtenerCandidatosClickeables(
    page: Page,
    limite: number,
  ): Promise<Array<{ tag: string; texto: string }>> {
    return page
      .evaluate((sel) => {
        const lista: Array<{ tag: string; texto: string }> = [];
        const vistos = new Set<string>();
        document.querySelectorAll(sel).forEach((el) => {
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const texto = (
            htmlEl.innerText ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            ''
          )
            .trim()
            .replace(/\s+/g, ' ');

          if (!texto || texto.length < 2 || texto.length > 60) return;
          const key = texto.toLowerCase();
          if (vistos.has(key)) return;
          vistos.add(key);

          lista.push({ tag: el.tagName.toLowerCase(), texto });
        });
        return lista.slice(0, limite);
      }, SELECTOR_CLICKEABLES)
      .catch(() => []);
  }

  private async obtenerTituloActual(page: Page, fallback: string): Promise<string> {
    const titulo = await page
      .evaluate(() => {
        const el = document.querySelector('h1, h2, .page-title');
        return (el?.textContent || document.title || '').trim().replace(/\s+/g, ' ');
      })
      .catch(() => fallback);
    return titulo && titulo.length <= 80 ? titulo : fallback;
  }

  private async extraerResumenDom(page: Page): Promise<{
    campos: Array<{ label: string; meaning?: string }>;
    acciones: Array<{ name: string; description?: string }>;
  }> {
    return page
      .evaluate(() => {
        const campos: Array<{ label: string; meaning?: string }> = [];
        const acciones: Array<{ name: string; description?: string }> = [];

        document
          .querySelectorAll('input:not([type="hidden"]), select, mat-select, textarea, [role="combobox"]')
          .forEach((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const label = (
              el.getAttribute('aria-label') ||
              el.getAttribute('placeholder') ||
              el.getAttribute('name') ||
              el.tagName.toLowerCase()
            ).trim();
            if (label) campos.push({ label });
          });

        document
          .querySelectorAll('button:not([disabled]), a[href], [role="button"], [role="tab"]')
          .forEach((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const name = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 60);
            if (name) acciones.push({ name });
          });

        return { campos: campos.slice(0, 30), acciones: acciones.slice(0, 30) };
      })
      .catch(() => ({ campos: [], acciones: [] }));
  }

  private obtenerOriginSeguro(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  }
}

function slugificar(texto: string): string {
  return (
    texto
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .slice(0, 40) || 'captura'
  );
}
