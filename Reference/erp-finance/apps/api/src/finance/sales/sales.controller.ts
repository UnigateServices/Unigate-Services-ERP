import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import {
  CustomerDto,
  ListSalesQueryDto,
  SalesPaymentDto,
  SaveSalesInvoiceDto,
  VoidSalesInvoiceDto,
} from './dto/sales.dto';
import { SalesService } from './sales.service';

const readers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE, Role.MONITOR];
const writers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE];
const managers = [Role.GENERAL_MANAGER, Role.SUPERVISOR];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('customers')
  @Roles(...readers)
  listCustomers(@CurrentUser() user: AuthUser) {
    return this.sales.listCustomers(user);
  }

  @Post('customers')
  @Roles(...managers)
  createCustomer(@Body() body: CustomerDto) {
    return this.sales.createCustomer(body);
  }

  @Patch('customers/:id')
  @Roles(...managers)
  updateCustomer(@Param('id') id: string, @Body() body: CustomerDto) {
    return this.sales.updateCustomer(id, body);
  }

  @Delete('customers/:id')
  @Roles(...managers)
  removeCustomer(@Param('id') id: string) {
    return this.sales.removeCustomer(id);
  }

  @Get('sales-invoices')
  @Roles(...readers)
  list(@CurrentUser() user: AuthUser, @Query() query: ListSalesQueryDto) {
    return this.sales.list(user, query);
  }

  @Get('sales-invoices/:id')
  @Roles(...readers)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.get(user, id);
  }

  @Post('sales-invoices')
  @Roles(...writers)
  create(@CurrentUser() user: AuthUser, @Body() body: SaveSalesInvoiceDto) {
    return this.sales.create(user, body);
  }

  @Patch('sales-invoices/:id')
  @Roles(...writers)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SaveSalesInvoiceDto) {
    return this.sales.update(user, id, body);
  }

  @Delete('sales-invoices/:id')
  @Roles(...writers)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.remove(user, id);
  }

  @Post('sales-invoices/:id/post')
  @Roles(...writers)
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.post(user, id);
  }

  @Post('sales-invoices/:id/void')
  @Roles(...managers)
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: VoidSalesInvoiceDto) {
    return this.sales.voidInvoice(user, id, body.reason);
  }

  @Post('sales-invoices/:id/payments')
  @Roles(...writers)
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SalesPaymentDto) {
    return this.sales.pay(user, id, body);
  }

  @Post('sales-invoices/:id/payments/:paymentId/reverse')
  @Roles(...managers)
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: VoidSalesInvoiceDto,
  ) {
    return this.sales.reversePayment(user, id, paymentId, body.reason);
  }
}
