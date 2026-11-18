import path from 'path';
import { ConfiguracionCliente, SeccionDocGenerada } from './tipos.js';
import { resolverTema } from './theme.js';

export class MotorPlantillas {
  public generarPortada(configCliente: ConfiguracionCliente, _totalCapturas: number): string {
    const tema = resolverTema(configCliente.theme);
    const nombreArchivoLogo = path.basename(tema.logoPath);

    let totalSecciones = 0;
    configCliente.modules.forEach((m) => (totalSecciones += m.sections.length));

    const modulosHtml = configCliente.modules
      .map((mod) => {
        const tarjetasSecciones = mod.sections
          .map((sec) => {
            const secHref = `${mod.id}/${sec.id}/index.html`;
            const descripcion = sec.description || 'Procedimientos operativos y parámetros.';
            return `
            <a href="${secHref}" class="apple-card" data-title="${escaparHtml(sec.title)}" data-desc="${escaparHtml(descripcion)}" data-module="${escaparHtml(mod.title)}">
              <div>
                <h3 class="card-title">${escaparHtml(sec.title)}</h3>
                <p class="card-desc">${escaparHtml(descripcion)}</p>
              </div>
              <div class="card-bottom-row">
                <span class="card-route-pill">${escaparHtml(sec.route)}</span>
                <span class="card-link-action">
                  <span>Abrir</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </span>
              </div>
            </a>`;
          })
          .join('\n');

        return `
        <section class="module-group" data-module="${escaparHtml(mod.title)}">
          <div class="module-header">
            <h2 class="module-title">${escaparHtml(mod.title)}</h2>
            <span class="module-count">${mod.sections.length} ${mod.sections.length === 1 ? 'pantalla' : 'pantallas'}</span>
          </div>
          <div class="cards-grid">
            ${tarjetasSecciones}
          </div>
        </section>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manual de Usuario | ${escaparHtml(configCliente.name)}</title>
  <link rel="stylesheet" href="assets/theme.css">
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>

  <header class="top-navbar">
    <div class="nav-left">
      <a href="index.html" class="brand-link">
        <img src="assets/${nombreArchivoLogo}" alt="Logo" class="brand-logo" onerror="this.style.display='none'">
        <span>${escaparHtml(configCliente.name)}</span>
      </a>
      <div class="nav-divider"></div>
      <span class="nav-location">Manual de Operación</span>
    </div>
    <div class="nav-right">
      <span class="badge-counter">${totalSecciones} pantallas documentadas</span>
    </div>
  </header>

  <main class="main-container">
    
    <div class="apple-hero">
      <h1 class="apple-hero-title">Manual de Usuario</h1>
      <p class="apple-hero-subtitle">Guía visual de operaciones, pantallas y flujos de trabajo.</p>

      <div class="search-wrapper">
        <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" id="searchInput" class="apple-search-input" placeholder="Buscar pantalla por nombre o ruta..." autocomplete="off">
        <span class="search-kbd-hint">/</span>
      </div>
    </div>

    <div id="modulesContainer">
      ${modulosHtml}
    </div>

    <div id="searchEmpty" class="search-empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <p>No se encontraron pantallas para tu búsqueda.</p>
      <button class="btn btn-secondary" onclick="document.getElementById('searchInput').value=''; document.getElementById('searchInput').dispatchEvent(new Event('input'))">
        Restablecer búsqueda
      </button>
    </div>

  </main>

  <script>
    const searchInput = document.getElementById('searchInput');
    const cards = document.querySelectorAll('.apple-card');
    const moduleGroups = document.querySelectorAll('.module-group');
    const emptyState = document.getElementById('searchEmpty');

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      let visibleCount = 0;

      cards.forEach(card => {
        const title = card.getAttribute('data-title').toLowerCase();
        const desc = card.getAttribute('data-desc').toLowerCase();
        const matches = !q || title.includes(q) || desc.includes(q);
        card.style.display = matches ? 'flex' : 'none';
        if (matches) visibleCount++;
      });

      moduleGroups.forEach(group => {
        const visibleInGroup = group.querySelectorAll('.apple-card[style="display: flex;"]');
        const hasVisible = !q || visibleInGroup.length > 0;
        group.style.display = hasVisible ? 'block' : 'none';
      });

      emptyState.style.display = (visibleCount === 0 && q.length > 0) ? 'block' : 'none';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.blur();
      }
    });
  </script>

</body>
</html>`;
  }

  public generarPaginaSeccion(configCliente: ConfiguracionCliente, seccion: SeccionDocGenerada): string {
    const tema = resolverTema(configCliente.theme);
    const nombreArchivoLogo = path.basename(tema.logoPath);

    const itemsOpcionesSeccion = configCliente.modules
      .map((mod) => {
        const opciones = mod.sections
          .map((s) => {
            const relPath = `../../${mod.id}/${s.id}/index.html`;
            const estaSeleccionada = mod.id === seccion.moduleId && s.id === seccion.id;
            return `<option value="${relPath}" ${estaSeleccionada ? 'selected' : ''}>${escaparHtml(mod.title)} &rsaquo; ${escaparHtml(s.title)}</option>`;
          })
          .join('\n');
        return `<optgroup label="${escaparHtml(mod.title)}">${opciones}</optgroup>`;
      })
      .join('\n');

    const breadcrumbsHtml = seccion.howToReach
      .map((step, idx) => {
        const esUltimo = idx === seccion.howToReach.length - 1;
        return esUltimo
          ? `<span class="breadcrumb-item breadcrumb-current">${escaparHtml(step)}</span>`
          : `<span class="breadcrumb-item">${escaparHtml(step)}</span><span class="breadcrumb-separator">&rsaquo;</span>`;
      })
      .join('');

    const capturas = seccion.screenshots || [];
    const itemsLightboxJson = JSON.stringify(
      capturas.map((s) => ({
        src: `screenshots/${s.fileName}`,
        caption: s.caption || seccion.title,
        note: s.userNote || '',
      })),
    );

    const principalCaptura = capturas[0];
    const principalCapturaHtml = principalCaptura
      ? `
      <div class="mac-window-frame" onclick="openLightboxAt(0)">
        <div class="mac-titlebar">
          <div class="mac-buttons">
            <span class="mac-btn mac-btn-close"></span>
            <span class="mac-btn mac-btn-min"></span>
            <span class="mac-btn mac-btn-max"></span>
          </div>
          <div class="mac-title">${escaparHtml(seccion.title)} &mdash; Vista Principal</div>
          <div class="mac-zoom-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            <span>Clic para ampliar</span>
          </div>
        </div>
        <img src="screenshots/${principalCaptura.fileName}" alt="${escaparHtml(principalCaptura.caption || seccion.title)}" class="mac-screenshot-img">
        ${principalCaptura.userNote ? `<div class="mac-caption-note">${escaparHtml(principalCaptura.userNote)}</div>` : ''}
      </div>`
      : '';

    const capturasSecundarias = capturas.slice(1);
    const capturasSecundariasHtml =
      capturasSecundarias.length > 0
        ? `
      <div class="extra-screenshots-section">
        <h3 class="extra-screenshots-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Estados y Subpantallas Exploradas (${capturasSecundarias.length})
        </h3>
        <div class="extra-screenshots-grid">
          ${capturasSecundarias
            .map(
              (s, i) => `
            <div class="extra-screenshot-card" onclick="openLightboxAt(${i + 1})">
              <div class="extra-screenshot-thumb-box">
                <img src="screenshots/${s.fileName}" alt="${escaparHtml(s.caption)}" class="extra-screenshot-thumb" loading="lazy">
                <span class="extra-screenshot-badge">${escaparHtml(s.kind || 'subview')}</span>
              </div>
              <div class="extra-screenshot-meta">
                <div class="extra-screenshot-caption">${escaparHtml(s.caption)}</div>
                ${s.userNote ? `<div class="extra-screenshot-note">${escaparHtml(s.userNote)}</div>` : ''}
              </div>
            </div>`,
            )
            .join('\n')}
        </div>
      </div>`
        : '';

    const campos = seccion.userGuide?.fields || [];
    const camposHtml =
      campos.length > 0
        ? `
      <div class="content-card">
        <h2 class="content-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Campos y Parámetros de la Pantalla
        </h2>
        <p class="content-card-desc">Conoce el significado de cada campo y cómo completarlo correctamente:</p>
        <div class="fields-grid">
          ${campos
            .map(
              (f) => `
            <div class="field-item">
              <div class="field-item-header">
                <span class="field-name">${escaparHtml(f.label)}</span>
                <span class="field-badge ${f.isRequired ? 'badge-required' : 'badge-optional'}">
                  ${f.isRequired ? 'Obligatorio' : 'Opcional'}
                </span>
              </div>
              <div class="field-meaning">${escaparHtml(f.meaning)}</div>
              ${
                f.options && f.options.length > 0
                  ? `
                <div class="field-options-box">
                  <span class="field-options-title">Opciones disponibles:</span>
                  <div class="field-options-tags">
                    ${f.options
                      .slice(0, 8)
                      .map((opt) => `<span class="option-tag">${escaparHtml(opt)}</span>`)
                      .join('')}
                    ${f.options.length > 8 ? `<span class="option-tag-more">+${f.options.length - 8} más</span>` : ''}
                  </div>
                </div>`
                  : ''
              }
              <div class="field-example-row">
                <span class="example-label">Ejemplo:</span>
                <code class="example-code">${escaparHtml(f.example)}</code>
                <button class="copy-example-btn" onclick="copyExampleText('${escaparJsString(f.example)}', this)" title="Copiar ejemplo">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>
            </div>`,
            )
            .join('\n')}
        </div>
      </div>`
        : '';

    const acciones = seccion.userGuide?.actions || [];
    const accionesHtml =
      acciones.length > 0
        ? `
      <div class="content-card">
        <h2 class="content-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          Acciones y Botones Disponibles
        </h2>
        <div class="actions-list">
          ${acciones
            .map(
              (a) => `
            <div class="action-item">
              <span class="action-btn-pill">${escaparHtml(a.name)}</span>
              <span class="action-desc">${escaparHtml(a.description)}</span>
            </div>`,
            )
            .join('\n')}
        </div>
      </div>`
        : '';

    const pasos = seccion.userGuide?.stepByStep || [];
    const pasosHtml =
      pasos.length > 0
        ? pasos
            .map(
              (p) => `
          <div class="step-compact-item">
            <span class="step-num">${p.stepNumber}</span>
            <div class="step-content">
              <h4 class="step-title">${escaparHtml(p.title)}</h4>
              <p class="step-desc">${escaparHtml(p.description)}</p>
            </div>
          </div>`,
            )
            .join('\n')
        : '<p style="color:var(--text-muted); font-size:0.88rem;">Flujo operativo estándar para esta vista.</p>';

    const elementosVisuales = seccion.userGuide?.visualElements || [];
    const elementosVisualesHtml =
      elementosVisuales.length > 0
        ? `
      <div class="content-card">
        <h2 class="content-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          Tablas, Filtros y Elementos en Pantalla
        </h2>
        <div class="fields-grid">
          ${elementosVisuales
            .map(
              (el) => `
            <div class="field-item">
              <div class="field-item-header">
                <span class="field-name">${escaparHtml(el.name)}</span>
                <span class="field-badge" style="background:var(--client-primary-subtle); color:var(--client-primary);">${escaparHtml(el.type)}</span>
              </div>
              <div class="field-meaning">${escaparHtml(el.description)}</div>
            </div>`,
            )
            .join('\n')}
        </div>
      </div>`
        : '';

    const alertas = seccion.userGuide?.alerts || [];
    const alertasHtml =
      alertas.length > 0
        ? `
      <div class="content-card alert-card">
        <h2 class="content-card-title" style="color:#b45309;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Validaciones y Avisos Importantes
        </h2>
        <ul class="tips-list">
          ${alertas.map((a) => `<li>${escaparHtml(a)}</li>`).join('\n')}
        </ul>
      </div>`
        : '';

    const tips = seccion.userGuide?.tips || [];
    const tipsHtml =
      tips.length > 0
        ? `
      <div class="content-card tips-card">
        <h2 class="content-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v1M12 21v1M4.22 4.22l.71.71M18.36 18.36l.71.71M1 12h2M21 12h2M4.22 19.78l.71-.71M18.36 5.64l.71-.71M12 6a6 6 0 0 0-6 6c0 2.22 1.21 4.16 3 5.2V19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.8c1.79-1.04 3-2.98 3-5.2a6 6 0 0 0-6-6z"/></svg>
          Recomendaciones y Consejos Prácticos
        </h2>
        <ul class="tips-list">
          ${tips.map((t) => `<li>${escaparHtml(t)}</li>`).join('\n')}
        </ul>
      </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escaparHtml(seccion.title)} | ${escaparHtml(configCliente.name)}</title>
  <link rel="stylesheet" href="../../assets/theme.css">
  <link rel="stylesheet" href="../../assets/styles.css">
</head>
<body class="section-body">

  <header class="top-navbar">
    <div class="nav-left">
      <a href="../../index.html" class="brand-link" title="Ir a la portada">
        <img src="../../assets/${nombreArchivoLogo}" alt="Logo" class="brand-logo" onerror="this.style.display='none'">
        <span>${escaparHtml(configCliente.name)}</span>
      </a>
      <div class="nav-divider"></div>
      <a href="../../index.html" class="nav-back-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>Portada</span>
      </a>
    </div>

    <div class="nav-right">
      <div class="section-picker-wrapper">
        <svg class="picker-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <select class="section-picker-select" onchange="if(this.value) window.location.href=this.value;">
          ${itemsOpcionesSeccion}
        </select>
      </div>
    </div>
  </header>

  <main class="section-main-container">

    <div class="breadcrumbs-row">
      ${breadcrumbsHtml}
    </div>

    <div class="section-hero">
      <div class="section-hero-badge">${escaparHtml(seccion.moduleTitle)}</div>
      <h1 class="section-hero-title">${escaparHtml(seccion.title)}</h1>
      <p class="section-hero-desc">
        ${escaparHtml(seccion.userGuide?.purpose || seccion.description || 'Procedimientos y operaciones de la pantalla.')}
      </p>
    </div>

    ${principalCapturaHtml}
    ${capturasSecundariasHtml}
    ${elementosVisualesHtml}
    ${camposHtml}
    ${accionesHtml}

    <div class="content-card">
      <h2 class="content-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Flujo de Uso Paso a Paso
      </h2>
      <div class="steps-compact-box">
        ${pasosHtml}
      </div>
    </div>

    ${alertasHtml}
    ${tipsHtml}

    <div class="section-footer-nav">
      <a href="../../index.html" class="btn btn-secondary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>Volver a la portada</span>
      </a>
      <span style="font-size:0.8rem; color:var(--text-muted);">${escaparHtml(configCliente.name)} &bull; Manual de Operación</span>
    </div>

  </main>

  <div id="lightboxModal" class="lightbox-modal" onclick="closeLightbox()">
    <button class="lightbox-close" aria-label="Cerrar modal" onclick="closeLightbox()">&times;</button>
    <button id="lightboxPrev" class="lightbox-nav lightbox-prev" aria-label="Captura anterior" onclick="event.stopPropagation(); stepLightbox(-1)">&#8249;</button>
    <div class="lightbox-stage" onclick="event.stopPropagation()">
      <img id="lightboxImg" class="lightbox-content" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="Captura ampliada">
      <div class="lightbox-caption-bar">
        <div id="lightboxCaption" class="lightbox-caption-text"></div>
        <div id="lightboxNote" class="lightbox-caption-note"></div>
        <div id="lightboxCounter" class="lightbox-counter"></div>
      </div>
    </div>
    <button id="lightboxNext" class="lightbox-nav lightbox-next" aria-label="Captura siguiente" onclick="event.stopPropagation(); stepLightbox(1)">&#8250;</button>
  </div>

  <script>
    const lightboxItems = ${itemsLightboxJson};
    let currentLightboxIndex = 0;

    function renderLightboxItem() {
      if (!lightboxItems.length) return;
      const item = lightboxItems[currentLightboxIndex];
      document.getElementById('lightboxImg').src = item.src;
      document.getElementById('lightboxCaption').textContent = item.caption || '';
      const noteEl = document.getElementById('lightboxNote');
      noteEl.textContent = item.note || '';
      noteEl.style.display = item.note ? 'block' : 'none';
      const counterEl = document.getElementById('lightboxCounter');
      counterEl.textContent = lightboxItems.length > 1 ? (currentLightboxIndex + 1) + ' / ' + lightboxItems.length : '';
      document.getElementById('lightboxPrev').style.display = lightboxItems.length > 1 ? 'flex' : 'none';
      document.getElementById('lightboxNext').style.display = lightboxItems.length > 1 ? 'flex' : 'none';
    }

    function openLightboxAt(index) {
      if (!lightboxItems.length) return;
      currentLightboxIndex = Math.max(0, Math.min(index, lightboxItems.length - 1));
      renderLightboxItem();
      document.getElementById('lightboxModal').classList.add('active');
    }

    function stepLightbox(delta) {
      if (lightboxItems.length <= 1) return;
      currentLightboxIndex = (currentLightboxIndex + delta + lightboxItems.length) % lightboxItems.length;
      renderLightboxItem();
    }

    function closeLightbox() {
      document.getElementById('lightboxModal').classList.remove('active');
    }

    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('lightboxModal');
      if (!modal.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'ArrowLeft') stepLightbox(-1);
    });

    function copyExampleText(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
      });
    }
  </script>

</body>
</html>`;
  }
}

function escaparHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escaparJsString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
