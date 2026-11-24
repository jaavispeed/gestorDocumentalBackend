import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class GuardarPantallaQaDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  identificador?: string;

  @IsString()
  nombre: string;

  @IsString()
  ruta: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  indicacionIa?: string;

  @IsString()
  @IsOptional()
  selectorEspera?: string;

  @IsInt()
  @IsOptional()
  orden?: number;
}

export class EjecutarCasosPantallaDto {
  @IsBoolean()
  @IsOptional()
  visibleBrowser?: boolean;

  @IsString()
  @IsOptional()
  casoId?: string;

  @IsOptional()
  auth?: {
    username?: string;
    password?: string;
    ssoTriggerSelector?: string;
    userSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  };
}
