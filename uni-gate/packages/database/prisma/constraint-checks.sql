\set ON_ERROR_STOP on

INSERT INTO companies (id, name, code, status, price_usd, expires_on, updated_at) VALUES
  ('co_a', 'Company A', 'alpha', 'ACTIVE', 10.00, DATE '2026-10-04', NOW()),
  ('co_b', 'Company B', 'beta', 'ACTIVE', 10.00, DATE '2026-10-04', NOW());

INSERT INTO locations (id, company_id, name, status, updated_at) VALUES
  ('loc_a', 'co_a', 'Branch A', 'ACTIVE', NOW()),
  ('loc_b', 'co_b', 'Branch B', 'ACTIVE', NOW());

INSERT INTO roles (id, company_id, key, name, visibility_scope, updated_at) VALUES
  ('role_a', 'co_a', 'OWNER', 'Owner', 'ALL_BRANCHES', NOW()),
  ('role_a_branch', 'co_a', 'CLERK', 'Clerk', 'BRANCH', NOW()),
  ('role_b', 'co_b', 'OWNER', 'Owner', 'ALL_BRANCHES', NOW());

INSERT INTO users (id, kind, username, name, password_hash, status, updated_at) VALUES
  ('usr_op1', 'PLATFORM', 'operator', 'Name', 'hash', 'ACTIVE', NOW()),
  ('usr_m1', 'MEMBER', NULL, 'Name', 'hash', 'ACTIVE', NOW()),
  ('usr_m2', 'MEMBER', NULL, 'Name', 'hash', 'ACTIVE', NOW()),
  ('usr_m3', 'MEMBER', NULL, 'Name', 'hash', 'ACTIVE', NOW()),
  ('usr_m5', 'MEMBER', NULL, 'Name', 'hash', 'ACTIVE', NOW());

INSERT INTO memberships (id, user_id, company_id, username, role_id, location_id, updated_at) VALUES
  ('mem_a', 'usr_m1', 'co_a', 'owner', 'role_a', NULL, NOW());

SELECT auth_version AS platform_auth_version_default
FROM users
WHERE id = 'usr_op1';

CREATE OR REPLACE FUNCTION pg_temp.expect_sqlstate(label text, sql text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
    IF expected IS NULL THEN
      RAISE NOTICE 'PASS %', label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL % expected % but statement succeeded', label, expected;
  EXCEPTION
    WHEN OTHERS THEN
      IF expected IS NOT NULL AND SQLSTATE = expected THEN
        RAISE NOTICE 'PASS % (%)', label, SQLSTATE;
      ELSIF expected IS NULL THEN
        RAISE EXCEPTION 'FAIL % unexpected % %', label, SQLSTATE, SQLERRM;
      ELSE
        RAISE EXCEPTION 'FAIL % expected % got % %', label, expected, SQLSTATE, SQLERRM;
      END IF;
  END;
END $$;

SELECT pg_temp.expect_sqlstate(
  'company code exact duplicate',
  $sql$INSERT INTO companies (id, name, code, status, price_usd, expires_on, updated_at)
       VALUES ('co_dup', 'Dup', 'alpha', 'ACTIVE', 1, DATE '2026-10-04', NOW())$sql$,
  '23505'
);

SELECT pg_temp.expect_sqlstate(
  'company code case-insensitive duplicate',
  $sql$INSERT INTO companies (id, name, code, status, price_usd, expires_on, updated_at)
       VALUES ('co_case', 'Case', 'ALPHA', 'ACTIVE', 1, DATE '2026-10-04', NOW())$sql$,
  '23505'
);

SELECT pg_temp.expect_sqlstate(
  'platform username case-insensitive duplicate',
  $sql$INSERT INTO users (id, kind, username, name, password_hash, status, updated_at)
       VALUES ('usr_op2', 'PLATFORM', 'Operator', 'Name', 'hash', 'ACTIVE', NOW())$sql$,
  '23505'
);

SELECT pg_temp.expect_sqlstate(
  'customer username case-insensitive duplicate in same company',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_case', 'usr_m2', 'co_a', 'OWNER', 'role_a', NOW())$sql$,
  '23505'
);

SELECT pg_temp.expect_sqlstate(
  'same customer username in a second company',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_b', 'usr_m2', 'co_b', 'owner', 'role_b', NOW())$sql$,
  NULL
);

SELECT pg_temp.expect_sqlstate(
  'MEMBER cannot store a platform username',
  $sql$INSERT INTO users (id, kind, username, name, password_hash, status, updated_at)
       VALUES ('usr_bad_member', 'MEMBER', 'someone', 'Name', 'hash', 'ACTIVE', NOW())$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'PLATFORM user must have a username',
  $sql$INSERT INTO users (id, kind, username, name, password_hash, status, updated_at)
       VALUES ('usr_bad_platform', 'PLATFORM', NULL, 'Name', 'hash', 'ACTIVE', NOW())$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'one user cannot have two memberships',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_second', 'usr_m1', 'co_b', 'other', 'role_b', NOW())$sql$,
  '23505'
);

SELECT pg_temp.expect_sqlstate(
  'membership role must exist',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_missing_role', 'usr_m3', 'co_a', 'third', 'missing_role', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'membership location must exist',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, location_id, updated_at)
       VALUES ('mem_missing_loc', 'usr_m3', 'co_a', 'fourth', 'role_a_branch', 'missing_loc', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'location must reference an existing company',
  $sql$INSERT INTO locations (id, company_id, name, status, updated_at)
       VALUES ('loc_missing', 'missing_company', 'X', 'ACTIVE', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'role must reference an existing company',
  $sql$INSERT INTO roles (id, company_id, key, name, visibility_scope, updated_at)
       VALUES ('role_missing', 'missing_company', 'OWNER', 'Owner', 'ALL_BRANCHES', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'cross-company role assignment is rejected',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_cross_role', 'usr_m3', 'co_a', 'crossrole', 'role_b', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'cross-company location assignment is rejected',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, location_id, updated_at)
       VALUES ('mem_cross_loc', 'usr_m3', 'co_a', 'crossloc', 'role_a_branch', 'loc_b', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'same-company role and location are accepted',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, location_id, updated_at)
       VALUES ('mem_same', 'usr_m3', 'co_a', 'same', 'role_a_branch', 'loc_a', NOW())$sql$,
  NULL
);

SELECT pg_temp.expect_sqlstate(
  'null location_id is accepted for all-branch access',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_all', 'usr_m5', 'co_a', 'allbranches', 'role_a', NOW())$sql$,
  NULL
);

-- Phase F1: role scope and membership location agree (trigger), and role permissions.

SELECT pg_temp.expect_sqlstate(
  'all-branch role cannot carry a location',
  $sql$UPDATE memberships SET location_id = 'loc_a' WHERE id = 'mem_all'$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'branch role must carry a location',
  $sql$UPDATE memberships SET location_id = NULL WHERE id = 'mem_same'$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'role scope cannot change under its members',
  $sql$UPDATE roles SET visibility_scope = 'ALL_BRANCHES' WHERE id = 'role_a_branch'$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'permission level is stored',
  $sql$INSERT INTO role_permissions (id, company_id, role_id, area, level, updated_at)
       VALUES ('rp_ok', 'co_a', 'role_a', 'finance', 'ADMIN', NOW())$sql$,
  NULL
);

SELECT pg_temp.expect_sqlstate(
  'NONE is never stored',
  $sql$INSERT INTO role_permissions (id, company_id, role_id, area, level, updated_at)
       VALUES ('rp_none', 'co_a', 'role_a', 'gold', 'NONE', NOW())$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'administration areas stop at WRITE',
  $sql$INSERT INTO role_permissions (id, company_id, role_id, area, level, updated_at)
       VALUES ('rp_admin', 'co_a', 'role_a', 'users', 'ADMIN', NOW())$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'permission role must be in the same company',
  $sql$INSERT INTO role_permissions (id, company_id, role_id, area, level, updated_at)
       VALUES ('rp_cross', 'co_a', 'role_b', 'finance', 'READ', NOW())$sql$,
  '23503'
);

SELECT pg_temp.expect_sqlstate(
  'one level per role and area',
  $sql$INSERT INTO role_permissions (id, company_id, role_id, area, level, updated_at)
       VALUES ('rp_dup', 'co_a', 'role_a', 'finance', 'READ', NOW())$sql$,
  '23505'
);

SELECT indexname
FROM pg_indexes
WHERE indexname IN (
  'users_platform_username_lower_key',
  'memberships_company_username_lower_key',
  'companies_code_lower_key',
  'memberships_company_id_username_key',
  'memberships_user_id_key',
  'companies_code_key',
  'roles_company_id_id_key',
  'locations_company_id_id_key',
  'memberships_company_id_id_key',
  'role_permissions_company_id_role_id_area_key'
)
ORDER BY indexname;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'users_username_by_kind_check',
  'roles_company_id_id_key',
  'locations_company_id_id_key',
  'memberships_company_id_role_id_fkey',
  'memberships_company_id_location_id_fkey',
  'memberships_role_id_fkey',
  'memberships_location_id_fkey'
)
ORDER BY conname;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname IN ('memberships_role_id_fkey', 'memberships_location_id_fkey')
  ) THEN
    RAISE EXCEPTION 'old single-column membership foreign keys are still present';
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'users_username_by_kind_check',
      'memberships_company_id_role_id_fkey',
      'memberships_company_id_location_id_fkey'
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'company integrity foreign keys are missing';
  END IF;

  IF (
    SELECT count(*) FROM pg_indexes
    WHERE indexname IN ('roles_company_id_id_key', 'locations_company_id_id_key')
  ) <> 2 THEN
    RAISE EXCEPTION 'company identity unique indexes are missing';
  END IF;
END $$;
