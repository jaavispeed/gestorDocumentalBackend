import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { ClienteAutomanual } from './cliente-automanual.entity.js';
import type { PantallaAutomanual } from './pantalla-automanual.entity.js';

export type EstadoQaCaptura = 'PASS' | 'WARNING' | 'ERROR';

export type TipoCapturaAutomanual =
  | 'main'
  | 'modal'
  | 'table'
  | 'tab'
  | 'filter'
  | 'action'
  | 'detail'
  | 'error';

export interface MetadataCaptura {
  storagePath?: string;
  viewport?: {
    width: number;
    height: number;
  };
  pesoBytes?: number;
  tiempoCargaMs?: number;
  httpStatus?: number;
  erroresConsola?: string[];
  resumenDom?: {
    campos?: string[];
    botones?: string[];
    tieneTabla?: boolean;
    totalFilasTabla?: number;
  };
  accionDisparadora?: string;
  userAgent?: string;
}

@Entity('capturas_automanual')
@Index(['clienteId', 'moduloId', 'seccionId'])
export class CapturaAutomanual {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cliente_id', type: 'uuid' })
  @Index()
  clienteId: string;

  @ManyToOne('ClienteAutomanual', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: ClienteAutomanual;

  @Column({ name: 'pantalla_id', type: 'uuid', nullable: true })
  @Index()
  pantallaId?: string;

  @ManyToOne('PantallaAutomanual', 'capturas', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'pantalla_id' })
  pantalla?: PantallaAutomanual;

  @Column({ name: 'modulo_id', length: 100 })
  moduloId: string;

  @Column({ name: 'modulo_titulo', length: 255 })
  moduloTitulo: string;

  @Column({ name: 'seccion_id', length: 100 })
  seccionId: string;

  @Column({ name: 'seccion_titulo', length: 255 })
  seccionTitulo: string;

  @Column({ name: 'ruta_app', length: 500, nullable: true })
  rutaApp?: string;

  @Column({ name: 'url', length: 1000 })
  url: string;

  @Column({
    name: 'tipo',
    type: 'varchar',
    length: 50,
    default: 'main',
  })
  tipo: TipoCapturaAutomanual;

  @Column({ name: 'titulo', length: 255 })
  titulo: string;

  @Column({
    name: 'estado_qa',
    type: 'varchar',
    length: 20,
    default: 'PASS',
  })
  estadoQa: EstadoQaCaptura;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'" })
  metadata: MetadataCaptura;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp with time zone' })
  fechaCreacion: Date;
}
