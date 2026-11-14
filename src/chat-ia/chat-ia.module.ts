import { Module } from '@nestjs/common';
import { ChatIaController } from './chat-ia.controller.js';
import { ChatIaService } from './chat-ia.service.js';

@Module({
  controllers: [ChatIaController],
  providers: [ChatIaService],
  exports: [ChatIaService],
})
export class ChatIaModule {}
