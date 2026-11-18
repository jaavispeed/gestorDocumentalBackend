import {
  Controller,
  Get,
  Post,
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

  // 2. Subir archivo físico .md (Multipart / Form-Data)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('categoria') categoria?: string,
    @Headers('x-gemini-key') apiKey?: string,
  ) {
    return this.documentosService.procesarArchivoSubido(file, categoria, apiKey);
  }

  // 3. Listar todos los documentos
  @Get()
  findAll() {
    return this.documentosService.findAll();
  }

  // 4. Obtener documento por ID con sus fragmentos vectoriales
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.findOne(id);
  }

  // 5. Eliminar documento (y sus fragmentos en cascada)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentosService.remove(id);
  }
}
