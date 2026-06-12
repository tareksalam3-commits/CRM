# Insurance CRM Pro

نظام إدارة الإنتاج والتحصيل لتأمينات الحياة.

---

## ⚡ طريقة التشغيل أول مرة (خطوة بخطوة)

### الخطوة 1 — إنشاء مشروع Supabase
1. اذهب إلى [supabase.com](https://supabase.com) وأنشئ حساباً جديداً
2. انقر **New Project** واختر اسماً (مثلاً `insurance-crm`)
3. ضع كلمة مرور قوية لقاعدة البيانات واحفظها
4. انتظر ~2 دقيقة حتى يجهز المشروع

### الخطوة 2 — نسخ بيانات الاتصال
من لوحة Supabase → **Settings → API**، انسخ:
- `Project URL` → هذا هو `VITE_SUPABASE_URL`
- `anon / public` key → هذا هو `VITE_SUPABASE_ANON_KEY`

### الخطوة 3 — تجهيز الملف المحلي
```bash
git clone <your-repo>
cd CRM-final
npm install
cp .env.example .env
```
افتح `.env` وضع البيانات:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### الخطوة 4 — تهيئة قاعدة البيانات
في Supabase → **SQL Editor** → **New Query**، شغّل الملفين **بالترتيب**:

**أولاً:**
```
supabase/migrations/20260612050353_create_crm_tables.sql
```

**ثانياً:**
```
supabase/migrations/20260612050426_create_rls_policies.sql
```

> انسخ محتوى كل ملف والصقه في SQL Editor ثم اضغط **Run**

### الخطوة 5 — إنشاء أول مستخدم (Super Admin)

**أ. من Supabase → Authentication → Users → Add User:**
- أدخل البريد الإلكتروني وكلمة المرور
- ✅ تأكد من تفعيل **"Auto Confirm User"**

**ب. من SQL Editor، شغّل هذا الأمر (استبدل البيانات):**
```sql
INSERT INTO profiles (id, full_name, email, phone, role)
SELECT 
  id,
  'اسم المدير هنا',
  email,
  '01000000000',
  'super_admin'
FROM auth.users
WHERE email = 'admin@example.com';  -- ← ضع الإيميل الذي أنشأته
```

> هذا الأمر يجلب الـ UUID تلقائياً من جدول `auth.users` بدون الحاجة لنسخه يدوياً.

### الخطوة 6 — تشغيل التطبيق
```bash
npm run dev
```
افتح المتصفح على: **http://localhost:5173**

سجّل الدخول بالبريد وكلمة المرور اللي أنشأتهم في الخطوة 5.

---

## 🚀 النشر على Vercel
1. ارفع المشروع على GitHub
2. من [vercel.com](https://vercel.com) → **New Project** → اختر الـ repo
3. في **Environment Variables** أضف:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. اضغط **Deploy**

---

## 📋 أوامر مفيدة
```bash
npm run dev        # تشغيل للتطوير
npm run build      # بناء للإنتاج
npm run preview    # معاينة بناء الإنتاج
npm run typecheck  # فحص TypeScript بحثاً عن أخطاء
npm run lint       # فحص جودة الكود
```

---

## 🏗️ هيكل المشروع
```
src/
├── components/
│   ├── audit/         # سجل العمليات
│   ├── clients/       # إدارة العملاء
│   ├── closing/       # تقفيل الشهر
│   ├── collections/   # إدارة التحصيل
│   ├── common/        # مكونات مشتركة (Sidebar, Layout, ...)
│   ├── dashboard/     # لوحة التحكم
│   ├── notifications/ # الإشعارات
│   ├── policies/      # إدارة الوثائق
│   ├── reports/       # التقارير
│   ├── settings/      # إعدادات النظام
│   ├── targets/       # التارجتات
│   ├── tasks/         # المهام
│   └── users/         # إدارة المستخدمين
├── contexts/          # AuthContext, ThemeContext
├── lib/               # supabase client, utils
├── pages/             # LoginPage
└── types/             # TypeScript types & constants
supabase/migrations/   # SQL schema & RLS policies
```

---

## 👥 التسلسل الوظيفي
| الدور | الصلاحيات |
|-------|-----------|
| `super_admin` | كامل الصلاحيات |
| `sales_manager` | إدارة المبيعات والتقارير |
| `general_supervisor` | إشراف عام |
| `supervisor` | إشراف على المجموعات |
| `group_leader` | إدارة مجموعة |
| `agent` | عمليات يومية فقط |
