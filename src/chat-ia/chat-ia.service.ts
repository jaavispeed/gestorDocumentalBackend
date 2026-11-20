import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { ConsultaChatDto } from '../common/dto/consulta-chat.dto.js';
import type {
  EstadoServidorDto,
  RespuestaChatDto,
} from '../common/dto/chat-respuestas.dto.js';
import {
  GenerarDocGitDiffDto,
  RespuestaDocGitDiffDto,
} from '../common/dto/git-diff-doc.dto.js';
import {
  PROMPT_ASISTENTE_DOCUMENTACION,
  PROMPT_GENERADOR_DOC_GIT_DIFF,
  PROMPT_COMPILADOR_MANUAL_UX,
  construirPromptConsultaRAG,
  construirPromptUsuarioGitDiff,
  construirPromptGenerarManual,
} from '../prompts/index.js';
import { CompilarManualIaDto } from '../common/dto/compilar-manual.dto.js';
import { DocumentoFragmento } from '../documentos/entities/documento-fragmento.entity.js';
import { EmbeddingsService } from '../documentos/embeddings.service.js';

@Injectable()
export class ChatIaService {
  private readonly logger = new Logger(ChatIaService.name);
  private readonly rutaDocumentacion: string;

  constructor(
    @InjectRepository(DocumentoFragmento)
    private readonly fragmentoRepository: Repository<DocumentoFragmento>,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    // Ruta de la carpeta documentacion en la raíz del backend (fallback)
    this.rutaDocumentacion = path.resolve(process.cwd(), 'documentacion');
  }

  private extraerMensajeLimpioError(error: any): string {
    let mensaje = error?.message || 'Error desconocido';
    try {
      if (typeof error?.message === 'string' && error.message.includes('{')) {
        const jsonStart = error.message.indexOf('{');
        const parseado = JSON.parse(error.message.substring(jsonStart));
        if (parseado?.error?.message) {
          return parseado.error.message;
        }
      }
    } catch {}
    return mensaje;
  }

  async obtenerEstado(
    clavePersonalizada?: string,
    modeloPersonalizado?: string,
  ): Promise<EstadoServidorDto> {
    const claveFinal = clavePersonalizada ? clavePersonalizada.trim() : '';
    const modeloFinal =
      (modeloPersonalizado && modeloPersonalizado.trim()) ||
      process.env.GEMINI_MODELO ||
      'gemini-3.1-flash-lite';

    if (!claveFinal) {
      return {
        estado: 'desconocido',
        modelo: modeloFinal,
        tieneClaveConfigurada: false,
        mensaje:
          'Debes configurar tu API Key de Gemini en los Ajustes del frontend.',
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
      const mensajeError =
        error?.message || 'Error al conectar con la API de Gemini';
      this.logger.warn(`Fallo en verificación de API Gemini: ${mensajeError}`);

      return {
        estado: 'error',
        modelo: modeloFinal,
        tieneClaveConfigurada: true,
        mensaje: mensajeError,
      };
    }
  }

  async procesarMensaje(
    consulta: ConsultaChatDto,
    apiKeyHeader?: string,
    modeloHeader?: string,
    modeloEmbeddingHeader?: string,
  ): Promise<RespuestaChatDto> {
    const inicioTiempo = Date.now();

    // Normalización de pregunta ("question" o "mensaje")
    const preguntaTexto = (consulta.question || consulta.mensaje || '').trim();

    if (!preguntaTexto) {
      throw new BadRequestException(
        'El campo question (o mensaje) es obligatorio',
      );
    }

    // Normalización de historial (soporta {role, text} o {rol, contenido})
    const listaHistorialCruda = consulta.history || consulta.historial || [];
    const historialNormalizado = listaHistorialCruda.map((item) => {
      const rol = item.role === 'assistant' || item.rol === 'asistente' ? 'asistente' : 'usuario';
      const contenido = (item.text || item.contenido || '').trim();
      return { rol: rol as 'usuario' | 'asistente', contenido };
    });

    const strategyUsed = consulta.mode || 'direct';

    const claveFinal =
      apiKeyHeader ||
      consulta.clavePersonalizada ||
      process.env.GEMINI_API_KEY ||
      '';

    const modeloFinal =
      modeloHeader ||
      consulta.modeloPersonalizado ||
      process.env.GEMINI_MODELO ||
      'gemini-3.1-flash-lite';

    if (!claveFinal || claveFinal === 'tu_clave_gemini_aqui') {
      throw new ServiceUnavailableException(
        'No hay ninguna clave API de Gemini configurada. Configura GEMINI_API_KEY en las variables de entorno o en la cabecera x-gemini-key.',
      );
    }

    const clienteFinal = new GoogleGenAI({ apiKey: claveFinal });

    try {
      // 1. Intentar recuperación semántica RAG mediante vectores (pgvector)
      let { contextoDoc, citasDetectadas } = await this.buscarContextoVectorial(
        preguntaTexto,
        claveFinal,
        modeloEmbeddingHeader,
      );

      let tipoEstrategia = 'rag-vectorial';

      // 2. Fallback a lectura de archivos físicos si no hay fragmentos vectoriales
      if (!contextoDoc) {
        contextoDoc = this.obtenerContextoBase(preguntaTexto);
        tipoEstrategia = 'rag-filesystem';
      }

      const contenidoPrompt = construirPromptConsultaRAG(
        preguntaTexto,
        contextoDoc,
        historialNormalizado,
      );

      const contextCharsSent = contenidoPrompt.length;

      this.logger.log(
        `Procesando chat [modo: ${strategyUsed} / ${tipoEstrategia}] con modelo: ${modeloFinal} (${contextCharsSent} caracteres)`,
      );

      const promesaConsulta = clienteFinal.models.generateContent({
        model: modeloFinal,
        contents: contenidoPrompt,
        config: {
          systemInstruction: PROMPT_ASISTENTE_DOCUMENTACION,
          temperature: 0.1,
          maxOutputTokens: 1536,
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

      // 1. "respuesta": Texto original enriquecido con Markdown (###, negritas, viñetas) para renderizar en el front con marked
      const respuestaMarkdown = this.sanitizarTextoRespuesta(textoRespuesta);

      // 2. "answer": Versión simplificada en texto plano legible para clientes externos que no usan visor Markdown
      const answerPlano = this.convertirATextoPlanoLegible(respuestaMarkdown);

      const latenciaMs = Date.now() - inicioTiempo;

      // Detección de si se encontró en el manual
      const noEncontrado = respuestaMarkdown.includes(
        'La información solicitada no se encuentra disponible',
      );
      const foundInManual = !noEncontrado && !!contextoDoc;

      // Extracción de citas del texto si existen referencias a archivos .md o documentos
      const matchesCitas = respuestaMarkdown.match(/`([a-zA-Z0-9_\-./\\]+\.md)`/g) || [];
      const citationsText = matchesCitas.map((m) => m.replace(/`/g, ''));
      const citations = Array.from(
        new Set([...citasDetectadas, ...citationsText]),
      );

      return {
        text: answerPlano,
        markdown: respuestaMarkdown,
        sources: citations,
        model: modeloFinal,
      };
    } catch (error: any) {
      const msjLimpio = this.extraerMensajeLimpioError(error);
      this.logger.error(`Error en Gemini: ${msjLimpio}`, error.stack);
      throw new BadRequestException(
        `Error al consultar la IA de Gemini: ${msjLimpio}`,
      );
    }
  }

  /**
   * Realiza búsqueda semántica vectorial en PostgreSQL utilizando pgvector y similitud coseno.
   */
  private async buscarContextoVectorial(
    pregunta: string,
    claveGemini?: string,
    modeloEmbedding?: string,
    limite: number = 5,
  ): Promise<{ contextoDoc: string; citasDetectadas: string[] }> {
    try {
      const vector = await this.embeddingsService.generarEmbedding(
        pregunta,
        claveGemini,
        modeloEmbedding,
      );

      if (!vector || !vector.length) {
        return { contextoDoc: '', citasDetectadas: [] };
      }

      const vectorStr = `[${vector.join(',')}]`;

      // Consultar los fragmentos más cercanos usando distancia coseno (<=>)
      const resultados: Array<{
        id: string;
        seccion: string;
        contenido: string;
        titulo: string;
        nombre_archivo: string;
        distancia: number;
        similitud: number;
      }> = await this.fragmentoRepository.query(
        `
        SELECT 
          df.id,
          df.seccion,
          df.contenido,
          d.titulo,
          d.nombre_archivo,
          (df.embedding <=> $1::vector) AS distancia,
          1 - (df.embedding <=> $1::vector) AS similitud
        FROM documento_fragmentos df
        INNER JOIN documentos d ON d.id = df.documento_id
        WHERE df.embedding IS NOT NULL
          AND d.estado = 'ACTIVO'
          AND d.fecha_eliminacion IS NULL
        ORDER BY df.embedding <=> $1::vector ASC
        LIMIT $2
        `,
        [vectorStr, limite],
      );

      if (!resultados || resultados.length === 0) {
        return { contextoDoc: '', citasDetectadas: [] };
      }

      this.logger.log(
        `Búsqueda vectorial encontró ${resultados.length} fragmentos relevantes. Top similitud: ${(resultados[0].similitud * 100).toFixed(1)}%`,
      );

      const citasSet = new Set<string>();
      const fragmentosTexto = resultados.map((r) => {
        const docRef = r.nombre_archivo || r.titulo || 'Documento';
        citasSet.add(docRef);
        const secRef = r.seccion ? ` (${r.seccion})` : '';
        const contenidoPodado = r.contenido
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return `[DOC: ${docRef}${secRef}]\n${contenidoPodado}`;
      });

      return {
        contextoDoc: fragmentosTexto.join('\n\n---\n\n'),
        citasDetectadas: Array.from(citasSet),
      };
    } catch (error: any) {
      this.logger.warn(
        `No se pudo completar la búsqueda vectorial: ${error?.message || error}. Se utilizará búsqueda de respaldo.`,
      );
      return { contextoDoc: '', citasDetectadas: [] };
    }
  }

  private generarSugerenciasSeguimiento(
    pregunta: string,
    contexto?: string,
  ): string[] {
    const pLower = pregunta.toLowerCase();

    if (pLower.includes('orden') || pLower.includes('servicio')) {
      return [
        '¿Cuáles son los estados permitidos para una orden de servicio?',
        '¿Cómo se asigna un responsable a una orden?',
        '¿Cómo exportar el reporte de órdenes a PDF?',
      ];
    }

    if (pLower.includes('offline') || pLower.includes('sincroniz')) {
      return [
        '¿Cómo funciona el modo offline y la sincronización?',
        '¿Qué sucede si se interrumpe la conexión a internet?',
        '¿Dónde se almacenan los datos de forma local?',
      ];
    }

    if (pLower.includes('instal') || pLower.includes('pwa') || pLower.includes('app')) {
      return [
        '¿Cómo instalo la aplicación en Android o iOS?',
        '¿Cuáles son los requisitos de navegador recomendados?',
        '¿Cómo actualizar a la última versión disponible?',
      ];
    }

    return [
      '¿Cuáles son las reglas de negocio clave del sistema?',
      '¿Cómo exportar la documentación técnica completa?',
      '¿Cómo consultar los manuales operativos paso a paso?',
    ];
  }

  async generarDocumentacionDesdeDiff(
    dto: GenerarDocGitDiffDto,
  ): Promise<RespuestaDocGitDiffDto> {
    const { diff, contextoAdicional, clavePersonalizada, modeloPersonalizado } =
      dto;

    if (!diff || !diff.trim()) {
      throw new BadRequestException(
        'El contenido del Git Diff es obligatorio.',
      );
    }

    const claveFinal = clavePersonalizada ? clavePersonalizada.trim() : '';
    const modeloFinal =
      (modeloPersonalizado && modeloPersonalizado.trim()) ||
      process.env.GEMINI_MODELO ||
      'gemini-3.1-flash-lite';

    if (!claveFinal) {
      throw new ServiceUnavailableException(
        'No hay ninguna clave API configurada. Configura tu API Key en los Ajustes de la aplicación.',
      );
    }

    const clienteFinal = new GoogleGenAI({ apiKey: claveFinal });
    const contenidoUsuario = construirPromptUsuarioGitDiff(
      diff,
      contextoAdicional,
    );

    try {
      this.logger.log(
        `Generando documentación desde diff con modelo: ${modeloFinal}`,
      );
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
        textoGenerado = textoGenerado
          .replace(/^```markdown\s*/i, '')
          .replace(/```\s*$/i, '');
      } else if (textoGenerado.startsWith('```md')) {
        textoGenerado = textoGenerado
          .replace(/^```md\s*/i, '')
          .replace(/```\s*$/i, '');
      }

      return {
        documentacionMarkdown: this.sanitizarTextoRespuesta(
          textoGenerado.trim(),
        ),
      };
    } catch (error: any) {
      const msjLimpio = this.extraerMensajeLimpioError(error);
      this.logger.error(
        `Error generando documentación desde diff: ${msjLimpio}`,
        error.stack,
      );
      throw new BadRequestException(
        `Error al generar la documentación con IA: ${msjLimpio}`,
      );
    }
  }

  /**
   * Convierte una respuesta con Markdown a texto plano limpio y fácil de leer
   * para clientes externos que no disponen de renderizador Markdown.
   */
  private convertirATextoPlanoLegible(texto: string): string {
    if (!texto) return '';

    return (
      texto
        // Quitar encabezados (#, ##, ###, etc.) y dejar solo el texto
        .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
        // Quitar negritas y cursivas con asteriscos (***texto***, **texto**, *texto*) sin tocar guiones bajos de variables
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        // Quitar solo los delimitadores backtick (ej: `HORA_BOLSA_RV` -> HORA_BOLSA_RV)
        .replace(/`([^`]+)`/g, '$1')
        // Normalizar viñetas markdown a puntos legibles
        .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')
        // Limpiar líneas horizontales divisoras (--- o ***)
        .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '')
        // Colapsar saltos de línea repetidos
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
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

  /**
   * Obtiene la base de conocimiento optimizada en tokens.
   * Si la consulta es específica, prioriza y filtra los documentos relevantes,
   * compactando saltos de línea superfluos para no saturar el prompt.
   */
  private obtenerContextoBase(pregunta?: string): string {
    if (!fs.existsSync(this.rutaDocumentacion)) {
      return '';
    }

    const archivos = this.leerArchivosMd(this.rutaDocumentacion);
    if (!archivos || archivos.length === 0) {
      return '';
    }

    let archivosSeleccionados = archivos;

    if (pregunta && pregunta.trim()) {
      const terminos = pregunta
        .toLowerCase()
        .replace(/[^\w\s]/gi, '')
        .split(/\s+/)
        .filter((t) => t.length > 2);

      // Si hay términos identificables, priorizamos los documentos coincidentes
      if (terminos.length > 0) {
        const coincidentes = archivos.filter((archivo) => {
          const nombreNormalizado = archivo.nombre.toLowerCase();
          const contenidoNormalizado = archivo.contenido.toLowerCase();
          return terminos.some(
            (t) =>
              nombreNormalizado.includes(t) || contenidoNormalizado.includes(t),
          );
        });

        if (coincidentes.length > 0) {
          archivosSeleccionados = coincidentes;
        }
      }
    }

    return archivosSeleccionados
      .map((archivo) => {
        // Poda de tokens: colapsar múltiples saltos de línea y espacios en blanco redundantes
        const contenidoPodado = archivo.contenido
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return `[DOC: ${archivo.nombre}]\n${contenidoPodado}`;
      })
      .join('\n\n');
  }

  async compilarManualConIa(
    dto: CompilarManualIaDto,
    clavePropia?: string,
    modeloPropio?: string,
  ): Promise<{ titulo: string; manualMarkdown: string }> {
    const claveFinal =
      (clavePropia && clavePropia.trim()) || process.env.GEMINI_API_KEY || '';
    const modeloFinal =
      (modeloPropio && modeloPropio.trim()) ||
      process.env.GEMINI_MODELO ||
      'gemini-3.1-flash-lite';

    if (!claveFinal || claveFinal === 'tu_clave_gemini_aqui') {
      throw new ServiceUnavailableException(
        'Se requiere una API Key de Gemini para compilar el manual con IA.',
      );
    }

    try {
      const cliente = new GoogleGenAI({ apiKey: claveFinal });
      const promptUsuario = construirPromptGenerarManual({
        tituloManual: dto.tituloManual,
        publicoObjetivo: dto.publicoObjetivo,
        documentos: dto.documentos,
      });

      const respuesta = await cliente.models.generateContent({
        model: modeloFinal,
        contents: promptUsuario,
        config: {
          systemInstruction: PROMPT_COMPILADOR_MANUAL_UX,
          temperature: 0.2,
        },
      });

      return {
        titulo: dto.tituloManual,
        manualMarkdown: respuesta.text?.trim() || '',
      };
    } catch (error: any) {
      const msjLimpio = this.extraerMensajeLimpioError(error);
      this.logger.error('Error al compilar manual con IA:', msjLimpio);
      throw new BadRequestException(
        'Error al procesar la documentación con IA: ' + msjLimpio,
      );
    }
  }

  private leerArchivosMd(
    directorio: string,
  ): Array<{ nombre: string; ruta: string; contenido: string }> {
    let resultados: Array<{ nombre: string; ruta: string; contenido: string }> =
      [];

    const entradas = fs.readdirSync(directorio, { withFileTypes: true });

    for (const entrada of entradas) {
      const rutaCompleta = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        resultados = resultados.concat(this.leerArchivosMd(rutaCompleta));
      } else if (entrada.isFile() && entrada.name.endsWith('.md')) {
        try {
          const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
          const rutaRelativa = path.relative(
            this.rutaDocumentacion,
            rutaCompleta,
          );
          resultados.push({
            nombre: rutaRelativa,
            ruta: rutaCompleta,
            contenido,
          });
        } catch (error: any) {
          this.logger.warn(
            `No se pudo leer el archivo ${rutaCompleta}: ${error.message}`,
          );
        }
      }
    }

    return resultados;
  }
}
