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

@Entity()
export class DocumentoFragmento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  documentoId: string;

  @ManyToOne('Documento', 'fragmentos', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'documentoId' })
  documento: Documento;

  @Column('int', { default: 0 })
  indice: number;

  @Column('text', { nullable: true })
  seccion?: string;

  @Column('text')
  contenido: string;

  // Vector embedding de 384 dimensiones generado localmente con all-MiniLM-L6-v2
  @Column({ type: 'vector', length: 384, nullable: true })
  @Index({ where: 'embedding IS NOT NULL' })
  embedding?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
