import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatIaModule } from './chat-ia/chat-ia.module.js';
import { DocumentacionModule } from './documentacion/documentacion.module.js';
import { DocumentosModule } from './documentos/documentos.module.js';
import { Documento } from './documentos/entities/documento.entity.js';
import { DocumentoFragmento } from './documentos/entities/documento-fragmento.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL');

        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            entities: [Documento, DocumentoFragmento],
            synchronize: true,
            ssl: { rejectUnauthorized: false },
          };
        }

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USER', 'postgres'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          entities: [Documento, DocumentoFragmento],
          synchronize: true,
        };
      },
    }),
    ChatIaModule,
    DocumentacionModule,
    DocumentosModule,
  ],
})
export class AppModule {}
