import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MensajeHistorialDto {
  @IsOptional()
  @IsString()
  rol?: 'usuario' | 'asistente' | string;

  @IsOptional()
  @IsString()
  role?: 'user' | 'assistant' | string;

  @IsOptional()
  @IsString()
  contenido?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

export class ConsultaChatDto {
  // Soporta "question" (nuevo formato) o "mensaje" (formato previo)
  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  mensaje?: string;

  // Soporta "mode" (ej. "direct")
  @IsOptional()
  @IsString()
  mode?: string;

  // Soporta "history" (nuevo formato) o "historial" (formato previo)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MensajeHistorialDto)
  history?: MensajeHistorialDto[];

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
