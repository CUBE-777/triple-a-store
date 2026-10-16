-- =====================================================================
-- Triple A — التحقق من ترحيل المعرض (006–008) بعد تنفيذه في Supabase → SQL Editor
-- كل الاختبارات أدناه إما قراءة فقط أو داخل معاملة تنتهي بـ rollback، فلا تترك أي بيانات.
-- نفّذ كل كتلة (بين الفواصل) على حدة وقارن بالنتيجة المتوقعة في التعليق.
-- ⚠ لم يُنفَّذ هذا الملف ولا الترحيلات في بيئة اختبار حقيقية قبل تسليمك المشروع.
-- =====================================================================

-- [1] الجداول موجودة وRLS مفعّل عليها.   المتوقع: 3 صفوف وكلها rls_enabled = true
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('portfolio_projects','portfolio_categories','portfolio_collections')
order by 1;

-- [2] السياسات.   المتوقع: 6 صفوف (قراءة عامة + إدارة لكل جدول)، ولا سياسة للأدوار anon في الكتابة
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' and tablename like 'portfolio\_%'
order by tablename, policyname;

-- [3] صلاحيات anon على الجداول.   المتوقع: SELECT فقط
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public' and table_name like 'portfolio\_%'
order by 1, 2;

-- [4] البيانات المبدئية.   المتوقع: 5 فئات، مجموعة واحدة، ومشروع واحد (إن نفّذت 008)
select (select count(*) from public.portfolio_categories)  as categories,
       (select count(*) from public.portfolio_collections) as collections,
       (select count(*) from public.portfolio_projects)    as projects;

-- [5] الزائر (anon) يقرأ المنشور فقط.  المتوقع: لا صفوف غير منشورة
begin;
  set local role anon;
  select slug, is_published from public.portfolio_projects;           -- كلها is_published = true
rollback;

-- [6] الزائر (anon) لا يستطيع الكتابة.   المتوقع: ERROR 42501 (permission denied / row-level security)
begin;
  set local role anon;
  insert into public.portfolio_projects (slug, category_slug, title)
  values ('hack-test', 'graphic-design', '{"en":"x"}'::jsonb);
rollback;

-- [7] مستخدم مسجَّل غير مسؤول لا يستطيع الكتابة.
--     استبدل UUID بمعرّف مستخدم عادي (ليس في admin_users) ثم نفّذ.   المتوقع: ERROR 42501
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   insert into public.portfolio_projects (slug, category_slug, title)
--   values ('hack-test', 'graphic-design', '{"en":"x"}'::jsonb);
-- rollback;

-- [8] قيد الشكل يعمل على الخادم (عنوان فارغ مرفوض) — يحتاج مسؤولاً، لذا نجرّبه كمالك قاعدة البيانات.
--     المتوقع: ERROR 23514 (violates check constraint "pp_title_shape")
begin;
  insert into public.portfolio_projects (slug, category_slug, title)
  values ('check-test', 'graphic-design', '{"ar":"  ","en":""}'::jsonb);
rollback;
