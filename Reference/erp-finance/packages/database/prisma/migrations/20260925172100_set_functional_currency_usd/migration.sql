-- Rows created before the currency choice existed used the old SYP default.
UPDATE "accounting_policies" SET "functional_currency" = 'USD' WHERE "functional_currency" = 'SYP';
