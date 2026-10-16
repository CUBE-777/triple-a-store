-- =====================================================================
-- Triple A — 006: معرض الأعمال (Portfolio) داخل نفس مشروع Supabase
-- إضافة فقط (additive): لا يغيّر ولا يحذف أي جدول أو عمود أو سياسة أو ملف موجود.
-- يتطلب تنفيذ 001 و 002 مسبقاً (يستعمل set_updated_at() و is_admin()).
-- آمن لإعادة التشغيل (idempotent).
--
-- مبدأ الأمان (نفس نموذج المتجر):
--   • الزوار (anon) يقرؤون المنشور/الفعّال فقط. لا كتابة إطلاقاً.
--   • المسؤول = public.is_admin() (جدول admin_users). لا نثق بأي علم في الواجهة.
--   • الصور: تُرفع إلى الـbucket العام الموجود "product-images" تحت المسار portfolio/
--     وسياساته الحالية (قراءة عامة + كتابة للمسؤول فقط) تكفي، فلا يوجد SQL للتخزين هنا.
--
-- للتراجع الكامل لاحقاً (يحذف جداول المعرض فقط، لا شيء من المتجر):
--   drop table public.portfolio_projects; drop table public.portfolio_collections;
--   drop table public.portfolio_categories;
-- =====================================================================

-- ---------------------------------------------------------------- الفئات
-- names: {"ar":"..","fr":"..","en":".."}  (نفس شكل بيانات المعرض الأصلي)
-- service: القيمة التي يملأ بها المعرض نموذج التواصل (Design / Digital / Printing)
create table if not exists public.portfolio_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  service     text check (char_length(service) <= 40),
  names       jsonb not null
              check (jsonb_typeof(names) = 'object' and char_length(names::text) <= 600
                     and coalesce(nullif(btrim(names->>'ar'), ''), nullif(btrim(names->>'fr'), ''), nullif(btrim(names->>'en'), '')) is not null),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- المجموعات (Collections) داخل فئة
-- ratio: نسبة إطار صور المجموعة مثل 9/5 (اختياري)
create table if not exists public.portfolio_collections (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  category_slug text not null references public.portfolio_categories(slug) on update cascade on delete restrict,
  ratio         text check (ratio ~ '^[0-9]+(\.[0-9]+)?/[0-9]+(\.[0-9]+)?$'),
  names         jsonb not null
                check (jsonb_typeof(names) = 'object' and char_length(names::text) <= 600
                       and coalesce(nullif(btrim(names->>'ar'), ''), nullif(btrim(names->>'fr'), ''), nullif(btrim(names->>'en'), '')) is not null),
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- المشاريع
-- slug = معرّف المشروع ورابطه (project.html?id=<slug>) ويجب أن يبقى ثابتاً.
-- النصوص المتعددة اللغات jsonb بشكل {"ar","fr","en"} كما يقرؤها المعرض مباشرة.
-- cover / gallery[].src: إما مسار داخل bucket "product-images" يبدأ بـ portfolio/
--   أو رابط https كامل، أو مسار محلي قديم داخل موقع المعرض (assets/portfolio/...).
-- extra: حقول دراسة الحالة المتقدمة {"process":[..],"metrics":[..],"beforeAfter":[..]} (بلا واجهة إدارة حالياً)
create table if not exists public.portfolio_projects (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  category_slug   text not null references public.portfolio_categories(slug) on update cascade on delete restrict,
  collection_slug text references public.portfolio_collections(slug) on update cascade on delete set null,

  title           jsonb not null,
  description     jsonb not null default '{}'::jsonb,
  overview        jsonb not null default '{}'::jsonb,
  challenge       jsonb not null default '{}'::jsonb,
  solution        jsonb not null default '{}'::jsonb,
  results         jsonb not null default '{}'::jsonb,
  services        jsonb not null default '{}'::jsonb,   -- {"ar":["..",".."],"fr":[..],"en":[..]}
  tools           jsonb not null default '[]'::jsonb,   -- ["Figma","HTML"]
  year            text check (char_length(year) <= 10),
  client          text check (char_length(client) <= 200),

  cover           text check (char_length(cover) <= 500),
  cover_ratio     text check (cover_ratio ~ '^[0-9]+(\.[0-9]+)?/[0-9]+(\.[0-9]+)?$'),
  cover_w         int  check (cover_w between 1 and 20000),
  cover_h         int  check (cover_h between 1 and 20000),
  gallery         jsonb not null default '[]'::jsonb,   -- [{"src":"portfolio/x.webp","w":1600,"h":1000}]
  pdf_url         text check (char_length(pdf_url) <= 500),
  links           jsonb not null default '{}'::jsonb,   -- {"live":"https://..","github":"..","whatsapp":true,...}
  extra           jsonb not null default '{}'::jsonb,

  sort_order      int not null default 0,               -- الأصغر أولاً (للمميّزة وللبقية)
  is_featured     boolean not null default false,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint pp_title_shape    check (jsonb_typeof(title) = 'object' and char_length(title::text) <= 1200
                                      and coalesce(nullif(btrim(title->>'ar'), ''), nullif(btrim(title->>'fr'), ''), nullif(btrim(title->>'en'), '')) is not null),
  constraint pp_text_shapes    check (jsonb_typeof(description) = 'object' and char_length(description::text) <= 3000
                                      and jsonb_typeof(overview)  = 'object' and char_length(overview::text)  <= 12000
                                      and jsonb_typeof(challenge) = 'object' and char_length(challenge::text) <= 12000
                                      and jsonb_typeof(solution)  = 'object' and char_length(solution::text)  <= 12000
                                      and jsonb_typeof(results)   = 'object' and char_length(results::text)   <= 12000),
  constraint pp_services_shape check (jsonb_typeof(services) = 'object' and char_length(services::text) <= 6000),
  constraint pp_tools_shape    check (jsonb_typeof(tools) = 'array' and jsonb_array_length(tools) <= 30 and char_length(tools::text) <= 2000),
  constraint pp_gallery_shape  check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 20 and char_length(gallery::text) <= 12000),
  constraint pp_links_shape    check (jsonb_typeof(links) = 'object' and char_length(links::text) <= 4000),
  constraint pp_extra_shape    check (jsonb_typeof(extra) = 'object' and char_length(extra::text) <= 30000),
  constraint pp_cover_size     check ((cover_w is null) = (cover_h is null))
);

-- ---------------------------------------------------------------- فهارس
create index if not exists idx_pproj_published  on public.portfolio_projects (is_published, sort_order);
create index if not exists idx_pproj_category   on public.portfolio_projects (category_slug);
create index if not exists idx_pproj_collection on public.portfolio_projects (collection_slug);
create index if not exists idx_pcat_sort        on public.portfolio_categories (sort_order);
create index if not exists idx_pcoll_category   on public.portfolio_collections (category_slug);

-- ---------------------------------------------------------------- محفّز updated_at (الدالة موجودة من 001)
drop trigger if exists trg_pproj_updated on public.portfolio_projects;
create trigger trg_pproj_updated before update on public.portfolio_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- الأمان (RLS)
alter table public.portfolio_categories  enable row level security;
alter table public.portfolio_collections enable row level security;
alter table public.portfolio_projects    enable row level security;

-- طبقة دفاع إضافية فوق RLS: لا صلاحية كتابة للزوار إطلاقاً
revoke all on public.portfolio_categories, public.portfolio_collections, public.portfolio_projects
  from anon, authenticated;
grant select on public.portfolio_categories, public.portfolio_collections, public.portfolio_projects
  to anon, authenticated;
grant insert, update, delete on public.portfolio_categories, public.portfolio_collections, public.portfolio_projects
  to authenticated;

-- القراءة العامة: المنشور / الفعّال فقط
drop policy if exists "public read active portfolio categories" on public.portfolio_categories;
create policy "public read active portfolio categories" on public.portfolio_categories
  for select to anon, authenticated using (is_active);

drop policy if exists "public read active portfolio collections" on public.portfolio_collections;
create policy "public read active portfolio collections" on public.portfolio_collections
  for select to anon, authenticated using (is_active);

drop policy if exists "public read published portfolio projects" on public.portfolio_projects;
create policy "public read published portfolio projects" on public.portfolio_projects
  for select to anon, authenticated using (is_published);

-- الإدارة: كل العمليات للمسؤولين فقط (يفرضها الخادم عبر is_admin())
drop policy if exists "admin all portfolio categories" on public.portfolio_categories;
create policy "admin all portfolio categories" on public.portfolio_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all portfolio collections" on public.portfolio_collections;
create policy "admin all portfolio collections" on public.portfolio_collections
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all portfolio projects" on public.portfolio_projects;
create policy "admin all portfolio projects" on public.portfolio_projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
