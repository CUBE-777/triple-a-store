-- =====================================================================
-- Triple A Store — 004 (اختياري): أقسام مبدئية فقط — لا منتجات وهمية.
-- يمكنك تعديلها أو حذفها لاحقاً من لوحة الإدارة.
-- =====================================================================
do $$
declare
  rec record; cid uuid;
begin
  for rec in select * from (values
    ('drawing-tools',        10, 'أدوات الرسم',            'Matériel de dessin',        'Drawing tools'),
    ('photography',          20, 'التصوير والإضاءة',       'Photo & éclairage',         'Photography & lighting'),
    ('computer-accessories', 30, 'إكسسوارات الحاسوب',      'Accessoires informatiques', 'Computer accessories'),
    ('digital-templates',    40, 'قوالب رقمية',            'Modèles numériques',        'Digital templates'),
    ('design-services',      50, 'خدمات التصميم',          'Services de design',        'Design services'),
    ('web-services',         60, 'خدمات المواقع',          'Services web',              'Web services')
  ) as v(slug, sort_order, ar, fr, en)
  loop
    insert into public.categories (slug, sort_order) values (rec.slug, rec.sort_order)
      on conflict (slug) do nothing;
    select id into cid from public.categories where slug = rec.slug;
    insert into public.category_translations (category_id, language, name) values
      (cid, 'ar', rec.ar), (cid, 'fr', rec.fr), (cid, 'en', rec.en)
      on conflict (category_id, language) do nothing;
  end loop;
end $$;
