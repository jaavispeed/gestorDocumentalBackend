import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger('EmbeddingsService');

  constructor(private readonly configService: ConfigService) {}

  async generarEmbedding(
    texto: string,
    claveAlternativa?: string,
    modeloAlternativo?: string,
  ): Promise<number[] | null> {
    if (!texto || !texto.trim()) {
      return null;
    }

    const apiKey =
      claveAlternativa || this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey || apiKey === 'tu_clave_gemini_aqui') {
      const msj = 'No se ha configurado ninguna API Key de Gemini en el sistema ni en localStorage.';
      this.logger.warn(msj);
      throw new Error(msj);
    }

    const modelo =
      modeloAlternativo ||
      this.configService.get<string>('GEMINI_MODELO_EMBEDDING') ||
      'gemini-embedding-2';

    try {
      // Configuramos apiVersion: 'v1beta' para soportar los modelos de embeddings actuales
      const ai = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
      } as any);

      const resultado: any = await ai.models.embedContent({
        model: modelo,
        contents: texto,
        config: {
          outputDimensionality: 768,
        },
      });

      // El SDK @google/genai retorna `embedding.values` en llamadas individuales,
      // o `embeddings[0].values` en batches. Soportamos ambas estructuras.
      if (resultado?.embedding?.values) {
        return resultado.embedding.values;
      }

      if (
        resultado?.embeddings &&
        resultado.embeddings.length > 0 &&
        resultado.embeddings[0]?.values
      ) {
        return resultado.embeddings[0].values;
      }

      return null;
    } catch (error: any) {
      let mensajeLimpio = error?.message || 'Error desconocido al contactar con la API de IA.';
      try {
        if (typeof error?.message === 'string' && error.message.includes('{')) {
          const inicioJson = error.message.indexOf('{');
          const parseado = JSON.parse(error.message.substring(inicioJson));
          if (parseado?.error?.message) {
            mensajeLimpio = parseado.error.message;
          }
        }
      } catch {}

      this.logger.error(`Error al generar embedding con Gemini [modelo: ${modelo}]: ${mensajeLimpio}`);
      throw new Error(`Error en modelo de embeddings (${modelo}): ${mensajeLimpio}`);
    }
  }
}
