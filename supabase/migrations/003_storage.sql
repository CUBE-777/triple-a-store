-- =====================================================================
-- Triple A Store — 003: التخزين (Storage)
--  • product-images : عام للقراءة (صور المنتجات مخصّصة للعرض)، الكتابة للمسؤول فقط
--  • digital-files  : خاص بالكامل، لا يمكن لأي زائر قراءته؛ المسؤول يولّد روابط موقّعة مؤقتة
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 50MB = الحد الأقصى للملف الواحد في الخطة المجانية
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('digital-files', 'digital-files', false, 52428800, null)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit;

-- الـbucket العام لا يحتاج سياسة قراءة لعرض الصور عبر الرابط العام،
-- ولذلك لا نمنح الزوار صلاحية "عرض قائمة الملفات" (list).
drop policy if exists "admin read store files"   on storage.objects;
drop policy if exists "admin upload store files" on storage.objects;
drop policy if exists "admin update store files" on storage.objects;
drop policy if exists "admin delete store files" on storage.objects;

create policy "admin read store files" on storage.objects
  for select to authenticated
  using (bucket_id in ('product-images','digital-files') and public.is_admin());

create policy "admin upload store files" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-images','digital-files') and public.is_admin());

create policy "admin update store files" on storage.objects
  for update to authenticated
  using (bucket_id in ('product-images','digital-files') and public.is_admin())
  with check (bucket_id in ('product-images','digital-files') and public.is_admin());

create policy "admin delete store files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-images','digital-files') and public.is_admin());
