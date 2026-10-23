# دليل البداية لمسؤول المالية

هذا الدليل لمن يتولى المالية. يشرح من أين يبدأ، وبأي ترتيب، وما القواعد. المرجع الكامل هو `docs/FINANCE_MERGE_PLAN.md` (القرارات في القسم 3، والتحضير في القسم 4).

الحالة (23 تشرين الأول 2026): الأساس جاهز لاستقبال المالية.

- **F1 مدموجة:** جدول الصلاحيات حسب المجال والمستوى.
- **المرحلة 11 مدموجة:** المدير يدير الفروع والأدوار بنفسه.
- **الخطوة التالية في المالية:** التحضير في القسم 4 من خطة الدمج، **داخل هذا المستودع**.

---

## 1. قبل أي شيء: تأكد أن النسخة هنا هي الأحدث

نسخة المالية في `Reference/erp-finance/` مأخوذة من مستودع المالية القديم، commit `77ce653` (18 تشرين الأول 2026). المستودع القديم مجمّد منذ 22 تشرين الأول.

- إذا لم تعمل في المستودع القديم بعد `77ce653`: لا شيء تفعله. أرشف المستودع القديم على GitHub (Settings ← Archive).
- إذا عملت بعده: انسخ آخر نسخة عندك إلى `Reference/erp-finance/` في فرع اسمه `finance-reference-sync`، بدون أي تعديل آخر، وافتح PR. بعد الدمج أرشف المستودع القديم.

من هنا فصاعداً لا تُعدّل المالية إلا في هذا المستودع.

## 2. تشغيل المالية على جهازك

المالية ما زالت تطبيقاً مستقلاً حتى المرحلة F3. لها قاعدة بياناتها على المنفذ `5432`، منفصلة عن قاعدة الأساس `unigate` على المنفذ `5433`. لا توجّه المالية إلى `5433`.

```powershell
git clone https://github.com/UnigateServices/Unigate-Services-ERP.git
cd Unigate-Services-ERP/Reference/erp-finance
# انسخ .env.example إلى .env إن وجد، واملأ DATABASE_URL لقاعدة المالية على 5432
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## 3. ترتيب العمل

كل بند: فرع مستقل، وPR، وتجربة يدوية في تطبيق المالية، ثم دمج. لا تبدأ بنداً قبل دمج السابق.

الترتيب هنا يختلف عن ترتيب القسم 4 في الخطة، **عمداً**: الاختبارات أولاً، كي تثبت أن الأرقام لم تتغير بعد كل تعديل كبير.

| # | الفرع | العمل | يُقبل عندما |
|---|---|---|---|
| P0 | `finance-prep-tests` | أمر واحد `npm test` يشغّل ملفات الاختبار الخمسة الموجودة، واختبارات جديدة لـ: القيود اليومية، والترحيل من العمليات، وفروقات العملة، والمطابقة. | `npm test` ينجح، والأرقام المتوقعة مكتوبة في الاختبارات. |
| P1 | `finance-prep-access` | كل فحوصات الأدوار (نحو 150 موضعاً) تنتقل إلى `apps/api/src/auth/access.ts`، وتُكتب **بالمستويات** لا بأسماء الأدوار (انظر القسم 4 هنا). | لا يبقى `role === '...'` ولا `Role.X` خارج `access.ts`. و`npm test` ينجح. |
| P2 | `finance-prep-company` | حذف `private get companyId()` و`DEFAULT_COMPANY_ID` (30 ملفاً)، واستعمال `actor.companyId` من المستخدم الحالي في كل دالة. | لا يبقى `DEFAULT_COMPANY_ID` في الكود. و`npm test` ينجح. |
| P3 | `finance-prep-lookups` | كل بحث أو تعديل أو حذف بالمعرّف يتضمن الشركة: `findFirst({ where: { id, companyId } })` بدل `findUnique({ where: { id } })`. | كل `findUnique` و`update` و`delete` بالمعرّف يمر بالشركة. |
| P4 | `finance-prep-isolation` | اختبار بشركتين: مستخدم الأولى لا يرى ولا يعدّل أي سجل من الثانية حتى بتخمين المعرّف. | الاختبار ينجح على كل نوع سجل رئيسي. |

بعد P4 تبدأ المرحلة F2 (المخطط)، ثم F3 (الـ API)، حسب القسم 5 من خطة الدمج.

## 4. كيف تُكتب `access.ts` كي يسهل الدمج (P1)

الأساس فيه الآن دالة `accessFor(auth, area)` في `uni-gate/apps/api/src/auth/access.ts`، وهي تعطي للمستخدم الحالي في مجال ما:

| الحقل | المعنى |
|---|---|
| `companyId` | الشركة من الجلسة |
| `level` | `NONE` < `READ` < `WRITE` < `APPROVE` < `ADMIN` |
| `visibility` | `ALL_BRANCHES` أو `BRANCH` أو `OWN` |
| `locationId` | فرع المستخدم (فارغ لكل الفروع) |
| `membershipId` | هوية المستخدم في الشركة (يحل محل `Employee.id` لاحقاً) |
| `editRequiresApproval` و`deleteRequiresApproval` | هل يحتاج تعديله أو حذفه موافقة |

اكتب `access.ts` في المالية بالشكل نفسه **من الآن**، وخذ القيم مؤقتاً من دور الموظف الحالي:

| دور المالية اليوم | `level` | `visibility` |
|---|---|---|
| `GENERAL_MANAGER` | `ADMIN` | `ALL_BRANCHES` |
| `SUPERVISOR` | `APPROVE` | `BRANCH` |
| `EMPLOYEE` | `WRITE` | `OWN` |
| `MONITOR` | `READ` | `ALL_BRANCHES` |

ثم اكتب كل الفحوصات بدلالة المستوى والنطاق فقط، مثل: `canRead` (`READ` أو أعلى)، و`canWrite` (`WRITE` أو أعلى)، و`canApprove` (`APPROVE` أو أعلى)، و`isFinanceAdmin` (`ADMIN`)، و`scopeWhere(actor)` (حسب `visibility`).

عند الدمج في F3 نستبدل مصدر القيم فقط (جدول `RolePermission` بدل دور الموظف)، وباقي كود المالية لا يتغير.

## 5. قواعد طوال التحضير

- كل جدول جديد فيه `companyId`، وكل قيد فريد جديد يبدأ بـ `companyId`.
- لا علاقات جديدة تشير إلى `Employee`.
- لا ميزات مالية جديدة، ولا إعادة تسمية لجداول أو مجلدات.
- لا تعديل داخل `uni-gate/` (الأساس) بدون اتفاق. إذا احتجت شيئاً من الأساس، اكتبه كطلب.
- لا ترقية Prisma إلى 8.

## 6. طريقة العمل

1. أداة الذكاء الاصطناعي عندك تبني البند على فرعه.
2. تفتح PR على `main`.
3. مراجعة مستقلة: أرسل رقم الـ PR لـ Claude في محادثة المشروع ليراجعه ويختبره.
4. تجربة يدوية في تطبيق المالية بالأدوار الأربعة.
5. دمج بعد القبول.

---

## 7. برومبت جاهز لأداة الذكاء الاصطناعي (للبند P0)

انسخه كما هو، وغيّر رقم البند في المرات التالية.

```text
You are working in the repository UnigateServices/Unigate-Services-ERP.
Finance code lives in Reference/erp-finance/ (a standalone NestJS + Prisma + Next.js app on its own
PostgreSQL, port 5432). Do not touch uni-gate/ (the foundation) and do not use the database on port 5433.

Read first, in this order:
1. docs/FINANCE_PREP_GUIDE.md (this task list and the rules in section 5)
2. docs/FINANCE_MERGE_PLAN.md, sections 3 and 4
3. uni-gate/apps/api/src/auth/access.ts (the foundation access model that finance must match later)

Task: item P0 from docs/FINANCE_PREP_GUIDE.md section 3, on a new branch named finance-prep-tests.
- Add one command, npm test, in Reference/erp-finance that runs every existing *.spec.ts file and fails
  when any of them fails.
- Add tests for journal entries, posting from operations, currency differences, and reconciliation.
  Each test states the exact expected numbers.
- Do not change finance behavior. If a test exposes a bug, stop and report it instead of fixing it.

When done: run npm test, list what you added, and stop. Do not merge and do not start the next item.
```
