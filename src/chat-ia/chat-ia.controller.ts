import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatIaService } from './chat-ia.service.js';
import { ConsultaChatDto } from '../common/dto/consulta-chat.dto.js';
import type { EstadoServidorDto, RespuestaChatDto } from '../common/dto/chat-respuestas.dto.js';

@Controller()
export class ChatIaController {
  constructor(private readonly chatIaService: ChatIaService) {}

  @Get('api/estado')
  obtenerEstado(): EstadoServidorDto {
    return this.chatIaService.obtenerEstado();
  }

  @Post('api/ia/chat')
  @HttpCode(HttpStatus.OK)
  async enviarChat(@Body() consulta: ConsultaChatDto): Promise<RespuestaChatDto> {
    return this.chatIaService.procesarMensaje(consulta);
  }
}
