\set ON_ERROR_STOP on

INSERT INTO companies (id, name, code, status, price_usd, expires_on, updated_at) VALUES
  ('co_a', 'Company A', 'alpha', 'ACTIVE', 10.00, DATE '2026-10-04', NOW()),
  ('co_b', 'Company B', 'beta', 'ACTIVE', 10.00, DATE '2026-10-04', NOW());

INSERT INTO locations (id, company_id, name, status, updated_at) VALUES
  ('loc_a', 'co_a', 'Branch A', 'ACTIVE', NOW()),
  ('loc_b', 'co_b', 'Branch B', 'ACTIVE', NOW());

INSERT INTO roles (id, company_id, key, name, visibility_scope, updated_at) VALUES
  ('role_a', 'co_a', 'OWNER', 'Owner', 'ALL_BRANCHES', NOW()),
  ('role_b', 'co_b', 'OWNER', 'Owner', 'ALL_BRANCHES', NOW());

INSERT INTO users (id, kind, username, password_hash, status, updated_at) VALUES
  ('usr_op1', 'PLATFORM', 'operator', 'hash', 'ACTIVE', NOW()),
  ('usr_m1', 'MEMBER', NULL, 'hash', 'ACTIVE', NOW()),
  ('usr_m2', 'MEMBER', NULL, 'hash', 'ACTIVE', NOW()),
  ('usr_m3', 'MEMBER', NULL, 'hash', 'ACTIVE', NOW());

INSERT INTO memberships (id, user_id, company_id, username, role_id, location_id, updated_at) VALUES
  ('mem_a', 'usr_m1', 'co_a', 'owner', 'role_a', 'loc_a', NOW());

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
  $sql$INSERT INTO users (id, kind, username, password_hash, status, updated_at)
       VALUES ('usr_op2', 'PLATFORM', 'Operator', 'hash', 'ACTIVE', NOW())$sql$,
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
  $sql$INSERT INTO users (id, kind, username, password_hash, status, updated_at)
       VALUES ('usr_bad_member', 'MEMBER', 'someone', 'hash', 'ACTIVE', NOW())$sql$,
  '23514'
);

SELECT pg_temp.expect_sqlstate(
  'PLATFORM user must have a username',
  $sql$INSERT INTO users (id, kind, username, password_hash, status, updated_at)
       VALUES ('usr_bad_platform', 'PLATFORM', NULL, 'hash', 'ACTIVE', NOW())$sql$,
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
       VALUES ('mem_missing_loc', 'usr_m3', 'co_a', 'fourth', 'role_a', 'missing_loc', NOW())$sql$,
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
  'cross-company role assignment is not blocked by the current foreign keys',
  $sql$INSERT INTO memberships (id, user_id, company_id, username, role_id, updated_at)
       VALUES ('mem_cross_role', 'usr_m3', 'co_a', 'crossrole', 'role_b', NOW())$sql$,
  NULL
);

SELECT indexname
FROM pg_indexes
WHERE indexname IN (
  'users_platform_username_lower_key',
  'memberships_company_username_lower_key',
  'companies_code_lower_key',
  'memberships_company_id_username_key',
  'memberships_user_id_key',
  'companies_code_key'
)
ORDER BY indexname;

SELECT conname
FROM pg_constraint
WHERE conname = 'users_username_by_kind_check';
