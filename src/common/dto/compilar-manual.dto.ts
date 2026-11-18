import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ItemDocumentoCompilarDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsNotEmpty()
  contenido: string;
}

export class CompilarManualIaDto {
  @IsString()
  @IsNotEmpty()
  tituloManual: string;

  @IsString()
  @IsOptional()
  publicoObjetivo?: 'tecnico' | 'usuario_final' | 'ejecutivo';

  @IsArray()
  documentos: ItemDocumentoCompilarDto[];
}
