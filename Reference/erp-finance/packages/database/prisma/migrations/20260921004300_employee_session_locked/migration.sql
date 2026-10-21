-- Idle screen lock: persist on the employee so refresh cannot bypass it.
ALTER TABLE "employees" ADD COLUMN "session_locked" BOOLEAN NOT NULL DEFAULT false;
