import { BadRequestException } from '@nestjs/common';
import { CostCenterKind, Prisma, RecordStatus } from '@prisma/client';

export const HEAD_OFFICE_CODE = 'HQ';

type DimensionInput = {
  companyId: string;
  locationId?: string | null;
  projectId?: string | null;
};

export type LineSeed = {
  /** Income and expense lines must always land in an office center. */
  profitAndLoss: boolean;
  /** Explicit center picked by the user (manual journals). A project center only sets the project dimension. */
  costCenterId?: string | null;
};

export type LineDimensions = { costCenterId: string | null; projectId: string | null };

/**
 * Two independent analytic dimensions per journal line.
 *  - costCenterId is the office. It comes from the document office, an explicit office center, or the head office
 *    when the entry belongs to the company as a whole. It is never empty on income and expense lines.
 *  - projectId is the project the document was booked against.
 * A project never replaces the office, so both profitability views stay correct.
 */
export async function resolveDimensions(
  tx: Prisma.TransactionClient,
  input: DimensionInput,
  lines: LineSeed[],
): Promise<LineDimensions[]> {
  const office = input.locationId ? await ensureLocationCenter(tx, input.companyId, input.locationId) : null;
  const entryProject = input.projectId ? await ensureProjectDimension(tx, input.companyId, input.projectId) : null;
  let headOffice: string | null = null;
  const result: LineDimensions[] = [];
  for (const line of lines) {
    let costCenterId = office;
    let projectId = entryProject;
    if (line.costCenterId) {
      const center = await tx.costCenter.findFirst({
        where: { id: line.costCenterId, companyId: input.companyId, status: RecordStatus.ACTIVE },
        select: { id: true, kind: true, projectId: true },
      });
      if (!center) throw new BadRequestException('COST_CENTER_INACTIVE');
      if (center.kind === CostCenterKind.PROJECT) projectId = center.projectId;
      else costCenterId = center.id;
    }
    if (!costCenterId && line.profitAndLoss) {
      headOffice ??= await ensureHeadOffice(tx, input.companyId);
      costCenterId = headOffice;
    }
    result.push({ costCenterId, projectId });
  }
  return result;
}

/** Report filter: a project center filters the project dimension, any other center filters the office dimension. */
export async function centerLineFilter(
  db: Pick<Prisma.TransactionClient, 'costCenter'>,
  companyId: string,
  costCenterId: string | undefined,
): Promise<Prisma.JournalLineWhereInput> {
  if (!costCenterId) return {};
  const center = await db.costCenter.findFirst({
    where: { id: costCenterId, companyId },
    select: { id: true, kind: true, projectId: true },
  });
  if (!center) throw new BadRequestException('COST_CENTER_INACTIVE');
  if (center.kind === CostCenterKind.PROJECT && center.projectId) return { projectId: center.projectId };
  return { costCenterId: center.id };
}

export async function ensureHeadOffice(tx: Prisma.TransactionClient, companyId: string) {
  const row = await tx.costCenter.upsert({
    where: { companyId_code: { companyId, code: HEAD_OFFICE_CODE } },
    create: {
      companyId,
      code: HEAD_OFFICE_CODE,
      name: 'المركز الرئيسي',
      kind: CostCenterKind.MANUAL,
      status: RecordStatus.ACTIVE,
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}

async function ensureProjectDimension(tx: Prisma.TransactionClient, companyId: string, projectId: string) {
  await ensureProjectCenter(tx, companyId, projectId);
  return projectId;
}

export async function syncCostCenters(tx: Prisma.TransactionClient, companyId: string) {
  const [projects, locations] = await Promise.all([
    tx.project.findMany({ where: { companyId }, select: { id: true, name: true, status: true } }),
    tx.location.findMany({ where: { companyId }, select: { id: true, name: true, status: true } }),
  ]);
  for (const project of projects) {
    await tx.costCenter.upsert({
      where: { projectId: project.id },
      create: {
        companyId,
        code: `P-${project.id}`,
        name: project.name,
        kind: CostCenterKind.PROJECT,
        status: project.status,
        projectId: project.id,
      },
      update: { name: project.name, status: project.status },
    });
  }
  for (const location of locations) {
    await tx.costCenter.upsert({
      where: { locationId: location.id },
      create: {
        companyId,
        code: `L-${location.id}`,
        name: location.name,
        kind: CostCenterKind.LOCATION,
        status: location.status,
        locationId: location.id,
      },
      update: { name: location.name, status: location.status },
    });
  }
  await ensureHeadOffice(tx, companyId);
}

async function ensureProjectCenter(tx: Prisma.TransactionClient, companyId: string, projectId: string) {
  const project = await tx.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true, name: true, status: true },
  });
  if (!project || project.status !== RecordStatus.ACTIVE) throw new BadRequestException('COST_CENTER_INACTIVE');
  const row = await tx.costCenter.upsert({
    where: { projectId: project.id },
    create: {
      companyId,
      code: `P-${project.id}`,
      name: project.name,
      kind: CostCenterKind.PROJECT,
      status: RecordStatus.ACTIVE,
      projectId: project.id,
    },
    update: { name: project.name, status: RecordStatus.ACTIVE },
    select: { id: true },
  });
  return row.id;
}

async function ensureLocationCenter(tx: Prisma.TransactionClient, companyId: string, locationId: string) {
  const location = await tx.location.findFirst({
    where: { id: locationId, companyId },
    select: { id: true, name: true, status: true },
  });
  if (!location || location.status !== RecordStatus.ACTIVE) throw new BadRequestException('COST_CENTER_INACTIVE');
  const row = await tx.costCenter.upsert({
    where: { locationId: location.id },
    create: {
      companyId,
      code: `L-${location.id}`,
      name: location.name,
      kind: CostCenterKind.LOCATION,
      status: RecordStatus.ACTIVE,
      locationId: location.id,
    },
    update: { name: location.name, status: RecordStatus.ACTIVE },
    select: { id: true },
  });
  return row.id;
}
