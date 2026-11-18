import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class OpcionesGeneracionDto {
  @IsBoolean()
  @IsOptional()
  all?: boolean;

  @IsString()
  @IsOptional()
  moduleId?: string;

  @IsString()
  @IsOptional()
  sectionId?: string;

  @IsBoolean()
  @IsOptional()
  visibleBrowser?: boolean;
}
