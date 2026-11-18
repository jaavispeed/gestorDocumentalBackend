import { IsOptional, IsString } from 'class-validator';

export class ProbarIaDto {
  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  model?: string;
}
