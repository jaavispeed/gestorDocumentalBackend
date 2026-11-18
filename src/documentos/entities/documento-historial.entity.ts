import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { Documento } from './documento.entity.js';

@Entity()
export class DocumentoHistorial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  documentoId: string;

  @ManyToOne('Documento', 'historial', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'documentoId' })
  documento: Documento;

  @Column('int')
  version: number;

  @Column('text')
  tituloAnterior: string;

  @Column('text')
  contenidoAnterior: string;

  @Column('text', { nullable: true })
  resumenCambio?: string;

  @Column('text', { nullable: true })
  modificadoPor?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
