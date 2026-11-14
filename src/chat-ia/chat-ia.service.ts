import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaChatDto } from '../common/dto/consulta-chat.dto.js';
import { EstadoServidorDto, RespuestaChatDto } from '../common/dto/chat-respuestas.dto.js';

@Injectable()
export class ChatIaService {
  private readonly logger = new Logger(ChatIaService.name);
  private readonly rutaDocumentacion: string;
  private readonly instruccionSistema = `
Eres el asistente documental del sistema. Tu rol es responder consultas con máxima fidelidad y claridad.

REGLAS DE OPERACIÓN (CERO ALUCINACIÓN):
1. Fuente única: Basa tus respuestas exclusivamente en la base de conocimiento provista. No agregues datos externos ni supuestos.
2. Si la información solicitada no figura en los documentos, indica con amabilidad:
   "La información solicitada no se encuentra disponible en la documentación técnica del sistema."
3. Cita el documento de origen cuando corresponda.

FORMATO Y ESTILO:
- Respuestas directas, concisas y fáciles de leer para cualquier usuario.
- Usa Markdown limpio: títulos cortos (###), viñetas y conceptos clave en **negrita**.
- Evita párrafos largos y redundancias innecesarias.
`.trim();

  constructor() {
    // Ruta de la carpeta documentacion en la raíz del backend
    this.rutaDocumentacion = path.resolve(process.cwd(), 'documentacion');
  }

  async obtenerEstado(
    clavePersonalizada?: string,
    modeloPersonalizado?: string,
  ): Promise<EstadoServidorDto> {
    const claveFinal = clavePersonalizada ? clavePersonalizada.trim() : '';
    const modeloFinal = (modeloPersonalizado && modeloPersonalizado.trim()) || 'gemini-2.5-flash';

    if (!claveFinal) {
      return {
        estado: 'desconocido',
        modelo: modeloFinal,
        tieneClaveConfigurada: false,
        mensaje: 'Debes configurar tu API Key de Gemini en los Ajustes del frontend.',
      };
    }

    try {
      const cliente = new GoogleGenAI({ apiKey: claveFinal });

      // Verificación real con la API de Gemini
      const nombreModelo = modeloFinal.replace(/^models\//, '');
      await cliente.models.get({
        model: nombreModelo,
      });

      return {
        estado: 'activo',
        modelo: modeloFinal,
        tieneClaveConfigurada: true,
      };
    } catch (error: any) {
      const mensajeError = error?.message || 'Error al conectar con la API de Gemini';
      this.logger.warn(`Fallo en verificación de API Gemini: ${mensajeError}`);

      return {
        estado: 'error',
        modelo: modeloFinal,
        tieneClaveConfigurada: true,
        mensaje: mensajeError,
      };
    }
  }

  async procesarMensaje(consulta: ConsultaChatDto): Promise<RespuestaChatDto> {
    const { mensaje, historial = [], clavePersonalizada, modeloPersonalizado } = consulta;

    if (!mensaje || !mensaje.trim()) {
      throw new BadRequestException('El mensaje es obligatorio');
    }

    const claveFinal = clavePersonalizada ? clavePersonalizada.trim() : '';
    const modeloFinal = (modeloPersonalizado && modeloPersonalizado.trim()) || 'gemini-2.5-flash';

    if (!claveFinal) {
      throw new ServiceUnavailableException(
        'No hay ninguna clave API configurada. Configura tu API Key en los Ajustes de la aplicación.',
      );
    }

    const clienteFinal = new GoogleGenAI({ apiKey: claveFinal });

    try {
      const contextoDoc = this.obtenerContextoBase();

      let contenidoPrompt = '';
      if (contextoDoc) {
        contenidoPrompt += `BASE DE CONOCIMIENTO:\n${contextoDoc}\n\n`;
      }

      if (historial && historial.length > 0) {
        const ultimos = historial.slice(-2);
        contenidoPrompt +=
          'HISTORIAL RECIENTE:\n' +
          ultimos
            .map((m) => `${m.rol === 'usuario' ? 'U' : 'A'}: ${m.contenido.trim()}`)
            .join('\n') +
          '\n\n';
      }

      contenidoPrompt += `Pregunta: ${mensaje.trim()}`;

      this.logger.log(`Procesando chat con modelo: ${modeloFinal}`);

      const promesaConsulta = clienteFinal.models.generateContent({
        model: modeloFinal,
        contents: contenidoPrompt,
        config: {
          systemInstruction: this.instruccionSistema,
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
    return archivos
      .map((a) => `[DOC: ${a.ruta}]\n${a.contenido.trim()}`)
      .join('\n---\n');
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
