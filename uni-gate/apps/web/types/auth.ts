export type Lang = 'ar' | 'en';

export type Theme = 'light' | 'dark';

export type Actor = 'platform' | 'member';

export type VisibilityScope = 'OWN' | 'BRANCH' | 'ALL_BRANCHES';

export type SessionVisibility = VisibilityScope | 'PLATFORM';

export type ModuleKey = 'finance' | 'exchange' | 'gold' | 'aviation' | 'engineering' | 'hr';

export type CompanyStatus = 'ACTIVE' | 'SUSPENDED';

export type RecordStatus = 'ACTIVE' | 'INACTIVE';

export type AuditAction = 'ENTER' | 'CREATE' | 'UPDATE' | 'DELETE';

export type RolePreset = 'tradivia' | 'simple';

export const MODULE_KEYS: ModuleKey[] = [
  'finance',
  'exchange',
  'gold',
  'aviation',
  'engineering',
  'hr',
];

export const FINANCE_ROLE_KEYS = ['GENERAL_MANAGER', 'MONITOR', 'SUPERVISOR', 'EMPLOYEE'] as const;

export type AppSession = {
  actor: Actor;
  userId: string;
  name: string;
  companyId: string | null;
  roleKey: string | null;
  roleName: string | null;
  locationId: string | null;
  visibility: SessionVisibility;
  canManageUsers: boolean;
  expiresAt: number;
  actingCompany: {
    id: string;
    name: string;
    code: string;
    status: CompanyStatus;
  } | null;
};

export type PlatformOperatorFixture = {
  id: string;
  name: string;
  password: string;
  status: RecordStatus;
};

export type LoginFailureCode =
  | 'WRONG_CREDENTIALS'
  | 'INACTIVE'
  | 'LOCKED'
  | 'COMPANY_SUSPENDED'
  | 'SUBSCRIPTION_EXPIRED';

export type PlatformLoginResult =
  | { ok: true; operator: { id: string; name: string } }
  | { ok: false; code: LoginFailureCode };

export type Company = {
  id: string;
  name: string;
  code: string;
  status: CompanyStatus;
  priceUsd: number;
  expiresOn: string;
};

export type Location = {
  id: string;
  companyId: string;
  name: string;
  status: RecordStatus;
};

export type Role = {
  id: string;
  companyId: string;
  key: string;
  name: string;
  canManageUsers: boolean;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

export type DirectoryUser = {
  id: string;
  name: string;
  password: string;
  email: string;
  phone: string;
  status: RecordStatus;
};

export type Membership = {
  id: string;
  userId: string;
  companyId: string;
  roleId: string;
  locationId: string | null;
};

export type CompanyModule = {
  id: string;
  companyId: string;
  moduleKey: ModuleKey;
  enabled: boolean;
};

export type AuditEntry = {
  id: string;
  actorUserId: string;
  actorName: string;
  companyId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  createdAt: string;
};

export type MockDatabase = {
  version: 1;
  companies: Company[];
  locations: Location[];
  roles: Role[];
  users: DirectoryUser[];
  memberships: Membership[];
  modules: CompanyModule[];
  audit: AuditEntry[];
};
