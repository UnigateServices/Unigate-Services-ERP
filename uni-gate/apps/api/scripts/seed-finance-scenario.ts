/**
 * Development-only company for the finance baseline scenario (tools/finance-baseline).
 * It mirrors the original finance seed: three offices, a general manager, a monitor, and a
 * supervisor and an employee per office, with the same display names, on the `tradivia` preset.
 * Finance is enabled. Run it on a fresh database, then start the API and run the scenario with
 * SCENARIO_TARGET=merged. Refuses NODE_ENV=production and refuses to touch an existing company.
 *
 * From uni-gate/apps/api:
 *   SCENARIO_PASSWORD=... npx tsx scripts/seed-finance-scenario.ts
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { CompanyStatus, PrismaClient, UserKind, UserStatus } from '@prisma/client';
import { MODULE_KEYS, passwordIssue } from '@unigate/shared';
import * as bcrypt from 'bcrypt';
import { ROLE_PRESETS, presetPermissionRows } from '../src/platform/companies/role-presets';

const root = path.resolve(__dirname, '../../..');
loadEnv(path.join(root, '.env'));
loadEnv(path.join(root, 'packages', 'database', '.env'));

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed the finance scenario in production.');
  process.exit(1);
}

const CODE = process.env.SCENARIO_COMPANY || 'scenario';
const password = process.env.SCENARIO_PASSWORD || '';
if (passwordIssue(password)) {
  console.error('Set SCENARIO_PASSWORD to a password that meets the policy (8+ characters, a letter and a number).');
  process.exit(1);
}

const OFFICES = ['المكتب الأول', 'المكتب الثاني', 'المكتب الثالث'];
const prisma = new PrismaClient();

async function main() {
  if (await prisma.company.findUnique({ where: { code: CODE } })) {
    console.error(`Company ${CODE} already exists. The scenario needs a fresh database.`);
    process.exitCode = 1;
    return;
  }
  const passwordHash = await bcrypt.hash(password, 4);
  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: 'TRADIVIA scenario', code: CODE, status: CompanyStatus.ACTIVE, priceUsd: '10.00', expiresOn: new Date('2099-01-01T00:00:00.000Z') },
    });
    const roles: Record<string, string> = {};
    for (const template of ROLE_PRESETS.tradivia) {
      const { permissions: _permissions, ...fields } = template;
      const role = await tx.role.create({ data: { companyId: company.id, ...fields } });
      await tx.rolePermission.createMany({ data: presetPermissionRows(company.id, role.id, template) });
      roles[template.key] = role.id;
    }
    const offices = [];
    for (const name of OFFICES) offices.push(await tx.location.create({ data: { companyId: company.id, name } }));

    const people: { username: string; name: string; role: string; locationId: string | null }[] = [
      { username: 'manager', name: 'المدير العام', role: 'GENERAL_MANAGER', locationId: null },
      { username: 'monitor', name: 'المراقب', role: 'MONITOR', locationId: null },
    ];
    offices.forEach((office, index) => {
      const n = index + 1;
      people.push({ username: `supervisor${n}`, name: `مشرف المكتب ${n}`, role: 'SUPERVISOR', locationId: office.id });
      people.push({ username: `employee${n}`, name: `موظف المكتب ${n}`, role: 'EMPLOYEE', locationId: office.id });
    });
    for (const person of people) {
      const user = await tx.user.create({
        data: { kind: UserKind.MEMBER, name: person.name, passwordHash, status: UserStatus.ACTIVE },
      });
      await tx.membership.create({
        data: { userId: user.id, companyId: company.id, username: person.username, roleId: roles[person.role], locationId: person.locationId },
      });
    }
    await tx.companyModule.createMany({
      data: MODULE_KEYS.map((moduleKey) => ({ companyId: company.id, moduleKey, enabled: moduleKey === 'finance' })),
    });
  });
  console.log(`Finance scenario company "${CODE}" is ready: 3 offices, 8 users, finance enabled.`);
}

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Finance scenario seed failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
