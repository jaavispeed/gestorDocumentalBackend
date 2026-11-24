import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike } from 'typeorm';
import * as path from 'path';
import fs from 'fs-extra';
import { ClienteAutomanual } from './entities/cliente-automanual.entity.js';
import { ModuloAutomanual } from './entities/modulo-automanual.entity.js';
import { PantallaAutomanual } from './entities/pantalla-automanual.entity.js';
import { CapturaAutomanual } from './entities/captura-automanual.entity.js';
import { CasoPruebaAutomanual } from './entities/caso-prueba-automanual.entity.js';
import { SupabaseStorageService } from './services/supabase-storage.service.js';
import { obtenerRutasAutomanual } from './motor/rutas.js';
import { ConfiguracionCliente } from './motor/tipos.js';
import { ComandanteDocumentacion } from './motor/comandante-documentacion.js';
import { MotorPlantillas } from './motor/template-engine.js';
import { generarCssTema } from './motor/theme.js';
import { AnalizadorVision } from './motor/vision-analyzer.js';
import {
  cargarConfiguracionPromptSincrono,
  guardarConfiguracionPrompt,
  obtenerTemperaturaEfectiva,
  PROMPT_VISION_PREDETERMINADO,
  VARIABLES_PROMPT_VISION,
} from './motor/config-sistema.js';
import { OpcionesGeneracionDto } from './dto/ejecutar-generacion.dto.js';
import {
  GuardarPantallaQaDto,
  EjecutarCasosPantallaDto,
} from './dto/pantalla-qa.dto.js';
import { EjecutorCasosPrueba } from './motor/test-runner.js';
import { OrquestadorFlujoQa } from './motor/orquestador-flujo-qa.js';
import { GuardarConfigSistemaDto } from './dto/config-sistema.dto.js';
import { ProbarIaDto } from './dto/probar-ia.dto.js';
import { PaginacionDto, RespuestaPaginada } from '../common/dto/paginacion.dto.js';

export interface ResumenCliente {
  id: string;
  name: string;
  appUrl: string;
  color?: string;
  theme: any;
  hasSession: boolean;
  hasManual: boolean;
}

@Injectable()
export class AutomanualService {
  private rutas = obtenerRutasAutomanual();
  private comandante = new ComandanteDocumentacion();
  private motorPlantillas = new MotorPlantillas();
  private ejecutorCasos = new EjecutorCasosPrueba();
  private orquestadorQa = new OrquestadorFlujoQa();

  private estaGenerando = false;
  private logsActuales: string[] = [];
  private estadoRegresion: {
    clienteSlug: string;
    enCurso: boolean;
    pantallas: Array<{
      pantallaId: string;
      nombre: string;
      ruta: string;
      esLogin: boolean;
      estado: 'PENDIENTE' | 'EJECUTANDO' | 'PASS' | 'FAIL' | 'SIN_CASOS';
      totalCasos: number;
      passed: number;
      failed: number;
      detalleFallo?: string;
    }>;
  } | null = null;
  // Almacena temporalmente el resultado de exploración/generación para revisión humana antes de guardar
  private revisionPendiente: {
    clienteSlug: string;
    pantallaId?: string;
    reemplazarExistentes?: boolean;
    moduloId: string;
    moduloTitulo: string;
    seccionId: string;
    seccionTitulo: string;
    rutaApp: string;
    capturas: Array<{
      fileName: string;
      caption: string;
      tipo: string;
      rutaLocal: string;
      previewBase64: string;
      url?: string;
    }>;
    pantallasDetectadas?: Array<{
      nombre: string;
      ruta: string;
      disparador?: string;
      capturaFileName?: string;
    }>;
    casosPrueba: any[];
    liveDom: any;
  } | null = null;

  constructor(
    @InjectRepository(ClienteAutomanual)
    private readonly clienteRepo: Repository<ClienteAutomanual>,
    @InjectRepository(ModuloAutomanual)
    private readonly moduloRepo: Repository<ModuloAutomanual>,
    @InjectRepository(PantallaAutomanual)
    private readonly pantallaRepo: Repository<PantallaAutomanual>,
    @InjectRepository(CapturaAutomanual)
    private readonly capturaRepo: Repository<CapturaAutomanual>,
    @InjectRepository(CasoPruebaAutomanual)
    private readonly casoPruebaRepo: Repository<CasoPruebaAutomanual>,
    private readonly storageService: SupabaseStorageService,
  ) {
    void this.asegurarDirectorioClientes();
  }

  private async asegurarDirectorioClientes(): Promise<void> {
    await fs.ensureDir(this.rutas.directorioClientes);
    await fs.ensureDir(this.rutas.directorioDocs);
  }

  public async obtenerClientes(
    paginacionDto?: PaginacionDto,
  ): Promise<RespuestaPaginada<ResumenCliente> | ResumenCliente[]> {
    await this.asegurarDirectorioClientes();

    const busqueda = paginacionDto?.busqueda?.trim();
    const pagina = paginacionDto?.pagina ? Number(paginacionDto.pagina) : undefined;
    const limite = paginacionDto?.limite ? Number(paginacionDto.limite) : undefined;

    // Buscar en BD
    let whereCondition: any = undefined;
    if (busqueda) {
      whereCondition = [
        { nombre: ILike(`%${busqueda}%`) },
        { identificador: ILike(`%${busqueda}%`) },
        { urlApp: ILike(`%${busqueda}%`) },
      ];
    }

    const [entidades, total] = await this.clienteRepo.findAndCount({
      where: whereCondition,
      order: { fechaActualizacion: 'DESC' },
      skip: pagina && limite ? (pagina - 1) * limite : undefined,
      take: limite || undefined,
    });

    const clientes: ResumenCliente[] = await Promise.all(
      entidades.map(async (c) => {
        const rutaSesion = path.join(
          this.rutas.directorioClientes,
          c.identificador,
          'session.json',
        );
        const rutaManual = path.join(
          this.rutas.directorioDocs,
          c.identificador,
          'index.html',
        );
        return {
          id: c.identificador,
          name: c.nombre,
          appUrl: c.urlApp,
          color: c.color,
          theme: {
            primaryColor: c.color,
            secondaryColor: '#f5f5f7',
            fontFamily: 'Inter',
            logoPath: 'default-logo.svg',
          },
          hasSession: await fs.pathExists(rutaSesion),
          hasManual: await fs.pathExists(rutaManual),
        };
      }),
    );

    if (!pagina && !limite && !busqueda) {
      return clientes;
    }

    const paginaActual = pagina || 1;
    const limiteActual = limite || 10;
    const totalPaginas = Math.ceil(total / limiteActual) || 1;

    return {
      datos: clientes,
      meta: {
        total,
        pagina: paginaActual,
        limite: limiteActual,
        totalPaginas,
        tienePaginaSiguiente: paginaActual < totalPaginas,
        tienePaginaAnterior: paginaActual > 1,
      },
    };
  }

  private normalizarConfiguracion(config: any): ConfiguracionCliente {
    if (!config) return config;
    if (Array.isArray(config.modules)) {
      config.modules = config.modules.map((mod: any) => {
        const nombreModulo = mod.name || mod.title || mod.id || 'Módulo';
        return {
          ...mod,
          name: nombreModulo,
          title: nombreModulo,
          sections: Array.isArray(mod.sections)
            ? mod.sections.map((sec: any) => {
                const nombreSec = sec.name || sec.title || sec.id || 'Pantalla';
                return {
                  ...sec,
                  name: nombreSec,
                  title: nombreSec,
                };
              })
            : [],
        };
      });
    }
    return config;
  }

  public async obtenerCliente(id: string): Promise<ConfiguracionCliente> {
    const entidad = await this.clienteRepo.findOne({
      where: [{ identificador: id }],
      relations: {
        modulos: {
          pantallas: true,
        },
      },
    });

    if (!entidad) {
      throw new NotFoundException(`Cliente "${id}" no encontrado`);
    }

    const rutaSesion = path.join(
      this.rutas.directorioClientes,
      id,
      'session.json',
    );
    const rutaManual = path.join(this.rutas.directorioDocs, id, 'index.html');
    const hasSession = await fs.pathExists(rutaSesion);
    const hasManual = await fs.pathExists(rutaManual);

    // Mapear entidades relacionales a ModuloCliente[]
    const modulosMapeados = (entidad.modulos || [])
      .sort((a, b) => a.orden - b.orden)
      .map((m) => ({
        id: m.identificador,
        name: m.nombre,
        title: m.nombre,
        sections: (m.pantallas || [])
          .sort((a, b) => a.orden - b.orden)
          .map((p) => ({
            id: p.identificador,
            name: p.nombre,
            title: p.nombre,
            route: p.ruta,
            description: p.descripcion,
            waitForSelector: p.selectorEspera,
          })),
      }));

    const normalizado = this.normalizarConfiguracion({
      id: entidad.identificador,
      name: entidad.nombre,
      appUrl: entidad.urlApp,
      color: entidad.color,
      auth: entidad.auth,
      theme: {
        primaryColor: entidad.color,
        secondaryColor: '#f5f5f7',
        fontFamily: 'Inter',
        logoPath: 'default-logo.svg',
      },
      modules: modulosMapeados,
    });

    return {
      ...normalizado,
      hasSession,
      hasManual,
    };
  }

  public async guardarCliente(
    config: any,
  ): Promise<{ success: boolean; client: ConfiguracionCliente }> {
    if (!config.id || !config.name || !config.appUrl) {
      throw new BadRequestException(
        'Faltan campos obligatorios (id, name, appUrl)',
      );
    }

    const normalizado = this.normalizarConfiguracion(config);

    // 1. Guardar o actualizar datos de ClienteAutomanual
    const identificador = config.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    let cliente = await this.clienteRepo.findOne({
      where: [{ identificador }],
      relations: {
        modulos: {
          pantallas: true,
        },
      },
    });
    const colorPrimario = config.color || config.theme?.primaryColor || '#0071e3';

    const authConfig = config.auth || normalizado.auth;

    if (!cliente) {
      cliente = this.clienteRepo.create({
        identificador,
        nombre: normalizado.name,
        urlApp: normalizado.appUrl,
        color: colorPrimario,
        auth: authConfig,
      });
      cliente = await this.clienteRepo.save(cliente);
    } else {
      cliente.nombre = normalizado.name;
      cliente.urlApp = normalizado.appUrl;
      cliente.color = colorPrimario;
      if (authConfig) {
        cliente.auth = authConfig;
      }
      cliente = await this.clienteRepo.save(cliente);
    }

    // 2. Persistir tablas relacionales modulos_automanual y pantallas_automanual
    if (Array.isArray(normalizado.modules)) {
      // Sincronizar módulos
      const modulosExistentes = cliente.modulos || [];
      const identificadoresNuevos = normalizado.modules.map((m: any) => m.id);

      // Eliminar módulos que ya no existan en la lista recibida
      for (const modExistente of modulosExistentes) {
        if (!identificadoresNuevos.includes(modExistente.identificador)) {
          await this.moduloRepo.remove(modExistente);
        }
      }

      // Crear o actualizar cada módulo y sus pantallas
      let ordenMod = 0;
      for (const modInput of normalizado.modules) {
        ordenMod++;
        let modDb = await this.moduloRepo.findOne({
          where: { clienteId: cliente.id, identificador: modInput.id },
          relations: {
            pantallas: true,
          },
        });

        if (!modDb) {
          modDb = this.moduloRepo.create({
            clienteId: cliente.id,
            identificador: modInput.id,
            nombre: modInput.title || modInput.name || modInput.id,
            orden: ordenMod,
          });
          modDb = await this.moduloRepo.save(modDb);
        } else {
          modDb.nombre = modInput.title || modInput.name || modInput.id;
          modDb.orden = ordenMod;
          modDb = await this.moduloRepo.save(modDb);
        }

        // Sincronizar pantallas dentro de este módulo
        const pantallasInput = modInput.sections || [];
        const pantallasExistentes = modDb.pantallas || [];
        const identificadoresPantallas = pantallasInput.map((p: any) => p.id);

        for (const pExistente of pantallasExistentes) {
          if (!identificadoresPantallas.includes(pExistente.identificador)) {
            await this.pantallaRepo.remove(pExistente);
          }
        }

        let ordenPantalla = 0;
        for (const secInput of pantallasInput) {
          ordenPantalla++;
          let pantallaDb = await this.pantallaRepo.findOne({
            where: { moduloId: modDb.id, identificador: secInput.id },
          });

          if (!pantallaDb) {
            pantallaDb = this.pantallaRepo.create({
              moduloId: modDb.id,
              identificador: secInput.id,
              nombre: secInput.title || secInput.name || secInput.id,
              ruta: secInput.route || '/',
              descripcion: secInput.description,
              selectorEspera: secInput.waitForSelector,
              orden: ordenPantalla,
            });
          } else {
            pantallaDb.nombre = secInput.title || secInput.name || secInput.id;
            pantallaDb.ruta = secInput.route || '/';
            pantallaDb.descripcion = secInput.description;
            pantallaDb.selectorEspera = secInput.waitForSelector;
            pantallaDb.orden = ordenPantalla;
          }
          await this.pantallaRepo.save(pantallaDb);
        }
      }
    }

    return { success: true, client: normalizado };
  }

  // ==========================================
  // GESTIÓN GRANULAR DE MÓDULOS Y PANTALLAS
  // ==========================================

  public async guardarModulo(
    clienteIdentificador: string,
    datos: { id?: string; identificador: string; nombre: string; orden?: number },
  ): Promise<ModuloAutomanual> {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteIdentificador }],
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente "${clienteIdentificador}" no encontrado`);
    }

    let modulo: ModuloAutomanual | null = null;
    if (datos.id) {
      modulo = await this.moduloRepo.findOne({ where: { id: datos.id, clienteId: cliente.id } });
    }
    if (!modulo) {
      modulo = await this.moduloRepo.findOne({
        where: { clienteId: cliente.id, identificador: datos.identificador },
      });
    }

    if (!modulo) {
      modulo = this.moduloRepo.create({
        clienteId: cliente.id,
        identificador: datos.identificador,
        nombre: datos.nombre,
        orden: datos.orden || 0,
      });
    } else {
      modulo.nombre = datos.nombre;
      if (datos.orden !== undefined) modulo.orden = datos.orden;
    }

    return this.moduloRepo.save(modulo);
  }

  public async eliminarModuloPorId(
    clienteIdentificador: string,
    moduloIdentificador: string,
  ): Promise<{ success: boolean }> {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteIdentificador }],
    });
    if (!cliente) return { success: false };

    await this.moduloRepo.delete({
      clienteId: cliente.id,
      identificador: moduloIdentificador,
    });
    return { success: true };
  }

  public async guardarPantalla(
    clienteIdentificador: string,
    moduloIdentificador: string,
    datos: {
      identificador: string;
      nombre: string;
      ruta: string;
      descripcion?: string;
      selectorEspera?: string;
      orden?: number;
    },
  ): Promise<PantallaAutomanual> {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteIdentificador }],
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente "${clienteIdentificador}" no encontrado`);
    }

    let modulo = await this.moduloRepo.findOne({
      where: { clienteId: cliente.id, identificador: moduloIdentificador },
    });
    if (!modulo) {
      modulo = await this.moduloRepo.save(
        this.moduloRepo.create({
          clienteId: cliente.id,
          identificador: moduloIdentificador,
          nombre: moduloIdentificador,
          orden: 1,
        }),
      );
    }

    let pantalla = await this.pantallaRepo.findOne({
      where: { moduloId: modulo.id, identificador: datos.identificador },
    });

    if (!pantalla) {
      pantalla = this.pantallaRepo.create({
        moduloId: modulo.id,
        identificador: datos.identificador,
        nombre: datos.nombre,
        ruta: datos.ruta || '/',
        descripcion: datos.descripcion,
        selectorEspera: datos.selectorEspera,
        orden: datos.orden || 1,
      });
    } else {
      pantalla.nombre = datos.nombre;
      pantalla.ruta = datos.ruta || '/';
      pantalla.descripcion = datos.descripcion;
      pantalla.selectorEspera = datos.selectorEspera;
      if (datos.orden !== undefined) pantalla.orden = datos.orden;
    }

    return this.pantallaRepo.save(pantalla);
  }

  public async eliminarPantallaPorId(
    clienteIdentificador: string,
    moduloIdentificador: string,
    pantallaIdentificador: string,
  ): Promise<{ success: boolean }> {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteIdentificador }],
    });
    if (!cliente) return { success: false };

    const modulo = await this.moduloRepo.findOne({
      where: { clienteId: cliente.id, identificador: moduloIdentificador },
    });
    if (!modulo) return { success: false };

    await this.pantallaRepo.delete({
      moduloId: modulo.id,
      identificador: pantallaIdentificador,
    });
    return { success: true };
  }

  public async eliminarCliente(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.clienteRepo.delete({ identificador: id });

    const rutaCliente = path.join(this.rutas.directorioClientes, id);
    if (await fs.pathExists(rutaCliente)) {
      await fs.remove(rutaCliente);
    }

    const rutaDocs = path.join(this.rutas.directorioDocs, id);
    if (await fs.pathExists(rutaDocs)) {
      await fs.remove(rutaDocs);
    }

    return {
      success: true,
      message: `Cliente "${id}" eliminado correctamente`,
    };
  }

  public async obtenerCapturas(
    clienteIdentificador: string,
    moduloId?: string,
    seccionId?: string,
  ): Promise<CapturaAutomanual[]> {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteIdentificador }],
    });
    if (!cliente) return [];

    const where: any = { clienteId: cliente.id };
    if (moduloId) where.moduloId = moduloId;
    if (seccionId) where.seccionId = seccionId;

    return this.capturaRepo.find({
      where,
      order: { fechaCreacion: 'DESC' },
    });
  }

  public async guardarCaptura(datos: Partial<CapturaAutomanual>): Promise<CapturaAutomanual> {
    const nueva = this.capturaRepo.create(datos);
    return this.capturaRepo.save(nueva);
  }

  public async eliminarCaptura(id: string): Promise<{ success: boolean }> {
    const captura = await this.capturaRepo.findOne({ where: { id } });
    if (!captura) {
      throw new NotFoundException(`Captura con ID ${id} no encontrada`);
    }

    if (captura.metadata?.storagePath && this.storageService.estaDisponible()) {
      await this.storageService.eliminarArchivos([captura.metadata.storagePath]);
    }

    await this.capturaRepo.delete(id);
    return { success: true };
  }

  // ==========================================
  // GESTIÓN DE CASOS DE PRUEBA (QA E2E)
  // ==========================================

  public async obtenerCasosPrueba(
    clienteIdentificador: string,
    moduloId?: string,
    seccionId?: string,
  ): Promise<CasoPruebaAutomanual[]> {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteIdentificador }],
    });
    if (!cliente) return [];

    const where: any = { clienteId: cliente.id };
    if (moduloId) where.moduloId = moduloId;
    if (seccionId) where.seccionId = seccionId;

    return this.casoPruebaRepo.find({
      where,
      order: { fechaCreacion: 'ASC' },
    });
  }

  public async obtenerCasoPruebaPorId(id: string): Promise<CasoPruebaAutomanual> {
    const caso = await this.casoPruebaRepo.findOne({ where: { id } });
    if (!caso) {
      throw new NotFoundException(`Caso de prueba con ID ${id} no encontrado`);
    }
    return caso;
  }

  public async guardarCasoPrueba(
    datos: Partial<CasoPruebaAutomanual> & { clienteIdentificador?: string },
  ): Promise<CasoPruebaAutomanual> {
    if (!datos.clienteId && datos.clienteIdentificador) {
      const cliente = await this.clienteRepo.findOne({
        where: [{ identificador: datos.clienteIdentificador }],
      });
      if (cliente) {
        datos.clienteId = cliente.id;
      }
    }

    if (datos.pantallaId) {
      const pantalla = await this.pantallaRepo.findOne({
        where: { id: datos.pantallaId },
        relations: { modulo: true },
      });
      if (pantalla) {
        datos.clienteId = datos.clienteId || pantalla.clienteId || pantalla.modulo?.clienteId;
        datos.moduloId = datos.moduloId || pantalla.modulo?.identificador || 'pantallas';
        datos.moduloTitulo = datos.moduloTitulo || pantalla.modulo?.nombre || 'Pantallas QA';
        datos.seccionId = datos.seccionId || pantalla.identificador;
        datos.seccionTitulo = datos.seccionTitulo || pantalla.nombre;
      }
    }

    if (!datos.clienteId || !datos.titulo) {
      throw new BadRequestException('Faltan campos obligatorios para el caso de prueba');
    }

    // Vincular automáticamente con PantallaAutomanual si no viene pantallaId
    if (!datos.pantallaId && datos.moduloId && datos.seccionId) {
      const pantalla = await this.pantallaRepo
        .createQueryBuilder('p')
        .leftJoin('p.modulo', 'm')
        .where('(p.clienteId = :clienteId OR m.clienteId = :clienteId)', { clienteId: datos.clienteId })
        .andWhere('p.identificador = :secId', { secId: datos.seccionId })
        .getOne();
      if (pantalla) {
        datos.pantallaId = pantalla.id;
      }
    }

    let caso: CasoPruebaAutomanual;
    if (datos.id) {
      const existente = await this.casoPruebaRepo.findOne({ where: { id: datos.id } });
      if (!existente) {
        throw new NotFoundException(`Caso de prueba con ID ${datos.id} no existe`);
      }
      Object.assign(existente, datos);
      caso = existente;
    } else {
      caso = this.casoPruebaRepo.create(datos);
    }

    return this.casoPruebaRepo.save(caso);
  }

  public async eliminarCasoPrueba(id: string): Promise<{ success: boolean }> {
    const caso = await this.casoPruebaRepo.findOne({ where: { id } });
    if (!caso) {
      throw new NotFoundException(`Caso de prueba con ID ${id} no existe`);
    }
    await this.casoPruebaRepo.delete(id);
    return { success: true };
  }

  public async obtenerFlujoLogo(id: string) {
    const rutaCliente = path.join(this.rutas.directorioClientes, id);
    let rutaLogo = path.join(
      this.rutas.directorioClientes,
      '_default',
      'default-logo.svg',
    );

    // Buscar logo del cliente en su carpeta si existe
    if (await fs.pathExists(rutaCliente)) {
      const archivos = await fs.readdir(rutaCliente);
      const archivoLogo = archivos.find((f) => f.startsWith('logo.'));
      if (archivoLogo) {
        rutaLogo = path.join(rutaCliente, archivoLogo);
      }
    }

    const ext = path.extname(rutaLogo).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    return {
      stream: fs.createReadStream(rutaLogo),
      contentType,
      path: rutaLogo,
    };
  }

  public async guardarLogo(id: string, base64: string, fileName: string) {
    if (!base64 || !fileName) {
      throw new BadRequestException(
        'Faltan datos de la imagen (base64, fileName)',
      );
    }

    const entidad = await this.clienteRepo.findOne({ where: [{ identificador: id }] });
    if (!entidad) {
      throw new NotFoundException(`Cliente "${id}" no encontrado`);
    }

    const rutaCliente = path.join(this.rutas.directorioClientes, id);
    await fs.ensureDir(rutaCliente);

    const ext = path.extname(fileName).toLowerCase() || '.png';
    const cleanFileName = `logo${ext}`;
    const targetFile = path.join(rutaCliente, cleanFileName);

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(targetFile, buffer);

    const clientDocsDir = path.join(this.rutas.directorioDocs, id);
    const clientAssetsDir = path.join(clientDocsDir, 'assets');
    if (await fs.pathExists(clientAssetsDir)) {
      await fs.copy(targetFile, path.join(clientAssetsDir, cleanFileName));
    }

    return {
      success: true,
      logoPath: cleanFileName,
      logoUrl: `/api/automanual/clientes/${id}/logo?t=${Date.now()}`,
    };
  }

  public async iniciarLogin(clienteId: string) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso en ejecución.');
    }

    this.estaGenerando = true;
    this.logsActuales = [
      `Iniciando ventana de Playwright para el cliente "${clienteId}"...`,
    ];

    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };

    void (async () => {
      try {
        await this.comandante.iniciarSesionCliente(clienteId);
        this.logsActuales.push('✔ Proceso de login finalizado.');
      } catch (err: any) {
        this.logsActuales.push(`✖ Error al abrir Playwright: ${err.message}`);
      } finally {
        console.log = originalLog;
        this.estaGenerando = false;
      }
    })();

    return {
      success: true,
      message: 'Ventana de Playwright abierta en pantalla.',
    };
  }

  public async descubrirRutas(clienteId: string) {
    this.logsActuales = [
      `Iniciando auto-descubrimiento para "${clienteId}"...`,
    ];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };

    try {
      const clienteConfig = await this.obtenerCliente(clienteId);
      const configActualizada = await this.comandante.descubrirRutasCliente(
        clienteId,
        clienteConfig,
      );

      // Persistir los módulos descubiertos 100% en las tablas relacionales de la BD
      if (configActualizada.modules && configActualizada.modules.length > 0) {
        await this.guardarCliente(configActualizada);
      }

      this.logsActuales.push(
        `✔ Auto-descubrimiento completado: ${configActualizada.modules?.length || 0} módulos encontrados.`,
      );
      return { success: true, modules: configActualizada.modules };
    } catch (err: any) {
      this.logsActuales.push(`✖ Error en auto-descubrimiento: ${err.message}`);
      throw err;
    } finally {
      console.log = originalLog;
    }
  }

  public async iniciarGeneracion(
    clienteId: string,
    opciones: OpcionesGeneracionDto,
  ) {
    if (this.estaGenerando) {
      throw new ConflictException(
        'Ya hay un proceso de generación o login en curso.',
      );
    }

    this.estaGenerando = true;
    this.logsActuales = [`Iniciando generación para ${clienteId}...`];

    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };

    void (async () => {
      try {
        const esCompleto =
          opciones.moduleId || opciones.sectionId
            ? false
            : opciones.all !== false;

        const clienteDb = await this.clienteRepo.findOne({
          where: [{ identificador: clienteId }],
        });

        const clienteConfig = await this.obtenerCliente(clienteId);

        // Si se enviaron credenciales desde el frontend (localStorage del usuario), usarlas para esta ejecución
        if (opciones.auth && (opciones.auth.username || opciones.auth.password)) {
          clienteConfig.auth = {
            ...clienteConfig.auth,
            ...opciones.auth,
          };
        }

        await this.comandante.ejecutarGeneracion({
          client: clienteId,
          configuracionCliente: clienteConfig,
          all: esCompleto,
          section: opciones.sectionId,
          module: opciones.moduleId,
          headless: opciones.visibleBrowser === false,
          onCapturasTomadas: async (datos) => {
            // Estrategia 1: Limpieza previa de capturas anteriores de esta pantalla en la BD
            if (clienteDb) {
              await this.capturaRepo.delete({
                clienteId: clienteDb.id,
                moduloId: datos.moduloId,
                seccionId: datos.seccionId,
              });
            }

            // Asociar con PantallaAutomanual si existe
            let pantallaDb: PantallaAutomanual | null = null;
            if (clienteDb) {
              pantallaDb = await this.pantallaRepo
                .createQueryBuilder('p')
                .innerJoin('p.modulo', 'm')
                .where('m.clienteId = :clienteId', { clienteId: clienteDb.id })
                .andWhere('m.identificador = :modId', { modId: datos.moduloId })
                .andWhere('p.identificador = :secId', { secId: datos.seccionId })
                .getOne();
            }

            // Procesar cada captura tomada por Playwright y preparar previsualizaciones base64
            const capturasParaRevision: any[] = [];
            for (const shot of datos.screenshots) {
              const rutaLocal = path.join(datos.screenshotsDir, shot.fileName);
              if (!(await fs.pathExists(rutaLocal))) continue;

              const buffer = await fs.readFile(rutaLocal);
              const previewBase64 = `data:image/png;base64,${buffer.toString('base64')}`;

              capturasParaRevision.push({
                fileName: shot.fileName,
                caption: shot.caption || `${datos.seccionTitulo} - ${shot.fileName}`,
                tipo: (shot.kind as any) || 'main',
                rutaLocal,
                previewBase64,
              });
            }

            // Guardar para revisión humana previa
            this.revisionPendiente = {
              clienteSlug: datos.clienteSlug,
              moduloId: datos.moduloId,
              moduloTitulo: datos.moduloTitulo,
              seccionId: datos.seccionId,
              seccionTitulo: datos.seccionTitulo,
              rutaApp: datos.rutaApp,
              capturas: capturasParaRevision,
              casosPrueba: datos.casosPruebaGenerados || [],
              liveDom: datos.liveDom,
            };

            this.logsActuales.push(
              `✨ Exploración lista: ${capturasParaRevision.length} capturas y ${(datos.casosPruebaGenerados || []).length} casos generados por IA esperando tu revisión y aprobación.`,
            );
          },
        });

        this.logsActuales.push('✔ ¡Manual generado con éxito!');
      } catch (err: any) {
        this.logsActuales.push(`✖ Error en generación: ${err.message}`);
      } finally {
        console.log = originalLog;
        this.estaGenerando = false;
      }
    })();

    return { success: true, message: 'Generación iniciada.' };
  }

  public obtenerEstadoGeneracion() {
    return {
      isGenerating: this.estaGenerando,
      logs: this.logsActuales,
      revisionPendiente: this.revisionPendiente,
      estadoRegresion: this.estadoRegresion,
    };
  }

  public async descartarRevisionPendiente() {
    if (this.revisionPendiente) {
      for (const cap of this.revisionPendiente.capturas) {
        await fs.remove(cap.rutaLocal).catch(() => {});
      }
    }

    this.revisionPendiente = null;
    return { success: true };
  }

  public async confirmarRevisionPendiente(datosConfirmados: {
    capturasSeleccionadas: string[]; // fileNames de las capturas aprobadas
    casosAprobados: any[]; // casos de prueba aprobados/editados por el usuario
    pantallasDetectadasAprobadas?: Array<{ nombre: string; ruta: string }>;
  }) {
    if (!this.revisionPendiente) {
      throw new BadRequestException('No hay ninguna revisión pendiente.');
    }

    const rev = this.revisionPendiente;
    const clienteDb = await this.clienteRepo.findOne({
      where: [{ identificador: rev.clienteSlug }],
    });
    if (!clienteDb) {
      throw new NotFoundException(`Cliente "${rev.clienteSlug}" no encontrado.`);
    }

    let pantallaDb: PantallaAutomanual | null = null;
    if (rev.pantallaId) {
      pantallaDb = await this.pantallaRepo.findOne({ where: { id: rev.pantallaId } });
    }
    if (!pantallaDb) {
      pantallaDb = await this.pantallaRepo
        .createQueryBuilder('p')
        .leftJoin('p.modulo', 'm')
        .where('(p.clienteId = :clienteId OR m.clienteId = :clienteId)', { clienteId: clienteDb.id })
        .andWhere('p.identificador = :secId', { secId: rev.seccionId })
        .getOne();
    }

    // 1. Subir a Supabase Storage clasificadas por cliente / pantallas / <pantalla> / exploracion
    const pantallaSlug = this.slugificarTexto(
      pantallaDb?.identificador || rev.seccionId || rev.seccionTitulo || 'pantalla',
    );
    const urlsPorArchivo: Record<string, string> = {};
    const rutasLocalesPorArchivo: Record<string, string> = {};
    let primeraRutaLocal: string | undefined;
    let primeraUrlEvidencia: string | undefined;

    for (const cap of rev.capturas) {
      if (!datosConfirmados.capturasSeleccionadas.includes(cap.fileName)) {
        continue;
      }

      if (!(await fs.pathExists(cap.rutaLocal))) continue;

      const extension = path.extname(cap.fileName) || '.png';
      const baseName = path.basename(cap.fileName, extension);
      const storagePath = `clientes/${rev.clienteSlug}/pantallas/${pantallaSlug}/exploracion/${baseName}${extension}`;

      if (!this.storageService.estaDisponible()) {
        throw new BadRequestException(
          'Supabase Storage no está configurado. No se permite guardar imágenes localmente.',
        );
      }

      const subida = await this.storageService.subirArchivoDesdeDisco(
        cap.rutaLocal,
        storagePath,
        'image/png',
      );
      if (!subida?.url) {
        throw new BadRequestException(
          `No se pudo subir la captura "${cap.fileName}" a Supabase Storage.`,
        );
      }

      const stats = await fs.stat(cap.rutaLocal);
      const urlFinal = subida.url;
      urlsPorArchivo[cap.fileName] = urlFinal;
      rutasLocalesPorArchivo[cap.fileName] = cap.rutaLocal;
      if (!primeraUrlEvidencia) {
        primeraUrlEvidencia = urlFinal;
        primeraRutaLocal = cap.rutaLocal;
      }

      const metadata = {
        storagePath,
        viewport: { width: 1366, height: 768 },
        pesoBytes: stats.size,
        resumenDom: {
          campos: rev.liveDom?.fields?.map((f: any) => f.label) || [],
          botones: rev.liveDom?.actions?.map((a: any) => a.name) || [],
          tieneTabla: Boolean(rev.liveDom?.tables && rev.liveDom.tables.length > 0),
          totalFilasTabla: rev.liveDom?.tables?.[0]?.rowCount || 0,
        },
        erroresConsola: [],
      };

      await this.capturaRepo.save(
        this.capturaRepo.create({
          clienteId: clienteDb.id,
          pantallaId: pantallaDb?.id,
          moduloId: rev.moduloId,
          moduloTitulo: rev.moduloTitulo,
          seccionId: rev.seccionId,
          seccionTitulo: rev.seccionTitulo,
          rutaApp: rev.rutaApp,
          url: urlFinal,
          tipo: cap.tipo as any,
          titulo: cap.caption,
          estadoQa: 'PASS',
          metadata,
        }),
      );
    }

    // 2. Si viene de generación completa ("Generar Casos con IA"), reemplazar casos previos de la pantalla al confirmar
    if (rev.reemplazarExistentes && pantallaDb?.id) {
      await this.casoPruebaRepo.delete({ pantallaId: pantallaDb.id });
    }

    // 3. Guardar cada caso aprobado clasificando su evidencia en Supabase bajo pantallas/<pantalla>/casos/<codigo>/
    for (let idx = 0; idx < datosConfirmados.casosAprobados.length; idx++) {
      const caso = datosConfirmados.casosAprobados[idx];
      const casoCarpeta = this.slugificarTexto(
        caso.codigo || `caso-${idx + 1}`,
      );
      const rutaLocalOrigen =
        (caso.capturaFileName && rutasLocalesPorArchivo[caso.capturaFileName]) ||
        primeraRutaLocal;

      let evidenciaUrl =
        (caso.capturaFileName && urlsPorArchivo[caso.capturaFileName]) ||
        primeraUrlEvidencia;

      if (rutaLocalOrigen && (await fs.pathExists(rutaLocalOrigen))) {
        const storageCasoPath = `clientes/${rev.clienteSlug}/pantallas/${pantallaSlug}/casos/${casoCarpeta}/evidencia-${Date.now()}.png`;
        const subidaCaso = await this.storageService.subirArchivoDesdeDisco(
          rutaLocalOrigen,
          storageCasoPath,
          'image/png',
        );
        if (subidaCaso?.url) {
          evidenciaUrl = subidaCaso.url;
        }
      }

      await this.casoPruebaRepo.save(
        this.casoPruebaRepo.create({
          clienteId: clienteDb.id,
          pantallaId: pantallaDb?.id,
          moduloId: rev.moduloId,
          moduloTitulo: rev.moduloTitulo,
          seccionId: rev.seccionId,
          seccionTitulo: rev.seccionTitulo,
          codigo: caso.codigo,
          titulo: caso.titulo,
          urlPantalla: caso.urlPantalla || rev.rutaApp,
          descripcion: caso.descripcion,
          pasos: caso.pasos || [],
          resultadoEsperado: caso.criterioAsercion || caso.resultadoEsperado || { tipo: 'selector_visible', selector: 'body' },
          capturaEvidenciaUrl: evidenciaUrl,
          ultimoResultado: 'PENDIENTE',
        }),
      );
    }

    // 4. Registrar opcionalmente las nuevas pantallas/URLs detectadas que el QA aprobó
    if (
      Array.isArray(datosConfirmados.pantallasDetectadasAprobadas) &&
      datosConfirmados.pantallasDetectadasAprobadas.length > 0
    ) {
      for (const pDet of datosConfirmados.pantallasDetectadasAprobadas) {
        if (!pDet.ruta?.trim() || !pDet.nombre?.trim()) continue;
        const yaExiste = await this.pantallaRepo.findOne({
          where: { clienteId: clienteDb.id, ruta: pDet.ruta.trim() },
        });
        if (!yaExiste) {
          await this.pantallaRepo.save(
            this.pantallaRepo.create({
              clienteId: clienteDb.id,
              identificador: `${this.slugificarTexto(pDet.nombre)}-${Date.now().toString().slice(-4)}`,
              nombre: pDet.nombre.trim(),
              ruta: pDet.ruta.trim(),
              descripcion: `Detectada automáticamente desde "${rev.seccionTitulo}".`,
              orden: 10,
            }),
          );
        }
      }
    }

    // Limpiar cualquier captura no seleccionada de la carpeta temporal
    for (const cap of rev.capturas) {
      await fs.remove(cap.rutaLocal).catch(() => {});
    }

    this.revisionPendiente = null;
    return {
      success: true,
      message: 'Evidencias y casos de prueba confirmados y guardados en PostgreSQL y Supabase Storage.',
    };
  }

  public async obtenerConfiguracionSistema() {
    const clientesRes = await this.obtenerClientes();
    const totalClientes = Array.isArray(clientesRes) ? clientesRes.length : clientesRes.meta.total;
    const promptConfig = cargarConfiguracionPromptSincrono();
    const apiKey = process.env.GEMINI_API_KEY || '';
    const hasApiKey = Boolean(apiKey && apiKey.length > 5);

    const apiKeyMasked = hasApiKey
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
      : '';

    return {
      system: {
        version: '2.0.0-gestor',
        nodeVersion: process.version,
        platform: process.platform,
        totalClients: totalClientes,
        docsPath: this.rutas.directorioDocs,
      },
      ai: {
        hasApiKey,
        apiKeyMasked,
        model:
          process.env.GEMINI_MODELO ||
          process.env.GEMINI_MODEL ||
          'gemini-3.1-flash-lite',
        temperature: obtenerTemperaturaEfectiva(),
        visionPrompt: promptConfig.visionPrompt,
        defaultVisionPrompt: PROMPT_VISION_PREDETERMINADO,
        promptVariables: VARIABLES_PROMPT_VISION,
      },
      availableModels: [
        {
          id: 'gemini-3.1-flash-lite',
          name: 'Gemini 3.1 Flash Lite (Por Defecto)',
          description: 'Ultra-rápido, eficiente en tokens y ágil.',
        },
        {
          id: 'gemini-2.5-flash',
          name: 'Gemini 2.5 Flash',
          description: 'Rápido, multimodal y de alta precisión.',
        },
        {
          id: 'gemini-2.5-flash-lite',
          name: 'Gemini 2.5 Flash Lite',
          description: 'Modelo ligero de generación 2.5.',
        },
        {
          id: 'gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          description: 'Modelo multimodal estándar.',
        },
        {
          id: 'gemini-2.5-pro',
          name: 'Gemini 2.5 Pro',
          description: 'Máxima profundidad de análisis y razonamiento.',
        },
      ],
    };
  }

  public async guardarConfiguracionSistema(dto: GuardarConfigSistemaDto) {
    if (dto.ai.apiKey) {
      process.env.GEMINI_API_KEY = dto.ai.apiKey;
    }
    if (dto.ai.model) {
      process.env.GEMINI_MODEL = dto.ai.model;
    }
    if (dto.ai.temperature !== undefined) {
      process.env.GEMINI_TEMPERATURE = String(dto.ai.temperature);
    }
    if (dto.ai.visionPrompt !== undefined) {
      await guardarConfiguracionPrompt(dto.ai.visionPrompt);
    }

    return {
      success: true,
      message: 'Configuración de Gemini AI actualizada.',
    };
  }

  public async obtenerModelos(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    const modelosPorDefecto = [
      {
        id: 'gemini-3.1-flash-lite',
        name: 'Gemini 3.1 Flash Lite (Por Defecto)',
        description: 'Ultra-rápido, eficiente en tokens y ágil.',
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Rápido, multimodal y de alta precisión.',
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        description: 'Modelo ligero de generación 2.5.',
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Modelo multimodal estándar.',
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Máxima profundidad de análisis y razonamiento.',
      },
    ];

    if (!key) {
      return { models: modelosPorDefecto, fromGoogle: false };
    }

    return { models: modelosPorDefecto, fromGoogle: true };
  }

  public async probarConexionIa(dto: ProbarIaDto) {
    return AnalizadorVision.probarConexion(dto.apiKey, dto.model);
  }

  // =========================================================================
  // FLUJO QA DIRECTO POR CLIENTE -> PANTALLA -> EVIDENCIAS & CASOS DE PRUEBA
  // =========================================================================

  private slugificarTexto(texto: string): string {
    return texto
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-');
  }

  public async obtenerPantallasCliente(clienteSlug: string) {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteSlug }],
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente "${clienteSlug}" no encontrado`);
    }

    const pantallas = await this.pantallaRepo
      .createQueryBuilder('p')
      .leftJoin('p.modulo', 'm')
      .where('p.clienteId = :clienteId OR m.clienteId = :clienteId', {
        clienteId: cliente.id,
      })
      .orderBy('p.orden', 'ASC')
      .addOrderBy('p.fechaCreacion', 'ASC')
      .getMany();

    const resultado = await Promise.all(
      pantallas.map(async (p) => {
        const [totalCapturas, casos] = await Promise.all([
          this.capturaRepo.count({ where: { pantallaId: p.id } }),
          this.casoPruebaRepo.find({
            where: { pantallaId: p.id },
            select: { id: true, ultimoResultado: true, estado: true },
          }),
        ]);

        let ultimoEstadoQa: 'PASS' | 'FAIL' | 'PENDIENTE' = 'PENDIENTE';
        if (casos.length > 0) {
          if (casos.some((c) => c.ultimoResultado === 'FAIL' || c.ultimoResultado === 'BLOCKED')) {
            ultimoEstadoQa = 'FAIL';
          } else if (casos.every((c) => c.ultimoResultado === 'PASS')) {
            ultimoEstadoQa = 'PASS';
          }
        }

        return {
          id: p.id,
          identificador: p.identificador,
          nombre: p.nombre,
          ruta: p.ruta,
          descripcion: p.descripcion || '',
          indicacionIa: p.indicacionIa || '',
          selectorEspera: p.selectorEspera || '',
          orden: p.orden,
          esLogin: p.identificador === 'login-inicio',
          totalCapturas,
          totalCasos: casos.length,
          ultimoEstadoQa,
          fechaActualizacion: p.fechaActualizacion,
        };
      }),
    );

    return resultado;
  }

  public async guardarPantallaDirecta(
    clienteSlug: string,
    dto: GuardarPantallaQaDto,
  ) {
    const cliente = await this.clienteRepo.findOne({
      where: [{ identificador: clienteSlug }],
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente "${clienteSlug}" no encontrado`);
    }

    let pantalla: PantallaAutomanual | null = null;
    if (dto.id) {
      pantalla = await this.pantallaRepo.findOne({ where: { id: dto.id } });
    }

    const identificador =
      dto.identificador?.trim() ||
      pantalla?.identificador ||
      `${this.slugificarTexto(dto.nombre)}-${Date.now().toString().slice(-4)}`;

    if (pantalla) {
      pantalla.clienteId = cliente.id;
      pantalla.identificador = identificador;
      pantalla.nombre = dto.nombre.trim();
      pantalla.ruta = dto.ruta.trim();
      pantalla.descripcion = dto.descripcion?.trim();
      pantalla.selectorEspera = dto.selectorEspera?.trim();
      if (dto.orden !== undefined) pantalla.orden = dto.orden;
    } else {
      pantalla = this.pantallaRepo.create({
        clienteId: cliente.id,
        identificador,
        nombre: dto.nombre.trim(),
        ruta: dto.ruta.trim(),
        descripcion: dto.descripcion?.trim(),
        selectorEspera: dto.selectorEspera?.trim(),
        orden: dto.orden ?? 0,
      });
    }

    return this.pantallaRepo.save(pantalla);
  }

  public async eliminarPantallaDirecta(pantallaId: string) {
    const pantalla = await this.pantallaRepo.findOne({ where: { id: pantallaId } });
    if (!pantalla) {
      throw new NotFoundException(`Pantalla con ID ${pantallaId} no encontrada`);
    }
    await this.pantallaRepo.delete(pantallaId);
    return { success: true };
  }

  public async obtenerCapturasPorPantalla(pantallaId: string) {
    return this.capturaRepo.find({
      where: { pantallaId },
      order: { fechaCreacion: 'DESC' },
    });
  }

  public async obtenerCasosPorPantalla(pantallaId: string) {
    return this.casoPruebaRepo.find({
      where: { pantallaId },
      order: { fechaCreacion: 'ASC' },
    });
  }

  public async iniciarGeneracionPantalla(
    pantallaId: string,
    opciones: {
      visibleBrowser?: boolean;
      auth?: any;
      indicacionIa?: string;
      geminiApiKey?: string;
      geminiModel?: string;
    },
  ) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso de Playwright en ejecución.');
    }

    const pantalla = await this.pantallaRepo.findOne({
      where: { id: pantallaId },
      relations: { cliente: true, modulo: { cliente: true } },
    });
    if (!pantalla) {
      throw new NotFoundException(`Pantalla con ID ${pantallaId} no encontrada`);
    }

    const indicacionEfectiva =
      opciones.indicacionIa !== undefined
        ? opciones.indicacionIa.trim()
        : pantalla.indicacionIa?.trim() || '';

    if (opciones.indicacionIa !== undefined) {
      pantalla.indicacionIa = indicacionEfectiva || undefined;
      await this.pantallaRepo.save(pantalla);
    }

    const clienteEntity = pantalla.cliente || pantalla.modulo?.cliente;
    if (!clienteEntity) {
      throw new NotFoundException('La pantalla no tiene un cliente asociado');
    }

    const clienteConfig = await this.obtenerCliente(clienteEntity.identificador);
    if (opciones.auth && (opciones.auth.username || opciones.auth.password)) {
      clienteConfig.auth = { ...clienteConfig.auth, ...opciones.auth };
    }

    // Asegurar que la configuración temporal contenga esta pantalla individual
    const modId = pantalla.modulo?.identificador || 'pantallas';
    const modTitle = pantalla.modulo?.nombre || 'Pantallas QA';
    clienteConfig.modules = [
      {
        id: modId,
        name: modTitle,
        title: modTitle,
        sections: [
          {
            id: pantalla.identificador,
            name: pantalla.nombre,
            title: pantalla.nombre,
            route: pantalla.ruta,
            description: pantalla.descripcion,
            waitForSelector: pantalla.selectorEspera,
          },
        ],
      },
    ];

    this.estaGenerando = true;
    this.logsActuales = [
      `▶ Iniciando Playwright + Gemini Vision para pantalla "${pantalla.nombre}" (${pantalla.ruta})...`,
    ];

    const originalLog = console.log;
    const originalWarn = console.warn;
    const capturarLog = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };
    console.log = capturarLog;
    console.warn = capturarLog;

    void (async () => {
      try {
        const directorioCapturas = path.join(
          this.rutas.directorioDocs,
          clienteEntity.identificador,
          pantalla.identificador,
          `run-${Date.now()}`,
        );

        const { exploracion, casosGenerados } = await this.orquestadorQa.ejecutar({
          nombreApp: clienteEntity.nombre,
          urlInicioLogin: clienteEntity.urlApp,
          nombrePantalla: pantalla.nombre,
          rutaPantalla: pantalla.ruta,
          descripcionPantalla: pantalla.descripcion,
          indicacionIa: indicacionEfectiva || undefined,
          authConfig: { ...clienteEntity.auth, ...(opciones.auth || {}) },
          headless: opciones.visibleBrowser === false,
          directorioCapturas,
          geminiApiKey: opciones.geminiApiKey,
          geminiModel: opciones.geminiModel,
          modo: 'completo',
        });

        const capturasParaRevision: any[] = [];
        for (const cap of exploracion.capturas) {
          if (!(await fs.pathExists(cap.rutaLocal))) continue;
          const buffer = await fs.readFile(cap.rutaLocal);
          capturasParaRevision.push({
            fileName: cap.fileName,
            caption: cap.caption,
            tipo: cap.tipo,
            rutaLocal: cap.rutaLocal,
            previewBase64: `data:image/png;base64,${buffer.toString('base64')}`,
            url: cap.url,
          });
        }

        this.revisionPendiente = {
          clienteSlug: clienteEntity.identificador,
          pantallaId: pantalla.id,
          reemplazarExistentes: true,
          moduloId: pantalla.modulo?.identificador || 'pantallas',
          moduloTitulo: pantalla.modulo?.nombre || 'Pantallas QA',
          seccionId: pantalla.identificador,
          seccionTitulo: pantalla.nombre,
          rutaApp: pantalla.ruta,
          capturas: capturasParaRevision,
          pantallasDetectadas: exploracion.pantallasDetectadas,
          casosPrueba: casosGenerados,
          liveDom: {
            fields: exploracion.campos,
            actions: exploracion.acciones,
          },
        };

        this.logsActuales.push(
          `✨ Listo para revisión: ${capturasParaRevision.length} captura(s) completa(s), ${exploracion.pantallasDetectadas.length} cambio(s) de URL y ${casosGenerados.length} caso(s) generado(s).`,
        );
      } catch (err: any) {
        this.logsActuales.push(`✖ Error en generación: ${err.message}`);
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        this.estaGenerando = false;
      }
    })();

    return {
      success: true,
      message: `Análisis Playwright + IA iniciado para "${pantalla.nombre}".`,
    };
  }

  /**
   * Endpoint granular aparte: navega guiado por IA hacia lo que el QA indicó que faltó,
   * saca nuevas capturas completas y genera SOLO los casos de prueba faltantes.
   */
  public async generarCasosFaltantesPantalla(
    pantallaId: string,
    opciones: {
      indicacionIa: string;
      visibleBrowser?: boolean;
      auth?: any;
      geminiApiKey?: string;
      geminiModel?: string;
    },
  ) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso de Playwright en ejecución.');
    }

    if (!opciones.indicacionIa?.trim()) {
      throw new BadRequestException(
        'Escribe una indicación de qué faltó probar para que la IA pueda buscarlo.',
      );
    }

    const pantalla = await this.pantallaRepo.findOne({
      where: { id: pantallaId },
      relations: { cliente: true, modulo: { cliente: true } },
    });
    if (!pantalla) {
      throw new NotFoundException(`Pantalla con ID ${pantallaId} no encontrada`);
    }

    const clienteEntity = pantalla.cliente || pantalla.modulo?.cliente;
    if (!clienteEntity) {
      throw new NotFoundException('La pantalla no tiene un cliente asociado');
    }

    pantalla.indicacionIa = opciones.indicacionIa.trim();
    await this.pantallaRepo.save(pantalla);

    const casosExistentes = await this.casoPruebaRepo.find({
      where: { pantallaId: pantalla.id },
      select: { codigo: true, titulo: true },
      order: { fechaCreacion: 'ASC' },
    });

    this.estaGenerando = true;
    this.logsActuales = [
      `▶ Buscando faltantes en "${pantalla.nombre}" según indicación: "${opciones.indicacionIa.trim()}"`,
    ];

    const originalLog = console.log;
    const originalWarn = console.warn;
    const capturarLog = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };
    console.log = capturarLog;
    console.warn = capturarLog;

    void (async () => {
      try {
        const directorioCapturas = path.join(
          this.rutas.directorioDocs,
          clienteEntity.identificador,
          pantalla.identificador,
          `faltantes-${Date.now()}`,
        );

        const { exploracion, casosGenerados } = await this.orquestadorQa.ejecutar({
          nombreApp: clienteEntity.nombre,
          urlInicioLogin: clienteEntity.urlApp,
          nombrePantalla: pantalla.nombre,
          rutaPantalla: pantalla.ruta,
          descripcionPantalla: pantalla.descripcion,
          indicacionIa: opciones.indicacionIa,
          casosExistentes,
          authConfig: { ...clienteEntity.auth, ...(opciones.auth || {}) },
          headless: opciones.visibleBrowser === false,
          directorioCapturas,
          geminiApiKey: opciones.geminiApiKey,
          geminiModel: opciones.geminiModel,
          modo: 'faltantes',
        });

        const capturasParaRevision: any[] = [];
        for (const cap of exploracion.capturas) {
          if (!(await fs.pathExists(cap.rutaLocal))) continue;
          const buf = await fs.readFile(cap.rutaLocal);
          capturasParaRevision.push({
            fileName: cap.fileName,
            caption: cap.caption,
            tipo: cap.tipo,
            rutaLocal: cap.rutaLocal,
            previewBase64: `data:image/png;base64,${buf.toString('base64')}`,
            url: cap.url,
          });
        }

        this.revisionPendiente = {
          clienteSlug: clienteEntity.identificador,
          pantallaId: pantalla.id,
          reemplazarExistentes: false,
          moduloId: pantalla.modulo?.identificador || 'pantallas',
          moduloTitulo: pantalla.modulo?.nombre || 'Pantallas QA',
          seccionId: pantalla.identificador,
          seccionTitulo: pantalla.nombre,
          rutaApp: pantalla.ruta,
          capturas: capturasParaRevision,
          pantallasDetectadas: exploracion.pantallasDetectadas,
          casosPrueba: casosGenerados,
          liveDom: {},
        };

        this.logsActuales.push(
          `✨ Faltantes listos para revisión: ${capturasParaRevision.length} captura(s) nueva(s) y ${casosGenerados.length} caso(s) nuevo(s).`,
        );
      } catch (err: any) {
        this.logsActuales.push(`✖ Error buscando faltantes: ${err.message}`);
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        this.estaGenerando = false;
      }
    })();

    return {
      success: true,
      message: `Búsqueda de casos faltantes iniciada para "${pantalla.nombre}".`,
    };
  }

  public async ejecutarCasosDePantalla(
    pantallaId: string,
    dto: EjecutarCasosPantallaDto & { geminiApiKey?: string; geminiModel?: string },
  ) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso de Playwright en ejecución.');
    }

    const pantalla = await this.pantallaRepo.findOne({
      where: { id: pantallaId },
      relations: { cliente: true, modulo: { cliente: true } },
    });
    if (!pantalla) {
      throw new NotFoundException(`Pantalla con ID ${pantallaId} no encontrada`);
    }

    const clienteEntity = pantalla.cliente || pantalla.modulo?.cliente;
    if (!clienteEntity) {
      throw new NotFoundException('La pantalla no tiene un cliente asociado');
    }

    const whereCasos: any = { pantallaId: pantalla.id, estado: 'ACTIVO' };
    if (dto.casoId) {
      whereCasos.id = dto.casoId;
    }

    const casos = await this.casoPruebaRepo.find({
      where: whereCasos,
      order: { fechaCreacion: 'ASC' },
    });

    if (casos.length === 0) {
      throw new BadRequestException(
        'Esta pantalla no tiene casos de prueba activos guardados para re-ejecutar.',
      );
    }

    this.estaGenerando = true;
    this.logsActuales = [
      `▶ Re-ejecución 1-Click en "${pantalla.nombre}": ${casos.length} caso(s) de prueba...`,
    ];

    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };

    try {
      const clientDir = path.join(this.rutas.directorioClientes, clienteEntity.identificador);
      const sessionPath = path.join(clientDir, 'session.json');
      const evidenciasDir = path.join(
        this.rutas.directorioDocs,
        clienteEntity.identificador,
        'evidencias-qa',
        pantalla.id,
      );

      const authConfig = {
        ...clienteEntity.auth,
        ...(dto.auth || {}),
      };

      const resultados = await this.ejecutorCasos.ejecutarCasosDePantalla({
        baseUrl: clienteEntity.urlApp,
        rutaPantalla: pantalla.ruta,
        authConfig,
        casos,
        evidenciasDir,
        headless: dto.visibleBrowser === false,
        geminiApiKey: dto.geminiApiKey,
        geminiModel: dto.geminiModel,
      });

      const ahora = new Date();
      const pantallaSlug = this.slugificarTexto(
        pantalla.identificador || pantalla.nombre || pantalla.id,
      );
      for (const res of resultados) {
        let evidenciaUrl: string | undefined;
        if (res.screenshotLocalPath && (await fs.pathExists(res.screenshotLocalPath))) {
          const fileName = path.basename(res.screenshotLocalPath);
          const casoSlug = this.slugificarTexto(res.codigo || res.casoId.slice(0, 8));
          const storagePath = `clientes/${clienteEntity.identificador}/pantallas/${pantallaSlug}/casos/${casoSlug}/${fileName}`;
          if (this.storageService.estaDisponible()) {
            const subida = await this.storageService.subirArchivoDesdeDisco(
              res.screenshotLocalPath,
              storagePath,
              'image/png',
            );
            if (subida) evidenciaUrl = subida.url;
          }
          // Borrar siempre el archivo temporal tras subirlo a Supabase
          await fs.remove(res.screenshotLocalPath).catch(() => {});
        }

        await this.casoPruebaRepo.update(res.casoId, {
          ultimoResultado: res.resultado,
          detalleUltimoFallo: res.detalleFallo || undefined,
          capturaEvidenciaUrl: evidenciaUrl,
          ultimaEjecucion: ahora,
        });
      }

      const passed = resultados.filter((r) => r.resultado === 'PASS').length;
      const failed = resultados.filter((r) => r.resultado !== 'PASS').length;
      this.logsActuales.push(
        `✔ Re-ejecución finalizada: ${passed} PASS, ${failed} FAIL.`,
      );

      return {
        success: true,
        total: resultados.length,
        passed,
        failed,
        resultados,
      };
    } finally {
      console.log = originalLog;
      this.estaGenerando = false;
    }
  }

  /**
   * Regresión General: Ejecuta en orden todas las pantallas del cliente (Login Paso 1 primero)
   * actualizando en tiempo real `estadoRegresion` para visualizar tarjetitas PASS/FAIL en vivo.
   */
  public async ejecutarRegresionCliente(
    clienteSlug: string,
    dto: EjecutarCasosPantallaDto & { geminiApiKey?: string; geminiModel?: string },
  ) {
    if (this.estaGenerando) {
      throw new ConflictException('Ya hay un proceso de Playwright en ejecución.');
    }

    const clienteEntity = await this.clienteRepo.findOne({
      where: [{ identificador: clienteSlug }],
    });
    if (!clienteEntity) {
      throw new NotFoundException(`Cliente "${clienteSlug}" no encontrado`);
    }

    const pantallas = await this.pantallaRepo
      .createQueryBuilder('p')
      .leftJoin('p.modulo', 'm')
      .where('p.clienteId = :clienteId OR m.clienteId = :clienteId', {
        clienteId: clienteEntity.id,
      })
      .orderBy('p.orden', 'ASC')
      .addOrderBy('p.fechaCreacion', 'ASC')
      .getMany();

    // Asegurar que login-inicio vaya siempre primero
    pantallas.sort((a, b) => {
      if (a.identificador === 'login-inicio') return -1;
      if (b.identificador === 'login-inicio') return 1;
      return (a.orden ?? 0) - (b.orden ?? 0);
    });

    const tarjetasIniciales = await Promise.all(
      pantallas.map(async (p) => {
        const totalCasos = await this.casoPruebaRepo.count({
          where: { pantallaId: p.id, estado: 'ACTIVO' },
        });
        return {
          pantallaId: p.id,
          nombre: p.nombre,
          ruta: p.ruta,
          esLogin: p.identificador === 'login-inicio',
          estado: (totalCasos === 0 ? 'SIN_CASOS' : 'PENDIENTE') as
            | 'PENDIENTE'
            | 'EJECUTANDO'
            | 'PASS'
            | 'FAIL'
            | 'SIN_CASOS',
          totalCasos,
          passed: 0,
          failed: 0,
        };
      }),
    );

    this.estaGenerando = true;
    this.estadoRegresion = {
      clienteSlug,
      enCurso: true,
      pantallas: tarjetasIniciales,
    };
    this.logsActuales = [
      `▶ Iniciando Regresión General para "${clienteEntity.nombre}" (${pantallas.length} pantallas)...`,
    ];

    const originalLog = console.log;
    console.log = (...args: any[]) => {
      originalLog(...args);
      const texto = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      this.logsActuales.push(texto);
    };

    void (async () => {
      try {
        const clientDir = path.join(this.rutas.directorioClientes, clienteEntity.identificador);
        const sessionPath = path.join(clientDir, 'session.json');
        const authConfig = {
          ...clienteEntity.auth,
          ...(dto.auth || {}),
        };

        for (let i = 0; i < pantallas.length; i++) {
          const p = pantallas[i];
          const tarjeta = this.estadoRegresion!.pantallas[i];
          if (tarjeta.totalCasos === 0) {
            this.logsActuales.push(
              `ℹ [${p.nombre}] Sin casos activos configurados. Omitida.`,
            );
            continue;
          }

          tarjeta.estado = 'EJECUTANDO';
          this.logsActuales.push(
            `\n🌐 Ejecutando pantalla ${i + 1}/${pantallas.length}: "${p.nombre}" (${p.ruta})...`,
          );

          try {
            const casos = await this.casoPruebaRepo.find({
              where: { pantallaId: p.id, estado: 'ACTIVO' },
              order: { fechaCreacion: 'ASC' },
            });

            const evidenciasDir = path.join(
              this.rutas.directorioDocs,
              clienteEntity.identificador,
              'evidencias-qa',
              p.id,
            );

            const resultados = await this.ejecutorCasos.ejecutarCasosDePantalla({
              baseUrl: clienteEntity.urlApp,
              rutaPantalla: p.ruta,
              authConfig,
              casos,
              evidenciasDir,
              headless: dto.visibleBrowser === false,
              geminiApiKey: dto.geminiApiKey,
              geminiModel: dto.geminiModel,
            });

            const ahora = new Date();
            const pantallaSlug = this.slugificarTexto(p.identificador || p.nombre || p.id);
            for (const res of resultados) {
              let evidenciaUrl: string | undefined;
              if (res.screenshotLocalPath && (await fs.pathExists(res.screenshotLocalPath))) {
                const fileName = path.basename(res.screenshotLocalPath);
                const casoSlug = this.slugificarTexto(res.codigo || res.casoId.slice(0, 8));
                const storagePath = `clientes/${clienteEntity.identificador}/pantallas/${pantallaSlug}/casos/${casoSlug}/${fileName}`;
                if (this.storageService.estaDisponible()) {
                  const subida = await this.storageService.subirArchivoDesdeDisco(
                    res.screenshotLocalPath,
                    storagePath,
                    'image/png',
                  );
                  if (subida) evidenciaUrl = subida.url;
                }
                await fs.remove(res.screenshotLocalPath).catch(() => {});
              }

              await this.casoPruebaRepo.update(res.casoId, {
                ultimoResultado: res.resultado,
                detalleUltimoFallo: res.detalleFallo || undefined,
                capturaEvidenciaUrl: evidenciaUrl,
                ultimaEjecucion: ahora,
              });
            }

            const passed = resultados.filter((r) => r.resultado === 'PASS').length;
            const failed = resultados.filter((r) => r.resultado !== 'PASS').length;
            const primerFallo = resultados.find((r) => r.resultado !== 'PASS')?.detalleFallo;

            tarjeta.passed = passed;
            tarjeta.failed = failed;
            tarjeta.detalleFallo = primerFallo;
            tarjeta.estado = failed > 0 ? 'FAIL' : 'PASS';
          } catch (err: any) {
            tarjeta.failed = tarjeta.totalCasos;
            tarjeta.detalleFallo = err?.message || 'Error ejecutando pantalla';
            tarjeta.estado = 'FAIL';
            this.logsActuales.push(`✖ Error en "${p.nombre}": ${tarjeta.detalleFallo}`);
          }
        }

        this.logsActuales.push('\n✔ Regresión General finalizada.');
      } finally {
        if (this.estadoRegresion) {
          this.estadoRegresion.enCurso = false;
        }
        console.log = originalLog;
        this.estaGenerando = false;
      }
    })();

    return {
      success: true,
      message: `Regresión general iniciada sobre ${pantallas.length} pantalla(s).`,
    };
  }
}
