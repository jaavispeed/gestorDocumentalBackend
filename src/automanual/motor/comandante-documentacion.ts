import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { ConfiguracionCliente, SeccionDocGenerada } from './tipos.js';
import { RastreadorNavegador } from './crawler.js';
import { SintetizadorGuiaUsuario } from './ai-synthesizer.js';
import { MotorPlantillas } from './template-engine.js';
import { generarCssTema } from './theme.js';
import { GestorSesionPlaywright } from './session-manager.js';
import { DescubridorNavegacion } from './nav-discovery.js';
import { AnalizadorVision } from './vision-analyzer.js';
import { obtenerRutasAutomanual } from './rutas.js';

export interface OpcionesEjecucionGeneracion {
  client: string;
  all?: boolean;
  module?: string;
  section?: string;
  headless?: boolean;
}

export class ComandanteDocumentacion {
  private rutas = obtenerRutasAutomanual();
  private crawler: RastreadorNavegador;
  private synthesizer: SintetizadorGuiaUsuario;
  private templateEngine: MotorPlantillas;
  private sessionManager: GestorSesionPlaywright;
  private visionAnalyzer: AnalizadorVision;
  private navDiscovery: DescubridorNavegacion;

  constructor() {
    this.crawler = new RastreadorNavegador();
    this.synthesizer = new SintetizadorGuiaUsuario();
    this.templateEngine = new MotorPlantillas();
    this.sessionManager = new GestorSesionPlaywright();
    this.visionAnalyzer = new AnalizadorVision();
    this.navDiscovery = new DescubridorNavegacion();
  }

  public async cargarCliente(clienteId: string): Promise<ConfiguracionCliente> {
    const configPath = path.join(
      this.rutas.directorioClientes,
      clienteId,
      'config.json',
    );
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Cliente "${clienteId}" no encontrado en ${configPath}`);
    }
    return fs.readJson(configPath);
  }

  public async iniciarSesionCliente(clienteId: string): Promise<void> {
    const config = await this.cargarCliente(clienteId);
    const clientPath = path.join(this.rutas.directorioClientes, config.id);
    await this.sessionManager.iniciarSesionYContinuar(
      config.appUrl,
      clientPath,
      config.auth,
    );
  }

  public async descubrirRutasCliente(
    clienteId: string,
  ): Promise<ConfiguracionCliente> {
    const config = await this.cargarCliente(clienteId);
    const clientPath = path.join(this.rutas.directorioClientes, config.id);
    const sessionPath = this.sessionManager.obtenerRutaSesion(clientPath);

    console.log(
      pc.bold(
        pc.cyan(
          `\nAuto-descubriendo navegación para: ${config.name} (${config.id})`,
        ),
      ),
    );

    const modulosDescubiertos = await this.navDiscovery.descubrir({
      appUrl: config.appUrl,
      storageStatePath: sessionPath,
      authConfig: config.auth,
      headless: true,
    });

    if (modulosDescubiertos.length > 0) {
      config.modules = modulosDescubiertos;
      const configFilePath = path.join(clientPath, 'config.json');
      await fs.writeJson(configFilePath, config, { spaces: 2 });
      console.log(
        pc.green(
          `Configuración de ${config.name} actualizada con ${config.modules.length} módulos.`,
        ),
      );
    }

    return config;
  }

  public async ejecutarGeneracion(
    opciones: OpcionesEjecucionGeneracion,
  ): Promise<void> {
    const config = await this.cargarCliente(opciones.client);
    const clientDir = path.join(this.rutas.directorioClientes, config.id);
    const clientOutDir = path.join(this.rutas.directorioDocs, config.id);
    const clientAssetsDir = path.join(clientOutDir, 'assets');
    const sessionPath = this.sessionManager.obtenerRutaSesion(clientDir);
    const sessionExists = await fs.pathExists(sessionPath);
    const activeSessionPath = sessionExists ? sessionPath : undefined;

    console.log(
      pc.bold(pc.cyan(`\n=== GENERADOR AUTOMANUAL ESTILO APPLE ===`)),
    );
    console.log(pc.white(`Cliente: ${config.name} (${config.id})`));
    console.log(pc.white(`URL: ${config.appUrl}`));

    await fs.ensureDir(clientAssetsDir);

    const themeCss = generarCssTema(config.theme);
    await fs.writeFile(
      path.join(clientAssetsDir, 'theme.css'),
      themeCss,
      'utf-8',
    );

    const stylesSource = path.join(
      this.rutas.directorioPlantillas,
      'styles.css',
    );
    if (await fs.pathExists(stylesSource)) {
      await fs.copy(stylesSource, path.join(clientAssetsDir, 'styles.css'));
    }

    const logoBaseName = path.basename(
      config.theme.logoPath || 'default-logo.svg',
    );
    const clientLogoSource = path.join(clientDir, logoBaseName);
    if (await fs.pathExists(clientLogoSource)) {
      await fs.copy(clientLogoSource, path.join(clientAssetsDir, logoBaseName));
    }

    let targetModuleId = opciones.module;
    let targetSectionId = opciones.section;

    await this.crawler.iniciar(opciones.headless !== false);
    let totalScreenshotsCount = 0;

    try {
      for (const mod of config.modules || []) {
        if (targetModuleId && mod.id !== targetModuleId) continue;

        for (const sec of mod.sections || []) {
          if (targetSectionId && sec.id !== targetSectionId) continue;

          console.log(
            pc.bold(
              pc.white(
                `\n📌 Documentando pantalla: [${mod.title}] -> ${sec.title}`,
              ),
            ),
          );

          const sectionOutDir = path.join(clientOutDir, mod.id, sec.id);
          const screenshotsDir = path.join(sectionOutDir, 'screenshots');
          await fs.ensureDir(screenshotsDir);

          const crawlResult = await this.crawler.capturarSeccion(
            config.appUrl,
            sec,
            screenshotsDir,
            activeSessionPath,
            config.autoExplore,
          );
          totalScreenshotsCount += crawlResult.screenshots.length;

          let visionResult = null;
          if (
            this.visionAnalyzer.estaDisponible() &&
            crawlResult.screenshots.length > 0
          ) {
            const visionShots = crawlResult.screenshots.map((s) => ({
              path: path.join(screenshotsDir, s.fileName),
              caption: s.caption,
              kind: s.kind,
              userNote: s.userNote,
            }));
            visionResult = await this.visionAnalyzer.analizarCaptura({
              screenshotPath: visionShots[0].path,
              screenshots: visionShots,
              appName: config.name,
              moduleTitle: mod.title,
              sectionTitle: sec.title,
              fields: crawlResult.liveDom.fields,
              actions: crawlResult.liveDom.actions,
              tables: crawlResult.liveDom.tables,
              exploredTabs: crawlResult.liveDom.exploredTabs,
            });
          }

          const userGuide = await this.synthesizer.sintetizarGuia(
            sec,
            crawlResult.liveDom,
            visionResult,
          );

          const howToReach =
            crawlResult.liveDom.breadcrumbs.length > 1
              ? crawlResult.liveDom.breadcrumbs
              : sec.menuPath || ['Inicio', mod.title, sec.title];

          const generatedSection: SeccionDocGenerada = {
            ...sec,
            moduleId: mod.id,
            moduleTitle: mod.title,
            howToReach,
            screenshots: crawlResult.screenshots,
            userGuide,
          };

          const sectionHtml = this.templateEngine.generarPaginaSeccion(
            config,
            generatedSection,
          );
          const sectionHtmlPath = path.join(sectionOutDir, 'index.html');
          await fs.writeFile(sectionHtmlPath, sectionHtml, 'utf-8');
          console.log(
            pc.green(
              `  ✔ Pantalla documentada: ${path.relative(this.rutas.directorioRaiz, sectionHtmlPath)}`,
            ),
          );
        }
      }

      const homeHtml = this.templateEngine.generarPortada(
        config,
        totalScreenshotsCount,
      );
      const homeHtmlPath = path.join(clientOutDir, 'index.html');
      await fs.writeFile(homeHtmlPath, homeHtml, 'utf-8');
      console.log(
        pc.green(
          `\n✔ Portada de presentación estilo Apple generada en ${path.relative(this.rutas.directorioRaiz, homeHtmlPath)}`,
        ),
      );
      console.log(
        pc.bold(
          pc.green(
            `\n🎉 ¡Manual de usuario generado con éxito para ${config.name}!`,
          ),
        ),
      );
    } finally {
      await this.crawler.cerrar();
    }
  }
}
