export interface EstadoServidorDto {
  estado: string;
  modelo: string;
  tieneClaveConfigurada: boolean;
  mensaje?: string;
}

export interface RespuestaChatDto {
  text: string;
  markdown: string;
  sources: string[];
  model: string;
}
