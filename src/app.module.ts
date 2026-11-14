import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatIaModule } from './chat-ia/chat-ia.module.js';
import { DocumentacionModule } from './documentacion/documentacion.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ChatIaModule,
    DocumentacionModule,
  ],
})
export class AppModule {}
