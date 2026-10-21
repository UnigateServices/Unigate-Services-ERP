-- Account 1300 is the control account of the borrower custody sub-ledger, not a loose "advances" bucket.
UPDATE "accounts" SET "name" = 'عهد وسلف المستلفين' WHERE "code" = '1300' AND "system" = true;
