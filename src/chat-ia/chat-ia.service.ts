import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaChatDto } from '../common/dto/consulta-chat.dto.js';
import { EstadoServidorDto, RespuestaChatDto } from '../common/dto/chat-respuestas.dto.js';

@Injectable()
export class ChatIaService {
  private readonly logger = new Logger(ChatIaService.name);
  private readonly clienteAiPorDefecto: GoogleGenAI | null = null;
  private readonly clavePorDefecto: string;
  private readonly modeloPorDefecto: string;
  private readonly rutaDocumentacion: string;

  constructor(private readonly configService: ConfigService) {
    this.clavePorDefecto = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.modeloPorDefecto =
      this.configService.get<string>('GEMINI_MODELO') || 'gemini-2.5-flash';

    if (this.clavePorDefecto) {
      this.clienteAiPorDefecto = new GoogleGenAI({
        apiKey: this.clavePorDefecto,
      });
    }

    // Ruta de la carpeta documentacion en la raíz del backend
    this.rutaDocumentacion = path.resolve(process.cwd(), 'documentacion');
  }

  obtenerEstado(): EstadoServidorDto {
    return {
      estado: 'activo',
      modelo: this.modeloPorDefecto,
      tieneClaveConfigurada: Boolean(this.clavePorDefecto),
    };
  }

  async procesarMensaje(consulta: ConsultaChatDto): Promise<RespuestaChatDto> {
    const { mensaje, historial = [], clavePersonalizada, modeloPersonalizado } = consulta;

    if (!mensaje || !mensaje.trim()) {
      throw new BadRequestException('El mensaje es obligatorio');
    }

    const claveFinal = clavePersonalizada || this.clavePorDefecto;
    const modeloFinal = (modeloPersonalizado || this.modeloPorDefecto).replace(/^models\//, '');

    if (!claveFinal) {
      throw new ServiceUnavailableException(
        'No hay ninguna clave API configurada. Configura tu API Key en los ajustes o en el archivo .env del servidor.',
      );
    }

    const clienteFinal = clavePersonalizada
      ? new GoogleGenAI({ apiKey: claveFinal })
      : this.clienteAiPorDefecto ?? new GoogleGenAI({ apiKey: claveFinal });

    try {
      const contextoDoc = this.obtenerContextoBase();

      let contenidoPrompt = '';
      if (contextoDoc) {
        contenidoPrompt += `BASE DE CONOCIMIENTO DISPONIBLE:\n${contextoDoc}\n\n`;
      }

      if (historial && historial.length > 0) {
        const ultimos = historial.slice(-3);
        contenidoPrompt +=
          'HISTORIAL PREVIO:\n' +
          ultimos
            .map((m) => `${m.rol === 'usuario' ? 'Usuario' : 'Asistente'}: ${m.contenido}`)
            .join('\n') +
          '\n\n';
      }

      contenidoPrompt += `Pregunta del usuario: ${mensaje}`;

      this.logger.log(`Procesando chat con modelo: ${modeloFinal}`);

      const promesaConsulta = clienteFinal.models.generateContent({
        model: modeloFinal,
        contents: contenidoPrompt,
        config: {
          maxOutputTokens: 2048,
        },
      });

      const promesaTimeout = new Promise<never>((_, rechazar) =>
        setTimeout(
          () =>
            rechazar(
              new Error(
                'Tiempo de espera agotado (20s). La API de Gemini está experimentando alta demanda.',
              ),
            ),
          20000,
        ),
      );

      const respuestaAi = await Promise.race([promesaConsulta, promesaTimeout]);

      const textoRespuesta =
        respuestaAi.text ||
        respuestaAi.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No se pudo obtener una respuesta del modelo.';

      return {
        respuesta: textoRespuesta,
      };
    } catch (error: any) {
      this.logger.error(`Error en Gemini: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Error al consultar la IA de Gemini: ${error.message}`,
      );
    }
  }

  private obtenerContextoBase(): string {
    if (!fs.existsSync(this.rutaDocumentacion)) {
      return '';
    }

    const archivos = this.leerArchivosMd(this.rutaDocumentacion);
    // Tomar una muestra representativa o consolidado simple
    return archivos
      .slice(0, 10)
      .map((a) => `[Archivo: ${a.ruta}]\n${a.contenido}`)
      .join('\n\n---\n\n');
  }

  private leerArchivosMd(directorio: string): Array<{ ruta: string; contenido: string }> {
    let resultados: Array<{ ruta: string; contenido: string }> = [];
    if (!fs.existsSync(directorio)) return resultados;

    const elementos = fs.readdirSync(directorio, { withFileTypes: true });
    for (const elemento of elementos) {
      const rutaCompleta = path.join(directorio, elemento.name);
      if (elemento.isDirectory()) {
        resultados = resultados.concat(this.leerArchivosMd(rutaCompleta));
      } else if (elemento.isFile() && elemento.name.endsWith('.md')) {
        const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
        const rutaRelativa = path.relative(this.rutaDocumentacion, rutaCompleta);
        resultados.push({ ruta: rutaRelativa, contenido });
      }
    }
    return resultados;
  }
}
