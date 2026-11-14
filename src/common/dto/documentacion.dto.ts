export interface DocumentoItemDto {
  id: string;
  titulo: string;
  nombreArchivo: string;
  ruta: string;
  descripcion?: string;
}

export interface CarpetaDocumentacionDto {
  id: string;
  nombre: string;
  documentos: DocumentoItemDto[];
}

export interface DetalleDocumentoDto {
  id: string;
  titulo: string;
  nombreArchivo: string;
  ruta: string;
  contenido: string;
}
