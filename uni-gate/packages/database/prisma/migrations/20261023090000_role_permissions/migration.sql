-- Phase F1: role permissions by area.
--
-- 1. RolePermission: one level per role and area. A missing row is NONE.
-- 2. can_manage_users moves into the table as area "users" level WRITE, then the column is dropped.
-- 3. memberships gets a unique (company_id, id) for later composite foreign keys (finance actors).
-- 4. A trigger keeps role scope and membership location in agreement. Until now only
--    application locks enforced that.

-- Runs first, before any change: stop if existing data already breaks the scope rule
-- enforced at the end of this file. Fix those memberships, then run the migration again.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM "memberships" m JOIN "roles" r ON r."id" = m."role_id"
  WHERE (r."visibility_scope" = 'ALL_BRANCHES' AND m."location_id" IS NOT NULL)
     OR (r."visibility_scope" <> 'ALL_BRANCHES' AND m."location_id" IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'ROLE_SCOPE_MISMATCH: % membership(s) do not match their role scope. Fix them before this migration.', bad;
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('NONE', 'READ', 'WRITE', 'APPROVE', 'ADMIN');

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "level" "PermissionLevel" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_company_id_role_id_area_key" ON "role_permissions"("company_id", "role_id", "area");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_company_id_id_key" ON "memberships"("company_id", "id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_company_id_role_id_fkey" FOREIGN KEY ("company_id", "role_id") REFERENCES "roles"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma does not model these checks. NONE is never stored, and the administration
-- areas accept READ or WRITE only.
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_level_not_none_check" CHECK ("level" <> 'NONE');
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_admin_area_level_check"
  CHECK ("area" NOT IN ('users', 'branches', 'roles') OR "level" IN ('READ', 'WRITE'));
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_area_format_check"
  CHECK ("area" ~ '^[a-z][a-z0-9_]{1,40}$');

-- Move existing data. Every role could list branches before, so every role keeps READ there.
-- A role that could manage users keeps that (users WRITE) and keeps reading the role list (roles READ).
INSERT INTO "role_permissions" ("id", "company_id", "role_id", "area", "level", "updated_at")
SELECT 'rp' || replace(gen_random_uuid()::text, '-', ''), r."company_id", r."id", 'branches', 'READ', CURRENT_TIMESTAMP
FROM "roles" r;

INSERT INTO "role_permissions" ("id", "company_id", "role_id", "area", "level", "updated_at")
SELECT 'rp' || replace(gen_random_uuid()::text, '-', ''), r."company_id", r."id", 'users', 'WRITE', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."can_manage_users" = true;

INSERT INTO "role_permissions" ("id", "company_id", "role_id", "area", "level", "updated_at")
SELECT 'rp' || replace(gen_random_uuid()::text, '-', ''), r."company_id", r."id", 'roles', 'READ', CURRENT_TIMESTAMP
FROM "roles" r
WHERE r."can_manage_users" = true;

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "can_manage_users";

-- Role scope and membership location must agree:
-- ALL_BRANCHES has no location, BRANCH and OWN have one.
-- The membership side locks the role row (FOR SHARE), so a concurrent scope change
-- waits and then sees this membership.
CREATE FUNCTION "membership_scope_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  scope "VisibilityScope";
BEGIN
  SELECT "visibility_scope" INTO scope FROM "roles" WHERE "id" = NEW."role_id" FOR SHARE;
  IF scope IS NULL THEN
    RETURN NEW;
  END IF;
  IF (scope = 'ALL_BRANCHES' AND NEW."location_id" IS NOT NULL)
     OR (scope <> 'ALL_BRANCHES' AND NEW."location_id" IS NULL) THEN
    RAISE EXCEPTION 'ROLE_SCOPE_MISMATCH: membership % does not match role scope %', NEW."id", scope
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "memberships_scope_check"
BEFORE INSERT OR UPDATE OF "role_id", "location_id" ON "memberships"
FOR EACH ROW EXECUTE FUNCTION "membership_scope_check"();

CREATE FUNCTION "role_scope_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "memberships" m
    WHERE m."role_id" = NEW."id"
      AND ((NEW."visibility_scope" = 'ALL_BRANCHES' AND m."location_id" IS NOT NULL)
        OR (NEW."visibility_scope" <> 'ALL_BRANCHES' AND m."location_id" IS NULL))
  ) THEN
    RAISE EXCEPTION 'ROLE_SCOPE_MISMATCH: role % has members that do not match scope %', NEW."id", NEW."visibility_scope"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "roles_scope_check"
BEFORE UPDATE OF "visibility_scope" ON "roles"
FOR EACH ROW
WHEN (OLD."visibility_scope" IS DISTINCT FROM NEW."visibility_scope")
EXECUTE FUNCTION "role_scope_check"();
