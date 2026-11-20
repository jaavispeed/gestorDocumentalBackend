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
  ): Promise<number[] | null> {
    if (!texto || !texto.trim()) {
      return null;
    }

    const apiKey =
      claveAlternativa || this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey || apiKey === 'tu_clave_gemini_aqui') {
      this.logger.warn(
        'No hay GEMINI_API_KEY configurada. Se omitirá el embedding vectorial.',
      );
      return null;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const resultado = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: texto,
      });

      if (
        resultado &&
        resultado.embeddings &&
        resultado.embeddings.length > 0
      ) {
        return resultado.embeddings[0].values || null;
      }
      return null;
    } catch (error) {
      this.logger.error('Error al generar embedding con Gemini:', error);
      return null;
    }
  }
}
