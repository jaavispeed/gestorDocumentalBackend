import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import type { DocumentoFragmento } from './documento-fragmento.entity.js';
import type { DocumentoHistorial } from './documento-historial.entity.js';

export enum EstadoDocumento {
  ACTIVO = 'ACTIVO',
  ARCHIVADO = 'ARCHIVADO',
  ELIMINADO = 'ELIMINADO',
}

@Entity({ name: 'documentos' })
export class Documento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  titulo: string;

  @Column('text', { name: 'nombre_archivo', nullable: true })
  nombreArchivo?: string;

  @Column('text', { nullable: true })
  categoria?: string;

  @Column('text')
  contenido: string;

  @Column({
    type: 'enum',
    enum: EstadoDocumento,
    default: EstadoDocumento.ACTIVO,
  })
  estado: EstadoDocumento;

  @Column('int', { default: 1 })
  version: number;

  @OneToMany('DocumentoFragmento', 'documento', {
    cascade: true,
  })
  fragmentos: DocumentoFragmento[];

  @OneToMany('DocumentoHistorial', 'documento', {
    cascade: true,
  })
  historial: DocumentoHistorial[];

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamptz' })
  fechaActualizacion: Date;

  @DeleteDateColumn({ name: 'fecha_eliminacion', type: 'timestamptz', nullable: true })
  fechaEliminacion?: Date;
}
