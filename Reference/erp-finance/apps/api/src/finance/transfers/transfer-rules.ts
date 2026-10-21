import { FundType } from '@prisma/client';

/** نفس الصندوق ممنوع إلا بنك→بنك بحسابين مختلفين. */
export function isSameFundTransfer(
  fromFund: FundType,
  toFund: FundType,
  fromBankId: string | null,
  toBankId: string | null,
) {
  if (fromFund !== toFund) return false;
  if (fromFund === FundType.BANK && fromBankId && toBankId && fromBankId !== toBankId) {
    return false;
  }
  return true;
}
