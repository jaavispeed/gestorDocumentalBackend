import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { ModuloAutomanual } from './modulo-automanual.entity.js';

@Entity('clientes_automanual')
export class ClienteAutomanual {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'identificador', unique: true, length: 100 })
  identificador: string;

  @Column({ name: 'nombre', length: 255 })
  nombre: string;

  @Column({ name: 'url_app', length: 500 })
  urlApp: string;

  @Column({ name: 'color', length: 30, default: '#0071e3' })
  color: string;

  @Column({ name: 'auth', type: 'jsonb', nullable: true })
  auth?: {
    username?: string;
    password?: string;
    ssoTriggerSelector?: string;
    userSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  };

  @OneToMany('ModuloAutomanual', 'cliente', { cascade: true })
  modulos: ModuloAutomanual[];

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamp with time zone' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion', type: 'timestamp with time zone' })
  fechaActualizacion: Date;
}
