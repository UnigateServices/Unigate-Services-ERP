# الوثائق داخل المستودع

هذا المجلد للوثائق **المرتبطة بالكود** فقط. الخطط الطويلة ومراجع المعايير ومواد العملاء في الأرشيف الخارجي.

**الأرشيف:** `D:\Projects\unigate-erp-finance-docs-archive\`

| داخل الأرشيف | الغرض |
|--------------|--------|
| `reference/ifrs-2027/` | معايير العرض والإفصاح (مرجع محاسبي — لا يُبنى منه التطبيق مباشرة) |
| `business/tradivia-client/` | مواد عميل TRADIVIA (عروض، متطلبات) |
| `work/` | ملفات عمل مؤقتة (Word، scratch) |
| `snapshots/` | لقطات مسارات API وجداول |
| `plans/` | خطط مشروع وعقد دمج ERP |
| `reference/` | GAS، رموز هوية، خطط UNI GATE |

**مصدر الحقيقة أثناء التطوير**

- API: `apps/api/src/**/*.controller.ts`
- قاعدة البيانات: `packages/database/prisma/schema.prisma`
- الواجهة: `apps/web/`
- الهوية: `apps/web/app/brand-tokens.css`

**المنتج:** UNI GATE Services ERP — Finance. **TRADIVIA** = مستأجر تجريبي في seed وليس اسم المنتج.
