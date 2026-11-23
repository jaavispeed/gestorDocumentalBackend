import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs-extra';

export interface ResultadoSubidaStorage {
  url: string;
  path: string;
}

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private clienteSupabase: SupabaseClient | null = null;
  private readonly nombreBucket: string;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.nombreBucket =
      this.configService.get<string>('SUPABASE_BUCKET_AUTOMANUAL') || 'autodoc';

    if (supabaseUrl && supabaseKey) {
      try {
        this.clienteSupabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        this.logger.log(
          `Supabase Storage inicializado para el bucket: ${this.nombreBucket}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Error al inicializar cliente de Supabase: ${err.message}`,
        );
      }
    } else {
      this.logger.warn(
        'SUPABASE_URL o SUPABASE_KEY no configurados. Las capturas se mantendrán solo en local.',
      );
    }
  }

  public estaDisponible(): boolean {
    return this.clienteSupabase !== null;
  }

  public async subirArchivoDesdeDisco(
    rutaArchivoLocal: string,
    rutaDestinoEnBucket: string,
    contentType = 'image/png',
  ): Promise<ResultadoSubidaStorage | null> {
    if (!this.clienteSupabase) return null;

    try {
      if (!(await fs.pathExists(rutaArchivoLocal))) {
        this.logger.error(
          `Archivo local no existe para subir a Storage: ${rutaArchivoLocal}`,
        );
        return null;
      }

      const buffer = await fs.readFile(rutaArchivoLocal);
      const rutaNormalizada = rutaDestinoEnBucket.replace(/^\/+/, '');

      const { data, error } = await this.clienteSupabase.storage
        .from(this.nombreBucket)
        .upload(rutaNormalizada, buffer, {
          contentType,
          upsert: true,
        });

      if (error) {
        this.logger.error(
          `Error al subir ${rutaNormalizada} a Supabase: ${error.message}`,
        );
        return null;
      }

      const { data: publicData } = this.clienteSupabase.storage
        .from(this.nombreBucket)
        .getPublicUrl(data.path);

      return {
        url: publicData.publicUrl,
        path: data.path,
      };
    } catch (err: any) {
      this.logger.error(`Error inesperado al subir a Supabase: ${err.message}`);
      return null;
    }
  }

  public async eliminarArchivos(rutasEnBucket: string[]): Promise<boolean> {
    if (!this.clienteSupabase || rutasEnBucket.length === 0) return false;

    try {
      const { error } = await this.clienteSupabase.storage
        .from(this.nombreBucket)
        .remove(rutasEnBucket);

      if (error) {
        this.logger.error(
          `Error al eliminar archivos de Supabase: ${error.message}`,
        );
        return false;
      }

      return true;
    } catch (err: any) {
      this.logger.error(`Error al eliminar en Supabase: ${err.message}`);
      return false;
    }
  }
}
