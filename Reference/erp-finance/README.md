# UNI GATE Services ERP — Finance

وحدة **المالية** لمنصة **UNI GATE Services ERP**. تُطوَّر حالياً كتطبيق مستقل ثم تُدمَج كقسم مالي داخل ERP.

**المستأجر التجريبي الافتراضي:** شركة TRADIVIA (عميل pilot — بيانات `companyId = tradivia` في قاعدة البيانات).  
**النسخة القديمة للعميل:** Google Apps Script في `D:\Projects\TRADIVIA Company\` (إصلاحات طارئة فقط أثناء التطوير هنا).

## الوثائق والأرشيف

خطط المشروع، معايير IFRS، ومواد العملاء **خارج المستودع**:

`D:\Projects\unigate-erp-finance-docs-archive\`

| المسار في الأرشيف | المحتوى |
|-------------------|---------|
| `reference/ifrs-2027/` | PDFs معايير العرض والإفصاح (IFRS 18 ومرتبط) |
| `business/tradivia-client/` | عروض أسعار ومتطلبات عميل TRADIVIA |
| `work/quote-docx/` | سكربتات وملفات عمل Word مؤقتة |
| `snapshots/`, `plans/`, `reference/` | لقطات API/schema ومراجع أقدم |

راجع [`docs/README.md`](docs/README.md).

**مصدر الحقيقة للتطوير:** `packages/database/prisma/schema.prisma`، `apps/api`، `apps/web`.  
**الهوية البصرية:** `apps/web/app/brand-tokens.css`، `apps/web/public/brand/`.

## اسم المجلد المحلي (اختياري)

يُفضَّل أن يطابق اسم المستودع على القرص:

`D:\Projects\unigate-erp-finance\`

(إعادة تسمية المجلد لا تغيّر Git؛ حدّث مسار Cursor/IDE بعد النقل.)

## المكدس

- **Frontend:** React + Next.js (واجهة عربية RTL)
- **Backend:** NestJS
- **Database:** PostgreSQL + Prisma
- **Language:** TypeScript

## هيكل المستودع

```
apps/api          NestJS — API
apps/web          Next.js — الواجهة
packages/database Prisma schema + migrations + seed
```

## عبارات جاهزة (للمطور والوكيل)

| قل | الغرض |
|----|--------|
| **شغّل الخادم المحلي** | تشغيل على جهازك فقط — `npm run dev`، روابط `localhost`، **بدون** نفق |
| **شغّل النفق** | تجربة من الإنترنت — `npm run dev` + `npm run share:tunnel`، رابط `trycloudflare.com` للمشاركة |

التفاصيل في `.cursor/rules/dev-run-phrases.mdc`.

## التشغيل المحلي

المتطلبات: Node.js 20+، Docker (أو PostgreSQL محلي).

```powershell
npm install
docker compose up -d
npm run db:migrate
npm run dev
```

- الواجهة: http://localhost:3000
- الدخول: http://localhost:3000/login
- API: http://localhost:3001/api/health

حسابات التطوير (بعد `npm run db:seed`) — مستأجر TRADIVIA، كلمة المرور للجميع `Tradivia@dev`:

- المدير العام
- مشرف المكتب 1 / 2 / 3
- موظف المكتب 1 / 2 / 3

```powershell
npm run dev:api
npm run dev:web
npm run db:studio
npm run db:seed
```

انسخ `.env.example` إلى `.env` عند الحاجة. لا ترفع `.env` إلى Git.

## مشاركة تجريبية عبر الإنترنت (Cloudflare Quick Tunnel)

لإرسال رابط مثل `https://….trycloudflare.com` لشخص يجرب النظام من خارج شبكتك — **بدون** حساب Cloudflare. الرابط **مؤقت**: يختفي عند إيقاف `cloudflared` (لم يكن محفوظاً في Git؛ يُشغَّل محلياً كما في الأيام السابقة).

1. شغّل التطبيق: `npm run dev`
2. للزوار من الإنترنت، انسخ `.env.share.example` إلى `apps/web/.env.local` (يُفرغ `NEXT_PUBLIC_API_URL` حتى تمر طلبات `/api` عبر Next إلى Nest — نفس أصل الرابط العام).
3. أعد تشغيل الواجهة إذا كانت تعمل (`Ctrl+C` ثم `npm run dev` أو `npm run dev:web`).
4. ثبّت الأداة (مرة واحدة): `winget install Cloudflare.cloudflared`
5. افتح النفق:

```powershell
npm run share:tunnel
# أو: .\scripts\share-tunnel.ps1
```

انسخ رابط `https://….trycloudflare.com` من الطرفية وأرسله. **لا تستخدم** رابطاً قديماً بعد إيقاف النفق.

---

*UNI GATE Services — ERP Finance module*
