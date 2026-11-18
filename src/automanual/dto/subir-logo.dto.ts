import { IsNotEmpty, IsString } from 'class-validator';

export class SubirLogoDto {
  @IsString()
  @IsNotEmpty()
  base64: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}
