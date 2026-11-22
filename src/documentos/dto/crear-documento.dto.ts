import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TipoUsuarioDocumento } from '../entities/documento.entity.js';

export class CrearDocumentoDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  nombreArchivo?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsEnum(TipoUsuarioDocumento)
  @IsOptional()
  tipoUsuario?: TipoUsuarioDocumento;

  @IsString()
  @IsNotEmpty()
  contenido: string;
}
