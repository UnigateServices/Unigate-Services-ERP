import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Currency, ProductUnit, RecordStatus, Role, SalesInvoiceStatus, StockMoveType } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AuthUser } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { IncomingFile } from '../../attachments/attachments.service';
import { companyOnHand } from '../inventory/inventory-nrv.service';
import { foreignOperationRate, functionalCurrency } from '../ledger/fx-journal';
import { inventoryMode, lockInventoryMethod } from '../ledger/inventory-policy';
import { releaseAllowance } from '../ledger/inventory-nrv';
import { postOperationJournal } from '../ledger/post-source';
import {
  CatalogQueryDto,
  CreateProductDto,
  CreateStockMoveDto,
  CreateWarehouseDto,
  ListMovesQueryDto,
  UpdateProductDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import {
  assertUnique,
  cleanBarcode,
  cleanName,
  cleanSku,
  decimalOrNull,
  money,
  nextStockReference,
  productView,
  qty,
  startOfToday,
} from './warehouse.shared';

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listWarehouses() {
    await this.ensureDefaultWarehouse();
    return this.prisma.warehouse.findMany({
      where: { companyId: this.companyId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isDefault: true, status: true },
    });
  }

  async createWarehouse(actor: AuthUser, dto: CreateWarehouseDto) {
    this.assertManager(actor);
    const name = cleanName(dto.name);
    assertUnique(
      await this.prisma.warehouse.findUnique({
        where: { companyId_name: { companyId: this.companyId, name } },
      }),
      'WAREHOUSE_EXISTS',
    );
    const count = await this.prisma.warehouse.count({ where: { companyId: this.companyId } });
    return this.prisma.warehouse.create({
      data: {
        companyId: this.companyId,
        name,
        isDefault: count === 0,
        status: RecordStatus.ACTIVE,
      },
      select: { id: true, name: true, isDefault: true, status: true },
    });
  }

  async updateWarehouse(actor: AuthUser, id: string, dto: UpdateWarehouseDto) {
    this.assertManager(actor);
    const current = await this.requireWarehouse(id);
    const name = dto.name ? cleanName(dto.name) : current.name;
    if (name !== current.name) {
      assertUnique(
        await this.prisma.warehouse.findUnique({
          where: { companyId_name: { companyId: this.companyId, name } },
        }),
        'WAREHOUSE_EXISTS',
        id,
      );
    }
    if (dto.status === RecordStatus.INACTIVE && current.isDefault) {
      throw new BadRequestException('DEFAULT_WAREHOUSE');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.warehouse.updateMany({
          where: { companyId: this.companyId, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.warehouse.update({
        where: { id },
        data: {
          name,
          status: dto.status ?? current.status,
          isDefault: dto.isDefault ?? current.isDefault,
        },
        select: { id: true, name: true, isDefault: true, status: true },
      });
    });
  }

  async catalog(actor: AuthUser, query: CatalogQueryDto) {
    const warehouse = await this.resolveWarehouse(query.warehouseId);
    const q = (query.q || '').trim();
    const rows = await this.prisma.product.findMany({
      where: {
        companyId: this.companyId,
        ...(actor.role === Role.EMPLOYEE ? { status: RecordStatus.ACTIVE } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
                { barcode: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    const onHand = await this.onHandMap(
      warehouse.id,
      rows.map((row) => row.id),
    );
    const allProducts = rows.map((row) => productView(row, onHand.get(row.id) || new Prisma.Decimal(0)));
    let products = allProducts;
    const filter = query.filter || 'all';
    if (filter === 'available') products = products.filter((row) => !row.out && row.status === 'ACTIVE');
    if (filter === 'low') products = products.filter((row) => row.low);
    if (filter === 'out') products = products.filter((row) => row.out && row.status === 'ACTIVE');
    if (filter === 'inactive') products = products.filter((row) => row.status === 'INACTIVE');

    const value = allProducts.reduce((sum, row) => {
      if (!row.costPrice || row.status !== 'ACTIVE' || row.out) return sum;
      return sum.plus(new Prisma.Decimal(row.onHand).mul(row.costPrice));
    }, new Prisma.Decimal(0));
    const movesToday = await this.prisma.stockMovement.count({
      where: {
        companyId: this.companyId,
        warehouseId: warehouse.id,
        createdAt: { gte: startOfToday() },
      },
    });

    return {
      warehouseId: warehouse.id,
      kpis: {
        products: allProducts.filter((row) => row.status === 'ACTIVE').length,
        stockValue: money(value) || '0',
        low: allProducts.filter((row) => row.low).length,
        movesToday,
      },
      products,
      canManage: this.canManage(actor),
      canMove: this.canMove(actor),
      canAdjust: this.canAdjust(actor),
    };
  }

  async product(actor: AuthUser, id: string, warehouseId?: string) {
    const warehouse = await this.resolveWarehouse(warehouseId);
    const row = await this.requireProduct(id);
    if (actor.role === Role.EMPLOYEE && row.status !== RecordStatus.ACTIVE) {
      throw new NotFoundException('PRODUCT_NOT_FOUND');
    }
    const onHand = await this.onHandOf(row.id, warehouse.id);
    const moves = await this.prisma.stockMovement.findMany({
      where: { companyId: this.companyId, productId: row.id, warehouseId: warehouse.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { employee: { select: { name: true } } },
    });
    const functional = await functionalCurrency(this.prisma as Prisma.TransactionClient, this.companyId);
    const costCurrency = await this.costCurrency(this.prisma, row.id, row.nrvCurrency, functional);
    return {
      warehouseId: warehouse.id,
      product: productView(row, onHand),
      movements: moves.map(presentMove),
      costCurrency,
      functionalCurrency: functional,
    };
  }

  async createProduct(actor: AuthUser, dto: CreateProductDto) {
    this.assertManage(actor);
    const name = cleanName(dto.name);
    if (!name) throw new BadRequestException('NAME_REQUIRED');
    const barcode = cleanBarcode(dto.barcode);
    await this.assertNameFree(name);
    await this.assertBarcodeFree(barcode);
    const sku = dto.sku?.trim() ? cleanSku(dto.sku) : await this.nextSku();
    await this.assertSkuFree(sku);
    const row = await this.prisma.product.create({
      data: {
        companyId: this.companyId,
        name,
        sku,
        barcode,
        unit: (dto.unit as ProductUnit) || ProductUnit.PIECE,
        costPrice: decimalOrNull(dto.costPrice),
        salePrice: decimalOrNull(dto.salePrice),
        minQuantity: new Prisma.Decimal((dto.minQuantity ?? 0).toFixed(4)),
        notes: (dto.notes || '').trim(),
        status: dto.status || RecordStatus.ACTIVE,
      },
    });
    return productView(row, new Prisma.Decimal(0));
  }

  async updateProduct(actor: AuthUser, id: string, dto: UpdateProductDto) {
    this.assertManage(actor);
    const current = await this.requireProduct(id);
    const name = dto.name ? cleanName(dto.name) : current.name;
    const sku = dto.sku ? cleanSku(dto.sku) : current.sku;
    const barcode = dto.barcode !== undefined ? cleanBarcode(dto.barcode) : current.barcode;
    if (!sku) throw new BadRequestException('SKU_REQUIRED');
    await this.assertNameFree(name, id);
    await this.assertSkuFree(sku, id);
    await this.assertBarcodeFree(barcode, id);
    const row = await this.prisma.product.update({
      where: { id },
      data: {
        name,
        sku,
        barcode,
        unit: (dto.unit as ProductUnit) || current.unit,
        costPrice: dto.costPrice !== undefined ? decimalOrNull(dto.costPrice) : current.costPrice,
        salePrice: dto.salePrice !== undefined ? decimalOrNull(dto.salePrice) : current.salePrice,
        minQuantity:
          dto.minQuantity !== undefined
            ? new Prisma.Decimal(dto.minQuantity.toFixed(4))
            : current.minQuantity,
        notes: dto.notes !== undefined ? dto.notes.trim() : current.notes,
        status: dto.status || current.status,
      },
    });
    return productView(row, new Prisma.Decimal(0));
  }

  async removeProduct(actor: AuthUser, id: string) {
    this.assertManage(actor);
    const current = await this.requireProduct(id);
    const moves = await this.prisma.stockMovement.count({ where: { productId: id } });
    if (moves > 0) {
      const row = await this.prisma.product.update({
        where: { id },
        data: { status: RecordStatus.INACTIVE },
      });
      return { deactivated: true, product: productView(row, new Prisma.Decimal(0)) };
    }
    await this.unlinkImage(current.imagePath);
    await this.prisma.product.delete({ where: { id } });
    return { deactivated: false, id };
  }

  async saveImage(actor: AuthUser, id: string, file: IncomingFile | undefined) {
    this.assertManage(actor);
    const product = await this.requireProduct(id);
    if (!file || file.size <= 0) throw new BadRequestException('IMAGE_REQUIRED');
    if (file.size > Math.ceil(4.5 * 1024 * 1024)) throw new BadRequestException('FILE_TOO_LARGE');
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = IMAGE_EXT[mime] || IMAGE_EXT[extFromName(file.originalname)];
    const normalized = IMAGE_EXT[mime] ? (mime === 'image/jpg' ? 'image/jpeg' : mime) : mimeFromExt(ext);
    if (!ext || !normalized) throw new BadRequestException('FILE_TYPE');
    const relative = path.join(this.companyId, 'products', `${product.id}${ext}`);
    const abs = path.join(this.uploadRoot, relative);
    await mkdir(path.dirname(abs), { recursive: true });
    if (product.imagePath && product.imagePath !== relative) {
      await this.unlinkImage(product.imagePath);
    }
    await writeFile(abs, file.buffer);
    const row = await this.prisma.product.update({
      where: { id: product.id },
      data: { imagePath: relative, imageMime: normalized },
    });
    return { hasImage: true, updatedAt: row.updatedAt.toISOString() };
  }

  async removeImage(actor: AuthUser, id: string) {
    this.assertManage(actor);
    const product = await this.requireProduct(id);
    await this.unlinkImage(product.imagePath);
    const row = await this.prisma.product.update({
      where: { id },
      data: { imagePath: '', imageMime: '' },
    });
    return { hasImage: false, updatedAt: row.updatedAt.toISOString() };
  }

  async image(actor: AuthUser, id: string) {
    const product = await this.requireProduct(id);
    if (actor.role === Role.EMPLOYEE && product.status !== RecordStatus.ACTIVE) {
      throw new NotFoundException('PRODUCT_NOT_FOUND');
    }
    if (!product.imagePath) throw new NotFoundException('IMAGE_NOT_FOUND');
    const abs = path.join(this.uploadRoot, product.imagePath);
    if (!existsSync(abs)) throw new NotFoundException('IMAGE_NOT_FOUND');
    const stream = createReadStream(abs);
    stream.on('error', () => undefined);
    return new StreamableFile(stream, {
      type: product.imageMime || 'image/jpeg',
      disposition: 'inline',
    });
  }

  async listMoves(actor: AuthUser, query: ListMovesQueryDto) {
    const warehouse = await this.resolveWarehouse(query.warehouseId);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        companyId: this.companyId,
        warehouseId: warehouse.id,
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.moveType ? { moveType: query.moveType as StockMoveType } : {}),
        ...(actor.role === Role.EMPLOYEE ? { product: { status: RecordStatus.ACTIVE } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        employee: { select: { name: true } },
        product: { select: { name: true, sku: true, unit: true } },
      },
    });
    return { warehouseId: warehouse.id, movements: rows.map(presentMove) };
  }

  async createMove(actor: AuthUser, dto: CreateStockMoveDto) {
    if (!this.canMove(actor)) throw new ForbiddenException('MOVE_FORBIDDEN');
    const moveType = dto.moveType as StockMoveType;
    if (moveType === StockMoveType.ADJUST && !this.canAdjust(actor)) {
      throw new ForbiddenException('MOVE_FORBIDDEN');
    }
    const amount = new Prisma.Decimal(dto.quantity.toFixed(4));
    if (moveType !== StockMoveType.ADJUST && amount.lte(0)) {
      throw new BadRequestException('QTY_INVALID');
    }
    if (amount.lt(0)) throw new BadRequestException('QTY_INVALID');

    const product = await this.requireProduct(dto.productId);
    const warehouse = await this.requireWarehouse(dto.warehouseId);
    if (product.status !== RecordStatus.ACTIVE) throw new BadRequestException('PRODUCT_INACTIVE');
    if (warehouse.status !== RecordStatus.ACTIVE) throw new BadRequestException('WAREHOUSE_INACTIVE');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${product.id} FOR UPDATE`;
      const agg = await tx.stockMovement.aggregate({
        where: { companyId: this.companyId, productId: product.id, warehouseId: warehouse.id },
        _sum: { quantity: true },
      });
      const onHand = new Prisma.Decimal(agg._sum.quantity ?? 0);
      let effect: Prisma.Decimal;
      if (moveType === StockMoveType.IN) effect = amount;
      else if (moveType === StockMoveType.OUT) effect = amount.neg();
      else effect = amount.minus(onHand);
      if (effect.eq(0)) throw new BadRequestException('NO_CHANGE');
      const next = onHand.plus(effect);
      if (next.lt(0)) throw new BadRequestException('INSUFFICIENT_STOCK');

      const locked = await tx.product.findFirst({ where: { id: product.id, companyId: this.companyId } });
      const mode = await inventoryMode(tx, this.companyId);
      const functional = await functionalCurrency(tx, this.companyId);
      const currency = await this.costCurrency(tx, locked?.id || product.id, locked?.nrvCurrency ?? null, functional);
      const fxRate = mode === 'PERIODIC' ? null : await foreignOperationRate(tx, this.companyId, currency, undefined, { date: new Date() });
      const value = mode === 'PERIODIC' || !locked?.costPrice
        ? new Prisma.Decimal(0)
        : effect.abs().mul(locked.costPrice).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      if (mode === 'PERPETUAL' && (!locked?.costPrice || locked.costPrice.lte(0) || value.lte(0))) {
        throw new BadRequestException('COST_REQUIRED');
      }

      let released = new Prisma.Decimal(0);
      if (effect.lt(0) && locked && locked.inventoryAllowance.gt(0)) {
        const held = await companyOnHand(tx, this.companyId, locked.id);
        released = releaseAllowance(locked.inventoryAllowance, held, effect.abs(), value);
        if (released.gt(0)) {
          await tx.product.update({
            where: { id: locked.id },
            data: { inventoryAllowance: locked.inventoryAllowance.minus(released) },
          });
        }
      }

      const dayCount = await tx.stockMovement.count({
        where: { companyId: this.companyId, createdAt: { gte: startOfToday() } },
      });
      const reference = await this.uniqueReference(tx, dayCount + 1);
      const row = await tx.stockMovement.create({
        data: {
          companyId: this.companyId,
          reference,
          productId: product.id,
          warehouseId: warehouse.id,
          moveType,
          quantity: effect,
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
        },
        include: {
          employee: { select: { name: true } },
          product: { select: { name: true, sku: true, unit: true } },
        },
      });
      if (mode === 'PERPETUAL') {
        const lines = effect.gt(0)
          ? [
              { code: '1400', currency, debit: value, credit: 0, fxRate },
              { code: '4910', currency, debit: 0, credit: value, fxRate },
            ]
          : [
              { code: '5410', currency, debit: value, credit: 0, fxRate },
              { code: '1400', currency, debit: 0, credit: value, fxRate },
              ...(released.gt(0)
                ? [
                    { code: '1410', currency, debit: released, credit: 0, fxRate },
                    { code: '5410', currency, debit: 0, credit: released, fxRate },
                  ]
                : []),
            ];
        await postOperationJournal(tx, {
          companyId: this.companyId,
          actorId: actor.id,
          locationId: actor.locationId,
          transactionDate: new Date(),
          description: `حركة مستودع ${reference}`,
          sourceType: 'STOCK',
          sourceId: row.id,
          lines,
        });
      }
      await lockInventoryMethod(tx, this.companyId);
      return {
        movement: presentMove(row),
        onHand: qty(next),
      };
    });
  }

  private async costCurrency(
    db: Prisma.TransactionClient | PrismaService,
    productId: string,
    nrvCurrency: Currency | null,
    functional: Currency,
  ) {
    if (nrvCurrency) return nrvCurrency;
    const line = await db.purchaseInvoiceLine.findFirst({
      where: { productId, invoice: { companyId: this.companyId, status: SalesInvoiceStatus.POSTED } },
      orderBy: { invoice: { postedAt: 'desc' } },
      select: { invoice: { select: { currency: true } } },
    });
    return line?.invoice.currency ?? functional;
  }

  private async uniqueReference(tx: Prisma.TransactionClient, serial: number) {
    for (let step = 0; step < 20; step += 1) {
      const reference = nextStockReference(serial + step);
      const taken = await tx.stockMovement.findUnique({
        where: { companyId_reference: { companyId: this.companyId, reference } },
        select: { id: true },
      });
      if (!taken) return reference;
    }
    throw new ConflictException('REFERENCE_TAKEN');
  }

  private async onHandMap(warehouseId: string, productIds: string[]) {
    const map = new Map<string, Prisma.Decimal>();
    if (!productIds.length) return map;
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { companyId: this.companyId, warehouseId, productId: { in: productIds } },
      _sum: { quantity: true },
    });
    for (const row of sums) {
      map.set(row.productId, new Prisma.Decimal(row._sum.quantity ?? 0));
    }
    return map;
  }

  private async onHandOf(productId: string, warehouseId: string) {
    const agg = await this.prisma.stockMovement.aggregate({
      where: { companyId: this.companyId, productId, warehouseId },
      _sum: { quantity: true },
    });
    return new Prisma.Decimal(agg._sum.quantity ?? 0);
  }

  private async ensureDefaultWarehouse() {
    const existing = await this.prisma.warehouse.findFirst({
      where: { companyId: this.companyId },
      select: { id: true },
    });
    if (existing) return existing;
    try {
      return await this.prisma.warehouse.create({
        data: {
          companyId: this.companyId,
          name: 'المستودع الرئيسي',
          isDefault: true,
          status: RecordStatus.ACTIVE,
        },
        select: { id: true },
      });
    } catch {
      const again = await this.prisma.warehouse.findFirst({
        where: { companyId: this.companyId },
        select: { id: true },
      });
      if (again) return again;
      throw new ConflictException('WAREHOUSE_EXISTS');
    }
  }

  private async resolveWarehouse(id?: string) {
    await this.ensureDefaultWarehouse();
    if (id) return this.requireWarehouse(id);
    const preferred = await this.prisma.warehouse.findFirst({
      where: { companyId: this.companyId, isDefault: true, status: RecordStatus.ACTIVE },
    });
    if (preferred) return preferred;
    const any = await this.prisma.warehouse.findFirst({
      where: { companyId: this.companyId, status: RecordStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
    if (!any) throw new NotFoundException('WAREHOUSE_NOT_FOUND');
    return any;
  }

  private async requireWarehouse(id: string) {
    const row = await this.prisma.warehouse.findFirst({
      where: { id, companyId: this.companyId },
    });
    if (!row) throw new NotFoundException('WAREHOUSE_NOT_FOUND');
    return row;
  }

  private async requireProduct(id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, companyId: this.companyId },
    });
    if (!row) throw new NotFoundException('PRODUCT_NOT_FOUND');
    return row;
  }

  private async nextSku() {
    const count = await this.prisma.product.count({ where: { companyId: this.companyId } });
    for (let n = count + 1; n < count + 50; n += 1) {
      const sku = `PRD-${String(n).padStart(4, '0')}`;
      const taken = await this.prisma.product.findUnique({
        where: { companyId_sku: { companyId: this.companyId, sku } },
        select: { id: true },
      });
      if (!taken) return sku;
    }
    return `PRD-${Date.now().toString().slice(-6)}`;
  }

  private async assertNameFree(name: string, selfId?: string) {
    const found = await this.prisma.product.findFirst({
      where: { companyId: this.companyId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    assertUnique(found, 'PRODUCT_EXISTS', selfId);
  }

  private async assertSkuFree(sku: string, selfId?: string) {
    assertUnique(
      await this.prisma.product.findUnique({
        where: { companyId_sku: { companyId: this.companyId, sku } },
        select: { id: true },
      }),
      'SKU_EXISTS',
      selfId,
    );
  }

  async scan(actor: AuthUser, code: string, warehouseId?: string) {
    const barcode = cleanBarcode(code);
    if (!barcode) throw new BadRequestException('BARCODE_REQUIRED');
    const warehouse = await this.resolveWarehouse(warehouseId);
    const rows = await this.prisma.product.findMany({
      where: {
        companyId: this.companyId,
        ...(actor.role === Role.EMPLOYEE ? { status: RecordStatus.ACTIVE } : {}),
        OR: [
          { barcode: { equals: barcode, mode: 'insensitive' } },
          { sku: { equals: barcode, mode: 'insensitive' } },
        ],
      },
    });
    const needle = barcode.toLowerCase();
    const match =
      rows.find((row) => row.barcode.toLowerCase() === needle) ||
      rows.find((row) => row.sku.toLowerCase() === needle);
    if (!match) throw new NotFoundException('BARCODE_UNKNOWN');
    const onHand = await this.onHandOf(match.id, warehouse.id);
    return productView(match, onHand);
  }

  private async assertBarcodeFree(barcode: string, selfId?: string) {
    if (!barcode) return;
    const found = await this.prisma.product.findFirst({
      where: { companyId: this.companyId, barcode: { equals: barcode, mode: 'insensitive' } },
      select: { id: true },
    });
    assertUnique(found, 'BARCODE_EXISTS', selfId);
  }

  private async unlinkImage(relative: string) {
    if (!relative) return;
    await unlink(path.join(this.uploadRoot, relative)).catch(() => undefined);
  }

  private assertManager(actor: AuthUser) {
    if (actor.role !== Role.GENERAL_MANAGER) throw new ForbiddenException('FORBIDDEN');
  }

  private assertManage(actor: AuthUser) {
    if (!this.canManage(actor)) throw new ForbiddenException('FORBIDDEN');
  }

  private canManage(actor: AuthUser) {
    return actor.role === Role.GENERAL_MANAGER || actor.role === Role.SUPERVISOR;
  }

  private canMove(actor: AuthUser) {
    return actor.role !== Role.MONITOR;
  }

  private canAdjust(actor: AuthUser) {
    return this.canManage(actor);
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }

  private get uploadRoot() {
    const configured = this.config.get<string>('UPLOAD_DIR', './uploads');
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
}

function presentMove(row: {
  id: string;
  reference: string;
  moveType: StockMoveType;
  quantity: Prisma.Decimal;
  notes: string;
  createdAt: Date;
  productId: string;
  employee: { name: string };
  product?: { name: string; sku: string; unit: ProductUnit };
}) {
  const signed = row.quantity;
  return {
    id: row.id,
    reference: row.reference,
    productId: row.productId,
    productName: row.product?.name || '',
    sku: row.product?.sku || '',
    unit: row.product?.unit || null,
    moveType: row.moveType,
    quantity: qty(signed.abs()),
    signed: qty(signed),
    notes: row.notes,
    employeeName: row.employee.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function extFromName(name: string) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return '';
}

function mimeFromExt(ext: string | undefined) {
  if (ext === '.jpg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return '';
}
