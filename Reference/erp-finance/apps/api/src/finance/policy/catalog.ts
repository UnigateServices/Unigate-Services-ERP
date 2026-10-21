export const CURRENCY_CATALOG: { code: string; name: string }[] = [
  { code: 'USD', name: 'دولار أمريكي' },
  { code: 'SYP', name: 'ليرة سورية' },
  { code: 'EUR', name: 'يورو' },
  { code: 'GBP', name: 'جنيه إسترليني' },
  { code: 'TRY', name: 'ليرة تركية' },
  { code: 'AED', name: 'درهم إماراتي' },
  { code: 'SAR', name: 'ريال سعودي' },
  { code: 'JOD', name: 'دينار أردني' },
  { code: 'LBP', name: 'ليرة لبنانية' },
  { code: 'IQD', name: 'دينار عراقي' },
  { code: 'EGP', name: 'جنيه مصري' },
  { code: 'QAR', name: 'ريال قطري' },
  { code: 'KWD', name: 'دينار كويتي' },
  { code: 'CHF', name: 'فرنك سويسري' },
  { code: 'CAD', name: 'دولار كندي' },
  { code: 'CNY', name: 'يوان صيني' },
];

export const CURRENCY_CODES = CURRENCY_CATALOG.map((row) => row.code);
