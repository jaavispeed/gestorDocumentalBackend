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
import type { ModuloAutomanual } from './modulo-automanual.entity.js';
import type { CapturaAutomanual } from './captura-automanual.entity.js';
import type { CasoPruebaAutomanual } from './caso-prueba-automanual.entity.js';

@Entity('pantallas_automanual')
@Index(['moduloId', 'identificador'], { unique: true })
export class PantallaAutomanual {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'modulo_id', type: 'uuid' })
  @Index()
  moduloId: string;

  @ManyToOne('ModuloAutomanual', 'pantallas', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modulo_id' })
  modulo: ModuloAutomanual;

  @Column({ name: 'identificador', length: 100 })
  identificador: string;

  @Column({ name: 'nombre', length: 255 })
  nombre: string;

  @Column({ name: 'ruta', length: 500 })
  ruta: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion?: string;

  @Column({ name: 'selector_espera', length: 255, nullable: true })
  selectorEspera?: string;

  @Column({ name: 'orden', type: 'int', default: 0 })
  orden: number;

  @OneToMany('CapturaAutomanual', 'pantalla', { cascade: true })
  capturas: CapturaAutomanual[];

  @OneToMany('CasoPruebaAutomanual', 'pantalla', { cascade: true })
  casosPrueba: CasoPruebaAutomanual[];

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp with time zone' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamp with time zone' })
  fechaActualizacion: Date;
}
