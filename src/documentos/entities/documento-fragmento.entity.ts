import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Documento } from './documento.entity.js';

@Entity({ name: 'documento_fragmentos' })
export class DocumentoFragmento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'documento_id' })
  documentoId: string;

  @ManyToOne('Documento', 'fragmentos', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'documento_id' })
  documento: Documento;

  @Column('int', { default: 0 })
  indice: number;

  @Column('text', { nullable: true })
  seccion?: string;

  @Column('text')
  contenido: string;

  // Vector embedding de 768 dimensiones (Google Gemini)
  // Nota: Los vectores usan índices vectoriales HNSW/IVFFlat creados en BD, no @Index estándar (B-tree)
  @Column({ type: 'vector', length: 768, nullable: true })
  embedding?: string;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;
}
