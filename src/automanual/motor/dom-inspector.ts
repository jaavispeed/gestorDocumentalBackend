import { Page } from 'playwright';
import {
  CampoFormularioUsuario,
  InformacionTablaDescubierta,
  AccionPantallaUsuario,
} from './tipos.js';

export interface InspeccionPaginaEnVivo {
  pageTitle: string;
  pageDescription: string;
  breadcrumbs: string[];
  fields: CampoFormularioUsuario[];
  actions: AccionPantallaUsuario[];
  notes: string[];
  tables: InformacionTablaDescubierta[];
  exploredTabs?: string[];
}

export class InspectorDom {
  public async inspectPage(page: Page): Promise<InspeccionPaginaEnVivo> {
    return this.inspeccionarPagina(page);
  }

  public mergeInspections(
    base: InspeccionPaginaEnVivo,
    extra: InspeccionPaginaEnVivo,
  ): InspeccionPaginaEnVivo {
    return this.fusionarInspecciones(base, extra);
  }

  public async inspeccionarPagina(page: Page): Promise<InspeccionPaginaEnVivo> {
    return page.evaluate<InspeccionPaginaEnVivo>(() => {
      const ignoreSelector =
        "header, .top-navbar, .navbar, mat-sidenav, .sidebar, nav, [role='navigation']";
      const contentArea =
        (document.querySelector(
          "mat-sidenav-content, .mat-drawer-content, [role='main'], main, #main-content, .main-content",
        ) as HTMLElement) || document.body;

      let title = '';
      const titleCandidate = contentArea.querySelector(
        'h1, h2.title, .page-title, .header-title, [data-title]',
      );
      if (titleCandidate && titleCandidate.textContent?.trim()) {
        title = titleCandidate.textContent.trim().replace(/\s+/g, ' ');
      } else {
        title = document.title || 'Vista del Sistema';
      }

      let description = '';
      const subCandidate = contentArea.querySelector(
        'p.subtitle, .description, mat-card-subtitle, .lead, .page-desc',
      );
      if (subCandidate && subCandidate.textContent?.trim()) {
        description = subCandidate.textContent.trim().replace(/\s+/g, ' ');
      }

      const breadcrumbs: string[] = [];
      const bcElements = contentArea.querySelectorAll(
        "nav[aria-label*='breadcrumb'] li, .breadcrumb li, .breadcrumb-item, .nav-path span, ol.breadcrumb a",
      );
      if (bcElements.length > 0) {
        bcElements.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && !['/', '>', '›', '»'].includes(text)) {
            breadcrumbs.push(text);
          }
        });
      }

      const fields: CampoFormularioUsuario[] = [];
      const seenLabels = new Set<string>();

      const inputElements = Array.from(
        contentArea.querySelectorAll(
          "input:not([type='hidden']):not([type='submit']):not([type='button']), select, mat-select, gpi-select, ng-select, .p-dropdown, textarea, [role='combobox']",
        ),
      );

      for (const el of inputElements) {
        if (el.closest(ignoreSelector)) continue;
        if (
          el.closest(
            "mat-paginator, .mat-mdc-paginator, .mat-paginator, .pagination, [class*='paginator']",
          )
        )
          continue;
        if (
          el.tagName.toLowerCase() !== 'gpi-select' &&
          el.closest('gpi-select')
        )
          continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const input = el as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        let labelText = '';

        if (el.getAttribute('label')) {
          labelText = el.getAttribute('label')!.trim();
        }

        if (!labelText && el.tagName.toLowerCase().includes('-')) {
          const innerLbl = el.querySelector('gpi-label label, label');
          if (innerLbl) labelText = innerLbl.textContent?.trim() || '';
        }

        if (!labelText && input.id) {
          const lbl = contentArea.querySelector(`label[for='${input.id}']`);
          if (lbl) labelText = lbl.textContent?.trim() || '';
        }

        if (!labelText) {
          const matField = input.closest('mat-form-field');
          if (matField) {
            const matLbl = matField.querySelector(
              'mat-label, label, mat-placeholder',
            );
            if (matLbl) labelText = matLbl.textContent?.trim() || '';
          }
        }

        if (!labelText) {
          let parent = input.parentElement;
          for (let i = 0; i < 4 && parent && parent !== contentArea; i++) {
            const candidate = parent.querySelector(
              'label, .label, .form-label, span.title',
            );
            if (
              candidate &&
              candidate !== input &&
              !candidate.contains(input)
            ) {
              const t = candidate.textContent?.trim();
              if (t && t.length < 50) {
                labelText = t;
                break;
              }
            }
            parent = parent.parentElement;
          }
        }

        const placeholder = (input as HTMLInputElement).placeholder;
        if (!labelText && placeholder) {
          labelText = placeholder.trim();
        }

        if (!labelText && input.name) {
          labelText = input.name
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .trim();
        }

        if (!labelText) continue;

        labelText = labelText.replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
        if (!labelText || labelText.length > 50) continue;

        const key = labelText.toLowerCase();
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);

        const isRequired =
          input.hasAttribute('required') ||
          input.getAttribute('aria-required') === 'true' ||
          Boolean(input.closest("mat-form-field[class*='required']")) ||
          Boolean(el.closest('[required]'));

        const options: string[] = [];
        if (input.tagName.toLowerCase() === 'select') {
          const selectEl = input as HTMLSelectElement;
          Array.from(selectEl.options).forEach((opt) => {
            const optText = opt.text.trim();
            if (
              optText &&
              !optText.toLowerCase().includes('seleccione') &&
              !options.includes(optText)
            ) {
              options.push(optText);
            }
          });
        }

        let example = 'Texto descriptivo';
        const type = (input.type || '').toLowerCase();
        if (type === 'number') example = '12345';
        else if (type === 'date') example = '2026-11-18';
        else if (type === 'email') example = 'usuario@empresa.com';
        else if (options.length > 0) example = options[0];

        fields.push({
          label: labelText,
          isRequired,
          meaning: `Ingreso o selección para ${labelText.toLowerCase()}.`,
          example,
          ...(options.length > 0 ? { options: options.slice(0, 15) } : {}),
        });
      }

      const actions: AccionPantallaUsuario[] = [];
      const seenActions = new Set<string>();
      const buttonElements = Array.from(
        contentArea.querySelectorAll(
          "button, a.btn, a.button, input[type='submit'], [role='button']",
        ),
      );

      for (const btn of buttonElements) {
        if (btn.closest(ignoreSelector)) continue;
        const text = btn.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (!text || text.length > 40) continue;
        if (/^(anterior|siguiente|\d+|<|>)$/i.test(text)) continue;

        const key = text.toLowerCase();
        if (seenActions.has(key)) continue;
        seenActions.add(key);

        actions.push({
          name: text,
          description: `Ejecuta la acción de ${text.toLowerCase()} en la pantalla.`,
        });
      }

      const tables: InformacionTablaDescubierta[] = [];
      const tableElements = Array.from(
        contentArea.querySelectorAll('table, mat-table'),
      );

      for (const tbl of tableElements) {
        const columns = Array.from(
          tbl.querySelectorAll('th, mat-header-cell, [role="columnheader"]'),
        )
          .map((th) => th.textContent?.trim().replace(/\s+/g, ' ') || '')
          .filter((t) => t.length > 0 && t.length < 50);

        const rowsCount = tbl.querySelectorAll('tbody tr, mat-row').length;

        if (columns.length > 0 || rowsCount > 0) {
          tables.push({
            columns: columns.slice(0, 15),
            rowCount: rowsCount,
          });
        }
      }

      return {
        pageTitle: title,
        pageDescription: description,
        breadcrumbs,
        fields: fields.slice(0, 20),
        actions: actions.slice(0, 12),
        notes: [],
        tables: tables.slice(0, 5),
      };
    });
  }

  public fusionarInspecciones(
    base: InspeccionPaginaEnVivo,
    extra: InspeccionPaginaEnVivo,
  ): InspeccionPaginaEnVivo {
    const mapaCampos = new Map<string, CampoFormularioUsuario>();
    for (const f of base.fields) {
      mapaCampos.set(f.label.toLowerCase(), { ...f });
    }
    for (const f of extra.fields) {
      const key = f.label.toLowerCase();
      if (!mapaCampos.has(key)) {
        mapaCampos.set(key, { ...f });
      }
    }

    const mapaAcciones = new Map<string, AccionPantallaUsuario>();
    for (const a of [...base.actions, ...extra.actions]) {
      const key = a.name.toLowerCase();
      if (!mapaAcciones.has(key)) {
        mapaAcciones.set(key, { ...a });
      }
    }

    return {
      pageTitle: base.pageTitle || extra.pageTitle,
      pageDescription: base.pageDescription || extra.pageDescription,
      breadcrumbs:
        base.breadcrumbs.length >= extra.breadcrumbs.length
          ? base.breadcrumbs
          : extra.breadcrumbs,
      fields: Array.from(mapaCampos.values()).slice(0, 30),
      actions: Array.from(mapaAcciones.values()).slice(0, 15),
      notes: Array.from(new Set([...base.notes, ...extra.notes])).slice(0, 6),
      tables:
        base.tables.length >= extra.tables.length ? base.tables : extra.tables,
    };
  }
}
