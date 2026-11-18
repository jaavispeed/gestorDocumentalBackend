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
import { Documento } from './entities/documento.entity.js';
import { DocumentoFragmento } from './entities/documento-fragmento.entity.js';
import { CrearDocumentoDto } from './dto/crear-documento.dto.js';
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
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async create(crearDocumentoDto: CrearDocumentoDto, apiKeyHeader?: string) {
    try {
      // 1. Guardar el documento completo
      const documento = this.documentoRepository.create({
        titulo: crearDocumentoDto.titulo,
        nombreArchivo: crearDocumentoDto.nombreArchivo,
        categoria: crearDocumentoDto.categoria || 'General',
        contenido: crearDocumentoDto.contenido,
      });

      const guardado = await this.documentoRepository.save(documento);

      // 2. Dividir en fragmentos (chunking inteligente por secciones Markdown)
      const bloques = dividirMarkdownPorSecciones(guardado.contenido);

      // 3. Generar embeddings y guardar cada fragmento
      const fragmentosEntidades: DocumentoFragmento[] = [];

      for (const bloque of bloques) {
        const vectorNumeros = await this.embeddingsService.generarEmbedding(
          bloque.contenido,
          apiKeyHeader,
        );

        // Formato vector de Postgres: "[0.12, -0.05, ...]"
        const vectorString = vectorNumeros ? `[${vectorNumeros.join(',')}]` : undefined;

        const fragmento = this.fragmentoRepository.create({
          documentoId: guardado.id,
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

      return this.findOne(guardado.id);
    } catch (error: any) {
      this.handleDBExceptions(error);
    }
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
      throw new BadRequestException('Solo se permiten archivos en formato Markdown (.md).');
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
    return this.documentoRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const documento = await this.documentoRepository.findOne({
      where: { id },
      relations: { fragmentos: true },
    });

    if (!documento) {
      throw new NotFoundException(`Documento con id ${id} no encontrado`);
    }

    return documento;
  }

  async remove(id: string) {
    const documento = await this.findOne(id);
    await this.documentoRepository.remove(documento);
    return { message: `Documento "${documento.titulo}" eliminado correctamente` };
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
