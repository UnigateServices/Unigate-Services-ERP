/**
 * Development-only identities for manual login checks.
 * Refuses to run when NODE_ENV is production.
 * Credentials come from the environment. This script does not print them.
 *
 * From uni-gate:
 *   npm run db:seed:dev
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { CompanyStatus, PrismaClient, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import { passwordIssue, todayInDamascus } from '@unigate/shared';
import * as bcrypt from 'bcrypt';

const root = path.resolve(__dirname, '../../..');
loadEnv(path.join(root, '.env'));
loadEnv(path.join(root, 'packages', 'database', '.env'));

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed development identities in production.');
  process.exit(1);
}

const platformUsername = required('DEV_PLATFORM_USERNAME');
const platformPassword = required('DEV_PLATFORM_PASSWORD');
const platformName = process.env.DEV_PLATFORM_NAME || platformUsername;
const memberUsername = required('DEV_MEMBER_USERNAME');
const memberPassword = required('DEV_MEMBER_PASSWORD');
const memberName = process.env.DEV_MEMBER_NAME || memberUsername;
const ownerPassword = required('DEV_OWNER_PASSWORD');

for (const password of [platformPassword, memberPassword, ownerPassword]) {
  if (passwordIssue(password)) {
    console.error('A development password does not meet the password policy.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();
const cost = 12;

async function main() {
  const today = todayInDamascus();
  await ensurePlatform();
  await ensureCustomer({
    companyId: 'co_tradivia',
    code: 'tradivia',
    name: 'TRADIVIA',
    status: CompanyStatus.ACTIVE,
    expiresOn: '2027-04-01',
    locationId: 'loc_t1',
    locationName: 'المكتب 1',
    roleId: 'role_t_gm',
    roleKey: 'GENERAL_MANAGER',
    roleName: 'مدير عام',
    userId: 'usr_manager',
    membershipId: 'mem_manager',
    username: memberUsername,
    displayName: memberName,
    password: memberPassword,
  });
  await ensureCustomer({
    companyId: 'co_ofoq',
    code: 'ofoq',
    name: 'الأفق',
    status: CompanyStatus.SUSPENDED,
    expiresOn: '2026-06-01',
    locationId: 'loc_ofoq',
    locationName: 'الأفق',
    roleId: 'role_o_owner',
    roleKey: 'OWNER',
    roleName: 'مالك',
    userId: 'usr_ofoq',
    membershipId: 'mem_ofoq',
    username: 'owner',
    displayName: 'owner',
    password: ownerPassword,
  });
  await ensureCustomer({
    companyId: 'co_expired',
    code: 'expired',
    name: 'Expired',
    status: CompanyStatus.ACTIVE,
    expiresOn: shiftDate(today, -1),
    locationId: 'loc_expired',
    locationName: 'Expired',
    roleId: 'role_expired',
    roleKey: 'OWNER',
    roleName: 'Owner',
    userId: 'usr_expired',
    membershipId: 'mem_expired',
    username: 'owner',
    displayName: 'owner',
    password: ownerPassword,
  });
  await ensureCustomer({
    companyId: 'co_lastday',
    code: 'lastday',
    name: 'Last day',
    status: CompanyStatus.ACTIVE,
    expiresOn: today,
    locationId: 'loc_lastday',
    locationName: 'Last day',
    roleId: 'role_lastday',
    roleKey: 'OWNER',
    roleName: 'Owner',
    userId: 'usr_lastday',
    membershipId: 'mem_lastday',
    username: 'owner',
    displayName: 'owner',
    password: ownerPassword,
  });
  console.log('Development identities are ready. Passwords were read from the environment and were not printed.');
  console.log(`Platform username: ${platformUsername}`);
  console.log(`Active company code: tradivia, username: ${memberUsername}`);
  console.log('Suspended company code: ofoq, username: owner');
  console.log('Expired company code: expired, username: owner');
  console.log('Last valid day company code: lastday, username: owner');
}

async function ensurePlatform() {
  const existing = await prisma.user.findFirst({
    where: { kind: UserKind.PLATFORM, username: { equals: platformUsername, mode: 'insensitive' } },
  });
  const passwordHash = await hashIfNeeded(existing?.passwordHash, platformPassword);
  const passwordChanged = passwordHash !== existing?.passwordHash;
  if (!existing) {
    await prisma.user.create({
      data: {
        id: 'dev_platform_operator',
        kind: UserKind.PLATFORM,
        username: platformUsername,
        name: platformName,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    return;
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: platformName,
      status: UserStatus.ACTIVE,
      failedLoginCount: 0,
      lockedUntil: null,
      ...(passwordChanged ? { passwordHash, authVersion: { increment: 1 } } : {}),
    },
  });
}

async function ensureCustomer(input: {
  companyId: string;
  code: string;
  name: string;
  status: CompanyStatus;
  expiresOn: string;
  locationId: string;
  locationName: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  userId: string;
  membershipId: string;
  username: string;
  displayName: string;
  password: string;
}) {
  await prisma.company.upsert({
    where: { id: input.companyId },
    create: {
      id: input.companyId,
      name: input.name,
      code: input.code,
      status: input.status,
      priceUsd: '10.00',
      expiresOn: utcDate(input.expiresOn),
    },
    update: {
      name: input.name,
      code: input.code,
      status: input.status,
      expiresOn: utcDate(input.expiresOn),
    },
  });
  await prisma.location.upsert({
    where: { id: input.locationId },
    create: { id: input.locationId, companyId: input.companyId, name: input.locationName },
    update: { name: input.locationName, companyId: input.companyId },
  });
  await prisma.role.upsert({
    where: { id: input.roleId },
    create: {
      id: input.roleId,
      companyId: input.companyId,
      key: input.roleKey,
      name: input.roleName,
      canManageUsers: true,
      visibilityScope: VisibilityScope.ALL_BRANCHES,
    },
    update: {
      key: input.roleKey,
      name: input.roleName,
      canManageUsers: true,
      visibilityScope: VisibilityScope.ALL_BRANCHES,
    },
  });
  const existing = await prisma.user.findUnique({ where: { id: input.userId } });
  const passwordHash = await hashIfNeeded(existing?.passwordHash, input.password);
  await prisma.user.upsert({
    where: { id: input.userId },
    create: {
      id: input.userId,
      kind: UserKind.MEMBER,
      name: input.displayName,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    update: {
      kind: UserKind.MEMBER,
      username: null,
      name: input.displayName,
      status: UserStatus.ACTIVE,
      failedLoginCount: 0,
      lockedUntil: null,
      ...(passwordHash === existing?.passwordHash ? {} : { passwordHash, authVersion: { increment: 1 } }),
    },
  });
  await prisma.membership.upsert({
    where: { id: input.membershipId },
    create: {
      id: input.membershipId,
      userId: input.userId,
      companyId: input.companyId,
      username: input.username,
      roleId: input.roleId,
    },
    update: {
      username: input.username,
      roleId: input.roleId,
      companyId: input.companyId,
      locationId: null,
    },
  });
}

async function hashIfNeeded(currentHash: string | undefined, password: string) {
  if (currentHash && (await bcrypt.compare(password, currentHash))) return currentHash;
  return bcrypt.hash(password, cost);
}

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in uni-gate/.env before seeding.`);
    process.exit(1);
  }
  return value;
}

function utcDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
    console.error(error instanceof Error ? error.message : 'Development seed failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
