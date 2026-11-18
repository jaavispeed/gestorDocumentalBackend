import { Module } from '@nestjs/common';
import { AutomanualController } from './automanual.controller.js';
import { AutomanualService } from './automanual.service.js';

@Module({
  controllers: [AutomanualController],
  providers: [AutomanualService],
  exports: [AutomanualService],
})
export class AutomanualModule {}
