import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatIaModule } from './chat-ia/chat-ia.module.js';
import { DocumentacionModule } from './documentacion/documentacion.module.js';
import { DocumentosModule } from './documentos/documentos.module.js';
import { AutomanualModule } from './automanual/automanual.module.js';
import { Documento } from './documentos/entities/documento.entity.js';
import { DocumentoFragmento } from './documentos/entities/documento-fragmento.entity.js';
import { DocumentoHistorial } from './documentos/entities/documento-historial.entity.js';
import { ClienteAutomanual } from './automanual/entities/cliente-automanual.entity.js';
import { ModuloAutomanual } from './automanual/entities/modulo-automanual.entity.js';
import { PantallaAutomanual } from './automanual/entities/pantalla-automanual.entity.js';
import { CapturaAutomanual } from './automanual/entities/captura-automanual.entity.js';
import { CasoPruebaAutomanual } from './automanual/entities/caso-prueba-automanual.entity.js';
import { BearerAuthGuard } from './common/guards/bearer-auth.guard.js';

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
            entities: [
              Documento,
              DocumentoFragmento,
              DocumentoHistorial,
              ClienteAutomanual,
              ModuloAutomanual,
              PantallaAutomanual,
              CapturaAutomanual,
              CasoPruebaAutomanual,
            ],
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
          entities: [
            Documento,
            DocumentoFragmento,
            DocumentoHistorial,
            ClienteAutomanual,
            ModuloAutomanual,
            PantallaAutomanual,
            CapturaAutomanual,
            CasoPruebaAutomanual,
          ],
          synchronize: true,
        };
      },
    }),
    ChatIaModule,
    DocumentacionModule,
    DocumentosModule,
    AutomanualModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: BearerAuthGuard,
    },
  ],
})
export class AppModule {}
