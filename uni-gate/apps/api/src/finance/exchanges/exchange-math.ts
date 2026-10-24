import { Currency, ExchangeType } from '@prisma/client';

/** شراء دولار = دفع ليرة واستلام دولار. بيع = العكس. */
export function exchangeDirection(type: ExchangeType) {
  if (type === ExchangeType.BUY) {
    return { from: Currency.SYP, to: Currency.USD };
  }
  return { from: Currency.USD, to: Currency.SYP };
}

/** سعر الصرف = ليرات مقابل دولار واحد. الإجمالي بعملة الوجهة. */
export function convertByRate(amount: number, rate: number, from: Currency, to: Currency) {
  if (!amount || rate <= 0) return 0;
  if (from === to) return roundFx(amount, to);
  if (from === Currency.SYP && to === Currency.USD) return roundFx(amount / rate, to);
  return roundFx(amount * rate, to);
}

function roundFx(value: number, currency: Currency) {
  if (currency === Currency.SYP) return Math.round(value);
  return Math.round(value * 100) / 100;
}
