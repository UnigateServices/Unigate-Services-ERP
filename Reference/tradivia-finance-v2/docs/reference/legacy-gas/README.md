# مرجع النظام القديم (Google Apps Script)

> **⚠️ للقراءة والمرجع فقط — لا يُشغَّل ولا يُعدَّل من هذا المجلد.**

هذا المجلد يحتوي نسخة من نظام TRADIVIA الأصلي المبني على Google Apps Script + Google Sheets.

## الغرض

عند تطوير TRADIVIA Finance v2، استخدم هذه الملفات لفهم:

- **قواعد العمل المالية** — كيف تُحسب الأرصدة، الموافقات، السلف، التصريف
- **شكل الواجهة** — شاشات الموظف والمشرف
- **أسماء الجداول والحقول** — للمطابقة مع PostgreSQL

## الملفات الرئيسية

| الملف | المحتوى |
|-------|---------|
| `Code.js` | كل منطق الخادم (~4800 سطر) |
| `Employee*.html` | واجهة الموظف |
| `Supervisor*.html` | واجهة المشرف |
| `Login*.html` | تسجيل الدخول |
| `Global*.html` | CSS/JS مشترك |
| `appsscript.json` | إعدادات GAS |
| `.clasp.json` | إعدادات النشر (clasp) |

## جداول Google Sheets (مرجع)

- Incomes, Outcomes, Exchanges, Transfers, Advances
- Opening_Balances, Audit_Trail, Notifications
- Employees, Borrowers, Projects, Banks

## المصدر الأصلي

`D:\Projects\TRADIVIA Company\` — المستودع GitHub القديم (GAS)

---

*لا تنسخ هذا الكود إلى `apps/api` أو `apps/web` — أعد كتابة المنطق على NestJS + Next.js.*
