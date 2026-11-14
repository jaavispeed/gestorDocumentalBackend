import { Module } from '@nestjs/common';
import { DocumentacionController } from './documentacion.controller.js';
import { DocumentacionService } from './documentacion.service.js';

@Module({
  controllers: [DocumentacionController],
  providers: [DocumentacionService],
  exports: [DocumentacionService],
})
export class DocumentacionModule {}
