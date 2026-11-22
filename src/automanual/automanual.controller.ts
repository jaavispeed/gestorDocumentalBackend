import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AutomanualService } from './automanual.service.js';
import { GuardarClienteDto } from './dto/cliente-automanual.dto.js';
import { OpcionesGeneracionDto } from './dto/ejecutar-generacion.dto.js';
import { SubirLogoDto } from './dto/subir-logo.dto.js';
import { GuardarConfigSistemaDto } from './dto/config-sistema.dto.js';
import { ProbarIaDto } from './dto/probar-ia.dto.js';
import { PaginacionDto } from '../common/dto/paginacion.dto.js';

@Controller('api/automanual')
export class AutomanualController {
  constructor(private readonly automanualService: AutomanualService) {}

  @Get('clientes')
  async obtenerClientes(@Query() paginacionDto: PaginacionDto) {
    return this.automanualService.obtenerClientes(paginacionDto);
  }

  @Get('clientes/:id')
  async obtenerCliente(@Param('id') id: string) {
    return this.automanualService.obtenerCliente(id);
  }

  @Post('clientes')
  @HttpCode(HttpStatus.OK)
  async guardarCliente(@Body() config: GuardarClienteDto) {
    return this.automanualService.guardarCliente(config);
  }

  @Delete('clientes/:id')
  async eliminarCliente(@Param('id') id: string) {
    return this.automanualService.eliminarCliente(id);
  }

  @Get('clientes/:id/logo')
  async obtenerLogo(@Param('id') id: string, @Res() res: Response) {
    const { stream, contentType } =
      await this.automanualService.obtenerFlujoLogo(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=60');
    stream.pipe(res);
  }

  @Post('clientes/:id/logo')
  @HttpCode(HttpStatus.OK)
  async guardarLogo(@Param('id') id: string, @Body() dto: SubirLogoDto) {
    return this.automanualService.guardarLogo(id, dto.base64, dto.fileName);
  }

  @Post('login/:id')
  @HttpCode(HttpStatus.OK)
  async iniciarLogin(@Param('id') id: string) {
    return this.automanualService.iniciarLogin(id);
  }

  @Post('descubrir/:id')
  @HttpCode(HttpStatus.OK)
  async descubrirRutas(@Param('id') id: string) {
    return this.automanualService.descubrirRutas(id);
  }

  @Post('generar/:id')
  @HttpCode(HttpStatus.OK)
  async iniciarGeneracion(
    @Param('id') id: string,
    @Body() opciones: OpcionesGeneracionDto,
  ) {
    return this.automanualService.iniciarGeneracion(id, opciones);
  }

  @Get('estado-generacion')
  obtenerEstadoGeneracion() {
    return this.automanualService.obtenerEstadoGeneracion();
  }

  @Get('sistema/config')
  async obtenerConfiguracionSistema() {
    return this.automanualService.obtenerConfiguracionSistema();
  }

  @Post('sistema/config')
  @HttpCode(HttpStatus.OK)
  async guardarConfiguracionSistema(@Body() dto: GuardarConfigSistemaDto) {
    return this.automanualService.guardarConfiguracionSistema(dto);
  }

  @Get('sistema/modelos')
  async obtenerModelos(@Query('apiKey') apiKey?: string) {
    return this.automanualService.obtenerModelos(apiKey);
  }

  @Post('sistema/probar-ia')
  @HttpCode(HttpStatus.OK)
  async probarConexionIa(@Body() dto: ProbarIaDto) {
    return this.automanualService.probarConexionIa(dto);
  }
}
