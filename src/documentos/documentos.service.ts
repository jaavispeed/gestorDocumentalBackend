import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Express } from 'express';
import 'multer';
import { Documento, EstadoDocumento } from './entities/documento.entity.js';
import { DocumentoFragmento } from './entities/documento-fragmento.entity.js';
import { DocumentoHistorial } from './entities/documento-historial.entity.js';
import { CrearDocumentoDto } from './dto/crear-documento.dto.js';
import { ActualizarDocumentoDto } from './dto/actualizar-documento.dto.js';
import { EmbeddingsService } from './embeddings.service.js';
import { dividirMarkdownPorSecciones } from './utils/markdown-chunker.js';
import { PaginacionDto, RespuestaPaginada } from '../common/dto/paginacion.dto.js';

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger('DocumentosService');

  constructor(
    @InjectRepository(Documento)
    private readonly documentoRepository: Repository<Documento>,
    @InjectRepository(DocumentoFragmento)
    private readonly fragmentoRepository: Repository<DocumentoFragmento>,
    @InjectRepository(DocumentoHistorial)
    private readonly historialRepository: Repository<DocumentoHistorial>,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Valida defensivamente si ya existe un documento con el mismo nombre de archivo
   * o si semánticamente / en texto es idéntico o casi idéntico a uno existente en la base de datos.
   */
  async validarDuplicado(
    nombreArchivo: string,
    contenido: string,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ): Promise<void> {
    const nombreLimpio = (nombreArchivo || '').trim();
    // Normalizar saltos de línea y espacios en blanco de los extremos
    const normalizarTexto = (t: string) =>
      (t || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const contenidoLimpio = normalizarTexto(contenido);

    // 1. Detección por nombre de archivo exacto (solo documentos con estado ACTIVO)
    const existentePorNombre = await this.documentoRepository.findOne({
      where: {
        nombreArchivo: nombreLimpio,
        estado: EstadoDocumento.ACTIVO,
      },
    });

    if (existentePorNombre) {
      throw new ConflictException(
        `Ya existe un documento activo registrado con el archivo "${nombreArchivo}" (Título: "${existentePorNombre.titulo}", Feature: "${existentePorNombre.categoria || 'General'}").`,
      );
    }

    // 2. Detección por coincidencia de texto/contenido (normalizado contra base de datos)
    const existentePorContenidoExacto = await this.documentoRepository
      .createQueryBuilder('d')
      .where('d.estado = :estado', { estado: EstadoDocumento.ACTIVO })
      .andWhere('d.fecha_eliminacion IS NULL')
      .andWhere(
        "REPLACE(REPLACE(TRIM(d.contenido), '\r\n', '\n'), '\r', '\n') = :contenido",
        { contenido: contenidoLimpio },
      )
      .getOne();

    if (existentePorContenidoExacto) {
      throw new ConflictException(
        `El contenido de "${nombreArchivo}" es exactamente idéntico al documento existente "${existentePorContenidoExacto.titulo}" (${existentePorContenidoExacto.nombreArchivo || 'sin archivo'}).`,
      );
    }

    // 3. Detección por similitud vectorial semántica (pgvector)
    try {
      // Tomamos una muestra representativa de hasta 3.000 caracteres
      const muestra = contenidoLimpio.substring(0, 3000);
      if (muestra.length > 40) {
        const vector = await this.embeddingsService.generarEmbedding(
          muestra,
          apiKeyHeader,
          modeloEmbeddingHeader,
        );

        if (vector && vector.length > 0) {
          const vectorStr = `[${vector.join(',')}]`;

          // Buscamos contra cualquier fragmento activo existente
          const duplicadoSemantico: Array<{
            id: string;
            titulo: string;
            nombre_archivo: string;
            categoria: string;
            similitud: number;
          }> = await this.fragmentoRepository.query(
            `
            SELECT 
              d.id,
              d.titulo,
              d.nombre_archivo,
              d.categoria,
              1 - (df.embedding <=> $1::vector) AS similitud
            FROM documento_fragmentos df
            INNER JOIN documentos d ON d.id = df.documento_id
            WHERE df.embedding IS NOT NULL
              AND d.estado = 'ACTIVO'
              AND d.fecha_eliminacion IS NULL
            ORDER BY df.embedding <=> $1::vector ASC
            LIMIT 1
            `,
            [vectorStr],
          );

          if (duplicadoSemantico && duplicadoSemantico.length > 0) {
            const masCercano = duplicadoSemantico[0];
            const sim = Number(masCercano.similitud);

            // Umbral de duplicidad semántica ajustado (>= 0.93 o 93%)
            if (sim >= 0.93) {
              const porcentaje = (sim * 100).toFixed(1);
              throw new ConflictException(
                `Detección de contenido duplicado (IA - ${porcentaje}% de similitud): El archivo "${nombreArchivo}" tiene el mismo contenido que el documento existente "${masCercano.titulo}" (${masCercano.nombre_archivo || 'sin archivo'}, Feature: "${masCercano.categoria || 'General'}").`,
              );
            }
          }
        }
      }
    } catch (vectorError: any) {
      if (vectorError instanceof ConflictException) {
        throw vectorError;
      }
      this.logger.warn(
        `Validación vectorial previa omitida por error técnico: ${vectorError.message}`,
      );
    }
  }

  async create(
    crearDocumentoDto: CrearDocumentoDto,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ) {
    try {
      // Validación defensiva previa de duplicados
      if (crearDocumentoDto.nombreArchivo) {
        await this.validarDuplicado(
          crearDocumentoDto.nombreArchivo,
          crearDocumentoDto.contenido,
          apiKeyHeader,
          modeloEmbeddingHeader,
        );
      }

      const documento = this.documentoRepository.create({
        titulo: crearDocumentoDto.titulo,
        nombreArchivo: crearDocumentoDto.nombreArchivo,
        categoria: crearDocumentoDto.categoria || 'General',
        tipoUsuario: crearDocumentoDto.tipoUsuario || ('DEV' as any),
        contenido: crearDocumentoDto.contenido,
        version: 1,
        estado: EstadoDocumento.ACTIVO,
      });

      // El documento siempre se guarda primero para preservar el archivo .md
      const guardado = await this.documentoRepository.save(documento);

      // Intentar generar los vectores del documento; si la IA falla, no se aborta la subida
      try {
        await this.regenerarVectores(
          guardado.id,
          guardado.contenido,
          apiKeyHeader,
          modeloEmbeddingHeader,
        );
      } catch (vectorError: any) {
        this.logger.warn(
          `Documento guardado pero ocurrió un error al generar embeddings: ${vectorError.message}`,
        );
      }

      return this.findOne(guardado.id);
    } catch (error: any) {
      this.handleDBExceptions(error);
    }
  }

  async update(
    id: string,
    dto: ActualizarDocumentoDto,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ) {
    const documento = await this.findOne(id);

    // 1. Si hay cambios en el contenido o título, guardamos snapshot en historial
    const hayCambio =
      (dto.contenido && dto.contenido !== documento.contenido) ||
      (dto.titulo && dto.titulo !== documento.titulo);

    if (hayCambio) {
      const snapshot = this.historialRepository.create({
        documentoId: documento.id,
        version: documento.version,
        tituloAnterior: documento.titulo,
        contenidoAnterior: documento.contenido,
        resumenCambio:
          dto.resumenCambio || `Edición a versión ${documento.version + 1}`,
        modificadoPor: dto.modificadoPor || 'Usuario',
      });
      await this.historialRepository.save(snapshot);

      // Incrementar número de versión
      documento.version += 1;
    }

    if (dto.titulo) documento.titulo = dto.titulo;
    if (dto.categoria) documento.categoria = dto.categoria;
    if (dto.tipoUsuario) documento.tipoUsuario = dto.tipoUsuario;
    if (dto.contenido) documento.contenido = dto.contenido;

    const actualizado = await this.documentoRepository.save(documento);

    // 2. Si cambió el contenido, se recalculan los vectores RAG
    if (dto.contenido) {
      try {
        await this.regenerarVectores(
          actualizado.id,
          actualizado.contenido,
          apiKeyHeader,
          modeloEmbeddingHeader,
        );
      } catch (vectorError: any) {
        this.logger.warn(
          `Documento actualizado pero falló el recálculo de embeddings: ${vectorError.message}`,
        );
      }
    }

    return this.findOne(actualizado.id);
  }

  async procesarArchivoSubido(
    archivo: Express.Multer.File,
    categoria?: string,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
    tipoUsuario?: 'DEV' | 'USUARIO',
  ) {
    if (!archivo) {
      throw new BadRequestException('No se ha proporcionado ningún archivo.');
    }

    if (!archivo.originalname.endsWith('.md')) {
      throw new BadRequestException(
        'Solo se permiten archivos en formato Markdown (.md).',
      );
    }

    const contenido = archivo.buffer.toString('utf-8');
    const titulo = archivo.originalname
      .replace(/\.md$/, '')
      .replace(/_/g, ' ')
      .trim();

    return this.create(
      {
        titulo,
        nombreArchivo: archivo.originalname,
        categoria: categoria || 'General',
        tipoUsuario: (tipoUsuario as any) || 'DEV',
        contenido,
      },
      apiKeyHeader,
      modeloEmbeddingHeader,
    );
  }

  async procesarMultiplesArchivos(
    archivos: Express.Multer.File[],
    categorias?: string | string[],
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
    tipoUsuario?: 'DEV' | 'USUARIO' | string[],
  ) {
    if (!archivos || archivos.length === 0) {
      throw new BadRequestException('No se han proporcionado archivos.');
    }

    const categoriasArray = Array.isArray(categorias)
      ? categorias
      : typeof categorias === 'string'
        ? [categorias]
        : [];

    const tipoUsuarioArray = Array.isArray(tipoUsuario)
      ? tipoUsuario
      : typeof tipoUsuario === 'string'
        ? [tipoUsuario]
        : [];

    const resultados = [];
    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      const categoria = categoriasArray[i] || categoriasArray[0] || 'General';
      const usuarioTipo = (tipoUsuarioArray[i] || tipoUsuarioArray[0] || 'DEV') as 'DEV' | 'USUARIO';
      const doc = await this.procesarArchivoSubido(
        archivo,
        categoria,
        apiKeyHeader,
        modeloEmbeddingHeader,
        usuarioTipo,
      );
      resultados.push(doc);
    }

    return resultados;
  }

  async findAll(paginacionDto?: PaginacionDto): Promise<RespuestaPaginada<any> | any[]> {
    // Si no se envían parámetros de paginación explícitos (modo retrocompatible)
    const pagina = paginacionDto?.pagina ? Number(paginacionDto.pagina) : undefined;
    const limite = paginacionDto?.limite ? Number(paginacionDto.limite) : undefined;
    const busqueda = paginacionDto?.busqueda?.trim();
    const tipoUsuario = paginacionDto?.tipoUsuario;
    const categoria = paginacionDto?.categoria?.trim();

    const queryBuilder = this.documentoRepository
      .createQueryBuilder('d')
      .leftJoin('d.fragmentos', 'f')
      .select([
        'd.id',
        'd.titulo',
        'd.nombreArchivo',
        'd.categoria',
        'd.tipoUsuario',
        'd.estado',
        'd.version',
        'd.fechaCreacion',
        'd.fechaActualizacion',
      ])
      .addSelect('COUNT(f.id)', 'total_fragmentos')
      .addSelect('COUNT(CASE WHEN f.embedding IS NOT NULL THEN 1 END)', 'total_vectores')
      .where('d.estado = :estado', { estado: EstadoDocumento.ACTIVO });

    if (busqueda) {
      queryBuilder.andWhere(
        '(LOWER(d.titulo) LIKE LOWER(:busqueda) OR LOWER(d.nombreArchivo) LIKE LOWER(:busqueda))',
        { busqueda: `%${busqueda}%` },
      );
    }

    if (tipoUsuario && tipoUsuario !== 'TODOS') {
      queryBuilder.andWhere('d.tipoUsuario = :tipoUsuario', { tipoUsuario });
    }

    if (categoria) {
      queryBuilder.andWhere('LOWER(d.categoria) = LOWER(:categoria)', { categoria });
    }

    queryBuilder
      .groupBy('d.id')
      .orderBy('d.fechaCreacion', 'DESC');

    // Si no hay paginación definida (ej. llamada interna sin query params), retornar array completo
    if (!pagina && !limite && !busqueda && !tipoUsuario && !categoria) {
      const documentos = await queryBuilder.getRawAndEntities();
      return documentos.entities.map((doc, idx) => {
        const raw = documentos.raw[idx];
        const totalVectores = parseInt(raw?.total_vectores || '0', 10);
        const totalFragmentos = parseInt(raw?.total_fragmentos || '0', 10);
        return {
          ...doc,
          totalFragmentos,
          totalVectores,
          tieneVectores: totalVectores > 0,
        };
      });
    }

    const paginaActual = pagina || 1;
    const limiteActual = limite || 10;
    const offset = (paginaActual - 1) * limiteActual;

    // Conteo total para paginación
    const subQueryTotal = this.documentoRepository
      .createQueryBuilder('d_count')
      .where('d_count.estado = :estado', { estado: EstadoDocumento.ACTIVO });

    if (busqueda) {
      subQueryTotal.andWhere(
        '(LOWER(d_count.titulo) LIKE LOWER(:busqueda) OR LOWER(d_count.nombreArchivo) LIKE LOWER(:busqueda))',
        { busqueda: `%${busqueda}%` },
      );
    }
    if (tipoUsuario && tipoUsuario !== 'TODOS') {
      subQueryTotal.andWhere('d_count.tipoUsuario = :tipoUsuario', { tipoUsuario });
    }
    if (categoria) {
      subQueryTotal.andWhere('LOWER(d_count.categoria) = LOWER(:categoria)', { categoria });
    }

    const total = await subQueryTotal.getCount();

    queryBuilder.offset(offset).limit(limiteActual);

    const documentos = await queryBuilder.getRawAndEntities();

    const datos = documentos.entities.map((doc, idx) => {
      const raw = documentos.raw[idx];
      const totalVectores = parseInt(raw?.total_vectores || '0', 10);
      const totalFragmentos = parseInt(raw?.total_fragmentos || '0', 10);
      return {
        ...doc,
        totalFragmentos,
        totalVectores,
        tieneVectores: totalVectores > 0,
      };
    });

    const totalPaginas = Math.ceil(total / limiteActual) || 1;

    return {
      datos,
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

  /**
   * Lista todas las categorías / features existentes y activas
   */
  async obtenerCategorias(): Promise<string[]> {
    const resultados = await this.documentoRepository
      .createQueryBuilder('d')
      .select('DISTINCT COALESCE(NULLIF(TRIM(d.categoria), \'\'), \'General\')', 'categoria')
      .where('d.estado = :estado', { estado: EstadoDocumento.ACTIVO })
      .orderBy('categoria', 'ASC')
      .getRawMany();

    return resultados.map((r) => r.categoria as string);
  }

  /**
   * Obtiene todos los documentos activos completos (con su contenido)
   * Diseñado para exportaciones masivas como descarga de ZIP
   */
  async obtenerTodosCompletos(): Promise<Documento[]> {
    return this.documentoRepository.find({
      select: {
        id: true,
        titulo: true,
        nombreArchivo: true,
        contenido: true,
        categoria: true,
        tipoUsuario: true,
        version: true,
      },
      where: { estado: EstadoDocumento.ACTIVO },
      order: { categoria: 'ASC', titulo: 'ASC' },
    });
  }

  async findOne(id: string) {
    const documento = await this.documentoRepository.findOne({
      where: { id },
      relations: { fragmentos: true, historial: true },
      withDeleted: true,
    });

    if (!documento) {
      throw new NotFoundException(`Documento con id ${id} no encontrado`);
    }

    return documento;
  }

  async obtenerHistorial(id: string) {
    return this.historialRepository.find({
      where: { documentoId: id },
      order: { version: 'DESC' },
    });
  }

  // Soft Delete: Marca como ELIMINADO y asigna deletedAt
  async softDelete(id: string) {
    const documento = await this.findOne(id);
    documento.estado = EstadoDocumento.ELIMINADO;
    await this.documentoRepository.save(documento);
    await this.documentoRepository.softDelete(id);

    return {
      message: `Documento "${documento.titulo}" eliminado correctamente (Soft Delete)`,
      id,
    };
  }

  // Restaurar documento eliminado
  async restore(id: string) {
    await this.documentoRepository.restore(id);
    const documento = await this.documentoRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (documento) {
      documento.estado = EstadoDocumento.ACTIVO;
      await this.documentoRepository.save(documento);
    }

    return documento;
  }

  private async regenerarVectores(
    documentoId: string,
    contenido: string,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ) {
    // Eliminar fragmentos anteriores
    await this.fragmentoRepository.delete({ documentoId });

    // Dividir en bloques
    const bloques = dividirMarkdownPorSecciones(contenido);
    const fragmentosEntidades: DocumentoFragmento[] = [];

    for (const bloque of bloques) {
      const vectorNumeros = await this.embeddingsService.generarEmbedding(
        bloque.contenido,
        apiKeyHeader,
        modeloEmbeddingHeader,
      );

      const vectorString = vectorNumeros
        ? `[${vectorNumeros.join(',')}]`
        : undefined;

      const fragmento = this.fragmentoRepository.create({
        documentoId,
        indice: bloque.indice,
        seccion: bloque.seccion,
        contenido: bloque.contenido,
        embedding: vectorString,
      });

      fragmentosEntidades.push(fragmento);
    }

    if (fragmentosEntidades.length > 0) {
      await this.fragmentoRepository.save(fragmentosEntidades);
    }
  }

  async regenerarEmbeddingsExistentes(
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ) {
    const documentos = await this.documentoRepository.find({
      where: { estado: EstadoDocumento.ACTIVO },
    });

    try {
      for (const doc of documentos) {
        await this.regenerarVectores(
          doc.id,
          doc.contenido,
          apiKeyHeader,
          modeloEmbeddingHeader,
        );
      }
    } catch (error: any) {
      throw new BadRequestException(
        `Error al regenerar embeddings: ${error.message}`,
      );
    }

    return {
      message: `Se han regenerado los vectores RAG para ${documentos.length} documento(s).`,
      totalDocumentos: documentos.length,
    };
  }

  async regenerarEmbeddingsPorDocumento(
    id: string,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ) {
    const doc = await this.findOne(id);
    try {
      await this.regenerarVectores(
        doc.id,
        doc.contenido,
        apiKeyHeader,
        modeloEmbeddingHeader,
      );
    } catch (error: any) {
      throw new BadRequestException(
        `Error al regenerar embeddings para "${doc.titulo}": ${error.message}`,
      );
    }

    return {
      message: `Vectores RAG regenerados correctamente para "${doc.titulo}".`,
      id: doc.id,
      titulo: doc.titulo,
    };
  }

  /**
   * Sugiere el Feature (categoría) y el tipo de documento (DEV o USUARIO) más adecuado para un archivo
   * analizando su nombre y una muestra de su contenido contra los vectores existentes en la base de datos (pgvector).
   */
  async sugerirFeature(
    nombreArchivo: string,
    muestraContenido?: string,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ): Promise<{
    featureSugerido: string;
    tipoUsuarioSugerido: 'DEV' | 'USUARIO';
    origen: 'vector' | 'heuristica';
    confianza?: number;
    duplicadoDetectado?: {
      titulo: string;
      nombreArchivo: string;
      similitud: number;
    };
  }> {
    const tipoUsuarioSugerido = this.detectarTipoUsuarioSugerido(
      nombreArchivo,
      muestraContenido,
    );

    // 1. Extraer texto para vectorizar (combinación de nombre y muestra inicial del contenido)
    const textoConsulta = [
      nombreArchivo.replace(/\.md$/i, '').replace(/[-_]+/g, ' '),
      muestraContenido ? muestraContenido.substring(0, 1000) : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    try {
      if (textoConsulta) {
        const vector = await this.embeddingsService.generarEmbedding(
          textoConsulta,
          apiKeyHeader,
          modeloEmbeddingHeader,
        );

        if (vector && vector.length > 0) {
          const vectorStr = `[${vector.join(',')}]`;

          // Buscar los fragmentos más cercanos en documentos activos
          const coincidencias: Array<{
            id: string;
            titulo: string;
            nombre_archivo: string;
            categoria: string;
            tipo_usuario?: string;
            similitud: number;
          }> = await this.fragmentoRepository.query(
            `
            SELECT 
              d.id,
              d.titulo,
              d.nombre_archivo,
              d.categoria,
              d.tipo_usuario,
              1 - (df.embedding <=> $1::vector) AS similitud
            FROM documento_fragmentos df
            INNER JOIN documentos d ON d.id = df.documento_id
            WHERE df.embedding IS NOT NULL
              AND d.categoria IS NOT NULL
              AND d.categoria != ''
              AND d.estado = 'ACTIVO'
              AND d.fecha_eliminacion IS NULL
            ORDER BY df.embedding <=> $1::vector ASC
            LIMIT 5
            `,
            [vectorStr],
          );

          let duplicadoDetectado:
            | { titulo: string; nombreArchivo: string; similitud: number }
            | undefined = undefined;

          if (coincidencias && coincidencias.length > 0) {
            const masCercano = coincidencias[0];
            if (Number(masCercano.similitud) >= 0.93) {
              duplicadoDetectado = {
                titulo: masCercano.titulo,
                nombreArchivo: masCercano.nombre_archivo,
                similitud: Number(masCercano.similitud),
              };
            }

            // Contar votos ponderados por similitud para la mejor categoría
            const puntuaciones: Record<string, number> = {};
            let votosDev = 0;
            let votosUsuario = 0;

            for (const c of coincidencias) {
              if (c.categoria) {
                puntuaciones[c.categoria] =
                  (puntuaciones[c.categoria] || 0) + Number(c.similitud);
              }
              if (c.tipo_usuario === 'USUARIO') {
                votosUsuario += Number(c.similitud);
              } else if (c.tipo_usuario === 'DEV') {
                votosDev += Number(c.similitud);
              }
            }

            let mejorCategoria = '';
            let mejorPuntuacion = -1;
            for (const [cat, punt] of Object.entries(puntuaciones)) {
              if (punt > mejorPuntuacion) {
                mejorPuntuacion = punt;
                mejorCategoria = cat;
              }
            }

            // Si hay fuerte coherencia en los documentos vecinos encontrados vectorialmente
            const tipoFinal =
              votosUsuario > votosDev && votosUsuario >= 0.8
                ? 'USUARIO'
                : votosDev > votosUsuario && votosDev >= 0.8
                  ? 'DEV'
                  : tipoUsuarioSugerido;

            // Si la similitud del primer resultado es representativa (>= 0.55)
            if (mejorCategoria && coincidencias[0].similitud >= 0.55) {
              return {
                featureSugerido: mejorCategoria,
                tipoUsuarioSugerido: tipoFinal,
                origen: 'vector',
                confianza: Number(coincidencias[0].similitud.toFixed(2)),
                duplicadoDetectado,
              };
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Fallo al sugerir feature con vectores: ${err.message}. Aplicando heurística.`,
      );
    }

    // 2. Si no hay vectores o la similitud fue baja, usar heurística formateada limpiamente
    const featureLimpio = this.limpiarYFormatearFeature(nombreArchivo);
    return {
      featureSugerido: featureLimpio,
      tipoUsuarioSugerido,
      origen: 'heuristica',
    };
  }

  /**
   * Detecta si un documento es para un usuario final o para un desarrollador técnico.
   */
  private detectarTipoUsuarioSugerido(
    nombreArchivo: string,
    muestraContenido?: string,
  ): 'DEV' | 'USUARIO' {
    const textoAnalisis = `${nombreArchivo} ${muestraContenido || ''}`.toLowerCase();

    // Palabras e indicios que sugieren documentación funcional / usuario final
    const indiciosUsuario = [
      'usuario',
      'manual de usuario',
      'guia de usuario',
      'guía de usuario',
      'paso a paso',
      'pantalla',
      'flujo',
      'cliente',
      'operativo',
      'operador',
      'funcional',
      'formulario',
      'boton',
      'botón',
      'clic en',
      'haga clic',
      'seleccionar',
      'captura de pantalla',
      'manual-usuario',
      'user guide',
      'user-guide',
    ];

    // Palabras e indicios técnicos que sugieren documentación para devs
    const indiciosDev = [
      'api',
      'endpoint',
      'controller',
      'service',
      'schema',
      'dto',
      'token',
      'jwt',
      'backend',
      'frontend',
      'curl',
      'post /',
      'get /',
      'patch /',
      'delete /',
      'json',
      'sql',
      'database',
      'typescript',
      'docker',
      'git',
      'http',
      'payload',
      'repositorio',
      'arquitectura',
      'sdk',
      'dev',
    ];

    let puntuacionUsuario = 0;
    let puntuacionDev = 0;

    for (const palabra of indiciosUsuario) {
      if (textoAnalisis.includes(palabra)) {
        puntuacionUsuario += 1;
      }
    }

    for (const palabra of indiciosDev) {
      if (textoAnalisis.includes(palabra)) {
        puntuacionDev += 1;
      }
    }

    if (puntuacionUsuario > puntuacionDev) {
      return 'USUARIO';
    }

    return 'DEV';
  }

  /**
   * Limpia nombres crudos de archivos como "DocumentacionRentaVariable_Venta" o "RV-01_comisiones"
   * transformándolos a nombres limpios y profesionales (ej: "Renta Variable", "Comisiones").
   */
  private limpiarYFormatearFeature(nombreArchivo: string): string {
    let base = nombreArchivo.replace(/\.md$/i, '').trim();

    // Eliminar prefijos comunes y redundantes como "Documentacion", "Documento", "Manual", "Guia", "Doc_"
    base = base.replace(/^(documentacion|documento|manual|guia|doc|specs?)[_ -]*/i, '');

    // Si viene en camelCase o PascalCase, separar palabras: "RentaVariable" -> "Renta Variable"
    base = base.replace(/([a-z])([A-Z])/g, '$1 $2');
    base = base.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

    // Reemplazar guiones y guiones bajos por espacios
    base = base.replace(/[-_]+/g, ' ').trim();

    // Reemplazos de acrónimos comunes conocidos
    const lower = base.toLowerCase();
    if (lower.startsWith('rv ') || lower === 'rv' || lower.includes('renta variable')) {
      return 'Renta Variable';
    }
    if (lower.startsWith('rf ') || lower === 'rf' || lower.includes('renta fija')) {
      return 'Renta Fija';
    }
    if (lower.includes('auth') || lower.includes('login') || lower.includes('usuario')) {
      return 'Autenticación';
    }
    if (lower.includes('pago') || lower.includes('billing') || lower.includes('factur')) {
      return 'Facturación';
    }
    if (lower.includes('comision')) {
      return 'Comisiones';
    }
    if (lower.includes('notificac')) {
      return 'Notificaciones';
    }
    if (lower.includes('orden')) {
      return 'Órdenes';
    }

    // Capitalizar palabras estilo Title Case estándar
    const palabras = base.split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return 'General';

    // Tomar las primeras dos palabras si es un nombre muy largo
    const palabrasClave = palabras.slice(0, 2);
    return palabrasClave
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }

  private handleDBExceptions(error: any) {
    if (error instanceof ConflictException || error instanceof BadRequestException) {
      throw error;
    }

    if (error.code === '23505') {
      throw new ConflictException(
        error.detail || 'El archivo o documento ya existe en la base de datos.',
      );
    }

    this.logger.error(error);
    throw new InternalServerErrorException(
      'Error inesperado, revise los logs del servidor',
    );
  }
}
