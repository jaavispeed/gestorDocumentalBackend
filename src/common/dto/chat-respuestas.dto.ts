export interface EstadoServidorDto {
  estado: string;
  modelo: string;
  tieneClaveConfigurada: boolean;
  mensaje?: string;
}

export interface RespuestaChatDto {
  // Nuevo formato detallado
  answer: string;
  foundInManual: boolean;
  citations: string[];
  suggestedFollowUps: string[];
  strategyUsed: string;
  modelUsed: string;
  contextCharsSent: number;
  latencyMs: number;

  // Retrocompatibilidad con clientes anteriores
  respuesta: string;
}
