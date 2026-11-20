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

  async create(crearDocumentoDto: CrearDocumentoDto, apiKeyHeader?: string) {
    try {
      const documento = this.documentoRepository.create({
        titulo: crearDocumentoDto.titulo,
        nombreArchivo: crearDocumentoDto.nombreArchivo,
        categoria: crearDocumentoDto.categoria || 'General',
        contenido: crearDocumentoDto.contenido,
        version: 1,
        estado: EstadoDocumento.ACTIVO,
      });

      const guardado = await this.documentoRepository.save(documento);
      await this.regenerarVectores(
        guardado.id,
        guardado.contenido,
        apiKeyHeader,
      );

      return this.findOne(guardado.id);
    } catch (error: any) {
      this.handleDBExceptions(error);
    }
  }

  async update(id: string, dto: ActualizarDocumentoDto, apiKeyHeader?: string) {
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
      await this.regenerarVectores(
        actualizado.id,
        actualizado.contenido,
        apiKeyHeader,
      );
    }

    return this.findOne(actualizado.id);
  }

  async procesarArchivoSubido(
    archivo: Express.Multer.File,
    categoria?: string,
    apiKeyHeader?: string,
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
    );
  }

  findAll() {
    // find() por defecto respeta @DeleteDateColumn e ignora eliminados lógicamente
    return this.documentoRepository.find({
      where: { estado: EstadoDocumento.ACTIVO },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const documento = await this.documentoRepository.findOne({
      where: { id },
      relations: { fragmentos: true, historial: true },
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
