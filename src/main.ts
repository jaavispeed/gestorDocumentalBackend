import * as path from 'path';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const directorioDocs = path.join(process.cwd(), 'datos', 'automanual', 'docs');
  app.use('/manuals', express.static(directorioDocs));

  const puerto = process.env.PORT ?? 3000;
  await app.listen(puerto);
  console.log(`Backend NestJS activo en http://localhost:${puerto}`);
}
await bootstrap();
