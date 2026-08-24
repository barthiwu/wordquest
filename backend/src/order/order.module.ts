import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { AliModule } from '../ali/ali.module';

@Module({
  imports: [AliModule],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
