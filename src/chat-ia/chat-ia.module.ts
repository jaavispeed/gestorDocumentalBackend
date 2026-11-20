import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatIaController } from './chat-ia.controller.js';
import { ChatIaService } from './chat-ia.service.js';
import { DocumentosModule } from '../documentos/documentos.module.js';
import { DocumentoFragmento } from '../documentos/entities/documento-fragmento.entity.js';
import { Documento } from '../documentos/entities/documento.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Documento, DocumentoFragmento]),
    DocumentosModule,
  ],
  controllers: [ChatIaController],
  providers: [ChatIaService],
  exports: [ChatIaService],
})
export class ChatIaModule {}
