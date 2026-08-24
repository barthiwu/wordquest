import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../auth/guards/email-verification.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

class PurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;
}

@Controller('shop')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('catalog')
  getCatalog(@CurrentUserId() userId: string) {
    return this.shop.getCatalog(userId);
  }

  @Get('purchases')
  getPurchases(@CurrentUserId() userId: string) {
    return this.shop.getPurchaseHistory(userId);
  }

  @Post('purchases')
  purchase(@CurrentUserId() userId: string, @Body() dto: PurchaseItemDto) {
    return this.shop.purchase(userId, dto.itemId);
  }
}
