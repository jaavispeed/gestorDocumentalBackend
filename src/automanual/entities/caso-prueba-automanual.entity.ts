import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { ClienteAutomanual } from './cliente-automanual.entity.js';
import type { PantallaAutomanual } from './pantalla-automanual.entity.js';

export type EstadoCasoPrueba = 'ACTIVO' | 'DESHABILITADO';
export type ResultadoEjecucionQa = 'PASS' | 'FAIL' | 'BLOCKED' | 'PENDIENTE';

export type TipoAccionPaso =
  | 'navegar'
  | 'escribir'
  | 'clic'
  | 'seleccionar'
  | 'marcar_checkbox'
  | 'esperar_visible'
  | 'esperar_tiempo'
  | 'assert_texto'
  | 'capturar_pantalla';

export interface PasoCasoPrueba {
  orden: number;
  accion: TipoAccionPaso;
  descripcion: string;
  selector?: string;
  valor?: string;
  timeoutMs?: number;
}

export interface CriterioAsercion {
  tipo: 'selector_visible' | 'texto_presente' | 'url_contiene' | 'sin_errores_consola';
  selector?: string;
  valorEsperado?: string;
}

@Entity('casos_prueba_automanual')
@Index(['clienteId', 'moduloId', 'seccionId'])
export class CasoPruebaAutomanual {
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

  @ManyToOne('PantallaAutomanual', 'casosPrueba', { onDelete: 'SET NULL', nullable: true })
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

  @Column({ name: 'codigo', length: 50, nullable: true })
  codigo?: string;

  @Column({ name: 'titulo', length: 255 })
  titulo: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion?: string;

  @Column({ name: 'precondiciones', type: 'text', array: true, default: () => "'{}'" })
  precondiciones: string[];

  @Column({ name: 'pasos', type: 'jsonb', default: () => "'[]'" })
  pasos: PasoCasoPrueba[];

  @Column({ name: 'resultado_esperado', type: 'jsonb', default: () => "'{}'" })
  resultadoEsperado: CriterioAsercion;

  @Column({
    name: 'estado',
    type: 'varchar',
    length: 20,
    default: 'ACTIVO',
  })
  estado: EstadoCasoPrueba;

  @Column({
    name: 'ultimo_resultado',
    type: 'varchar',
    length: 20,
    default: 'PENDIENTE',
  })
  ultimoResultado: ResultadoEjecucionQa;

  @Column({ name: 'detalle_ultimo_fallo', type: 'text', nullable: true })
  detalleUltimoFallo?: string;

  @Column({ name: 'ultima_ejecucion', type: 'timestamp with time zone', nullable: true })
  ultimaEjecucion?: Date;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp with time zone' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamp with time zone' })
  fechaActualizacion: Date;
}
