-- A membership must cite a role, and a location when it has one, from its own company.
-- The previous foreign keys only proved that the role or location row existed.
-- ON DELETE RESTRICT replaces SET NULL on location_id. Clearing location_id
-- through the composite key would also clear company_id. Branches are deactivated.

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_location_id_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_role_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_id_key" ON "locations"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_id_key" ON "roles"("company_id", "id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_role_id_fkey" FOREIGN KEY ("company_id", "role_id") REFERENCES "roles"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_location_id_fkey" FOREIGN KEY ("company_id", "location_id") REFERENCES "locations"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
