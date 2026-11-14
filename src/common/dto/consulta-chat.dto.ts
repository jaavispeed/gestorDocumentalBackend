import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MensajeHistorialDto {
  @IsString()
  @IsNotEmpty()
  rol: 'usuario' | 'asistente';

  @IsString()
  @IsNotEmpty()
  contenido: string;
}

export class ConsultaChatDto {
  @IsString()
  @IsNotEmpty()
  mensaje: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MensajeHistorialDto)
  historial?: MensajeHistorialDto[];

  @IsOptional()
  @IsString()
  clavePersonalizada?: string;

  @IsOptional()
  @IsString()
  modeloPersonalizado?: string;
}
