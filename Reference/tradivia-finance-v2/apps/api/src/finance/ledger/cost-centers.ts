import { BadRequestException } from '@nestjs/common';
import { CostCenterKind, Prisma, RecordStatus } from '@prisma/client';

type ResolveInput = {
  companyId: string;
  costCenterId?: string | null;
  projectId?: string | null;
  locationId?: string | null;
};

/** Project wins over office. An explicit center overrides both. */
export async function resolveCostCenter(tx: Prisma.TransactionClient, input: ResolveInput) {
  if (input.costCenterId) {
    const row = await tx.costCenter.findFirst({
      where: { id: input.costCenterId, companyId: input.companyId, status: RecordStatus.ACTIVE },
      select: { id: true },
    });
    if (!row) throw new BadRequestException('COST_CENTER_INACTIVE');
    return row.id;
  }
  if (input.projectId) return ensureProjectCenter(tx, input.companyId, input.projectId);
  if (input.locationId) return ensureLocationCenter(tx, input.companyId, input.locationId);
  return null;
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
