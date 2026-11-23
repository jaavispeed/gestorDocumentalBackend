import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomanualController } from './automanual.controller.js';
import { AutomanualService } from './automanual.service.js';
import { ClienteAutomanual } from './entities/cliente-automanual.entity.js';
import { ModuloAutomanual } from './entities/modulo-automanual.entity.js';
import { PantallaAutomanual } from './entities/pantalla-automanual.entity.js';
import { CapturaAutomanual } from './entities/captura-automanual.entity.js';
import { CasoPruebaAutomanual } from './entities/caso-prueba-automanual.entity.js';
import { SupabaseStorageService } from './services/supabase-storage.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClienteAutomanual,
      ModuloAutomanual,
      PantallaAutomanual,
      CapturaAutomanual,
      CasoPruebaAutomanual,
    ]),
  ],
  controllers: [AutomanualController],
  providers: [AutomanualService, SupabaseStorageService],
  exports: [AutomanualService, SupabaseStorageService],
})
export class AutomanualModule {}
