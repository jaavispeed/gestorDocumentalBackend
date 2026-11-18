import { IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AjustesAiDto {
  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsString()
  @IsOptional()
  visionPrompt?: string;
}

export class GuardarConfigSistemaDto {
  @ValidateNested()
  @Type(() => AjustesAiDto)
  ai: AjustesAiDto;
}
