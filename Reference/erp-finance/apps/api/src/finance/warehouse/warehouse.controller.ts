import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { MulterError, memoryStorage } from 'multer';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { IncomingFile } from '../../attachments/attachments.service';
import {
  CatalogQueryDto,
  CreateProductDto,
  CreateStockMoveDto,
  CreateWarehouseDto,
  ListMovesQueryDto,
  UpdateProductDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { WarehouseService } from './warehouse.service';

@Catch(MulterError)
class ProductImageFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const code = exception.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'IMAGE_REQUIRED';
    response.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, code, message: code });
  }
}

const readers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE, Role.MONITOR];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(ProductImageFilter)
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get('warehouses')
  @Roles(...readers)
  listWarehouses() {
    return this.warehouse.listWarehouses();
  }

  @Post('warehouses')
  @Roles(Role.GENERAL_MANAGER)
  createWarehouse(@CurrentUser() user: AuthUser, @Body() body: CreateWarehouseDto) {
    return this.warehouse.createWarehouse(user, body);
  }

  @Patch('warehouses/:id')
  @Roles(Role.GENERAL_MANAGER)
  updateWarehouse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWarehouseDto,
  ) {
    return this.warehouse.updateWarehouse(user, id, body);
  }

  @Get('products')
  @Roles(...readers)
  catalog(@CurrentUser() user: AuthUser, @Query() query: CatalogQueryDto) {
    return this.warehouse.catalog(user, query);
  }

  @Post('products')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  createProduct(@CurrentUser() user: AuthUser, @Body() body: CreateProductDto) {
    return this.warehouse.createProduct(user, body);
  }

  @Get('products/:id/image')
  @Roles(...readers)
  image(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.warehouse.image(user, id);
  }

  @Post('products/:id/image')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: Math.ceil(4.5 * 1024 * 1024) },
    }),
  )
  saveImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: IncomingFile,
  ) {
    return this.warehouse.saveImage(user, id, file);
  }

  @Delete('products/:id/image')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  removeImage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.warehouse.removeImage(user, id);
  }

  @Get('products/scan')
  @Roles(...readers)
  scan(
    @CurrentUser() user: AuthUser,
    @Query('code') code = '',
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.warehouse.scan(user, code, warehouseId);
  }

  @Get('products/:id')
  @Roles(...readers)
  product(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.warehouse.product(user, id, warehouseId);
  }

  @Patch('products/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  updateProduct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateProductDto) {
    return this.warehouse.updateProduct(user, id, body);
  }

  @Delete('products/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  removeProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.warehouse.removeProduct(user, id);
  }

  @Get('stock-movements')
  @Roles(...readers)
  listMoves(@CurrentUser() user: AuthUser, @Query() query: ListMovesQueryDto) {
    return this.warehouse.listMoves(user, query);
  }

  @Post('stock-movements')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
  createMove(@CurrentUser() user: AuthUser, @Body() body: CreateStockMoveDto) {
    return this.warehouse.createMove(user, body);
  }
}
