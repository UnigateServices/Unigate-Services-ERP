import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import {
  ListPurchaseQueryDto,
  PurchasePaymentDto,
  SavePurchaseInvoiceDto,
  SupplierDto,
  VoidPurchaseInvoiceDto,
} from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

const readers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE, Role.MONITOR];
const writers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE];
const managers = [Role.GENERAL_MANAGER, Role.SUPERVISOR];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('suppliers')
  @Roles(...readers)
  listSuppliers(@CurrentUser() user: AuthUser) {
    return this.purchases.listSuppliers(user);
  }

  @Post('suppliers')
  @Roles(...managers)
  createSupplier(@Body() body: SupplierDto) {
    return this.purchases.createSupplier(body);
  }

  @Patch('suppliers/:id')
  @Roles(...managers)
  updateSupplier(@Param('id') id: string, @Body() body: SupplierDto) {
    return this.purchases.updateSupplier(id, body);
  }

  @Delete('suppliers/:id')
  @Roles(...managers)
  removeSupplier(@Param('id') id: string) {
    return this.purchases.removeSupplier(id);
  }

  @Get('purchase-invoices')
  @Roles(...readers)
  list(@CurrentUser() user: AuthUser, @Query() query: ListPurchaseQueryDto) {
    return this.purchases.list(user, query);
  }

  @Get('purchase-invoices/:id')
  @Roles(...readers)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchases.get(user, id);
  }

  @Post('purchase-invoices')
  @Roles(...writers)
  create(@CurrentUser() user: AuthUser, @Body() body: SavePurchaseInvoiceDto) {
    return this.purchases.create(user, body);
  }

  @Patch('purchase-invoices/:id')
  @Roles(...writers)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SavePurchaseInvoiceDto) {
    return this.purchases.update(user, id, body);
  }

  @Delete('purchase-invoices/:id')
  @Roles(...writers)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchases.remove(user, id);
  }

  @Post('purchase-invoices/:id/post')
  @Roles(...writers)
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchases.post(user, id);
  }

  @Post('purchase-invoices/:id/void')
  @Roles(...managers)
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: VoidPurchaseInvoiceDto) {
    return this.purchases.voidInvoice(user, id, body.reason);
  }

  @Post('purchase-invoices/:id/payments')
  @Roles(...writers)
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PurchasePaymentDto) {
    return this.purchases.pay(user, id, body);
  }

  @Post('purchase-invoices/:id/payments/:paymentId/reverse')
  @Roles(...managers)
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: VoidPurchaseInvoiceDto,
  ) {
    return this.purchases.reversePayment(user, id, paymentId, body.reason);
  }
}
