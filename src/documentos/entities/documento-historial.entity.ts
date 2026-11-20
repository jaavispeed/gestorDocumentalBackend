import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { Documento } from './documento.entity.js';

@Entity({ name: 'documento_historial' })
export class DocumentoHistorial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'documento_id' })
  documentoId: string;

  @ManyToOne('Documento', 'historial', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'documento_id' })
  documento: Documento;

  @Column('int')
  version: number;

  @Column('text', { name: 'titulo_anterior' })
  tituloAnterior: string;

  @Column('text', { name: 'contenido_anterior' })
  contenidoAnterior: string;

  @Column('text', { name: 'resumen_cambio', nullable: true })
  resumenCambio?: string;

  @Column('text', { name: 'modificado_por', nullable: true })
  modificadoPor?: string;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;
}
