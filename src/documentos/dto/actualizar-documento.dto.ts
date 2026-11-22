import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoUsuarioDocumento } from '../entities/documento.entity.js';

export class ActualizarDocumentoDto {
  @IsString()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  contenido?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsEnum(TipoUsuarioDocumento)
  @IsOptional()
  tipoUsuario?: TipoUsuarioDocumento;

  @IsString()
  @IsOptional()
  resumenCambio?: string;

  @IsString()
  @IsOptional()
  modificadoPor?: string;
}
