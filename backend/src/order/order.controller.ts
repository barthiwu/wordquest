import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { SelectOrderDto } from './dto/select-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * GET  /api/v1/order/catalog       — the four fixed Orders, public info
 * GET  /api/v1/order/me            — the player's current Order + next eligible change date
 * GET  /api/v1/order/me/history    — every Order the player has ever selected
 * POST /api/v1/order/me            — select or change Order (gated: Kingdom stage, 30-day cooldown)
 */
@Controller('order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly order: OrderService) {}

  @Get('catalog')
  getCatalog() {
    return this.order.listCatalog();
  }

  @Get('me')
  getMyOrder(@CurrentUserId() userId: string) {
    return this.order.getMyOrder(userId);
  }

  @Get('me/history')
  getMyOrderHistory(@CurrentUserId() userId: string) {
    return this.order.getMyOrderHistory(userId);
  }

  @Post('me')
  selectOrder(@CurrentUserId() userId: string, @Body() dto: SelectOrderDto) {
    return this.order.selectOrder(userId, dto.order);
  }
}
