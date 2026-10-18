# TRADIVIA Finance v2

نظام مالي متقدم لشركة TRADIVIA — هجرة من Google Apps Script إلى TypeScript + NestJS + Next.js + PostgreSQL.

> **هذا ليس UNI GATE ERP الكامل.**  
> مشروع تسليم لعميل واحد (TRADIVIA) خلال 2–3 أسابيع، ثم يُدمَج قسم المالية لاحقاً في منصة UNI GATE ERP.

## الوثائق الأساسية

| الملف | الغرض |
|-------|--------|
| [`docs/خطة_مشروع_TRADIVIA_Finance_v2.md`](docs/خطة_مشروع_TRADIVIA_Finance_v2.md) | خطة المشروع — اقرأها أولاً (أنت + Cursor AI) |
| [`docs/دليل_المصطلحات_التقنية_الشامل.md`](docs/دليل_المصطلحات_التقنية_الشامل.md) | دليل المصطلحات التقنية |
| [`docs/database-schema.md`](docs/database-schema.md) | ربط جداول GAS → PostgreSQL |
| [`docs/reference/unigate-theme/`](docs/reference/unigate-theme/) | ألوان هوية UNI GATE المعتمدة |
| [`docs/reference/legacy-gas/`](docs/reference/legacy-gas/) | **مرجع فقط** — كود GAS القديم (لا يُشغَّل من هنا) |

## المكدس

- **Frontend:** React + Next.js (واجهة عربية RTL)
- **Backend:** NestJS
- **Database:** PostgreSQL + Prisma
- **Language:** TypeScript

## هيكل المستودع

```
apps/api          NestJS — الخادم و API
apps/web          Next.js — الواجهة
packages/database Prisma schema + Prisma Client
```

## التشغيل المحلي

المتطلبات: Node.js 20+، Docker (أو PostgreSQL محلي).

```powershell
# 1) تثبيت الحزم (يولّد Prisma Client تلقائياً)
npm install

# 2) تشغيل PostgreSQL
docker compose up -d

# 3) إنشاء الجداول (أول مرة)
npm run db:migrate

# 4) تشغيل الخادم والواجهة معاً
npm run dev
```

- الواجهة: http://localhost:3000
- الدخول: http://localhost:3000/login
- API: http://localhost:3001/api/health

حسابات التطوير المحلية (بعد `npm run db:seed`) — كلمة المرور للجميع `Tradivia@dev`:

- المدير العام
- مشرف المكتب 1 / 2 / 3
- موظف المكتب 1 / 2 / 3

أوامر مفيدة:

```powershell
npm run dev:api    # NestJS فقط — المنفذ 3001
npm run dev:web    # Next.js فقط — المنفذ 3000
npm run db:studio  # واجهة Prisma لاستعراض الجداول
npm run db:seed    # موظف ومشرف تجريبيان
```

انسخ `.env.example` إلى `.env` إذا احتجت إعادة إنشاء ملف البيئة. لا ترفع `.env` إلى GitHub.

## النظام القديم (GAS)

المشروع الأصلي يبقى في `D:\Projects\TRADIVIA Company\` — إصلاحات طارئة فقط للعميل أثناء التطوير هنا.

---

*UNI GATE — TRADIVIA Finance v2*
