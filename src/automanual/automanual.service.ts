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

  private estaGenerando = false;
  private logsActuales: string[] = [];
  // Almacena temporalmente el resultado de exploración/generación para revisión humana antes de guardar
  private revisionPendiente: {
    clienteSlug: string;
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

    if (!datos.clienteId || !datos.moduloId || !datos.seccionId || !datos.titulo) {
      throw new BadRequestException('Faltan campos obligatorios para el caso de prueba');
    }

    // Vincular automáticamente con PantallaAutomanual si no viene pantallaId
    if (!datos.pantallaId) {
      const pantalla = await this.pantallaRepo
        .createQueryBuilder('p')
        .innerJoin('p.modulo', 'm')
        .where('m.clienteId = :clienteId', { clienteId: datos.clienteId })
        .andWhere('m.identificador = :modId', { modId: datos.moduloId })
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
    };
  }

  public descartarRevisionPendiente() {
    this.revisionPendiente = null;
    return { success: true };
  }

  public async confirmarRevisionPendiente(datosConfirmados: {
    capturasSeleccionadas: string[]; // fileNames de las capturas aprobadas
    casosAprobados: any[]; // casos de prueba aprobados/editados por el usuario
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
    pantallaDb = await this.pantallaRepo
      .createQueryBuilder('p')
      .innerJoin('p.modulo', 'm')
      .where('m.clienteId = :clienteId', { clienteId: clienteDb.id })
      .andWhere('m.identificador = :modId', { modId: rev.moduloId })
      .andWhere('p.identificador = :secId', { secId: rev.seccionId })
      .getOne();

    // 1. Subir a Supabase Storage y guardar en BD únicamente las capturas aprobadas
    for (const cap of rev.capturas) {
      if (!datosConfirmados.capturasSeleccionadas.includes(cap.fileName)) {
        continue;
      }

      if (!(await fs.pathExists(cap.rutaLocal))) continue;

      const extension = path.extname(cap.fileName) || '.png';
      const baseName = path.basename(cap.fileName, extension);
      const storagePath = `clientes/${rev.clienteSlug}/${rev.moduloId}/${rev.seccionId}/${baseName}${extension}`;

      let publicUrl = '';
      if (this.storageService.estaDisponible()) {
        const subida = await this.storageService.subirArchivoDesdeDisco(
          cap.rutaLocal,
          storagePath,
          'image/png',
        );
        if (subida) {
          publicUrl = subida.url;
        }
      }

      const stats = await fs.stat(cap.rutaLocal);
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
          url: publicUrl || `/manuals/${rev.clienteSlug}/${rev.moduloId}/${rev.seccionId}/screenshots/${cap.fileName}`,
          tipo: cap.tipo as any,
          titulo: cap.caption,
          estadoQa: 'PASS',
          metadata,
        }),
      );
    }

    // 2. Guardar los casos de prueba aprobados en la base de datos
    for (const caso of datosConfirmados.casosAprobados) {
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
          descripcion: caso.descripcion,
          pasos: caso.pasos || [],
          resultadoEsperado: caso.criterioAsercion || caso.resultadoEsperado || { tipo: 'selector_visible', selector: 'body' },
          ultimoResultado: 'PENDIENTE',
        }),
      );
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
}
