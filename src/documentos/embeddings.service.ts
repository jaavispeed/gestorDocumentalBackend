import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger('EmbeddingsService');
  private modelo: any = null;

  async onModuleInit() {
    try {
      this.logger.log('Inicializando modelo local de embeddings (FastEmbed - BGE Small EN)...');
      this.modelo = await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
      });
      this.logger.log('Modelo local de embeddings listo (384 dimensiones).');
    } catch (error) {
      this.logger.error('Error al precargar el modelo local:', error);
    }
  }

  async generarEmbedding(texto: string): Promise<number[] | null> {
    if (!texto || !texto.trim()) {
      return null;
    }

    try {
      if (!this.modelo) {
        this.modelo = await FlagEmbedding.init({
          model: EmbeddingModel.BGESmallENV15,
        });
      }

      // Genera el vector de 384 dimensiones directamente en la CPU
      const vector = await this.modelo.queryEmbed(texto);
      return Array.from(vector);
    } catch (error) {
      this.logger.error('Error al generar embedding local:', error);
      return null;
    }
  }
}
