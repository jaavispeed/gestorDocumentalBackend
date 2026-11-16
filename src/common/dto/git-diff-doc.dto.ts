import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GenerarDocGitDiffDto {
  @IsString()
  @IsNotEmpty()
  diff: string;

  @IsOptional()
  @IsString()
  contextoAdicional?: string;

  @IsOptional()
  @IsString()
  clavePersonalizada?: string;

  @IsOptional()
  @IsString()
  modeloPersonalizado?: string;
}

export interface RespuestaDocGitDiffDto {
  documentacionMarkdown: string;
  resumenCambios?: string;
}
