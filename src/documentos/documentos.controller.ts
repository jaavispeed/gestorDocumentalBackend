import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import 'multer';
import { DocumentosService } from './documentos.service.js';
import { CrearDocumentoDto } from './dto/crear-documento.dto.js';
import { ActualizarDocumentoDto } from './dto/actualizar-documento.dto.js';

@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  // 1. Guardar documento vía JSON directo
  @Post()
  create(
    @Body() crearDocumentoDto: CrearDocumentoDto,
    @Headers('x-gemini-key') apiKey?: string,
  ) {
    return this.documentosService.create(crearDocumentoDto, apiKey);
  }

  // 2. Subir archivo físico .md
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('categoria') categoria?: string,
    @Headers('x-gemini-key') apiKey?: string,
  ) {
    return this.documentosService.procesarArchivoSubido(
      file,
      categoria,
      apiKey,
    );
  }

  // 3. Listar todos los documentos activos
  @Get()
  findAll() {
    return this.documentosService.findAll();
  }

  // 4. Obtener documento por ID
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.findOne(id);
  }

  // 5. Obtener historial de versiones de un documento
  @Get(':id/historial')
  obtenerHistorial(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.obtenerHistorial(id);
  }

  // 6. Actualizar documento (genera nueva versión en historial y recalcula vectores)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarDocumentoDto,
    @Headers('x-gemini-key') apiKey?: string,
  ) {
    return this.documentosService.update(id, dto, apiKey);
  }

  // 7. Soft Delete (Eliminación lógica)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.softDelete(id);
  }

  // 8. Restaurar documento eliminado
  @Patch(':id/restaurar')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.restore(id);
  }
}
