import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TemaClienteDto {
  @IsString()
  @IsNotEmpty()
  primaryColor: string;

  @IsString()
  @IsNotEmpty()
  secondaryColor: string;

  @IsString()
  @IsOptional()
  accentColor?: string;

  @IsString()
  @IsNotEmpty()
  fontFamily: string;

  @IsString()
  @IsNotEmpty()
  logoPath: string;
}

export class ConfiguracionAutenticacionDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  ssoTriggerSelector?: string;

  @IsString()
  @IsOptional()
  userSelector?: string;

  @IsString()
  @IsOptional()
  passwordSelector?: string;

  @IsString()
  @IsOptional()
  submitSelector?: string;
}

export class SeccionClienteDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  route: string;

  @IsArray()
  @IsOptional()
  menuPath?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  waitForSelector?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ModuloClienteDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeccionClienteDto)
  sections: SeccionClienteDto[];
}

export class GuardarClienteDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  appUrl: string;

  @IsString()
  @IsOptional()
  startCommand?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfiguracionAutenticacionDto)
  auth?: ConfiguracionAutenticacionDto;

  @ValidateNested()
  @Type(() => TemaClienteDto)
  theme: TemaClienteDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuloClienteDto)
  modules: ModuloClienteDto[];
}
