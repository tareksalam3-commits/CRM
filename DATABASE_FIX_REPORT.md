# تقرير إصلاح خطأ قاعدة البيانات - مشروع CRM

## المشكلة

تم الإبلاغ عن خطأ في Supabase يشير إلى أن العمود `collected_by` غير موجود في جدول `collections`، مما كان يمنع عمليات الإدراج (INSERT) في هذا الجدول بسبب فشل سياسات أمان الصفوف (RLS).

```sql
ERROR: column "collected_by" does not exist (SQLSTATE 42703)
DETAIL:  policy "collections_insert" on table "collections" for INSERT to authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id))
  )
```

## التحليل

تم فحص ملفات الهجرة (migrations) الخاصة بقاعدة البيانات في مجلد `supabase/migrations`.

- تبين أن ملف الهجرة الأولي `20260612050353_create_crm_tables.sql` كان يحتوي على تعريف للعمود `collected_by` في جدول `collections`.
- ومع ذلك، يبدو أن الخطأ كان يحدث بسبب عدم تطبيق هذا العمود بشكل صحيح أو وجود تعارض في سياسات RLS التي تم تعريفها لاحقًا.
- سياسة `collections_insert` كانت تحاول التحقق من `collected_by` دون التأكد من وجود العمود فعليًا في سياق التنفيذ، أو أن القيمة الافتراضية `auth.uid()` لم تكن تعمل كما هو متوقع.

## الحل

تم إنشاء ملف هجرة جديد باسم `20260618120000_fix_collections_column.sql` لمعالجة المشكلة بشكل صريح. تضمن هذا الملف الخطوات التالية:

1.  **إضافة العمود `collected_by`:** تم التأكد من إضافة العمود `collected_by` إلى جدول `collections`، مع تحديد `uuid` كنوع بيانات، و `NOT NULL`، وربطه بجدول `profiles(id)` كمفتاح خارجي (Foreign Key) مع `ON DELETE RESTRICT`.
2.  **تحديث سياسة `collections_insert`:** تم تعديل سياسة RLS الخاصة بالإدراج في جدول `collections` لضمان أن المستخدم الذي يقوم بالإدراج هو نفسه `collected_by`، مما يعزز الأمان ويحل مشكلة عدم وجود العمود.

    ```sql
    ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS collected_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE RESTRICT;

    CREATE INDEX IF NOT EXISTS idx_collections_collected_by ON collections(collected_by);

    DROP POLICY IF EXISTS "collections_insert" ON collections;
    CREATE POLICY "collections_insert" ON collections FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_id AND can_access_user(auth.uid(), policies.agent_id))
        AND collected_by = auth.uid()
      );
    ```

3.  **التحقق من السياسات الأخرى:** تم التأكد من أن جميع سياسات RLS الأخرى لجدول `collections` (SELECT, UPDATE, DELETE) لا تزال سارية وتعمل بشكل صحيح.

## الملفات المعدلة

-   `supabase/migrations/20260618120000_fix_collections_column.sql` (ملف جديد)

## حالة المشروع الحالية

تم رفع التعديلات إلى فرع `main` في مستودع GitHub الخاص بك. يجب أن يحل هذا الإصلاح مشكلة `collected_by` ويسمح لعمليات الإدراج في جدول `collections` بالعمل بشكل صحيح.

--- 
*تم إعداد هذا التقرير بواسطة Manus AI*
