import { IsInt, IsOptional, Max, Min, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página mínima permitida es 1' })
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo permitido es 1' })
  @Max(100, { message: 'El límite máximo permitido es 100' })
  limite?: number = 10;

  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser una cadena de texto' })
  busqueda?: string;

  @IsOptional()
  @IsIn(['DEV', 'USUARIO', 'TODOS'], {
    message: 'El tipo de usuario debe ser DEV, USUARIO o TODOS',
  })
  tipoUsuario?: 'DEV' | 'USUARIO' | 'TODOS';

  @IsOptional()
  @IsString({ message: 'La categoría debe ser una cadena de texto' })
  categoria?: string;
}

export interface MetaPaginacion {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
  tienePaginaSiguiente: boolean;
  tienePaginaAnterior: boolean;
}

export interface RespuestaPaginada<T> {
  datos: T[];
  meta: MetaPaginacion;
}
