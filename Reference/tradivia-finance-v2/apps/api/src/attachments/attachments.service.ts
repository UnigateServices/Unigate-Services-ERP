import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionStatus } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/current-user.decorator';
import { canDirectlyChangeOperations } from '../auth/access';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentMeta, parseAttachmentMeta, stringifyAttachmentMeta } from './attachment-meta';

const MAX_FILES = 8;
const MAX_FILE_BYTES = Math.ceil(4.5 * 1024 * 1024);

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
]);

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.zip',
  '.rar',
]);

type OpKind = 'income' | 'outcome' | 'exchange' | 'transfer' | 'advance';

type LiveOp = {
  kind: OpKind;
  id: string;
  reference: string;
  status: TransactionStatus;
  employeeId: string;
  locationId: string | null;
  attachments: string;
};

export type IncomingFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(actor: AuthUser, reference: string) {
    const op = await this.requireViewableOp(actor, reference);
    const files = parseAttachmentMeta(op.attachments);
    return {
      reference: op.reference,
      files,
      canUpload: canUpload(actor, op),
      canDelete: canDelete(actor, op),
    };
  }

  async upload(actor: AuthUser, reference: string, incoming: IncomingFile[]) {
    const op = await this.requireViewableOp(actor, reference);
    if (!canUpload(actor, op)) {
      throw new ForbiddenException('ATTACH_FORBIDDEN');
    }

    const current = parseAttachmentMeta(op.attachments);
    const files = (incoming || []).filter((file) => file && file.size > 0);
    if (!files.length) {
      throw new BadRequestException('FILE_REQUIRED');
    }
    if (current.length + files.length > MAX_FILES) {
      throw new BadRequestException('TOO_MANY_FILES');
    }

    const dir = this.opDir(op.reference);
    await mkdir(dir, { recursive: true });

    const added: AttachmentMeta[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        throw new BadRequestException('FILE_TOO_LARGE');
      }
      const ext = safeExt(file.originalname, file.mimetype);
      const mime = normalizeMime(file.mimetype, ext);
      if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(mime)) {
        throw new BadRequestException('FILE_TYPE');
      }
      const id = randomUUID();
      const meta: AttachmentMeta = {
        id,
        name: safeOriginalName(file.originalname),
        size: file.size,
        mime,
        ext,
      };
      await writeFile(path.join(dir, `${id}${ext}`), file.buffer);
      added.push(meta);
    }

    const next = [...current, ...added];
    await this.saveMeta(op, next);
    return {
      reference: op.reference,
      files: next,
      canUpload: canUpload(actor, op),
      canDelete: canDelete(actor, op),
    };
  }

  async remove(actor: AuthUser, reference: string, id: string) {
    const op = await this.requireViewableOp(actor, reference);
    if (!canDelete(actor, op)) {
      throw new ForbiddenException('ATTACH_FORBIDDEN');
    }
    const current = parseAttachmentMeta(op.attachments);
    const target = current.find((file) => file.id === id);
    if (!target) {
      throw new NotFoundException('ATTACH_NOT_FOUND');
    }
    await unlink(path.join(this.opDir(op.reference), `${target.id}${target.ext}`)).catch(() => undefined);
    const next = current.filter((file) => file.id !== id);
    await this.saveMeta(op, next);
    return {
      reference: op.reference,
      files: next,
      canUpload: canUpload(actor, op),
      canDelete: canDelete(actor, op),
    };
  }

  async file(actor: AuthUser, reference: string, id: string) {
    const op = await this.requireViewableOp(actor, reference);
    const target = parseAttachmentMeta(op.attachments).find((file) => file.id === id);
    if (!target) {
      throw new NotFoundException('ATTACH_NOT_FOUND');
    }
    const absPath = path.join(this.opDir(op.reference), `${target.id}${target.ext}`);
    if (!existsSync(absPath)) {
      throw new NotFoundException('ATTACH_NOT_FOUND');
    }
    const stream = createReadStream(absPath);
    stream.on('error', () => undefined);
    const encoded = encodeURIComponent(target.name);
    return new StreamableFile(stream, {
      type: target.mime || 'application/octet-stream',
      disposition: `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      length: target.size,
    });
  }

  private async requireViewableOp(actor: AuthUser, reference: string) {
    const op = await this.findOp(sanitizeReference(reference));
    if (!op) {
      throw new NotFoundException('OP_NOT_FOUND');
    }
    if (!canView(actor, op)) {
      throw new ForbiddenException('FORBIDDEN');
    }
    return op;
  }

  private async findOp(reference: string): Promise<LiveOp | null> {
    const where = {
      companyId: this.companyId,
      reference,
      status: { not: TransactionStatus.DELETED },
    };
    const income = await this.prisma.income.findFirst({ where });
    if (income) return toOp('income', income);
    const outcome = await this.prisma.outcome.findFirst({ where });
    if (outcome) return toOp('outcome', outcome);
    const exchange = await this.prisma.exchange.findFirst({ where });
    if (exchange) return toOp('exchange', exchange);
    const transfer = await this.prisma.transfer.findFirst({ where });
    if (transfer) return toOp('transfer', transfer);
    const advance = await this.prisma.advance.findFirst({ where });
    if (advance) return toOp('advance', advance);
    return null;
  }

  private saveMeta(op: LiveOp, files: AttachmentMeta[]) {
    const data = { attachments: stringifyAttachmentMeta(files) };
    if (op.kind === 'income') return this.prisma.income.update({ where: { id: op.id }, data });
    if (op.kind === 'outcome') return this.prisma.outcome.update({ where: { id: op.id }, data });
    if (op.kind === 'exchange') return this.prisma.exchange.update({ where: { id: op.id }, data });
    if (op.kind === 'transfer') return this.prisma.transfer.update({ where: { id: op.id }, data });
    return this.prisma.advance.update({ where: { id: op.id }, data });
  }

  private opDir(reference: string) {
    return path.join(this.uploadRoot, this.companyId, reference);
  }

  private get uploadRoot() {
    const configured = this.config.get<string>('UPLOAD_DIR', './uploads');
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function toOp(
  kind: OpKind,
  row: {
    id: string;
    reference: string;
    status: TransactionStatus;
    employeeId: string;
    locationId: string | null;
    attachments: string;
  },
): LiveOp {
  return {
    kind,
    id: row.id,
    reference: row.reference,
    status: row.status,
    employeeId: row.employeeId,
    locationId: row.locationId,
    attachments: row.attachments,
  };
}

function canView(actor: AuthUser, op: LiveOp) {
  if (actor.role === 'GENERAL_MANAGER' || actor.role === 'MONITOR') return true;
  if (actor.role === 'EMPLOYEE') return op.employeeId === actor.id;
  return Boolean(actor.locationId && op.locationId === actor.locationId);
}

function canUpload(actor: AuthUser, op: LiveOp) {
  if (op.status === TransactionStatus.DELETED) return false;
  if (canDirectlyChangeOperations(actor)) return canView(actor, op);
  return op.employeeId === actor.id;
}

function canDelete(actor: AuthUser, op: LiveOp) {
  if (op.status === TransactionStatus.DELETED) return false;
  if (canDirectlyChangeOperations(actor)) return canView(actor, op);
  return op.employeeId === actor.id && op.status === TransactionStatus.COMPLETED;
}

function sanitizeReference(value: string) {
  const ref = String(value || '').trim();
  if (!/^[A-Z]{2,5}-\d{6}-\d{3,}$/i.test(ref)) {
    throw new BadRequestException('OP_NOT_FOUND');
  }
  return ref.toUpperCase();
}

function safeOriginalName(name: string) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f]/g, '').trim();
  return (base || 'file').slice(0, 180);
}

function safeExt(name: string, mime: string) {
  const fromName = path.extname(String(name || '')).toLowerCase();
  if (ALLOWED_EXT.has(fromName)) return fromName;
  if (mime === 'application/pdf') return '.pdf';
  if (mime.startsWith('image/jpeg') || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.bin';
}

function normalizeMime(mime: string, ext: string) {
  const value = String(mime || '').toLowerCase();
  if (ALLOWED_MIME.has(value)) return value === 'image/jpg' ? 'image/jpeg' : value;
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}
