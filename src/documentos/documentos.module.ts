import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Documento } from './entities/documento.entity.js';
import { DocumentoFragmento } from './entities/documento-fragmento.entity.js';
import { DocumentoHistorial } from './entities/documento-historial.entity.js';
import { DocumentosController } from './documentos.controller.js';
import { DocumentosService } from './documentos.service.js';
import { EmbeddingsService } from './embeddings.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Documento, DocumentoFragmento, DocumentoHistorial]),
  ],
  controllers: [DocumentosController],
  providers: [DocumentosService, EmbeddingsService],
  exports: [DocumentosService, EmbeddingsService],
})
export class DocumentosModule {}
