import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AutomanualService } from './automanual.service.js';
import { GuardarClienteDto } from './dto/cliente-automanual.dto.js';
import { OpcionesGeneracionDto } from './dto/ejecutar-generacion.dto.js';
import {
  GuardarPantallaQaDto,
  EjecutarCasosPantallaDto,
} from './dto/pantalla-qa.dto.js';
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

  @Post('clientes/:slug/modulos')
  @HttpCode(HttpStatus.OK)
  async guardarModulo(
    @Param('slug') slug: string,
    @Body() datos: { id?: string; identificador: string; nombre: string; orden?: number },
  ) {
    return this.automanualService.guardarModulo(slug, datos);
  }

  @Delete('clientes/:slug/modulos/:moduloId')
  async eliminarModulo(
    @Param('slug') slug: string,
    @Param('moduloId') moduloId: string,
  ) {
    return this.automanualService.eliminarModuloPorId(slug, moduloId);
  }

  @Post('clientes/:slug/modulos/:moduloId/pantallas')
  @HttpCode(HttpStatus.OK)
  async guardarPantalla(
    @Param('slug') slug: string,
    @Param('moduloId') moduloId: string,
    @Body()
    datos: {
      identificador: string;
      nombre: string;
      ruta: string;
      descripcion?: string;
      selectorEspera?: string;
      orden?: number;
    },
  ) {
    return this.automanualService.guardarPantalla(slug, moduloId, datos);
  }

  @Delete('clientes/:slug/modulos/:moduloId/pantallas/:pantallaId')
  async eliminarPantalla(
    @Param('slug') slug: string,
    @Param('moduloId') moduloId: string,
    @Param('pantallaId') pantallaId: string,
  ) {
    return this.automanualService.eliminarPantallaPorId(slug, moduloId, pantallaId);
  }

  @Get('clientes/:id/logo')
  async obtenerLogo(@Param('id') id: string, @Res() res: Response) {
    const { stream, contentType } =
      await this.automanualService.obtenerFlujoLogo(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=60');
    stream.pipe(res);
  }

  @Get('clientes/:slug/capturas')
  async obtenerCapturas(
    @Param('slug') slug: string,
    @Query('moduloId') moduloId?: string,
    @Query('seccionId') seccionId?: string,
  ) {
    return this.automanualService.obtenerCapturas(slug, moduloId, seccionId);
  }

  @Delete('capturas/:id')
  async eliminarCaptura(@Param('id') id: string) {
    return this.automanualService.eliminarCaptura(id);
  }

  @Get('clientes/:slug/casos-prueba')
  async obtenerCasosPrueba(
    @Param('slug') slug: string,
    @Query('moduloId') moduloId?: string,
    @Query('seccionId') seccionId?: string,
  ) {
    return this.automanualService.obtenerCasosPrueba(slug, moduloId, seccionId);
  }

  @Get('casos-prueba/:id')
  async obtenerCasoPruebaPorId(@Param('id') id: string) {
    return this.automanualService.obtenerCasoPruebaPorId(id);
  }

  @Post('casos-prueba')
  @HttpCode(HttpStatus.OK)
  async guardarCasoPrueba(@Body() datos: any) {
    return this.automanualService.guardarCasoPrueba(datos);
  }

  @Delete('casos-prueba/:id')
  async eliminarCasoPrueba(@Param('id') id: string) {
    return this.automanualService.eliminarCasoPrueba(id);
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

  @Post('confirmar-revision')
  @HttpCode(HttpStatus.OK)
  async confirmarRevision(
    @Body()
    body: {
      capturasSeleccionadas: string[];
      casosAprobados: any[];
      pantallasDetectadasAprobadas?: Array<{ nombre: string; ruta: string }>;
    },
  ) {
    return this.automanualService.confirmarRevisionPendiente(body);
  }

  @Post('descartar-revision')
  @HttpCode(HttpStatus.OK)
  descartarRevision() {
    return this.automanualService.descartarRevisionPendiente();
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

  // =========================================================================
  // ENDPOINTS QA DIRECTOS POR PANTALLA (CLIENTE -> PANTALLA -> CASOS/EVIDENCIA)
  // =========================================================================

  @Get('clientes/:slug/pantallas')
  async obtenerPantallasCliente(@Param('slug') slug: string) {
    return this.automanualService.obtenerPantallasCliente(slug);
  }

  @Post('clientes/:slug/pantallas')
  @HttpCode(HttpStatus.OK)
  async guardarPantallaDirecta(
    @Param('slug') slug: string,
    @Body() dto: GuardarPantallaQaDto,
  ) {
    return this.automanualService.guardarPantallaDirecta(slug, dto);
  }

  @Delete('pantallas/:pantallaId')
  async eliminarPantallaDirecta(@Param('pantallaId') pantallaId: string) {
    return this.automanualService.eliminarPantallaDirecta(pantallaId);
  }

  @Get('pantallas/:pantallaId/capturas')
  async obtenerCapturasPorPantalla(@Param('pantallaId') pantallaId: string) {
    return this.automanualService.obtenerCapturasPorPantalla(pantallaId);
  }

  @Get('pantallas/:pantallaId/casos-prueba')
  async obtenerCasosPorPantalla(@Param('pantallaId') pantallaId: string) {
    return this.automanualService.obtenerCasosPorPantalla(pantallaId);
  }

  @Post('pantallas/:pantallaId/generar')
  @HttpCode(HttpStatus.OK)
  async iniciarGeneracionPantalla(
    @Param('pantallaId') pantallaId: string,
    @Body() body: { visibleBrowser?: boolean; auth?: any; indicacionIa?: string },
    @Headers('x-gemini-key') geminiApiKey?: string,
    @Headers('x-gemini-model') geminiModel?: string,
  ) {
    return this.automanualService.iniciarGeneracionPantalla(pantallaId, {
      ...body,
      geminiApiKey,
      geminiModel,
    });
  }

  @Post('pantallas/:pantallaId/generar-faltantes')
  @HttpCode(HttpStatus.OK)
  async generarCasosFaltantesPantalla(
    @Param('pantallaId') pantallaId: string,
    @Body() body: { indicacionIa: string; visibleBrowser?: boolean; auth?: any },
    @Headers('x-gemini-key') geminiApiKey?: string,
    @Headers('x-gemini-model') geminiModel?: string,
  ) {
    return this.automanualService.generarCasosFaltantesPantalla(pantallaId, {
      ...body,
      geminiApiKey,
      geminiModel,
    });
  }

  @Post('pantallas/:pantallaId/ejecutar-casos')
  @HttpCode(HttpStatus.OK)
  async ejecutarCasosDePantalla(
    @Param('pantallaId') pantallaId: string,
    @Body() dto: EjecutarCasosPantallaDto,
    @Headers('x-gemini-key') geminiApiKey?: string,
    @Headers('x-gemini-model') geminiModel?: string,
  ) {
    return this.automanualService.ejecutarCasosDePantalla(pantallaId, {
      ...dto,
      geminiApiKey,
      geminiModel,
    });
  }

  @Post('clientes/:slug/ejecutar-regresion')
  @HttpCode(HttpStatus.OK)
  async ejecutarRegresionCliente(
    @Param('slug') slug: string,
    @Body() dto: EjecutarCasosPantallaDto,
    @Headers('x-gemini-key') geminiApiKey?: string,
    @Headers('x-gemini-model') geminiModel?: string,
  ) {
    return this.automanualService.ejecutarRegresionCliente(slug, {
      ...dto,
      geminiApiKey,
      geminiModel,
    });
  }
}
