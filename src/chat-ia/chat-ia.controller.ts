import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatIaService } from './chat-ia.service.js';
import { ConsultaChatDto } from '../common/dto/consulta-chat.dto.js';
import type {
  EstadoServidorDto,
  RespuestaChatDto,
} from '../common/dto/chat-respuestas.dto.js';
import {
  GenerarDocGitDiffDto,
  RespuestaDocGitDiffDto,
} from '../common/dto/git-diff-doc.dto.js';
import { CompilarManualIaDto } from '../common/dto/compilar-manual.dto.js';

@Controller()
export class ChatIaController {
  constructor(private readonly chatIaService: ChatIaService) {}

  @Get('api/estado')
  async obtenerEstado(
    @Query('clave') clavePersonalizada?: string,
    @Query('modelo') modeloPersonalizado?: string,
  ): Promise<EstadoServidorDto> {
    return this.chatIaService.obtenerEstado(
      clavePersonalizada,
      modeloPersonalizado,
    );
  }

  @Post('api/ia/chat')
  @HttpCode(HttpStatus.OK)
  async enviarChat(
    @Body() consulta: ConsultaChatDto,
    @Headers('x-gemini-key') apiKey?: string,
    @Headers('x-gemini-model') modelo?: string,
    @Headers('x-gemini-embedding-model') modeloEmbedding?: string,
  ): Promise<RespuestaChatDto> {
    return this.chatIaService.procesarMensaje(
      consulta,
      apiKey,
      modelo,
      modeloEmbedding,
    );
  }

  @Post('api/ia/generar-doc-diff')
  @HttpCode(HttpStatus.OK)
  async generarDocDiff(
    @Body() dto: GenerarDocGitDiffDto,
  ): Promise<RespuestaDocGitDiffDto> {
    return this.chatIaService.generarDocumentacionDesdeDiff(dto);
  }

  @Post('api/ia/compilar-manual')
  @HttpCode(HttpStatus.OK)
  async compilarManual(
    @Body() dto: CompilarManualIaDto,
    @Headers('x-gemini-key') apiKey?: string,
    @Headers('x-gemini-model') modelo?: string,
  ) {
    return this.chatIaService.compilarManualConIa(dto, apiKey, modelo);
  }
}
