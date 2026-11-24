import { Module } from '@nestjs/common';
import { FloorsController } from './floors.controller.js';

@Module({
  controllers: [FloorsController],
})
export class FloorsModule {}
