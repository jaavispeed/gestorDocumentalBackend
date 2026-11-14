export interface EstadoServidorDto {
  estado: string;
  modelo: string;
  tieneClaveConfigurada: boolean;
  mensaje?: string;
}

export interface RespuestaChatDto {
  respuesta: string;
}
