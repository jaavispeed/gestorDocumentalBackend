import {
  BadRequestException,
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

  async create(
    crearDocumentoDto: CrearDocumentoDto,
    apiKeyHeader?: string,
    modeloEmbeddingHeader?: string,
  ) {
    try {
      const documento = this.documentoRepository.create({
        titulo: crearDocumentoDto.titulo,
        nombreArchivo: crearDocumentoDto.nombreArchivo,
        categoria: crearDocumentoDto.categoria || 'General',
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
  ) {
    if (!archivos || archivos.length === 0) {
      throw new BadRequestException('No se han proporcionado archivos.');
    }

    const categoriasArray = Array.isArray(categorias)
      ? categorias
      : typeof categorias === 'string'
        ? [categorias]
        : [];

    const resultados = [];
    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      const categoria = categoriasArray[i] || categoriasArray[0] || 'General';
      const doc = await this.procesarArchivoSubido(
        archivo,
        categoria,
        apiKeyHeader,
        modeloEmbeddingHeader,
      );
      resultados.push(doc);
    }

    return resultados;
  }

  findAll() {
    // Retorna solo documentos con estado ACTIVO sin importar si tienen o no fecha de eliminación (withDeleted: true)
    return this.documentoRepository.find({
      where: { estado: EstadoDocumento.ACTIVO },
      order: { fechaCreacion: 'DESC' },
      withDeleted: true,
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
      withDeleted: true,
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

  private handleDBExceptions(error: any) {
    if (error.code === '23505') {
      throw new BadRequestException(error.detail || 'El registro ya existe');
    }

    this.logger.error(error);
    throw new InternalServerErrorException(
      'Error inesperado, revise los logs del servidor',
    );
  }
}
