import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { DocumentoFragmento } from './documento-fragmento.entity.js';

@Entity()
export class Documento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  titulo: string;

  @Column('text', { nullable: true })
  nombreArchivo?: string;

  @Column('text', { nullable: true })
  categoria?: string;

  @Column('text')
  contenido: string;

  @OneToMany('DocumentoFragmento', 'documento', {
    cascade: true,
  })
  fragmentos: DocumentoFragmento[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
