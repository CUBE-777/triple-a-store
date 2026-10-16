-- =====================================================================
-- Triple A — 008 (اختياري لكن موصى به): نقل المشروع الوحيد الموجود حالياً في data.js إلى قاعدة البيانات
-- بنفس الـslug (فيبقى الرابط project.html?id=triple-a-business-card كما هو) وبنفس مسارات الصور المحلية
-- (assets/portfolio/...) التي تبقى داخل مجلد موقع المعرض — لا حاجة لإعادة رفع أي صورة.
--
-- لماذا هذا مهم؟ عندما يتصل المعرض بقاعدة البيانات بنجاح تصبح هي المصدر الوحيد للمشاريع.
-- فلو فعّلت الاتصال دون نقل هذا المشروع سيختفي من الموقع (يبقى في data.js كاحتياطي عند فشل الاتصال فقط).
-- يتطلب 006 و007. آمن لإعادة التشغيل: لا يعدّل صفاً موجوداً.
-- ملاحظة: الصور المحلية تظهر في الموقع العام لكن لا تُعرض مصغّراتها داخل لوحة الإدارة (سياسة CSP للمتجر لا
-- تسمح بصور من دومين آخر)؛ تظهر بدلها أيقونة بديلة. لاستبدالها ارفع صورة جديدة من نموذج المشروع.
-- =====================================================================
insert into public.portfolio_projects
  (slug, category_slug, collection_slug, title, description, cover, cover_ratio, cover_w, cover_h, gallery, pdf_url, links, sort_order, is_featured, is_published)
values (
  'triple-a-business-card', 'graphic-design', 'business-cards',
  $j${"ar":"بطاقة أعمال Triple A","fr":"Carte de visite Triple A","en":"Triple A Business Card"}$j$::jsonb,
  $j${"ar":"تصميم بطاقة أعمال احترافية لفريق Triple A.","fr":"Conception d'une carte de visite professionnelle pour Triple A.","en":"Professional business card design for Triple A."}$j$::jsonb,
  'assets/portfolio/Graphic Design/Business Cards/triple-a-business-card/cover.webp', '9/5', 1134, 661,
  $j$[
    {"src":"assets/portfolio/Graphic Design/Business Cards/triple-a-business-card/front 1.webp","w":1134,"h":661},
    {"src":"assets/portfolio/Graphic Design/Business Cards/triple-a-business-card/back1.webp","w":1134,"h":661},
    {"src":"assets/portfolio/Graphic Design/Business Cards/triple-a-business-card/reel.webp","w":1134,"h":661}
  ]$j$::jsonb,
  'assets/portfolio/Graphic Design/Business Cards/triple-a-business-card/MY ULTRA CART V2.4.pdf',
  '{}'::jsonb, 10, false, true
)
on conflict (slug) do nothing;
