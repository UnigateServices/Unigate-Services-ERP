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
import { PrismaService } from '../../prisma/prisma.service';
import { canDirectlyDelete, canDirectlyEdit, seesEveryOffice, type FinanceActor } from '../finance-access';
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

  async list(actor: FinanceActor, reference: string) {
    const op = await this.requireViewableOp(actor, reference);
    const files = parseAttachmentMeta(op.attachments);
    return {
      reference: op.reference,
      files,
      canUpload: canUpload(actor, op),
      canDelete: canDelete(actor, op),
    };
  }

  async upload(actor: FinanceActor, reference: string, incoming: IncomingFile[]) {
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

    const dir = this.opDir(actor.companyId, op.reference);
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
    await this.saveMeta(actor.companyId, op, next);
    return {
      reference: op.reference,
      files: next,
      canUpload: canUpload(actor, op),
      canDelete: canDelete(actor, op),
    };
  }

  async remove(actor: FinanceActor, reference: string, id: string) {
    const op = await this.requireViewableOp(actor, reference);
    if (!canDelete(actor, op)) {
      throw new ForbiddenException('ATTACH_FORBIDDEN');
    }
    const current = parseAttachmentMeta(op.attachments);
    const target = current.find((file) => file.id === id);
    if (!target) {
      throw new NotFoundException('ATTACH_NOT_FOUND');
    }
    await unlink(path.join(this.opDir(actor.companyId, op.reference), `${target.id}${target.ext}`)).catch(() => undefined);
    const next = current.filter((file) => file.id !== id);
    await this.saveMeta(actor.companyId, op, next);
    return {
      reference: op.reference,
      files: next,
      canUpload: canUpload(actor, op),
      canDelete: canDelete(actor, op),
    };
  }

  async file(actor: FinanceActor, reference: string, id: string) {
    const op = await this.requireViewableOp(actor, reference);
    const target = parseAttachmentMeta(op.attachments).find((file) => file.id === id);
    if (!target) {
      throw new NotFoundException('ATTACH_NOT_FOUND');
    }
    const absPath = path.join(this.opDir(actor.companyId, op.reference), `${target.id}${target.ext}`);
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

  private async requireViewableOp(actor: FinanceActor, reference: string) {
    const op = await this.findOp(actor.companyId, sanitizeReference(reference));
    if (!op) {
      throw new NotFoundException('OP_NOT_FOUND');
    }
    if (!canView(actor, op)) {
      throw new ForbiddenException('FORBIDDEN');
    }
    return op;
  }

  private async findOp(companyId: string, reference: string): Promise<LiveOp | null> {
    const where = {
      companyId,
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

  private saveMeta(companyId: string, op: LiveOp, files: AttachmentMeta[]) {
    const data = { attachments: stringifyAttachmentMeta(files) };
    const where = { companyId_id: { companyId, id: op.id } };
    if (op.kind === 'income') return this.prisma.income.update({ where, data });
    if (op.kind === 'outcome') return this.prisma.outcome.update({ where, data });
    if (op.kind === 'exchange') return this.prisma.exchange.update({ where, data });
    if (op.kind === 'transfer') return this.prisma.transfer.update({ where, data });
    return this.prisma.advance.update({ where, data });
  }

  /** Decision I: one folder per company, `UPLOAD_DIR/<companyId>/<reference>`. */
  private opDir(companyId: string, reference: string) {
    return path.join(this.uploadRoot, companyId, reference);
  }

  private get uploadRoot() {
    const configured = this.config.get<string>('UPLOAD_DIR', './uploads');
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
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

function canView(actor: FinanceActor, op: LiveOp) {
  if (seesEveryOffice(actor)) return true;
  if (actor.visibility === 'OWN') return op.employeeId === actor.membershipId;
  return Boolean(actor.locationId && op.locationId === actor.locationId);
}

/** Readers (and a platform operator in support) view only. Recorders change their own operations. */
function canUpload(actor: FinanceActor, op: LiveOp) {
  if (op.status === TransactionStatus.DELETED || actor.level === 'NONE' || actor.level === 'READ') return false;
  if (canDirectlyEdit(actor)) return canView(actor, op);
  return op.employeeId === actor.membershipId;
}

function canDelete(actor: FinanceActor, op: LiveOp) {
  if (op.status === TransactionStatus.DELETED || actor.level === 'NONE' || actor.level === 'READ') return false;
  if (canDirectlyDelete(actor)) return canView(actor, op);
  return op.employeeId === actor.membershipId && op.status === TransactionStatus.COMPLETED;
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
