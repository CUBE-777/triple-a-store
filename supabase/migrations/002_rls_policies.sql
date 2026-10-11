-- =====================================================================
-- Triple A Store — 002: سياسات الأمان (Row Level Security)
-- القاعدة: الزوار يقرؤون المنشور فقط. الكتابة للمسؤولين فقط ويفرضها الخادم.
-- =====================================================================

-- هل المستخدم الحالي مسؤول؟ (security definer كي لا تتعارض مع RLS على admin_users)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.categories            enable row level security;
alter table public.category_translations enable row level security;
alter table public.products              enable row level security;
alter table public.product_translations  enable row level security;
alter table public.product_private       enable row level security;
alter table public.admin_users           enable row level security;

-- ---- صلاحيات الجداول (طبقة دفاع إضافية فوق RLS)
revoke all on public.categories, public.category_translations, public.products,
              public.product_translations, public.product_private, public.admin_users
  from anon, authenticated;
grant select on public.categories, public.category_translations,
                public.products, public.product_translations to anon, authenticated;
grant insert, update, delete on public.categories, public.category_translations,
                public.products, public.product_translations to authenticated;
grant select, insert, update, delete on public.product_private to authenticated;
grant select on public.admin_users to authenticated;   -- يرى المستخدم صفّه فقط (سياسة أدناه)

-- ---- القراءة العامة: المنشور / الفعّال فقط
drop policy if exists "public read active categories" on public.categories;
create policy "public read active categories" on public.categories
  for select to anon, authenticated using (is_active);

drop policy if exists "public read active category names" on public.category_translations;
create policy "public read active category names" on public.category_translations
  for select to anon, authenticated using (
    exists (select 1 from public.categories c where c.id = category_id and c.is_active));

drop policy if exists "public read published products" on public.products;
create policy "public read published products" on public.products
  for select to anon, authenticated using (is_published);

drop policy if exists "public read published product texts" on public.product_translations;
create policy "public read published product texts" on public.product_translations
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_published));

-- ---- الإدارة: كل العمليات للمسؤولين فقط
drop policy if exists "admin all categories" on public.categories;
create policy "admin all categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all category names" on public.category_translations;
create policy "admin all category names" on public.category_translations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all products" on public.products;
create policy "admin all products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all product texts" on public.product_translations;
create policy "admin all product texts" on public.product_translations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all product private" on public.product_private;
create policy "admin all product private" on public.product_private
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- admin_users: يقرأ المستخدم صفّه فقط. لا insert/update/delete من التطبيق إطلاقاً.
drop policy if exists "read own admin row" on public.admin_users;
create policy "read own admin row" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));
