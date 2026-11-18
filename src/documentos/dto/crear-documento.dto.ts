import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  contenido: string;
}
