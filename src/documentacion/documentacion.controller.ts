import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { DocumentacionService } from './documentacion.service.js';
import type {
  CarpetaDocumentacionDto,
  DetalleDocumentoDto,
} from '../common/dto/documentacion.dto.js';

@Controller('api/documentacion')
export class DocumentacionController {
  constructor(private readonly documentacionService: DocumentacionService) {}

  @Get()
  obtenerTodos(): CarpetaDocumentacionDto[] {
    return this.documentacionService.obtenerEstructura();
  }

  @Get('detalle')
  obtenerDetalle(@Query('ruta') ruta: string): DetalleDocumentoDto {
    if (!ruta || !ruta.trim()) {
      throw new BadRequestException('El parámetro "ruta" es requerido.');
    }
    return this.documentacionService.obtenerDocumentoPorRuta(ruta);
  }
}
