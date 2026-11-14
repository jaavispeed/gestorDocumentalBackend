import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CarpetaDocumentacionDto,
  DocumentoItemDto,
  DetalleDocumentoDto,
} from '../common/dto/documentacion.dto.js';

@Injectable()
export class DocumentacionService {
  private readonly rutaBase = path.resolve(process.cwd(), 'documentacion');

  obtenerEstructura(): CarpetaDocumentacionDto[] {
    if (!fs.existsSync(this.rutaBase)) {
      return [];
    }

    const carpetas: CarpetaDocumentacionDto[] = [];
    const entradas = fs.readdirSync(this.rutaBase, { withFileTypes: true });

    for (const entrada of entradas) {
      if (entrada.isDirectory()) {
        const rutaCarpeta = path.join(this.rutaBase, entrada.name);
        const archivos = fs.readdirSync(rutaCarpeta, { withFileTypes: true });

        const documentos: DocumentoItemDto[] = [];
        for (const archivo of archivos) {
          if (archivo.isFile() && archivo.name.endsWith('.md')) {
            const nombreArchivo = archivo.name;
            const rutaRelativa = path.join(entrada.name, nombreArchivo).replace(/\\/g, '/');
            const id = nombreArchivo.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const titulo = this.formatearTitulo(nombreArchivo);

            documentos.push({
              id,
              titulo,
              nombreArchivo,
              ruta: rutaRelativa,
            });
          }
        }

        if (documentos.length > 0) {
          const idCarpeta = entrada.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          carpetas.push({
            id: idCarpeta,
            nombre: entrada.name.replace(/_/g, ' '),
            documentos,
          });
        }
      }
    }

    return carpetas;
  }

  obtenerDocumentoPorRuta(rutaRelativa: string): DetalleDocumentoDto {
    const rutaNormalizada = path.normalize(rutaRelativa).replace(/^(\.\.(\/|\\|$))+/, '');
    const rutaCompleta = path.join(this.rutaBase, rutaNormalizada);

    if (!fs.existsSync(rutaCompleta) || !fs.statSync(rutaCompleta).isFile()) {
      throw new NotFoundException(`El documento "${rutaRelativa}" no fue encontrado.`);
    }

    const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
    const nombreArchivo = path.basename(rutaCompleta);
    const id = nombreArchivo.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    return {
      id,
      titulo: this.formatearTitulo(nombreArchivo),
      nombreArchivo,
      ruta: rutaRelativa.replace(/\\/g, '/'),
      contenido,
    };
  }

  private formatearTitulo(nombreArchivo: string): string {
    const sinExtension = nombreArchivo.replace(/\.md$/, '');
    return sinExtension
      .replace(/^Documentacion/, '')
      .replace(/_/g, ' ')
      .trim();
  }
}
