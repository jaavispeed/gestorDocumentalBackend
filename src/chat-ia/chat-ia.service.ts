import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaChatDto } from '../common/dto/consulta-chat.dto.js';
import type { EstadoServidorDto, RespuestaChatDto } from '../common/dto/chat-respuestas.dto.js';
import { GenerarDocGitDiffDto, RespuestaDocGitDiffDto } from '../common/dto/git-diff-doc.dto.js';
import {
  PROMPT_ASISTENTE_DOCUMENTACION,
  PROMPT_GENERADOR_DOC_GIT_DIFF,
  construirPromptConsultaRAG,
  construirPromptUsuarioGitDiff,
} from '../prompts/index.js';

@Injectable()
export class ChatIaService {
  private readonly logger = new Logger(ChatIaService.name);
  private readonly rutaDocumentacion: string;

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
      const contenidoPrompt = construirPromptConsultaRAG(mensaje, contextoDoc, historial);

      this.logger.log(`Procesando chat con modelo: ${modeloFinal}`);

      const promesaConsulta = clienteFinal.models.generateContent({
        model: modeloFinal,
        contents: contenidoPrompt,
        config: {
          systemInstruction: PROMPT_ASISTENTE_DOCUMENTACION,
          temperature: 0.1,
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

      // Sanitización defensiva de posibles residuos LaTeX en la respuesta
      const respuestaLimpia = this.sanitizarTextoRespuesta(textoRespuesta);

      return {
        respuesta: respuestaLimpia,
      };
    } catch (error: any) {
      this.logger.error(`Error en Gemini: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Error al consultar la IA de Gemini: ${error.message}`,
      );
    }
  }

  async generarDocumentacionDesdeDiff(
    dto: GenerarDocGitDiffDto,
  ): Promise<RespuestaDocGitDiffDto> {
    const { diff, contextoAdicional, clavePersonalizada, modeloPersonalizado } = dto;

    if (!diff || !diff.trim()) {
      throw new BadRequestException('El contenido del Git Diff es obligatorio.');
    }

    const claveFinal = clavePersonalizada ? clavePersonalizada.trim() : '';
    const modeloFinal = (modeloPersonalizado && modeloPersonalizado.trim()) || 'gemini-2.5-flash';

    if (!claveFinal) {
      throw new ServiceUnavailableException(
        'No hay ninguna clave API configurada. Configura tu API Key en los Ajustes de la aplicación.',
      );
    }

    const clienteFinal = new GoogleGenAI({ apiKey: claveFinal });
    const contenidoUsuario = construirPromptUsuarioGitDiff(diff, contextoAdicional);

    try {
      this.logger.log(`Generando documentación desde diff con modelo: ${modeloFinal}`);
      const respuestaAi = await clienteFinal.models.generateContent({
        model: modeloFinal,
        contents: contenidoUsuario,
        config: {
          systemInstruction: PROMPT_GENERADOR_DOC_GIT_DIFF,
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      });

      let textoGenerado =
        respuestaAi.text ||
        respuestaAi.candidates?.[0]?.content?.parts?.[0]?.text ||
        '# Documentación\n\nNo se pudo generar la documentación a partir del diff provisto.';

      // Si el modelo envolvió todo en bloque de markdown ```markdown ... ``` lo extraemos limpiamente
      if (textoGenerado.startsWith('```markdown')) {
        textoGenerado = textoGenerado.replace(/^```markdown\s*/i, '').replace(/```\s*$/i, '');
      } else if (textoGenerado.startsWith('```md')) {
        textoGenerado = textoGenerado.replace(/^```md\s*/i, '').replace(/```\s*$/i, '');
      }

      return {
        documentacionMarkdown: this.sanitizarTextoRespuesta(textoGenerado.trim()),
      };
    } catch (error: any) {
      this.logger.error(`Error generando documentación desde diff: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Error al generar la documentación con IA: ${error.message}`,
      );
    }
  }

  /**
   * Sanitiza residuos de notación matemática LaTeX que el modelo pudiera filtrar.
   * Transforma de forma general cualquier comando LaTeX y expresión entre signos $ a texto plano.
   */
  private sanitizarTextoRespuesta(texto: string): string {
    if (!texto) return '';

    return (
      texto
        // Comandos comunes de texto y formato LaTeX: \text{...}, \mathbf{...}, \mathit{...} -> contenido interior
        .replace(/\\[a-zA-Z]+\{([^}]+)\}/g, '$1')
        // Operadores relacionales LaTeX
        .replace(/\\ge\s*/g, '>= ')
        .replace(/\\le\s*/g, '<= ')
        .replace(/\\neq\s*/g, '!= ')
        .replace(/\\times\s*/g, ' * ')
        // Limpiar comandos LaTeX sueltos residuales (ej: \cdot, \approx)
        .replace(/\\[a-zA-Z]+/g, '')
        // Desencapsular cualquier fórmula entre delimitadores de bloque $$...$$
        .replace(/\$\$([^$]+)\$\$/g, '$1')
        // Desencapsular cualquier fórmula o variable entre signos de dólar $...$
        .replace(/\$([^$]+)\$/g, '$1')
        // Normalizar espaciados en sumas y restas de variables (ej: T+1 -> T + 1, T-1 -> T - 1)
        .replace(/([A-Za-z])\+([A-Za-z0-9])/g, '$1 + $2')
        .replace(/([A-Za-z])\-([A-Za-z0-9])/g, '$1 - $2')
    );
  }

  private obtenerContextoBase(): string {
    if (!fs.existsSync(this.rutaDocumentacion)) {
      return '';
    }

    const archivos = this.leerArchivosMd(this.rutaDocumentacion);
    if (!archivos || archivos.length === 0) {
      return '';
    }

    return archivos
      .map((archivo) => {
        return `=== DOCUMENTO: ${archivo.nombre} ===\n${archivo.contenido}\n`;
      })
      .join('\n');
  }

  private leerArchivosMd(
    directorio: string,
  ): Array<{ nombre: string; ruta: string; contenido: string }> {
    let resultados: Array<{ nombre: string; ruta: string; contenido: string }> = [];

    const entradas = fs.readdirSync(directorio, { withFileTypes: true });

    for (const entrada of entradas) {
      const rutaCompleta = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        resultados = resultados.concat(this.leerArchivosMd(rutaCompleta));
      } else if (entrada.isFile() && entrada.name.endsWith('.md')) {
        try {
          const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
          const rutaRelativa = path.relative(this.rutaDocumentacion, rutaCompleta);
          resultados.push({
            nombre: rutaRelativa,
            ruta: rutaCompleta,
            contenido,
          });
        } catch (error: any) {
          this.logger.warn(`No se pudo leer el archivo ${rutaCompleta}: ${error.message}`);
        }
      }
    }

    return resultados;
  }
}
