import path from 'path';
import pc from 'picocolors';
import { Page, Route } from 'playwright';
import {
  ConfiguracionAutoExploracion as AutoExploreConfig,
  CapturaPantalla as CapturedScreenshot,
  InformacionTablaDescubierta as DiscoveredTableInfo,
} from './tipos.js';
import {
  InspectorDom as DOMInspector,
  InspeccionPaginaEnVivo as LivePageInspection,
} from './dom-inspector.js';

const IGNORE_CHROME_SELECTOR =
  "header, .top-navbar, .navbar, mat-sidenav, .sidebar, nav, [role='navigation']";

const CONTENT_AREA_SELECTOR =
  "mat-sidenav-content, .mat-drawer-content, [role='main'], main, #main-content, .main-content";

const DANGEROUS_ACTION_REGEX =
  /\b(guardar|grabar|ingresar|registrar|confirmar|crear|nuevo|nueva|agregar|a[ñn]adir|eliminar|borrar|quitar|anular|rechazar|aprobar|autorizar|enviar|procesar|ejecutar|cierre|generar|transferir|pagar|liquidar|comprar|vender|operar|pactar|cerrar\s+sesi[óo]n|logout|sign\s*out|salir|importar|carga\s+masiva|exportar|descargar|imprimir|limpiar|cancelar|volver|reversar|editar|modificar)\b/i;

const SAFE_FILTER_REGEX =
  /^(filtros?|mostrar\s+filtros|ver\s+filtros|filtros?\s+avanzados?|b[úu]squeda\s+avanzada|m[áa]s\s+filtros|ocultar\s+filtros)$/i;

const SAFE_SEARCH_EXACT_REGEX =
  /^(consultar|buscar|filtrar|ver\s+resultados|mostrar\s+resultados|aplicar\s+filtros|aplicar|actualizar\s+consulta|refrescar)$/i;

const SAFE_SEARCH_PREFIX_REGEX =
  /^(consultar|buscar)\s+[a-záéíóúñ0-9\s]{2,25}$/i;

const MUTATING_URL_REGEX =
  /\/(delete|remove|destroy|create|save|insert|update|edit|approve|reject|cancel|anular|eliminar|guardar|grabar|ingresar|confirmar|procesar|cierre|logout|signout|sign-out)\b/i;

// Botones que NUNCA se deben pulsar al explorar subpantallas/modales
const UNSAFE_EXPLORE_BUTTON_REGEX =
  /\b(guardar|grabar|confirmar|eliminar|borrar|quitar|desvincular|desasignar|anular|rechazar|aprobar|autorizar|enviar|procesar|ejecutar|cierre|transferir|pagar|liquidar|comprar|vender|operar|pactar|reversar|desactivar|activar|bloquear|desbloquear|finalizar|cerrar\s+sesi[óo]n|logout|sign\s*out|salir|exportar|descargar|imprimir|limpiar|cancelar|cerrar|volver|atr[áa]s|consultar|buscar|filtrar|aplicar|refrescar|primera\s+p[áa]gina|p[áa]gina\s+anterior|siguiente\s+p[áa]gina|[úu]ltima\s+p[áa]gina|vista\s+de\s+tabla|vista\s+de\s+tarjetas|pdf|excel|csv|delete|trash|remove)\b/i;

// Botones de barra/pantalla/pestaña que abren formularios de creación, asignación, edición, modales o subpantallas seguras (sin guardar)
const SAFE_SUBVIEW_BUTTON_REGEX =
  /^(nuevo|nueva|crear|agregar|a[ñn]adir|asignar|asociar|vincular|ingresar|registrar|alta|dar\s+de\s+alta|incorporar|adjuntar|cargar|subir|ver\s+detalle|detalle|ver\s+m[áa]s|ver\s+historial|historial|ver\s+resumen|ver\s+[a-záéíóúñ]+|configurar|configuraci[óo]n|par[áa]metros|gestionar|administrar|editar|modificar|actualizar|cambiar)(\s+[a-záéíóúñ0-9\/\-\.]+){0,5}$/i;

// Botones de acción dentro de filas de tablas (detalle, ver, editar)
const SAFE_ROW_DETAIL_REGEX =
  /\b(ver\s*detalle|detalle|ver\s+ficha|ficha|ver\s+m[áa]s|ver\s+resumen|resumen|visualizar|consultar\s+detalle|ver|info|visibility|remove_red_eye|open_in_new|preview)\b/i;

const SAFE_ROW_EDIT_REGEX = /\b(editar|modificar|actualizar|edit|mode_edit)\b/i;

const ROW_MENU_TRIGGER_REGEX =
  /\b(more_vert|more_horiz|acciones|opciones|men[úu]|actions)\b/i;

const DIALOG_SELECTOR =
  "mat-dialog-container, [role='dialog'], .modal.show, .p-dialog, gpi-modal, .ant-modal-content, [class*='modal'][class*='open'], [class*='drawer'][class*='open']";

export interface ResolvedAutoExploreConfig {
  enabled: boolean;
  exploreFilters: boolean;
  exploreSelects: boolean;
  exploreTabs: boolean;
  exploreSearch: boolean;
  exploreButtons: boolean;
  exploreRowActions: boolean;
  maxSelectCaptures: number;
  maxTabCaptures: number;
  maxButtonCaptures: number;
  maxTabButtonCaptures: number;
  maxTotalScreenshots: number;
  safeReadOnlyNetwork: boolean;
}

export function resolveAutoExploreConfig(
  input?: boolean | AutoExploreConfig,
): ResolvedAutoExploreConfig {
  if (input === false) {
    return {
      enabled: false,
      exploreFilters: false,
      exploreSelects: false,
      exploreTabs: false,
      exploreSearch: false,
      exploreButtons: false,
      exploreRowActions: false,
      maxSelectCaptures: 0,
      maxTabCaptures: 0,
      maxButtonCaptures: 0,
      maxTabButtonCaptures: 0,
      maxTotalScreenshots: 1,
      safeReadOnlyNetwork: true,
    };
  }

  const cfg: AutoExploreConfig =
    typeof input === 'object' && input !== null ? input : {};
  return {
    enabled: cfg.enabled !== false,
    exploreFilters: cfg.exploreFilters !== false,
    exploreSelects: cfg.exploreSelects !== false,
    exploreTabs: cfg.exploreTabs !== false,
    exploreSearch: cfg.exploreSearch !== false,
    exploreButtons: cfg.exploreButtons !== false,
    exploreRowActions: cfg.exploreRowActions !== false,
    maxSelectCaptures: cfg.maxSelectCaptures ?? 4,
    maxTabCaptures: cfg.maxTabCaptures ?? 12,
    maxButtonCaptures: cfg.maxButtonCaptures ?? 4,
    maxTabButtonCaptures: cfg.maxTabButtonCaptures ?? 3,
    maxTotalScreenshots: cfg.maxTotalScreenshots ?? 25,
    safeReadOnlyNetwork: cfg.safeReadOnlyNetwork !== false,
  };
}

export interface AutoExploreResult {
  screenshots: CapturedScreenshot[];
  liveDom: LivePageInspection;
}

export class AutoExplorer {
  private domInspector: DOMInspector;

  constructor(domInspector?: DOMInspector) {
    this.domInspector = domInspector || new DOMInspector();
  }

  /**
   * Explora automáticamente una pantalla en modo seguro de solo lectura:
   * 1. Despliega paneles de filtros ocultos
   * 2. Abre selectores/desplegables, lee sus opciones reales y toma captura desplegada
   * 3. Presiona botones seguros de búsqueda/consulta y captura la tabla de resultados
   * 4. Presiona botones de detalle/edición en la primera fila de la tabla (ej. "Ver Detalle")
   * 5. Presiona botones seguros de subpantallas/creación/modales (ej. "Nuevo Asesor")
   * 6. Recorre pestañas secundarias visibles
   */
  public async explore(options: {
    page: Page;
    screenshotsDir: string;
    initialDom: LivePageInspection;
    existingScreenshots: CapturedScreenshot[];
    config?: boolean | AutoExploreConfig;
  }): Promise<AutoExploreResult> {
    const cfg = resolveAutoExploreConfig(options.config);
    const screenshots: CapturedScreenshot[] = [...options.existingScreenshots];
    let liveDom: LivePageInspection = options.initialDom;

    if (!cfg.enabled) {
      return { screenshots, liveDom };
    }

    const { page, screenshotsDir } = options;
    const originUrl = page.url();
    let shotCounter = screenshots.length + 1;
    let blockedRequests = 0;

    const nextShotName = (slug: string): string => {
      const prefix = String(shotCounter).padStart(2, '0');
      shotCounter++;
      return `${prefix}-${slugify(slug)}.png`;
    };

    const canCaptureMore = (): boolean =>
      screenshots.length < cfg.maxTotalScreenshots;

    // Instalar guardia de red de solo lectura
    let routeHandler: ((route: Route) => Promise<void>) | null = null;
    if (cfg.safeReadOnlyNetwork) {
      routeHandler = async (route: Route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        const url = req.url();

        if (['DELETE', 'PUT', 'PATCH'].includes(method)) {
          blockedRequests++;
          console.log(
            pc.yellow(
              `    🛡 [Solo lectura] Bloqueada petición ${method} ${shortenUrl(url)}`,
            ),
          );
          await route.abort('blockedbyclient').catch(() => {});
          return;
        }

        if (method === 'POST' && MUTATING_URL_REGEX.test(url)) {
          blockedRequests++;
          console.log(
            pc.yellow(
              `    🛡 [Solo lectura] Bloqueada petición mutante POST ${shortenUrl(url)}`,
            ),
          );
          await route.abort('blockedbyclient').catch(() => {});
          return;
        }

        await route.continue().catch(() => {});
      };

      await page.route('**/*', routeHandler).catch(() => {});
    }

    try {
      // 1. Paneles de filtros colapsados
      if (cfg.exploreFilters) {
        const filterOutcome = await this.exploreFilters(
          page,
          screenshotsDir,
          liveDom,
          nextShotName,
          canCaptureMore,
        );
        liveDom = filterOutcome.liveDom;
        screenshots.push(...filterOutcome.screenshots);
      }

      // 2. Selectores / desplegables (mat-select, combobox, ng-select, select nativo)
      if (cfg.exploreSelects) {
        const selectOutcome = await this.exploreSelects(
          page,
          screenshotsDir,
          liveDom,
          cfg.maxSelectCaptures,
          nextShotName,
          canCaptureMore,
        );
        liveDom = selectOutcome.liveDom;
        screenshots.push(...selectOutcome.screenshots);
      }

      // 3. Búsqueda segura (Consultar/Buscar) + captura de tabla con datos
      if (cfg.exploreSearch) {
        const searchOutcome = await this.exploreSearchAndTable(
          page,
          screenshotsDir,
          liveDom,
          nextShotName,
          canCaptureMore,
        );
        liveDom = searchOutcome.liveDom;
        screenshots.push(...searchOutcome.screenshots);
      }

      const visitedMainButtons = new Set<string>();

      // 4. Botones de detalle / edición en la primera fila de la tabla (mientras la tabla tiene datos visibles)
      //    Recorre TODAS las pestañas dentro del detalle y presiona botones de acción seguros dentro de cada pestaña
      if (cfg.exploreRowActions && canCaptureMore()) {
        const rowOutcome = await this.exploreTableRowActions(
          page,
          originUrl,
          screenshotsDir,
          liveDom,
          2,
          cfg.exploreTabs ? cfg.maxTabCaptures : 0,
          cfg.exploreButtons ? cfg.maxTabButtonCaptures : 0,
          nextShotName,
          canCaptureMore,
        );
        liveDom = rowOutcome.liveDom;
        screenshots.push(...rowOutcome.screenshots);
      }

      // 5. Botones seguros de subpantallas / creación / modales (ej. "Nuevo Asesor", "Crear ...")
      if (cfg.exploreButtons && cfg.maxButtonCaptures > 0 && canCaptureMore()) {
        const buttonOutcome = await this.exploreActionButtons(
          page,
          originUrl,
          screenshotsDir,
          liveDom,
          cfg.maxButtonCaptures,
          visitedMainButtons,
          nextShotName,
          canCaptureMore,
        );
        liveDom = buttonOutcome.liveDom;
        screenshots.push(...buttonOutcome.screenshots);
      }

      // 6. Pestañas secundarias de la vista principal (mat-tab, [role="tab"], .nav-tabs, gpi-tabs)
      //    También presiona botones de acción seguros encontrados dentro de cada pestaña
      if (cfg.exploreTabs && cfg.maxTabCaptures > 0 && canCaptureMore()) {
        const tabOutcome = await this.exploreTabs(
          page,
          originUrl,
          screenshotsDir,
          liveDom,
          cfg.maxTabCaptures,
          cfg.exploreButtons ? cfg.maxTabButtonCaptures : 0,
          visitedMainButtons,
          nextShotName,
          canCaptureMore,
        );
        liveDom = tabOutcome.liveDom;
        screenshots.push(...tabOutcome.screenshots);
      }

      if (blockedRequests > 0) {
        console.log(
          pc.gray(
            `    🛡 Protección solo lectura activa: ${blockedRequests} petición(es) mutante(s) bloqueada(s).`,
          ),
        );
      }
    } catch (err: any) {
      console.log(
        pc.yellow(`    ⚠ Aviso durante auto-exploración: ${err.message}`),
      );
    } finally {
      if (routeHandler) {
        await page.unroute('**/*', routeHandler).catch(() => {});
      }
    }

    return { screenshots, liveDom };
  }

  /**
   * 1. Detecta y despliega paneles de filtros ocultos
   */
  private async exploreFilters(
    page: Page,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];

    try {
      const filterTarget = await page.evaluate(
        ({ contentSel, ignoreSel }) => {
          const contentArea =
            (document.querySelector(contentSel) as HTMLElement) ||
            document.body;
          const candidates = Array.from(
            contentArea.querySelectorAll(
              "button, [role='button'], mat-expansion-panel-header[aria-expanded='false'], summary",
            ),
          );

          const extractCleanText = (node: Element): string => {
            const clone = node.cloneNode(true) as Element;
            clone
              .querySelectorAll(
                'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
              )
              .forEach((n) => n.remove());
            return (clone.textContent || '').trim().replace(/\s+/g, ' ');
          };

          for (const el of candidates) {
            if (el.closest(ignoreSel)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if ((el as HTMLButtonElement).disabled) continue;

            const text = extractCleanText(el);
            if (!text || text.length > 40) continue;

            const isExpansion =
              el.tagName.toLowerCase() === 'mat-expansion-panel-header';
            const matchesFilter = isExpansion
              ? /filtro|b[úu]squeda|criterios/i.test(text)
              : /^(filtros?|mostrar\s+filtros|ver\s+filtros|filtros?\s+avanzados?|b[úu]squeda\s+avanzada|m[áa]s\s+filtros)$/i.test(
                  text,
                );

            if (matchesFilter) {
              el.setAttribute('data-am-filter-trigger', 'true');
              return text;
            }
          }
          return null;
        },
        {
          contentSel: CONTENT_AREA_SELECTOR,
          ignoreSel: IGNORE_CHROME_SELECTOR,
        },
      );

      if (
        !filterTarget ||
        (!SAFE_FILTER_REGEX.test(filterTarget) &&
          !/filtro|b[úu]squeda|criterios/i.test(filterTarget))
      ) {
        return { screenshots: newShots, liveDom };
      }

      const beforeFieldLabels = new Set(
        liveDom.fields.map((f) => f.label.toLowerCase()),
      );
      const trigger = page.locator("[data-am-filter-trigger='true']").first();

      if (await trigger.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log(
          pc.cyan(`    🔎 Desplegando panel de filtros: "${filterTarget}"...`),
        );
        await trigger.scrollIntoViewIfNeeded().catch(() => {});
        await trigger.click({ timeout: 2500 }).catch(() => {});
        await this.waitForUiSettled(page, 1800);

        const afterDom = await this.domInspector.inspectPage(page);
        const revealedFields = afterDom.fields.filter(
          (f) => !beforeFieldLabels.has(f.label.toLowerCase()),
        );

        liveDom = this.domInspector.mergeInspections(liveDom, afterDom);

        if (revealedFields.length > 0 && canCaptureMore()) {
          const fileName = nextShotName('filtros-desplegados');
          const filePath = path.join(screenshotsDir, fileName);
          await page.screenshot({ path: filePath, fullPage: false });

          const preview = revealedFields
            .slice(0, 6)
            .map((f) => f.label)
            .join(', ');
          newShots.push({
            fileName,
            caption: `Panel de filtros desplegado (${filterTarget})`,
            kind: 'filters',
            userNote: `Filtros revelados: ${preview}${revealedFields.length > 6 ? ` y ${revealedFields.length - 6} más` : ''}`,
          });
          console.log(
            pc.green(
              `    📸 Capturado panel de filtros -> ${fileName} (+${revealedFields.length} campos)`,
            ),
          );
        }
      }
    } catch {
      // Continuar silenciosamente si no hay panel desplegable
    } finally {
      await page
        .evaluate(() => {
          document
            .querySelectorAll('[data-am-filter-trigger]')
            .forEach((el) => {
              el.removeAttribute('data-am-filter-trigger');
            });
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * 2. Abre selectores/desplegables visibles, lee sus opciones reales y toma captura con el selector desplegado
   */
  private async exploreSelects(
    page: Page,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    maxSelectCaptures: number,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];

    try {
      const candidates = await page.evaluate(
        ({ contentSel, ignoreSel }) => {
          const contentArea =
            (document.querySelector(contentSel) as HTMLElement) ||
            document.body;
          const selectorQuery =
            "gpi-select, mat-select, ng-select, .p-dropdown, select, [role='combobox'], [aria-haspopup='listbox']";
          const elements = Array.from(
            contentArea.querySelectorAll(selectorQuery),
          );
          const seenLabels = new Set<string>();
          const found: Array<{
            idx: number;
            label: string;
            kind: 'native' | 'custom' | 'gpi';
          }> = [];

          let idx = 0;
          for (const el of elements) {
            if (el.closest(ignoreSel)) continue;
            if (
              el.closest(
                "mat-paginator, .mat-mdc-paginator, .mat-paginator, .pagination, [class*='paginator']",
              )
            )
              continue;
            if (el.closest("[aria-hidden='true']")) continue;

            // Evitar doble conteo si un input[role=combobox] está dentro de gpi-select, ng-select o mat-select
            const tagName = el.tagName.toLowerCase();
            if (
              tagName !== 'gpi-select' &&
              tagName !== 'mat-select' &&
              tagName !== 'ng-select' &&
              el.parentElement?.closest(
                'gpi-select, mat-select, ng-select, .p-dropdown',
              )
            ) {
              continue;
            }

            const targetBox =
              tagName === 'gpi-select'
                ? (el.querySelector('.gpi-select-box') as HTMLElement) || el
                : el;
            const rect = targetBox.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 14) continue;

            const boxStyle = window.getComputedStyle(targetBox);
            const isDisabled =
              (el as HTMLSelectElement).disabled ||
              el.hasAttribute('disabled') ||
              el.getAttribute('aria-disabled') === 'true' ||
              targetBox.getAttribute('aria-disabled') === 'true' ||
              el.classList.contains('mat-mdc-select-disabled') ||
              el.classList.contains('mat-select-disabled') ||
              el.classList.contains('p-disabled') ||
              targetBox.classList.contains('cursor-not-allowed') ||
              targetBox.classList.contains('pointer-events-none') ||
              boxStyle.pointerEvents === 'none';
            if (isDisabled) continue;

            let labelText = '';
            if (el.getAttribute('label')) {
              labelText = el.getAttribute('label')!.trim();
            }
            if (!labelText && tagName === 'gpi-select') {
              const innerLbl = el.querySelector('gpi-label label, label');
              if (innerLbl) labelText = innerLbl.textContent?.trim() || '';
            }
            if (!labelText && el.id) {
              const lbl = contentArea.querySelector(
                `label[for='${CSS.escape(el.id)}']`,
              );
              if (lbl) labelText = lbl.textContent?.trim() || '';
            }
            if (!labelText) {
              const matField = el.closest('mat-form-field');
              if (matField) {
                const matLbl = matField.querySelector(
                  'mat-label, label, mat-placeholder',
                );
                if (matLbl) labelText = matLbl.textContent?.trim() || '';
              }
            }
            if (!labelText) {
              let parent = el.parentElement;
              let depth = 0;
              while (parent && depth < 4 && parent !== contentArea) {
                const lbl = parent.querySelector(
                  "label, [class*='label'], span.font-medium, span.font-bold",
                );
                if (lbl && lbl !== el && !lbl.contains(el)) {
                  const t = (lbl.textContent || '').trim();
                  if (t && t.length < 50 && !t.includes('\n')) {
                    labelText = t;
                    break;
                  }
                }
                if (parent.previousElementSibling) {
                  const prev = parent.previousElementSibling;
                  if (['LABEL', 'SPAN', 'P', 'DIV'].includes(prev.tagName)) {
                    const t = (prev.textContent || '').trim();
                    if (t && t.length < 50 && !t.includes('\n')) {
                      labelText = t;
                      break;
                    }
                  }
                }
                parent = parent.parentElement;
                depth++;
              }
            }
            if (!labelText) {
              labelText =
                el.getAttribute('aria-label') ||
                el.getAttribute('placeholder') ||
                el.getAttribute('name') ||
                '';
            }

            labelText = labelText
              .replace(/[:*]/g, '')
              .trim()
              .replace(/\s+/g, ' ');
            if (!labelText || labelText.length < 2 || labelText.length > 55) {
              labelText = `Selector ${idx + 1}`;
            }
            if (
              /^(items per page|rows per page|registros por p[áa]gina|elementos por p[áa]gina|mostrando\s+\d+)/i.test(
                labelText,
              )
            ) {
              continue;
            }

            const key = labelText.toLowerCase();
            if (seenLabels.has(key)) continue;
            seenLabels.add(key);

            el.setAttribute('data-am-select-idx', String(idx));
            found.push({
              idx,
              label: labelText,
              kind:
                tagName === 'select'
                  ? 'native'
                  : tagName === 'gpi-select'
                    ? 'gpi'
                    : 'custom',
            });
            idx++;
            if (found.length >= 12) break;
          }

          return found;
        },
        {
          contentSel: CONTENT_AREA_SELECTOR,
          ignoreSel: IGNORE_CHROME_SELECTOR,
        },
      );

      if (candidates.length === 0) {
        return { screenshots: newShots, liveDom };
      }

      console.log(
        pc.cyan(
          `    🔽 Auto-explorando ${candidates.length} selector(es) en pantalla...`,
        ),
      );
      let capturedCount = 0;

      for (const item of candidates) {
        let discoveredOptions: string[] = [];

        if (item.kind === 'native') {
          // Leer opciones directamente del <select> nativo
          const nativeInfo = await page.evaluate((idx) => {
            const sel = document.querySelector(
              `[data-am-select-idx="${idx}"]`,
            ) as HTMLSelectElement | null;
            if (!sel) return null;
            const opts = Array.from(sel.options)
              .map((o) => ({
                text: (o.textContent || '').trim().replace(/\s+/g, ' '),
                selected: o.selected,
              }))
              .filter((o) => o.text.length > 0);
            return {
              allOptions: opts,
              cleanOptions: Array.from(
                new Set(
                  opts
                    .map((o) => o.text)
                    .filter(
                      (t) =>
                        !/^(seleccione|seleccionar|--|-|elige|elegir|select)\.?\.?\.?$/i.test(
                          t,
                        ),
                    ),
                ),
              ),
            };
          }, item.idx);

          if (!nativeInfo || nativeInfo.cleanOptions.length === 0) continue;
          discoveredOptions = nativeInfo.cleanOptions.slice(0, 30);

          this.attachOptionsToField(liveDom, item.label, discoveredOptions);
          console.log(
            pc.gray(
              `      • [${item.label}] ${discoveredOptions.length} opciones: ${discoveredOptions.slice(0, 5).join(', ')}${discoveredOptions.length > 5 ? '...' : ''}`,
            ),
          );

          // Para <select> nativo: renderizar temporalmente su lista desplegada fiel al DOM para la captura
          if (capturedCount < maxSelectCaptures && canCaptureMore()) {
            const loc = page
              .locator(`[data-am-select-idx="${item.idx}"]`)
              .first();
            await loc.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(200);

            try {
              await page.evaluate(
                ({ idx, opts }) => {
                  document
                    .querySelectorAll("[data-am-native-select-preview='true']")
                    .forEach((n) => n.remove());
                  const sel = document.querySelector(
                    `[data-am-select-idx="${idx}"]`,
                  ) as HTMLElement | null;
                  if (!sel) return;
                  const rect = sel.getBoundingClientRect();
                  const overlay = document.createElement('div');
                  overlay.setAttribute('data-am-native-select-preview', 'true');

                  const visibleOpts = opts.slice(0, 10);
                  const hiddenCount = opts.length - visibleOpts.length;
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const estHeight = Math.min(
                    320,
                    visibleOpts.length * 34 + (hiddenCount > 0 ? 30 : 0) + 12,
                  );
                  const openAbove =
                    spaceBelow < estHeight && rect.top > estHeight;

                  overlay.style.cssText = [
                    'position: fixed',
                    `left: ${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 220) - 8))}px`,
                    openAbove
                      ? `top: ${Math.max(8, rect.top - estHeight - 4)}px`
                      : `top: ${Math.min(window.innerHeight - 60, rect.bottom + 4)}px`,
                    `min-width: ${Math.max(rect.width, 210)}px`,
                    'max-width: 380px',
                    'max-height: 320px',
                    'overflow: hidden',
                    'background: #ffffff',
                    'border: 1px solid #cbd5e1',
                    'border-radius: 8px',
                    'box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.08)',
                    'z-index: 2147483647',
                    'padding: 4px 0',
                    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    'font-size: 13px',
                    'color: #1e293b',
                  ].join(';');

                  sel.style.outline = '2px solid #2563eb';
                  sel.style.outlineOffset = '1px';

                  for (const o of visibleOpts) {
                    const row = document.createElement('div');
                    row.textContent = o.text;
                    row.style.cssText = [
                      'padding: 7px 12px',
                      'white-space: nowrap',
                      'overflow: hidden',
                      'text-overflow: ellipsis',
                      o.selected
                        ? 'background: #eff6ff; color: #1d4ed8; font-weight: 600;'
                        : 'background: #ffffff; color: #1e293b;',
                    ].join(';');
                    overlay.appendChild(row);
                  }

                  if (hiddenCount > 0) {
                    const more = document.createElement('div');
                    more.textContent = `+ ${hiddenCount} opciones más...`;
                    more.style.cssText =
                      'padding: 6px 12px; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; background: #f8fafc;';
                    overlay.appendChild(more);
                  }

                  document.body.appendChild(overlay);
                },
                { idx: item.idx, opts: nativeInfo.allOptions },
              );

              await page.waitForTimeout(150);
              const fileName = nextShotName(`selector-${item.label}`);
              const filePath = path.join(screenshotsDir, fileName);
              await page.screenshot({ path: filePath, fullPage: false });

              const preview = discoveredOptions.slice(0, 8).join(', ');
              newShots.push({
                fileName,
                caption: `Selector desplegado: ${item.label}`,
                kind: 'selector',
                userNote: `Opciones disponibles (${discoveredOptions.length}): ${preview}${discoveredOptions.length > 8 ? ` (+${discoveredOptions.length - 8} más)` : ''}`,
              });
              capturedCount++;
              console.log(
                pc.green(`    📸 Capturado selector desplegado -> ${fileName}`),
              );
            } finally {
              await page
                .evaluate((idx) => {
                  document
                    .querySelectorAll("[data-am-native-select-preview='true']")
                    .forEach((n) => n.remove());
                  const sel = document.querySelector(
                    `[data-am-select-idx="${idx}"]`,
                  ) as HTMLElement | null;
                  if (sel) {
                    sel.style.outline = '';
                    sel.style.outlineOffset = '';
                  }
                }, item.idx)
                .catch(() => {});
            }
          }
        } else {
          // Selector personalizado (gpi-select, Angular Material mat-select, ng-select, PrimeNG, ARIA combobox)
          const loc =
            item.kind === 'gpi'
              ? page
                  .locator(`[data-am-select-idx="${item.idx}"] .gpi-select-box`)
                  .first()
              : page.locator(`[data-am-select-idx="${item.idx}"]`).first();
          try {
            if (!(await loc.isVisible({ timeout: 1500 }).catch(() => false)))
              continue;
            await loc.scrollIntoViewIfNeeded().catch(() => {});
            await loc.click({ timeout: 2500 });
            await page.waitForTimeout(550);

            discoveredOptions = await page.evaluate((idx) => {
              const texts: string[] = [];

              // 1. Popover de gpi-select (visible con display !== none)
              const host = document.querySelector(
                `[data-am-select-idx="${idx}"]`,
              );
              if (host) {
                const popover = host.querySelector(
                  '.gpi-select-popover',
                ) as HTMLElement | null;
                if (popover) {
                  const pStyle = window.getComputedStyle(popover);
                  if (
                    pStyle.display !== 'none' &&
                    pStyle.visibility !== 'hidden' &&
                    Number(pStyle.opacity || '1') > 0
                  ) {
                    const gpiOpts = Array.from(
                      popover.querySelectorAll("[id^='opt-']"),
                    );
                    for (const opt of gpiOpts) {
                      const primarySpan = opt.querySelector(
                        'span.font-bold, span',
                      );
                      const txt = (
                        (primarySpan
                          ? primarySpan.textContent
                          : opt.textContent) || ''
                      )
                        .trim()
                        .replace(/\s+/g, ' ');
                      if (!txt || txt.length > 80) continue;
                      if (
                        /^(seleccione|seleccionar|--|-|elige|elegir|select)\.?\.?\.?$/i.test(
                          txt,
                        )
                      )
                        continue;
                      texts.push(txt);
                    }
                  }
                }
              }

              // 2. Overlays estándar (Angular Material, ng-select, PrimeNG, AntD, ARIA listbox)
              if (texts.length === 0) {
                const optionEls = Array.from(
                  document.querySelectorAll(
                    ".cdk-overlay-container mat-option, .cdk-overlay-container [role='option'], [role='listbox'] [role='option'], .ng-dropdown-panel .ng-option, .p-dropdown-items .p-dropdown-item, .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
                  ),
                );

                for (const opt of optionEls) {
                  const rect = opt.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0) continue;
                  const txt = (opt.textContent || '')
                    .trim()
                    .replace(/\s+/g, ' ');
                  if (!txt || txt.length > 80) continue;
                  if (
                    /^(seleccione|seleccionar|--|-|elige|elegir|select)\.?\.?\.?$/i.test(
                      txt,
                    )
                  )
                    continue;
                  texts.push(txt);
                }
              }

              return Array.from(new Set(texts)).slice(0, 30);
            }, item.idx);

            if (discoveredOptions.length > 0) {
              this.attachOptionsToField(liveDom, item.label, discoveredOptions);
              console.log(
                pc.gray(
                  `      • [${item.label}] ${discoveredOptions.length} opciones: ${discoveredOptions.slice(0, 5).join(', ')}${discoveredOptions.length > 5 ? '...' : ''}`,
                ),
              );

              if (capturedCount < maxSelectCaptures && canCaptureMore()) {
                const fileName = nextShotName(`selector-${item.label}`);
                const filePath = path.join(screenshotsDir, fileName);
                await page.screenshot({ path: filePath, fullPage: false });

                const preview = discoveredOptions.slice(0, 8).join(', ');
                newShots.push({
                  fileName,
                  caption: `Selector desplegado: ${item.label}`,
                  kind: 'selector',
                  userNote: `Opciones disponibles (${discoveredOptions.length}): ${preview}${discoveredOptions.length > 8 ? ` (+${discoveredOptions.length - 8} más)` : ''}`,
                });
                capturedCount++;
                console.log(
                  pc.green(
                    `    📸 Capturado selector desplegado -> ${fileName}`,
                  ),
                );
              }
            }
          } catch {
            // Si el selector no se pudo abrir, continuar con el siguiente
          } finally {
            // Cerrar siempre el overlay sin seleccionar una opción destructiva
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(250);

            // Si era gpi-select y sigue abierto (.is-open), volver a clicar la caja para cerrarlo
            if (item.kind === 'gpi') {
              const stillOpen = await page
                .locator(
                  `[data-am-select-idx="${item.idx}"] .gpi-select-box.is-open`,
                )
                .first()
                .isVisible()
                .catch(() => false);
              if (stillOpen) {
                await page
                  .locator(
                    `[data-am-select-idx="${item.idx}"] .gpi-select-box.is-open`,
                  )
                  .first()
                  .click({ force: true })
                  .catch(() => {});
                await page.waitForTimeout(200);
              }
            }

            const backdropVisible = await page
              .locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing')
              .first()
              .isVisible()
              .catch(() => false);
            if (backdropVisible) {
              await page
                .locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing')
                .first()
                .click({ force: true })
                .catch(() => {});
              await page.waitForTimeout(200);
            }
          }
        }
      }
    } catch {
      // Continuar silenciosamente
    } finally {
      await page
        .evaluate(() => {
          document.querySelectorAll('[data-am-select-idx]').forEach((el) => {
            el.removeAttribute('data-am-select-idx');
          });
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * 3. Ejecuta un botón seguro de búsqueda/consulta (Consultar, Buscar, Filtrar)
   *    y captura una screenshot dedicada si aparece o se llena una tabla con datos
   */
  private async exploreSearchAndTable(
    page: Page,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];

    const beforeBestTable = this.getBestTable(liveDom.tables);
    const beforeNotesCount = liveDom.notes.length;
    let capturedTableShot = false;

    try {
      const searchBtnLabel = await page.evaluate(
        ({
          contentSel,
          ignoreSel,
          dangerousPattern,
          exactPattern,
          prefixPattern,
        }) => {
          const contentArea =
            (document.querySelector(contentSel) as HTMLElement) ||
            document.body;
          const dangerousRe = new RegExp(dangerousPattern, 'i');
          const exactRe = new RegExp(exactPattern, 'i');
          const prefixRe = new RegExp(prefixPattern, 'i');

          const buttons = Array.from(
            contentArea.querySelectorAll(
              "button, a.btn, input[type='submit'], [role='button']",
            ),
          );

          const extractCleanText = (node: Element): string => {
            const clone = node.cloneNode(true) as Element;
            clone
              .querySelectorAll(
                'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
              )
              .forEach((n) => n.remove());
            return (clone.textContent || '').trim().replace(/\s+/g, ' ');
          };

          let fallbackCandidate: { el: Element; label: string } | null = null;

          for (const btn of buttons) {
            if (btn.closest(ignoreSel)) continue;
            if (
              btn.closest(
                "th, [role='columnheader'], mat-header-cell, mat-paginator, .mat-mdc-paginator",
              )
            )
              continue;
            // Ignorar lupas internas de campos buscadores (abren modales de búsqueda de cuenta/instrumento, no consultan la tabla)
            if (
              btn.closest(
                "gpi-search-input, [class*='search-input'], [class*='buscador']",
              )
            )
              continue;
            if (
              (btn as HTMLButtonElement).disabled ||
              btn.getAttribute('aria-disabled') === 'true'
            )
              continue;

            const rect = btn.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            // Usar texto visible del botón (evitar botones de solo ícono con aria-label="Buscar")
            const visibleText = (
              (btn as HTMLInputElement).value ||
              extractCleanText(btn) ||
              ''
            )
              .trim()
              .replace(/\s+/g, ' ');

            if (
              !visibleText ||
              visibleText.length < 2 ||
              visibleText.length > 35
            )
              continue;
            if (dangerousRe.test(visibleText)) continue;

            if (/^consultar$/i.test(visibleText)) {
              btn.setAttribute('data-am-search-btn', 'true');
              return visibleText;
            }

            if (
              !fallbackCandidate &&
              (exactRe.test(visibleText) || prefixRe.test(visibleText))
            ) {
              fallbackCandidate = { el: btn, label: visibleText };
            }
          }

          if (fallbackCandidate) {
            fallbackCandidate.el.setAttribute('data-am-search-btn', 'true');
            return fallbackCandidate.label;
          }
          return null;
        },
        {
          contentSel: CONTENT_AREA_SELECTOR,
          ignoreSel: IGNORE_CHROME_SELECTOR,
          dangerousPattern: DANGEROUS_ACTION_REGEX.source,
          exactPattern: SAFE_SEARCH_EXACT_REGEX.source,
          prefixPattern: SAFE_SEARCH_PREFIX_REGEX.source,
        },
      );

      if (searchBtnLabel) {
        const btnLoc = page.locator("[data-am-search-btn='true']").first();
        if (await btnLoc.isVisible({ timeout: 1500 }).catch(() => false)) {
          console.log(
            pc.cyan(
              `    🔍 Ejecutando búsqueda segura: "${searchBtnLabel}"...`,
            ),
          );
          await btnLoc.scrollIntoViewIfNeeded().catch(() => {});
          await btnLoc.click({ timeout: 3000 }).catch(() => {});

          await this.waitForUiSettled(page, 5500);
          await page.waitForTimeout(700);

          const afterDom = await this.domInspector.inspectPage(page);
          liveDom = this.domInspector.mergeInspections(liveDom, afterDom);

          const afterBestTable = this.getBestTable(afterDom.tables);
          const hasDataRows = afterBestTable && afterBestTable.rowCount > 0;
          const columnsGrew =
            (afterBestTable?.columns.length || 0) >
            (beforeBestTable?.columns.length || 0);
          const notesGrew = afterDom.notes.length > beforeNotesCount;

          if (hasDataRows && canCaptureMore()) {
            await this.scrollBestTableIntoView(page);
            await page.waitForTimeout(300);

            const fileName = nextShotName('resultados-consulta');
            const filePath = path.join(screenshotsDir, fileName);
            await page.screenshot({ path: filePath, fullPage: false });

            const colSummary =
              afterBestTable.columns.length > 0
                ? `Columnas: ${afterBestTable.columns.slice(0, 8).join(', ')}${afterBestTable.columns.length > 8 ? ` (+${afterBestTable.columns.length - 8})` : ''}`
                : `${afterBestTable.rowCount} fila(s) visibles`;

            newShots.push({
              fileName,
              caption: `Resultados tras "${searchBtnLabel}" (${afterBestTable.rowCount} ${afterBestTable.rowCount === 1 ? 'registro' : 'registros'})`,
              kind: 'search-results',
              userNote: colSummary,
            });
            capturedTableShot = true;
            console.log(
              pc.green(
                `    📸 Capturada tabla de resultados -> ${fileName} (${afterBestTable.rowCount} filas)`,
              ),
            );
          } else if ((columnsGrew || notesGrew) && canCaptureMore()) {
            const fileName = nextShotName('resultado-consulta');
            const filePath = path.join(screenshotsDir, fileName);
            await page.screenshot({ path: filePath, fullPage: false });

            const noteText = afterDom.notes[0]
              ? afterDom.notes[0]
              : afterBestTable?.columns.length
                ? `Columnas detectadas: ${afterBestTable.columns.slice(0, 8).join(', ')}`
                : `Respuesta visible al ejecutar "${searchBtnLabel}"`;

            newShots.push({
              fileName,
              caption: `Vista tras ejecutar "${searchBtnLabel}"`,
              kind: 'search-results',
              userNote: noteText,
            });
            capturedTableShot = true;
            console.log(
              pc.green(`    📸 Capturado estado tras búsqueda -> ${fileName}`),
            );
          } else {
            console.log(
              pc.gray(
                `    ℹ "${searchBtnLabel}" ejecutado sin nuevos registros en tabla (puede requerir filtros específicos).`,
              ),
            );
          }
        }
      }

      // Si no se tomó captura de búsqueda pero ya existe una tabla con datos debajo del primer pantallazo, capturarla
      if (!capturedTableShot && canCaptureMore()) {
        const bestTable = this.getBestTable(liveDom.tables);
        if (bestTable && bestTable.rowCount > 0) {
          const tableBelowFold = await page.evaluate(
            ({ contentSel, ignoreSel }) => {
              const contentArea =
                (document.querySelector(contentSel) as HTMLElement) ||
                document.body;
              const tables = Array.from(
                contentArea.querySelectorAll(
                  "table, mat-table, [role='table'], [role='grid']",
                ),
              );
              for (const tbl of tables) {
                if (tbl.closest(ignoreSel)) continue;
                const rect = tbl.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (
                  rect.bottom > window.innerHeight - 20 ||
                  rect.top > window.innerHeight * 0.55
                ) {
                  return true;
                }
              }
              return false;
            },
            {
              contentSel: CONTENT_AREA_SELECTOR,
              ignoreSel: IGNORE_CHROME_SELECTOR,
            },
          );

          if (tableBelowFold) {
            await this.scrollBestTableIntoView(page);
            await page.waitForTimeout(250);

            const fileName = nextShotName('tabla-datos');
            const filePath = path.join(screenshotsDir, fileName);
            await page.screenshot({ path: filePath, fullPage: false });

            const colSummary =
              bestTable.columns.length > 0
                ? `Columnas: ${bestTable.columns.slice(0, 8).join(', ')}${bestTable.columns.length > 8 ? ` (+${bestTable.columns.length - 8})` : ''}`
                : `${bestTable.rowCount} fila(s) visibles`;

            newShots.push({
              fileName,
              caption: `Tabla de datos (${bestTable.rowCount} ${bestTable.rowCount === 1 ? 'registro' : 'registros'})`,
              kind: 'table',
              userNote: colSummary,
            });
            console.log(
              pc.green(
                `    📸 Capturada tabla de datos -> ${fileName} (${bestTable.rowCount} filas)`,
              ),
            );
          }
        }
      }
    } catch {
      // Continuar silenciosamente
    } finally {
      await page
        .evaluate(() => {
          document.querySelectorAll('[data-am-search-btn]').forEach((el) => {
            el.removeAttribute('data-am-search-btn');
          });
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * 4. Explora botones seguros de detalle/edición dentro de la primera fila de la tabla de datos
   *    (ej. "Ver Detalle", "Detalle", "Ver", "Editar" o menús de acciones por fila)
   */
  private async exploreTableRowActions(
    page: Page,
    originUrl: string,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    maxRowActions: number,
    maxDetailTabs: number,
    maxButtonsPerTab: number,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];

    try {
      const candidates = await this.findFirstTableRowActions(page);
      if (candidates.length === 0) {
        return { screenshots: newShots, liveDom };
      }

      let rowActionsExplored = 0;
      const visitedKeys = new Set<string>();

      for (const candidate of candidates) {
        if (rowActionsExplored >= maxRowActions || !canCaptureMore()) break;
        if (visitedKeys.has(candidate.key)) continue;
        visitedKeys.add(candidate.key);

        // Asegurar que estamos en la vista de origen y re-ubicar el botón en la primera fila actual
        if (page.url() !== originUrl) {
          await this.returnToOrigin(page, originUrl, false);
        }

        const tagged = await this.tagFirstRowActionByKey(page, candidate.key);
        if (!tagged) continue;

        const beforeState = await this.getPageSnapshotState(page);
        const btnLoc = page.locator("[data-am-row-action='true']").first();
        if (!(await btnLoc.isVisible({ timeout: 1500 }).catch(() => false)))
          continue;

        console.log(
          pc.cyan(
            `    🖱 Explorando acción en fila de tabla: "${candidate.label}"...`,
          ),
        );
        await btnLoc.scrollIntoViewIfNeeded().catch(() => {});
        await btnLoc.click({ timeout: 3000 }).catch(() => {});

        let effectiveLabel = candidate.label;

        // Si el botón era un menú desplegable de fila (ej. tres puntos / more_vert), elegir "Ver Detalle"/"Detalle"/"Ver"
        if (candidate.isMenuTrigger) {
          await page.waitForTimeout(450);
          const menuChoice = await page.evaluate(
            ({ detailPat, editPat, unsafePat }) => {
              const detailRe = new RegExp(detailPat, 'i');
              const editRe = new RegExp(editPat, 'i');
              const unsafeRe = new RegExp(unsafePat, 'i');
              const items = Array.from(
                document.querySelectorAll(
                  ".cdk-overlay-container [role='menuitem'], .cdk-overlay-container .mat-mdc-menu-item, .cdk-overlay-container button, .dropdown-menu.show .dropdown-item, .p-menu .p-menuitem-link",
                ),
              );

              let fallbackEdit: { el: Element; text: string } | null = null;
              for (const item of items) {
                const r = item.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                const text = (item.textContent || '')
                  .trim()
                  .replace(/\s+/g, ' ');
                if (!text || text.length > 45) continue;
                if (
                  unsafeRe.test(text) &&
                  !detailRe.test(text) &&
                  !editRe.test(text)
                )
                  continue;

                if (detailRe.test(text)) {
                  item.setAttribute('data-am-row-menuitem', 'true');
                  return text;
                }
                if (!fallbackEdit && editRe.test(text)) {
                  fallbackEdit = { el: item, text };
                }
              }

              if (fallbackEdit) {
                fallbackEdit.el.setAttribute('data-am-row-menuitem', 'true');
                return fallbackEdit.text;
              }
              return null;
            },
            {
              detailPat: SAFE_ROW_DETAIL_REGEX.source,
              editPat: SAFE_ROW_EDIT_REGEX.source,
              unsafePat: UNSAFE_EXPLORE_BUTTON_REGEX.source,
            },
          );

          if (!menuChoice) {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(200);
            continue;
          }

          effectiveLabel = menuChoice;
          const menuLoc = page.locator("[data-am-row-menuitem='true']").first();
          await menuLoc.click({ timeout: 2500 }).catch(() => {});
        }

        await this.waitForUiSettled(page, 3500);
        await page.waitForTimeout(500);

        const afterState = await this.getPageSnapshotState(page);
        const urlChanged = afterState.url !== beforeState.url;
        const modalOpened =
          afterState.visibleDialogs > beforeState.visibleDialogs;
        const headingChanged =
          afterState.headings.length > 0 &&
          afterState.headings[0] !== beforeState.headings[0];
        const fieldsChanged =
          Math.abs(afterState.fieldCount - beforeState.fieldCount) >= 2;

        if (urlChanged || modalOpened || headingChanged || fieldsChanged) {
          const detailDom = await this.domInspector.inspectPage(page);
          const subTitle =
            (afterState.headings[0] &&
            afterState.headings[0] !== beforeState.headings[0]
              ? afterState.headings[0]
              : detailDom.pageTitle) || effectiveLabel;

          const shotKind = modalOpened && !urlChanged ? 'modal' : 'detail';
          const fileName = nextShotName(`detalle-${effectiveLabel}`);
          const filePath = path.join(screenshotsDir, fileName);
          await page.screenshot({ path: filePath, fullPage: false });

          const noteParts: string[] = [];
          if (urlChanged) noteParts.push(`Ruta: ${shortenUrl(afterState.url)}`);
          if (detailDom.fields.length > 0) {
            const fPreview = detailDom.fields
              .slice(0, 5)
              .map((f) => f.label)
              .join(', ');
            noteParts.push(
              `${detailDom.fields.length} campo(s): ${fPreview}${detailDom.fields.length > 5 ? '...' : ''}`,
            );
          }
          const bestDetailTable = this.getBestTable(detailDom.tables);
          if (bestDetailTable && bestDetailTable.columns.length > 0) {
            noteParts.push(`Tabla (${bestDetailTable.rowCount} filas)`);
          }

          newShots.push({
            fileName,
            caption: `Detalle de registro ("${effectiveLabel}") → ${subTitle}`,
            kind: shotKind,
            userNote:
              noteParts.length > 0
                ? noteParts.join(' • ')
                : `Vista abierta desde "${effectiveLabel}" en la tabla`,
          });
          rowActionsExplored++;
          console.log(
            pc.green(
              `    📸 Capturado detalle ("${effectiveLabel}") -> ${fileName} (${subTitle})`,
            ),
          );

          // Registrar la acción descubierta en liveDom para que Gemini la documente con precisión
          this.upsertDiscoveredAction(
            liveDom,
            `${effectiveLabel} (Tabla)`,
            `Abre la vista "${subTitle}"${urlChanged ? ` (${shortenUrl(afterState.url)})` : modalOpened ? ' en una ventana modal' : ''} con el detalle del registro seleccionado.`,
          );

          // Mezclar campos/tablas descubiertos
          liveDom = this.domInspector.mergeInspections(liveDom, detailDom);

          // Explorar TODAS las pestañas dentro del detalle y los botones de acción seguros dentro de cada pestaña
          if (canCaptureMore() && (maxDetailTabs > 0 || maxButtonsPerTab > 0)) {
            const detailUrl = page.url();
            const isDetailModal = modalOpened && !urlChanged;
            const detailSubOutcome = await this.exploreDetailTabsAndButtons(
              page,
              detailUrl,
              isDetailModal,
              screenshotsDir,
              liveDom,
              subTitle,
              maxDetailTabs,
              maxButtonsPerTab,
              nextShotName,
              canCaptureMore,
            );
            liveDom = detailSubOutcome.liveDom;
            newShots.push(...detailSubOutcome.screenshots);
          }

          // Volver a la pantalla principal
          await this.returnToOrigin(
            page,
            originUrl,
            modalOpened && !urlChanged,
          );
        }
      }
    } catch (err: any) {
      console.log(
        pc.yellow(`    ⚠ Aviso explorando acciones de fila: ${err.message}`),
      );
      await this.returnToOrigin(page, originUrl, false);
    } finally {
      await page
        .evaluate(() => {
          document
            .querySelectorAll('[data-am-row-action], [data-am-row-menuitem]')
            .forEach((el) => {
              el.removeAttribute('data-am-row-action');
              el.removeAttribute('data-am-row-menuitem');
            });
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * 5. Explora botones seguros de la pantalla que abren subpantallas o modales
   *    (ej. "Nuevo Asesor", "Crear ...", "Agregar ...", "Configurar ...")
   *    Nunca hace clic en botones de guardar/eliminar/exportar y siempre vuelve al origen.
   */
  private async exploreActionButtons(
    page: Page,
    originUrl: string,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    maxCaptures: number,
    visitedButtons: Set<string>,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];

    try {
      if (page.url() !== originUrl) {
        await this.returnToOrigin(page, originUrl, false);
      }

      const candidates = await this.findSafeActionButtons(page);
      if (candidates.length === 0) {
        return { screenshots: newShots, liveDom };
      }

      let captured = 0;

      for (const candidate of candidates) {
        if (captured >= maxCaptures || !canCaptureMore()) break;
        const btnKey = candidate.label.toLowerCase();
        if (visitedButtons.has(btnKey)) continue;
        visitedButtons.add(btnKey);

        if (page.url() !== originUrl) {
          await this.returnToOrigin(page, originUrl, false);
        }

        const tagged = await this.tagSafeActionButtonByLabel(
          page,
          candidate.label,
        );
        if (!tagged) continue;

        const beforeState = await this.getPageSnapshotState(page);
        const btnLoc = page.locator("[data-am-action-btn='true']").first();
        if (!(await btnLoc.isVisible({ timeout: 1500 }).catch(() => false)))
          continue;

        console.log(
          pc.cyan(`    🖱 Explorando botón de acción: "${candidate.label}"...`),
        );
        await btnLoc.scrollIntoViewIfNeeded().catch(() => {});
        await btnLoc.click({ timeout: 3000 }).catch(() => {});

        await this.waitForUiSettled(page, 3500);
        await page.waitForTimeout(500);

        const afterState = await this.getPageSnapshotState(page);
        const urlChanged = afterState.url !== beforeState.url;
        const modalOpened =
          afterState.visibleDialogs > beforeState.visibleDialogs;
        const headingChanged =
          afterState.headings.length > 0 &&
          afterState.headings[0] !== beforeState.headings[0];
        const fieldsGrew = afterState.fieldCount >= beforeState.fieldCount + 2;

        if (urlChanged || modalOpened || headingChanged || fieldsGrew) {
          const subDom = await this.domInspector.inspectPage(page);
          const subTitle =
            (afterState.headings[0] &&
            afterState.headings[0] !== beforeState.headings[0]
              ? afterState.headings[0]
              : subDom.pageTitle) || candidate.label;

          const isModal = modalOpened && !urlChanged;
          const shotKind = isModal ? 'modal' : 'subview';
          const fileName = nextShotName(
            `${isModal ? 'modal' : 'subpantalla'}-${candidate.label}`,
          );
          const filePath = path.join(screenshotsDir, fileName);
          await page.screenshot({ path: filePath, fullPage: false });

          const noteParts: string[] = [];
          if (urlChanged) noteParts.push(`Ruta: ${shortenUrl(afterState.url)}`);
          if (subDom.fields.length > 0) {
            const fPreview = subDom.fields
              .slice(0, 6)
              .map((f) => f.label)
              .join(', ');
            noteParts.push(
              `${subDom.fields.length} campo(s): ${fPreview}${subDom.fields.length > 6 ? ` (+${subDom.fields.length - 6})` : ''}`,
            );
          }

          newShots.push({
            fileName,
            caption: `Botón "${candidate.label}" → ${subTitle}`,
            kind: shotKind,
            userNote:
              noteParts.length > 0
                ? noteParts.join(' • ')
                : `Vista abierta al pulsar "${candidate.label}"`,
          });
          captured++;
          console.log(
            pc.green(
              `    📸 Capturada ${isModal ? 'ventana modal' : 'subpantalla'} ("${candidate.label}") -> ${fileName} (+${subDom.fields.length} campos)`,
            ),
          );

          // Registrar en liveDom.actions qué abre exactamente este botón
          this.upsertDiscoveredAction(
            liveDom,
            candidate.label,
            `Abre ${isModal ? 'el modal' : 'la subpantalla'} "${subTitle}"${urlChanged ? ` (${shortenUrl(afterState.url)})` : ''}${
              subDom.fields.length > 0
                ? ` con ${subDom.fields.length} campo(s) para completar (${subDom.fields
                    .slice(0, 5)
                    .map((f) => f.label)
                    .join(', ')}${subDom.fields.length > 5 ? '...' : ''})`
                : ''
            }.`,
          );

          // Mezclar los nuevos campos del formulario/subpantalla en liveDom
          liveDom = this.domInspector.mergeInspections(liveDom, subDom);

          // Si la subpantalla/modal tiene selectores propios, explorar hasta 2 para documentar sus opciones reales
          if (canCaptureMore()) {
            const subSelects = await this.exploreSelects(
              page,
              screenshotsDir,
              liveDom,
              2,
              nextShotName,
              canCaptureMore,
            );
            liveDom = subSelects.liveDom;
            newShots.push(...subSelects.screenshots);
          }

          // Volver a la vista principal para dejar el estado limpio
          await this.returnToOrigin(page, originUrl, isModal);
        } else {
          console.log(
            pc.gray(
              `    ℹ Botón "${candidate.label}" no abrió una nueva vista o modal.`,
            ),
          );
        }
      }
    } catch (err: any) {
      console.log(
        pc.yellow(`    ⚠ Aviso explorando botones de acción: ${err.message}`),
      );
      await this.returnToOrigin(page, originUrl, false);
    } finally {
      await page
        .evaluate(() => {
          document.querySelectorAll('[data-am-action-btn]').forEach((el) => {
            el.removeAttribute('data-am-action-btn');
          });
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * Busca acciones seguras en la primera fila visible de la tabla principal
   */
  private async findFirstTableRowActions(
    page: Page,
  ): Promise<
    Array<{
      key: string;
      label: string;
      priority: number;
      isMenuTrigger: boolean;
    }>
  > {
    return page.evaluate(
      ({ contentSel, ignoreSel, detailPat, editPat, menuPat, unsafePat }) => {
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;
        const detailRe = new RegExp(detailPat, 'i');
        const editRe = new RegExp(editPat, 'i');
        const menuRe = new RegExp(menuPat, 'i');
        const unsafeRe = new RegExp(unsafePat, 'i');

        const tables = Array.from(
          contentArea.querySelectorAll(
            "table, mat-table, [role='table'], [role='grid']",
          ),
        );
        let firstDataRow: Element | null = null;

        for (const tbl of tables) {
          if (tbl.closest(ignoreSel)) continue;
          const r = tbl.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;

          const rows = Array.from(
            tbl.querySelectorAll("tbody tr, mat-row, [role='row']"),
          ).filter((row) => {
            if (row.closest('thead')) return false;
            if (row.querySelector("th, mat-header-cell, [role='columnheader']"))
              return false;
            const rr = row.getBoundingClientRect();
            if (rr.width === 0 || rr.height === 0) return false;
            const txt = (row.textContent || '').trim();
            if (
              !txt ||
              /^(no hay datos|sin registros|no se encontraron|no data)/i.test(
                txt,
              )
            )
              return false;
            return true;
          });

          if (rows.length > 0) {
            firstDataRow = rows[0];
            break;
          }
        }

        if (!firstDataRow) return [];

        const extractCleanText = (node: Element): string => {
          const clone = node.cloneNode(true) as Element;
          clone
            .querySelectorAll(
              'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
            )
            .forEach((n) => n.remove());
          return (clone.textContent || '').trim().replace(/\s+/g, ' ');
        };

        const controls = Array.from(
          firstDataRow.querySelectorAll("button, a, [role='button']"),
        );
        const results: Array<{
          key: string;
          label: string;
          priority: number;
          isMenuTrigger: boolean;
        }> = [];
        const seen = new Set<string>();

        controls.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          if (
            (el as HTMLButtonElement).disabled ||
            el.getAttribute('aria-disabled') === 'true'
          )
            return;
          if (el.querySelector("input[type='checkbox'], mat-checkbox")) return;

          const visibleText = extractCleanText(el);
          const ariaText = (
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.getAttribute('mattooltip') ||
            el.getAttribute('data-tooltip') ||
            ''
          ).trim();
          const iconText = Array.from(
            el.querySelectorAll(
              'mat-icon, .material-icons, .material-symbols-outlined',
            ),
          )
            .map((i) => (i.textContent || '').trim())
            .join(' ');
          const className = (el.className || '').toString().toLowerCase();

          const rawLabel = visibleText || ariaText || iconText;
          const combined = `${visibleText} ${ariaText} ${iconText}`.trim();

          // Excluir acciones destructivas o de descarga
          if (
            /\b(eliminar|borrar|quitar|anular|desactivar|rechazar|aprobar|descargar|exportar|imprimir|delete|trash|remove|close|cancel|pdf|excel)\b/i.test(
              combined,
            ) ||
            /\b(danger|delete|trash|remove)\b/i.test(className)
          ) {
            return;
          }

          if (
            unsafeRe.test(combined) &&
            !detailRe.test(combined) &&
            !editRe.test(combined) &&
            !menuRe.test(combined)
          ) {
            return;
          }

          let priority = 99;
          let isMenuTrigger = false;
          let displayLabel = visibleText || ariaText || '';

          if (detailRe.test(combined)) {
            priority = 1;
            displayLabel = displayLabel || 'Ver Detalle';
          } else if (editRe.test(combined)) {
            priority = 2;
            displayLabel = displayLabel || 'Editar';
          } else if (
            menuRe.test(combined) ||
            el.hasAttribute('aria-haspopup')
          ) {
            priority = 3;
            isMenuTrigger = true;
            displayLabel = displayLabel || 'Acciones';
          } else if (controls.length === 1 && !rawLabel) {
            // Único botón de ícono en la fila (típico botón de detalle en última columna)
            priority = 4;
            displayLabel = 'Ver Detalle';
          } else {
            return;
          }

          const key = `${displayLabel.toLowerCase()}::${idx}`;
          if (seen.has(displayLabel.toLowerCase())) return;
          seen.add(displayLabel.toLowerCase());

          results.push({ key, label: displayLabel, priority, isMenuTrigger });
        });

        return results.sort((a, b) => a.priority - b.priority).slice(0, 3);
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        detailPat: SAFE_ROW_DETAIL_REGEX.source,
        editPat: SAFE_ROW_EDIT_REGEX.source,
        menuPat: ROW_MENU_TRIGGER_REGEX.source,
        unsafePat: UNSAFE_EXPLORE_BUTTON_REGEX.source,
      },
    );
  }

  /**
   * Marca en el DOM actual el botón de la primera fila correspondiente a la clave encontrada
   */
  private async tagFirstRowActionByKey(
    page: Page,
    targetKey: string,
  ): Promise<boolean> {
    const [, idxStr] = targetKey.split('::');
    const targetIdx = Number(idxStr);
    return page.evaluate(
      ({ contentSel, ignoreSel, targetIdx }) => {
        document
          .querySelectorAll('[data-am-row-action]')
          .forEach((el) => el.removeAttribute('data-am-row-action'));
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;
        const tables = Array.from(
          contentArea.querySelectorAll(
            "table, mat-table, [role='table'], [role='grid']",
          ),
        );

        for (const tbl of tables) {
          if (tbl.closest(ignoreSel)) continue;
          const r = tbl.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;

          const rows = Array.from(
            tbl.querySelectorAll("tbody tr, mat-row, [role='row']"),
          ).filter((row) => {
            if (row.closest('thead')) return false;
            if (row.querySelector("th, mat-header-cell, [role='columnheader']"))
              return false;
            const rr = row.getBoundingClientRect();
            return (
              rr.width > 0 &&
              rr.height > 0 &&
              (row.textContent || '').trim().length > 0
            );
          });

          if (rows.length > 0) {
            const controls = Array.from(
              rows[0].querySelectorAll("button, a, [role='button']"),
            );
            const target = controls[targetIdx];
            if (target) {
              target.setAttribute('data-am-row-action', 'true');
              return true;
            }
          }
        }
        return false;
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        targetIdx,
      },
    );
  }

  /**
   * Encuentra botones seguros en la barra/área principal que abren subpantallas de creación,
   * modales o configuración (ej. "Nuevo Asesor", "Crear Banco", "Agregar Registro").
   */
  private async findSafeActionButtons(
    page: Page,
  ): Promise<Array<{ label: string; priority: number }>> {
    return page.evaluate(
      ({ contentSel, ignoreSel, safePat, unsafePat }) => {
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;
        const safeRe = new RegExp(safePat, 'i');
        const unsafeRe = new RegExp(unsafePat, 'i');

        const extractCleanText = (node: Element): string => {
          const clone = node.cloneNode(true) as Element;
          clone
            .querySelectorAll(
              'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
            )
            .forEach((n) => n.remove());
          return (clone.textContent || '').trim().replace(/\s+/g, ' ');
        };

        const controls = Array.from(
          contentArea.querySelectorAll("button, a, [role='button']"),
        );
        const found: Array<{ label: string; priority: number }> = [];
        const seen = new Set<string>();

        for (const el of controls) {
          if (el.closest(ignoreSel)) continue;
          if (
            el.closest(
              "table, mat-table, [role='table'], [role='grid'], mat-paginator, .mat-mdc-paginator, .pagination, [role='tablist'], .mat-mdc-tab-header, .mat-tab-header, .nav-tabs, gpi-search-input",
            ) ||
            el.matches(
              "[role='tab'], .mat-mdc-tab, .mat-tab-label, .nav-tabs .nav-link",
            )
          ) {
            continue;
          }
          if (
            (el as HTMLButtonElement).disabled ||
            el.getAttribute('aria-disabled') === 'true'
          )
            continue;

          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Ignorar botones de cambio de vista, toggles o botones con clases destructivas
          const cls = (el.className || '').toString().toLowerCase();
          if (
            cls.includes('toggle-btn') ||
            /\b(danger|delete|trash|remove)\b/.test(cls)
          )
            continue;

          // Si es un botón type="submit" dentro de un formulario con 3+ campos, es envío de formulario -> NO pulsar
          const form = el.closest('form');
          if (
            form &&
            (el.getAttribute('type') || '').toLowerCase() === 'submit'
          ) {
            const formInputs = form.querySelectorAll(
              "input:not([type='hidden']), select, textarea, mat-select, gpi-select",
            ).length;
            if (formInputs >= 3) continue;
          }

          // Si es enlace <a>, ignorar enlaces externos o descargas
          if (el.tagName.toLowerCase() === 'a') {
            const href = el.getAttribute('href') || '';
            if (el.hasAttribute('download') || /^mailto:|^tel:/i.test(href))
              continue;
            if (
              /^https?:\/\//i.test(href) &&
              !href.startsWith(window.location.origin)
            )
              continue;
          }

          const visibleText = extractCleanText(el);
          const ariaText = (
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.getAttribute('mattooltip') ||
            ''
          ).trim();
          const label = visibleText || ariaText;

          if (!label || label.length < 3 || label.length > 42) continue;
          // Ignorar indicadores financieros de barra superior (USD, UF, EUR, YEN)
          if (/^(usd|uf|eur|yen|utm|ipc)\s*[\d\.,]+/i.test(label)) continue;
          if (unsafeRe.test(label)) continue;
          if (!safeRe.test(label)) continue;

          const key = label.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          // Priorizar botones de creación ("Nuevo ...", "Crear ...", "Agregar ...", "Asignar ...")
          const isCreate =
            /^(nuevo|nueva|crear|agregar|a[ñn]adir|asignar|asociar|vincular|ingresar|registrar|alta|dar\s+de\s+alta)/i.test(
              label,
            );
          found.push({ label, priority: isCreate ? 1 : 2 });
        }

        return found.sort((a, b) => a.priority - b.priority).slice(0, 6);
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        safePat: SAFE_SUBVIEW_BUTTON_REGEX.source,
        unsafePat: UNSAFE_EXPLORE_BUTTON_REGEX.source,
      },
    );
  }

  /**
   * Marca en el DOM actual el botón seguro cuyo texto/aria coincide con `targetLabel`
   */
  private async tagSafeActionButtonByLabel(
    page: Page,
    targetLabel: string,
  ): Promise<boolean> {
    return page.evaluate(
      ({ contentSel, ignoreSel, targetLabel }) => {
        document
          .querySelectorAll('[data-am-action-btn]')
          .forEach((el) => el.removeAttribute('data-am-action-btn'));
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;

        const extractCleanText = (node: Element): string => {
          const clone = node.cloneNode(true) as Element;
          clone
            .querySelectorAll(
              'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
            )
            .forEach((n) => n.remove());
          return (clone.textContent || '').trim().replace(/\s+/g, ' ');
        };

        const controls = Array.from(
          contentArea.querySelectorAll("button, a, [role='button']"),
        );
        for (const el of controls) {
          if (el.closest(ignoreSel)) continue;
          if (
            el.closest(
              "table, mat-table, [role='table'], [role='grid'], mat-paginator, .mat-mdc-paginator, [role='tablist'], .mat-mdc-tab-header, .mat-tab-header, .nav-tabs",
            ) ||
            el.matches(
              "[role='tab'], .mat-mdc-tab, .mat-tab-label, .nav-tabs .nav-link",
            )
          ) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const label =
            extractCleanText(el) ||
            (
              el.getAttribute('aria-label') ||
              el.getAttribute('title') ||
              el.getAttribute('mattooltip') ||
              ''
            ).trim();

          if (label.toLowerCase() === targetLabel.toLowerCase()) {
            el.setAttribute('data-am-action-btn', 'true');
            return true;
          }
        }
        return false;
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        targetLabel,
      },
    );
  }

  /**
   * Lista todas las pestañas visibles en la pantalla actual (activa + todas las inactivas)
   */
  private async listVisibleTabs(
    page: Page,
  ): Promise<{ activeTab: string | null; inactiveTabs: string[] }> {
    return page.evaluate(
      ({ contentSel, ignoreSel, dangerousPattern }) => {
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;
        const dangerousRe = new RegExp(dangerousPattern, 'i');
        const tabEls = Array.from(
          contentArea.querySelectorAll(
            "[role='tab'], .mat-mdc-tab, .mat-tab-label, .nav-tabs .nav-link, gpi-tabs button[type='button']",
          ),
        );

        const extractCleanText = (node: Element): string => {
          const clone = node.cloneNode(true) as Element;
          clone
            .querySelectorAll(
              'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
            )
            .forEach((n) => n.remove());
          return (clone.textContent || '').trim().replace(/\s+/g, ' ');
        };

        const seen = new Set<string>();
        let activeTab: string | null = null;
        const inactiveTabs: string[] = [];

        for (const el of tabEls) {
          if (el.closest(ignoreSel)) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (
            el.getAttribute('aria-disabled') === 'true' ||
            el.classList.contains('disabled')
          )
            continue;

          const label = extractCleanText(el)
            .replace(/\s+\d+$/, '')
            .trim();
          if (!label || label.length < 2 || label.length > 55) continue;
          if (dangerousRe.test(label)) continue;

          const key = label.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          const inlineStyle = (el.getAttribute('style') || '').toLowerCase();
          const isActive =
            el.getAttribute('aria-selected') === 'true' ||
            el.classList.contains('mdc-tab--active') ||
            el.classList.contains('mat-tab-label-active') ||
            el.classList.contains('active') ||
            (el.closest('gpi-tabs') !== null &&
              inlineStyle.includes('--mat-sys-primary'));

          if (isActive) {
            if (!activeTab) activeTab = label;
          } else {
            inactiveTabs.push(label);
          }
        }

        return { activeTab, inactiveTabs };
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        dangerousPattern: DANGEROUS_ACTION_REGEX.source,
      },
    );
  }

  /**
   * Hace clic en una pestaña visible buscando por su etiqueta limpia (resiste recargas de DOM)
   */
  private async clickTabByLabel(
    page: Page,
    targetLabel: string,
  ): Promise<boolean> {
    const tagged = await page.evaluate(
      ({ contentSel, ignoreSel, targetLabel }) => {
        document
          .querySelectorAll('[data-am-target-tab]')
          .forEach((el) => el.removeAttribute('data-am-target-tab'));
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;
        const tabEls = Array.from(
          contentArea.querySelectorAll(
            "[role='tab'], .mat-mdc-tab, .mat-tab-label, .nav-tabs .nav-link, gpi-tabs button[type='button']",
          ),
        );

        const extractCleanText = (node: Element): string => {
          const clone = node.cloneNode(true) as Element;
          clone
            .querySelectorAll(
              'mat-icon, .material-icons, .material-symbols-outlined, svg, fa-icon',
            )
            .forEach((n) => n.remove());
          return (clone.textContent || '').trim().replace(/\s+/g, ' ');
        };

        for (const el of tabEls) {
          if (el.closest(ignoreSel)) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;

          const label = extractCleanText(el)
            .replace(/\s+\d+$/, '')
            .trim();
          if (label.toLowerCase() === targetLabel.toLowerCase()) {
            el.setAttribute('data-am-target-tab', 'true');
            return true;
          }
        }
        return false;
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        targetLabel,
      },
    );

    if (!tagged) return false;
    const loc = page.locator("[data-am-target-tab='true']").first();
    if (!(await loc.isVisible({ timeout: 1500 }).catch(() => false)))
      return false;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ timeout: 2500 }).catch(() => {});
    await this.waitForUiSettled(page, 2500);
    return true;
  }

  /**
   * Explora botones de acción seguros dentro de una vista o pestaña activa (ej. "Editar Asesor",
   * "Agregar ...", "Asignar ...", "Nuevo ..."), saca captura de la subpantalla o modal que abren
   * y regresa limpiamente a la misma vista/pestaña.
   */
  private async exploreTabContextButtons(options: {
    page: Page;
    baseUrl: string;
    isBaseModal: boolean;
    activeTabLabel: string | null;
    parentTitle: string;
    screenshotsDir: string;
    liveDom: LivePageInspection;
    visitedButtons: Set<string>;
    maxButtons: number;
    nextShotName: (slug: string) => string;
    canCaptureMore: () => boolean;
  }): Promise<AutoExploreResult> {
    const {
      page,
      baseUrl,
      isBaseModal,
      activeTabLabel,
      parentTitle,
      screenshotsDir,
      visitedButtons,
      maxButtons,
      nextShotName,
      canCaptureMore,
    } = options;
    let liveDom = options.liveDom;
    const newShots: CapturedScreenshot[] = [];

    if (maxButtons <= 0 || !canCaptureMore()) {
      return { screenshots: newShots, liveDom };
    }

    try {
      const candidates = await this.findSafeActionButtons(page);
      const freshCandidates = candidates.filter(
        (c) => !visitedButtons.has(c.label.toLowerCase()),
      );
      if (freshCandidates.length === 0) {
        return { screenshots: newShots, liveDom };
      }

      let captured = 0;

      for (let i = 0; i < freshCandidates.length; i++) {
        if (captured >= maxButtons || !canCaptureMore()) break;
        const candidate = freshCandidates[i];
        const key = candidate.label.toLowerCase();
        if (visitedButtons.has(key)) continue;
        visitedButtons.add(key);

        // Si un botón anterior nos sacó de baseUrl, volver y reactivar la pestaña actual
        if (!isBaseModal && page.url() !== baseUrl) {
          await this.returnToOrigin(page, baseUrl, false);
          if (activeTabLabel) {
            await this.clickTabByLabel(page, activeTabLabel);
          }
        }

        const tagged = await this.tagSafeActionButtonByLabel(
          page,
          candidate.label,
        );
        if (!tagged) continue;

        const beforeState = await this.getPageSnapshotState(page);
        const btnLoc = page.locator("[data-am-action-btn='true']").first();
        if (!(await btnLoc.isVisible({ timeout: 1500 }).catch(() => false)))
          continue;

        const contextLabel = activeTabLabel
          ? `${parentTitle} › ${activeTabLabel}`
          : parentTitle;
        console.log(
          pc.cyan(
            `    🖱 Explorando botón en "${contextLabel}": "${candidate.label}"...`,
          ),
        );
        await btnLoc.scrollIntoViewIfNeeded().catch(() => {});
        await btnLoc.click({ timeout: 3000 }).catch(() => {});

        await this.waitForUiSettled(page, 3500);
        await page.waitForTimeout(450);

        const afterState = await this.getPageSnapshotState(page);
        const urlChanged = afterState.url !== beforeState.url;
        const modalOpened =
          afterState.visibleDialogs > beforeState.visibleDialogs;
        const headingChanged =
          afterState.headings.length > 0 &&
          afterState.headings[0] !== beforeState.headings[0];
        const fieldsGrew = afterState.fieldCount >= beforeState.fieldCount + 2;

        if (urlChanged || modalOpened || headingChanged || fieldsGrew) {
          const subDom = await this.domInspector.inspectPage(page);
          const subTitle =
            (afterState.headings[0] &&
            afterState.headings[0] !== beforeState.headings[0]
              ? afterState.headings[0]
              : subDom.pageTitle) || candidate.label;

          const isModal = modalOpened && !urlChanged;
          const shotKind = isModal ? 'modal' : 'subview';
          const slugPrefix = activeTabLabel
            ? `${activeTabLabel}-${candidate.label}`
            : candidate.label;
          const fileName = nextShotName(`accion-${slugPrefix}`);
          const filePath = path.join(screenshotsDir, fileName);
          await page.screenshot({ path: filePath, fullPage: false });

          const noteParts: string[] = [];
          if (urlChanged) noteParts.push(`Ruta: ${shortenUrl(afterState.url)}`);
          if (subDom.fields.length > 0) {
            const fPreview = subDom.fields
              .slice(0, 6)
              .map((f) => f.label)
              .join(', ');
            noteParts.push(
              `${subDom.fields.length} campo(s): ${fPreview}${subDom.fields.length > 6 ? ` (+${subDom.fields.length - 6})` : ''}`,
            );
          }

          newShots.push({
            fileName,
            caption: activeTabLabel
              ? `${parentTitle} [${activeTabLabel}] → "${candidate.label}"`
              : `${parentTitle} → "${candidate.label}" (${subTitle})`,
            kind: shotKind,
            userNote:
              noteParts.length > 0
                ? noteParts.join(' • ')
                : `Vista abierta al pulsar "${candidate.label}"`,
          });
          captured++;
          console.log(
            pc.green(
              `    📸 Capturada acción "${candidate.label}" en "${contextLabel}" -> ${fileName} (+${subDom.fields.length} campos)`,
            ),
          );

          this.upsertDiscoveredAction(
            liveDom,
            activeTabLabel
              ? `${candidate.label} (${activeTabLabel})`
              : candidate.label,
            `Desde "${contextLabel}", abre ${isModal ? 'el modal' : 'la vista'} "${subTitle}"${urlChanged ? ` (${shortenUrl(afterState.url)})` : ''}${subDom.fields.length > 0 ? ` con ${subDom.fields.length} campo(s)` : ''}.`,
          );

          liveDom = this.domInspector.mergeInspections(liveDom, subDom);

          // Volver a la vista/pestaña donde estábamos
          if (isModal) {
            await this.returnToOrigin(page, baseUrl, true);
          } else if (urlChanged && !isBaseModal) {
            await this.returnToOrigin(page, baseUrl, false);
            if (activeTabLabel && i < freshCandidates.length - 1) {
              await this.clickTabByLabel(page, activeTabLabel);
            }
          }
        }
      }
    } catch {
      // Continuar silenciosamente
    } finally {
      await page
        .evaluate(() => {
          document
            .querySelectorAll('[data-am-action-btn]')
            .forEach((el) => el.removeAttribute('data-am-action-btn'));
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * Recorre TODAS las pestañas dentro de una vista de detalle recién abierta
   * y presiona los botones de acción seguros que encuentre en cada pestaña.
   */
  private async exploreDetailTabsAndButtons(
    page: Page,
    detailUrl: string,
    isDetailModal: boolean,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    parentTitle: string,
    maxTabs: number,
    maxButtonsPerTab: number,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];
    const visitedDetailButtons = new Set<string>();

    try {
      const { activeTab, inactiveTabs } = await this.listVisibleTabs(page);
      const exploredTabNames: string[] = [];
      if (activeTab) exploredTabNames.push(activeTab);

      // 1. Primero explorar botones de acción seguros visibles en el detalle / pestaña inicial activa
      if (maxButtonsPerTab > 0 && canCaptureMore()) {
        const initialBtnOutcome = await this.exploreTabContextButtons({
          page,
          baseUrl: detailUrl,
          isBaseModal: isDetailModal,
          activeTabLabel: activeTab,
          parentTitle,
          screenshotsDir,
          liveDom,
          visitedButtons: visitedDetailButtons,
          maxButtons: maxButtonsPerTab,
          nextShotName,
          canCaptureMore,
        });
        liveDom = initialBtnOutcome.liveDom;
        newShots.push(...initialBtnOutcome.screenshots);
      }

      // 2. Recorrer TODAS las pestañas inactivas del detalle (hasta maxTabs)
      if (maxTabs > 0 && inactiveTabs.length > 0) {
        const tabsToVisit = inactiveTabs.slice(0, maxTabs);
        console.log(
          pc.cyan(
            `    🗂 Recorriendo ${tabsToVisit.length} pestaña(s) dentro de "${parentTitle}"...`,
          ),
        );

        for (const tabLabel of tabsToVisit) {
          if (!canCaptureMore()) break;

          // Asegurar que estamos en detailUrl (por si un botón anterior navegó)
          if (!isDetailModal && page.url() !== detailUrl) {
            await this.returnToOrigin(page, detailUrl, false);
          }

          const clicked = await this.clickTabByLabel(page, tabLabel);
          if (!clicked) continue;

          const tabDom = await this.domInspector.inspectPage(page);
          liveDom = this.domInspector.mergeInspections(liveDom, tabDom);
          exploredTabNames.push(tabLabel);

          const fileName = nextShotName(`detalle-pestana-${tabLabel}`);
          const filePath = path.join(screenshotsDir, fileName);
          await page.screenshot({ path: filePath, fullPage: false });

          const bestTbl = this.getBestTable(tabDom.tables);
          const noteParts: string[] = [
            `Sub-pestaña dentro de "${parentTitle}"`,
          ];
          if (tabDom.fields.length > 0)
            noteParts.push(`${tabDom.fields.length} campo(s)`);
          if (bestTbl && bestTbl.rowCount > 0)
            noteParts.push(`tabla con ${bestTbl.rowCount} registro(s)`);

          newShots.push({
            fileName,
            caption: `${parentTitle} — Pestaña: ${tabLabel}`,
            kind: 'detail',
            userNote: noteParts.join(' • '),
          });
          console.log(
            pc.green(
              `    📸 Capturada pestaña de detalle "${tabLabel}" -> ${fileName}`,
            ),
          );

          // 3. Explorar botones de acción seguros exclusivos de esta pestaña
          if (maxButtonsPerTab > 0 && canCaptureMore()) {
            const tabBtnOutcome = await this.exploreTabContextButtons({
              page,
              baseUrl: detailUrl,
              isBaseModal: isDetailModal,
              activeTabLabel: tabLabel,
              parentTitle,
              screenshotsDir,
              liveDom,
              visitedButtons: visitedDetailButtons,
              maxButtons: maxButtonsPerTab,
              nextShotName,
              canCaptureMore,
            });
            liveDom = tabBtnOutcome.liveDom;
            newShots.push(...tabBtnOutcome.screenshots);
          }
        }
      }

      if (exploredTabNames.length > 0) {
        liveDom = {
          ...liveDom,
          exploredTabs: Array.from(
            new Set([...(liveDom.exploredTabs || []), ...exploredTabNames]),
          ),
        };
      }
    } catch {
      // Continuar silenciosamente
    } finally {
      await page
        .evaluate(() => {
          document
            .querySelectorAll('[data-am-target-tab]')
            .forEach((el) => el.removeAttribute('data-am-target-tab'));
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * Obtiene una huella ligera del estado actual de la pantalla para detectar si un clic navegó o abrió un modal
   */
  private async getPageSnapshotState(page: Page): Promise<{
    url: string;
    visibleDialogs: number;
    headings: string[];
    fieldCount: number;
  }> {
    return page.evaluate(
      ({ contentSel, ignoreSel, dialogSel }) => {
        const contentArea =
          (document.querySelector(contentSel) as HTMLElement) || document.body;
        const dialogs = Array.from(document.querySelectorAll(dialogSel)).filter(
          (el) => {
            const r = el.getBoundingClientRect();
            const st = window.getComputedStyle(el);
            return (
              r.width > 40 &&
              r.height > 40 &&
              st.display !== 'none' &&
              st.visibility !== 'hidden' &&
              Number(st.opacity || '1') > 0
            );
          },
        );

        const headings = Array.from(
          contentArea.querySelectorAll('h1, h2, .page-title, .header-title'),
        )
          .filter((el) => {
            if (el.closest(ignoreSel)) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '))
          .filter(Boolean)
          .slice(0, 4);

        const fieldCount = Array.from(
          contentArea.querySelectorAll(
            "input:not([type='hidden']), select, textarea, mat-select, gpi-select, ng-select",
          ),
        ).filter((el) => {
          if (el.closest(ignoreSel)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length;

        return {
          url: window.location.href,
          visibleDialogs: dialogs.length,
          headings,
          fieldCount,
        };
      },
      {
        contentSel: CONTENT_AREA_SELECTOR,
        ignoreSel: IGNORE_CHROME_SELECTOR,
        dialogSel: DIALOG_SELECTOR,
      },
    );
  }

  /**
   * Cierra un modal abierto o vuelve a la URL principal original de la sección
   */
  private async returnToOrigin(
    page: Page,
    originUrl: string,
    closeModalOnly: boolean,
  ): Promise<void> {
    try {
      if (closeModalOnly && page.url() === originUrl) {
        const closeClicked = await page.evaluate((dialogSel) => {
          const dialogs = Array.from(document.querySelectorAll(dialogSel));
          const topDialog = dialogs[dialogs.length - 1];
          if (!topDialog) return false;
          const btns = Array.from(
            topDialog.querySelectorAll("button, [role='button']"),
          );
          for (const b of btns) {
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const label =
              `${b.textContent || ''} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`.trim();
            if (
              /\b(cerrar|cancelar|volver|close|dismiss)\b|^[×✕x]$/i.test(label)
            ) {
              (b as HTMLElement).click();
              return true;
            }
          }
          return false;
        }, DIALOG_SELECTOR);

        if (!closeClicked) {
          await page.keyboard.press('Escape').catch(() => {});
        }
        await page.waitForTimeout(450);
        return;
      }

      if (page.url() !== originUrl) {
        await page
          .goto(originUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(() => {});
        await this.waitForUiSettled(page, 3000);
      }
    } catch {
      // Continuar silenciosamente
    }
  }

  /**
   * Inserta o actualiza la descripción real de un botón/acción descubierta en liveDom.actions
   */
  private upsertDiscoveredAction(
    liveDom: LivePageInspection,
    name: string,
    description: string,
  ): void {
    const norm = name.toLowerCase().trim();
    const existing = liveDom.actions.find(
      (a) => a.name.toLowerCase().trim() === norm,
    );
    if (existing) {
      existing.description = description;
    } else {
      liveDom.actions.unshift({ name, description });
    }
  }

  /**
   * 6. Recorre TODAS las pestañas secundarias dentro del contenido principal
   *    y presiona botones de acción seguros encontrados dentro de cada pestaña
   */
  private async exploreTabs(
    page: Page,
    originUrl: string,
    screenshotsDir: string,
    liveDom: LivePageInspection,
    maxTabCaptures: number,
    maxButtonsPerTab: number,
    visitedMainButtons: Set<string>,
    nextShotName: (slug: string) => string,
    canCaptureMore: () => boolean,
  ): Promise<AutoExploreResult> {
    const newShots: CapturedScreenshot[] = [];

    try {
      if (page.url() !== originUrl) {
        await this.returnToOrigin(page, originUrl, false);
      }

      const { activeTab, inactiveTabs } = await this.listVisibleTabs(page);
      if (inactiveTabs.length === 0) {
        return { screenshots: newShots, liveDom };
      }

      const exploredNames: string[] = [];
      if (activeTab) exploredNames.push(activeTab);
      const toVisit = inactiveTabs.slice(0, maxTabCaptures);
      console.log(
        pc.cyan(
          `    🗂 Explorando ${toVisit.length} pestaña(s) adicional(es)...`,
        ),
      );

      for (const tabLabel of toVisit) {
        if (!canCaptureMore()) break;

        if (page.url() !== originUrl) {
          await this.returnToOrigin(page, originUrl, false);
        }

        const clicked = await this.clickTabByLabel(page, tabLabel);
        if (!clicked) continue;

        const tabDom = await this.domInspector.inspectPage(page);
        liveDom = this.domInspector.mergeInspections(liveDom, tabDom);
        exploredNames.push(tabLabel);

        const fileName = nextShotName(`pestana-${tabLabel}`);
        const filePath = path.join(screenshotsDir, fileName);
        await page.screenshot({ path: filePath, fullPage: false });

        const bestTbl = this.getBestTable(tabDom.tables);
        const noteParts: string[] = [];
        if (tabDom.fields.length > 0)
          noteParts.push(`${tabDom.fields.length} campo(s)`);
        if (bestTbl && bestTbl.rowCount > 0)
          noteParts.push(`tabla con ${bestTbl.rowCount} registro(s)`);

        newShots.push({
          fileName,
          caption: `Pestaña: ${tabLabel}`,
          kind: 'tab',
          userNote:
            noteParts.length > 0
              ? `Contenido detectado: ${noteParts.join(' • ')}`
              : undefined,
        });
        console.log(
          pc.green(`    📸 Capturada pestaña "${tabLabel}" -> ${fileName}`),
        );

        // Explorar botones de acción seguros dentro de esta pestaña
        if (maxButtonsPerTab > 0 && canCaptureMore()) {
          const tabBtnOutcome = await this.exploreTabContextButtons({
            page,
            baseUrl: originUrl,
            isBaseModal: false,
            activeTabLabel: tabLabel,
            parentTitle: liveDom.pageTitle || 'Vista',
            screenshotsDir,
            liveDom,
            visitedButtons: visitedMainButtons,
            maxButtons: maxButtonsPerTab,
            nextShotName,
            canCaptureMore,
          });
          liveDom = tabBtnOutcome.liveDom;
          newShots.push(...tabBtnOutcome.screenshots);
        }
      }

      if (exploredNames.length > 0) {
        liveDom = {
          ...liveDom,
          exploredTabs: Array.from(
            new Set([...(liveDom.exploredTabs || []), ...exploredNames]),
          ),
        };
      }
    } catch {
      // Continuar silenciosamente
    } finally {
      await page
        .evaluate(() => {
          document.querySelectorAll('[data-am-target-tab]').forEach((el) => {
            el.removeAttribute('data-am-target-tab');
          });
        })
        .catch(() => {});
    }

    return { screenshots: newShots, liveDom };
  }

  /**
   * Asocia las opciones descubiertas al campo correspondiente dentro de liveDom.fields
   */
  private attachOptionsToField(
    liveDom: LivePageInspection,
    label: string,
    options: string[],
  ): void {
    const normTarget = label.toLowerCase().trim();
    const existing = liveDom.fields.find(
      (f) =>
        f.label.toLowerCase().trim() === normTarget ||
        f.label.toLowerCase().includes(normTarget) ||
        normTarget.includes(f.label.toLowerCase()),
    );

    if (existing) {
      const merged = Array.from(
        new Set([...(existing.options || []), ...options]),
      ).slice(0, 30);
      existing.options = merged;
      if (!existing.example || existing.example === 'Selección de lista') {
        existing.example = `Ej: ${merged.slice(0, 3).join(' / ')}`;
      }
    } else {
      liveDom.fields.push({
        label,
        isRequired: false,
        meaning: `Menú desplegable para seleccionar ${label.toLowerCase()}.`,
        example: `Ej: ${options.slice(0, 3).join(' / ')}`,
        options: options.slice(0, 30),
      });
    }
  }

  private getBestTable(
    tables?: DiscoveredTableInfo[],
  ): DiscoveredTableInfo | null {
    if (!tables || tables.length === 0) return null;
    return [...tables].sort((a, b) => {
      if (b.rowCount !== a.rowCount) return b.rowCount - a.rowCount;
      return b.columns.length - a.columns.length;
    })[0];
  }

  private async scrollBestTableIntoView(page: Page): Promise<void> {
    await page
      .evaluate(
        ({ contentSel, ignoreSel }) => {
          const contentArea =
            (document.querySelector(contentSel) as HTMLElement) ||
            document.body;
          const tables = Array.from(
            contentArea.querySelectorAll(
              "table, mat-table, [role='table'], [role='grid']",
            ),
          );
          let best: HTMLElement | null = null;
          let bestScore = -1;

          for (const tbl of tables) {
            if (tbl.closest(ignoreSel)) continue;
            const rect = tbl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const rows = tbl.querySelectorAll(
              "tbody tr, mat-row, [role='row']",
            ).length;
            if (rows > bestScore) {
              bestScore = rows;
              best = tbl as HTMLElement;
            }
          }

          if (best) {
            best.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        },
        {
          contentSel: CONTENT_AREA_SELECTOR,
          ignoreSel: IGNORE_CHROME_SELECTOR,
        },
      )
      .catch(() => {});
  }

  /**
   * Espera a que desaparezcan spinners/loaders comunes tras una interacción
   */
  private async waitForUiSettled(
    page: Page,
    maxWaitMs: number = 4000,
  ): Promise<void> {
    const start = Date.now();
    await page.waitForTimeout(350);

    while (Date.now() - start < maxWaitMs) {
      const isLoading = await page
        .evaluate(() => {
          const loaders = Array.from(
            document.querySelectorAll(
              'mat-spinner, mat-progress-spinner, .mat-mdc-progress-spinner, mat-progress-bar, .ngx-spinner-overlay, .loading-overlay, .spinner-border',
            ),
          );
          return loaders.some((el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              Number(style.opacity || '1') > 0
            );
          });
        })
        .catch(() => false);

      if (!isLoading) break;
      await page.waitForTimeout(250);
    }

    await page.waitForTimeout(300);
  }
}

function slugify(text: string): string {
  return (
    text
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .slice(0, 40) || 'captura'
  );
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? '?...' : '');
  } catch {
    return url.slice(0, 80);
  }
}
