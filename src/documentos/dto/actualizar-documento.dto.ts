import { IsOptional, IsString } from 'class-validator';

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

  @IsString()
  @IsOptional()
  resumenCambio?: string;

  @IsString()
  @IsOptional()
  modificadoPor?: string;
}
