import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient, RecordStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

config({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const companyId = process.env.DEFAULT_COMPANY_ID || 'tradivia';
const password = 'Tradivia@dev';

const offices = ['المكتب الأول', 'المكتب الثاني', 'المكتب الثالث'];

async function upsertLocation(name: string) {
  return prisma.location.upsert({
    where: { companyId_name: { companyId, name } },
    update: { status: RecordStatus.ACTIVE },
    create: { companyId, name, status: RecordStatus.ACTIVE },
  });
}

async function upsertEmployee(
  name: string,
  role: Role,
  locationId: string | null,
) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.employee.upsert({
    where: { companyId_name: { companyId, name } },
    update: { role, accountStatus: RecordStatus.ACTIVE, passwordHash, locationId },
    create: {
      companyId,
      name,
      role,
      accountStatus: RecordStatus.ACTIVE,
      passwordHash,
      locationId,
    },
  });
}

async function main() {
  const locations = [];
  for (const name of offices) {
    locations.push(await upsertLocation(name));
  }

  await upsertEmployee('المدير العام', Role.GENERAL_MANAGER, null);
  await upsertEmployee('المراقب', Role.MONITOR, null);

  for (const [index, location] of locations.entries()) {
    const n = index + 1;
    await upsertEmployee(`مشرف المكتب ${n}`, Role.SUPERVISOR, location.id);
    await upsertEmployee(`موظف المكتب ${n}`, Role.EMPLOYEE, location.id);
  }

  console.log(`Seeded demo tenant "${companyId}": 1 general manager, 1 monitor, 3 offices, supervisors and employees.`);
  console.log('Local password for all seed users: Tradivia@dev');
  console.log('Borrowers, projects, and banks are empty — add them from the manager/supervisor screens.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
