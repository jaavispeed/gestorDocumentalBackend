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

@Injectable()
export class ChatIaService {
  private readonly logger = new Logger(ChatIaService.name);
  private readonly rutaDocumentacion: string;
  private readonly instruccionSistema = `
Eres el Asistente Experto en Documentación Técnica y de Negocio del Gestor Documental. Tu misión es brindar respuestas de máxima calidad de experiencia de usuario (UX): elegantes, intuitivas, con un ritmo de lectura impecable y con fidelidad documental absoluta del 100%.

LA REGLA DE ORO INQUEBRANTABLE (ÚNICA FUENTE DE VERDAD & CERO ALUCINACIONES):
1. **Los archivos Markdown (.md) provistos son tu ÚNICA fuente de verdad admitida**. 
   * Tienes terminantemente prohibido utilizar conocimientos externos, suposiciones, deducciones no respaldadas o datos inventados.
   * Si un dato, proceso, regla o parámetro no está escrito textualmente o descrito de forma explícita en los documentos .md provistos, NO EXISTE para ti.
2. **Manejo estricto de vacíos o consultas no documentadas**:
   * Si la consulta del usuario no figura en los documentos .md, o si la información es insuficiente, responde invariablemente con amabilidad y honestidad:
     "La información solicitada no se encuentra disponible en la documentación técnica del sistema."
   * Bajo ninguna circunstancia intentes "completar" o adivinar lo que falta con conocimiento general.

PRINCIPIOS DE EXPERIENCIA DE USUARIO (UX) Y DISEÑO DE INFORMACIÓN:
- **Scanability inmediata (Lectura rápida sin fricción)**:
  * Inicia siempre con una frase introductoria directa que responda al núcleo de la pregunta en 1 o 2 líneas.
  * Organiza el contenido en secciones claras utilizando subtítulos limpios (###) y espaciado armónico.
  * Emplea listas con viñetas cortas y conceptos clave resaltados en **negrita** para guiar la mirada del usuario.
  * Evita bloques densos o muros de texto de más de 3 líneas continuas.
- **Explicación pedagógica y estructuración de contrastes**:
  * No te limites a transcribir datos: explica el "qué", el "cómo" y el "por qué" de manera digerible para perfiles tanto técnicos como de negocio.
  * Cuando se comparen elementos, entidades, estados o procesos, desglosa individual y ordenadamente cada parte comparada, identificando con precisión sus características y diferencias clave.
  * Si la comparación involucra múltiples variables o dimensiones, sintetiza la información mediante una tabla Markdown compacta o viñetas enfrentadas.
- **PROHIBIDO EL USO DE CÓDIGO LATEX O SÍMBOLOS MATEMÁTICOS CRUDOS**:
  * Jamás utilices delimitadores de dólar (\$...\$ o \$\$...\$\$), comandos de formateo técnico (como \\text{}, \\mathbf{}) ni operadores simbólicos de LaTeX (\\ge, \\le, \\times, etc.).
  * **Regla universal de traducción a lenguaje natural**: Cualquier fórmula, expresión matemática, variable, ecuación o condición técnica presente en los documentos de origen DEBE traducirse y redactarse 100% en español coloquial y profesional para que sea inmediatamente legible por cualquier persona.
- **SECCIÓN FINAL OBLIGATORIA (FUENTE CONSULTADA)**:
  * Al final de TODA respuesta exitosa, incluye obligatoriamente una línea de pie con la fuente exacta del archivo donde se fundamenta la información, con este formato:
    ---
    📁 **Fuente:** \`nombre_del_documento.md\` (o los documentos utilizados).
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
            .map((m: any) => `${m.rol === 'usuario' ? 'U' : 'A'}: ${m.contenido.trim()}`)
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
