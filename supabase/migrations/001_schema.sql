-- =====================================================================
-- Triple A Store — 001: بنية قاعدة البيانات (الجداول والقيود والفهارس)
-- نفّذ هذا الملف أولاً من Supabase → SQL Editor. آمن لإعادة التشغيل (idempotent).
-- =====================================================================

-- دالة تحديث updated_at تلقائياً
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- الأقسام
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.category_translations (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  language    text not null check (language in ('ar','fr','en')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  unique (category_id, language)
);

-- ---------------------------------------------------------------- المنتجات
-- type: physical (منتج مادي) | digital (منتج رقمي) | service (خدمة)
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  type              text not null check (type in ('physical','digital','service')),
  category_id       uuid references public.categories(id) on delete set null,

  -- السعر بالدرهم المغربي. NULL مسموح فقط للخدمات "عرض سعر حسب الطلب"
  price             numeric(10,2) check (price >= 0 and price < 10000000),
  price_is_starting boolean not null default false,   -- "ابتداءً من"
  quote_only        boolean not null default false,   -- خدمة بعرض سعر فقط
  currency          text not null default 'MAD' check (currency = 'MAD'),

  -- المنتجات المادية فقط
  fulfillment       text check (fulfillment in ('own_stock','external_supplier')),
  stock_quantity    int  check (stock_quantity >= 0 and stock_quantity <= 100000),
  -- مفتاح يدوي لإيقاف التوفر مؤقتاً لأي نوع
  is_available      boolean not null default true,

  -- المنتجات الرقمية فقط
  file_format       text check (char_length(file_format) <= 100),
  delivery_method   text check (delivery_method in ('whatsapp_manual','signed_link')),

  -- خيارات (مقاس/لون/موديل): [{"name":{"ar":"..","fr":"..","en":".."},"options":["Red","Blue"]}]
  variants          jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 5),
  -- مسارات الصور داخل bucket "product-images" (الأولى = الرئيسية)
  images            text[] not null default '{}' check (cardinality(images) <= 8),

  is_published      boolean not null default false,
  is_featured       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- قيود منطقية تُفرض على الخادم (وليس في المتصفح فقط)
  constraint price_required        check (quote_only or price is not null),
  constraint quote_only_services   check (not quote_only or type = 'service'),
  constraint physical_fulfillment  check ((type = 'physical') = (fulfillment is not null)),
  constraint stock_only_physical   check (type = 'physical' or stock_quantity is null),
  constraint own_stock_has_qty     check (fulfillment is distinct from 'own_stock' or stock_quantity is not null),
  constraint digital_fields        check ((type = 'digital') = (delivery_method is not null)),
  constraint file_format_digital   check (type = 'digital' or file_format is null)
);

create table if not exists public.product_translations (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  language          text not null check (language in ('ar','fr','en')),
  name              text not null check (char_length(btrim(name)) between 1 and 200),
  short_description text check (char_length(short_description) <= 300),
  full_description  text check (char_length(full_description) <= 5000),
  specifications    text check (char_length(specifications) <= 3000), -- سطر لكل مواصفة "الاسم: القيمة"
  deliverables      text check (char_length(deliverables) <= 2000),   -- للخدمات: سطر لكل مخرج
  delivery_info     text check (char_length(delivery_info) <= 1000),  -- شحن / تعليمات تحميل / مدة التنفيذ
  unique (product_id, language)
);

-- بيانات خاصة بالإدارة فقط (مورّد، تكلفة، ملف رقمي خاص). لا يقرؤها الزوار أبداً.
create table if not exists public.product_private (
  product_id        uuid primary key references public.products(id) on delete cascade,
  supplier_name     text check (char_length(supplier_name) <= 200),
  supplier_notes    text check (char_length(supplier_notes) <= 2000),
  cost_price        numeric(10,2) check (cost_price >= 0),
  digital_file_path text check (char_length(digital_file_path) <= 300), -- مسار داخل bucket الخاص "digital-files"
  updated_at        timestamptz not null default now()
);

-- المسؤولون: لا يوجد تسجيل عام. تُضاف الصفوف يدوياً من SQL Editor فقط (انظر README).
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- فهارس
create index if not exists idx_products_published  on public.products (is_published, is_featured);
create index if not exists idx_products_category   on public.products (category_id);
create index if not exists idx_products_type       on public.products (type);
create index if not exists idx_products_created    on public.products (created_at desc);
create index if not exists idx_ptrans_product      on public.product_translations (product_id);
create index if not exists idx_ctrans_category     on public.category_translations (category_id);
create index if not exists idx_categories_sort     on public.categories (sort_order);

-- ---------------------------------------------------------------- محفّزات
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();
drop trigger if exists trg_private_updated on public.product_private;
create trigger trg_private_updated before update on public.product_private
  for each row execute function public.set_updated_at();
