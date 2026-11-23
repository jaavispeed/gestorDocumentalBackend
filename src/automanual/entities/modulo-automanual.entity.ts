import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import type { ClienteAutomanual } from './cliente-automanual.entity.js';
import type { PantallaAutomanual } from './pantalla-automanual.entity.js';

@Entity('modulos_automanual')
@Index(['clienteId', 'identificador'], { unique: true })
export class ModuloAutomanual {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cliente_id', type: 'uuid' })
  @Index()
  clienteId: string;

  @ManyToOne('ClienteAutomanual', 'modulos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: ClienteAutomanual;

  @Column({ name: 'identificador', length: 100 })
  identificador: string;

  @Column({ name: 'nombre', length: 255 })
  nombre: string;

  @Column({ name: 'orden', type: 'int', default: 0 })
  orden: number;

  @OneToMany('PantallaAutomanual', 'modulo', { cascade: true })
  pantallas: PantallaAutomanual[];

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp with time zone' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamp with time zone' })
  fechaActualizacion: Date;
}
