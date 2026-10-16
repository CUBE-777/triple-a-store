-- =====================================================================
-- Triple A — 007: فئات ومجموعات المعرض المبدئية (مطابقة تماماً لما في data.js بموقع المعرض)
-- مطلوب كي تظهر قوائم الفئات في لوحة الإدارة وتبقى فلاتر المعرض كما هي.
-- يتطلب 006. آمن لإعادة التشغيل: لا يعدّل أي صف موجود (on conflict do nothing).
-- يمكنك تعديل الأسماء لاحقاً من Supabase → Table Editor.
-- =====================================================================
insert into public.portfolio_categories (slug, service, names, sort_order) values
  ('web-development',  'Digital',  $j${"ar":"تطوير المواقع","fr":"Développement web","en":"Web Development"}$j$::jsonb,   10),
  ('graphic-design',   'Design',   $j${"ar":"التصميم الجرافيكي","fr":"Design graphique","en":"Graphic Design"}$j$::jsonb, 20),
  ('print',            'Printing', $j${"ar":"طباعة","fr":"Impression","en":"Print"}$j$::jsonb,                            30),
  ('video-motion',     'Design',   $j${"ar":"فيديو / موشن","fr":"Vidéo / Motion","en":"Video / Motion"}$j$::jsonb,         40),
  ('digital-services', 'Digital',  $j${"ar":"خدمات رقمية","fr":"Services digitaux","en":"Digital Services"}$j$::jsonb,     50)
on conflict (slug) do nothing;

insert into public.portfolio_collections (slug, category_slug, ratio, names, sort_order) values
  ('business-cards', 'graphic-design', '9/5', $j${"ar":"بطاقات الأعمال","fr":"Cartes de visite","en":"Business Cards"}$j$::jsonb, 10)
on conflict (slug) do nothing;
