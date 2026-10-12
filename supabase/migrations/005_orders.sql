-- =====================================================================
-- Triple A Store — 005 (اختياري): سجل الطلبات في لوحة الإدارة
-- إضافة فقط: لا يغيّر أي جدول أو سياسة موجودة. لإلغائه لاحقاً:
--   drop function public.create_order(text, text, jsonb);
--   drop table public.order_items; drop table public.orders;
--
-- مبدأ الأمان: الزائر لا يكتب في الجداول مباشرة أبداً؛ يستدعي الدالة create_order
-- التي تتجاهل أي سعر/مجموع يرسله المتصفح وتحسبهما من جدول المنتجات.
-- القراءة والتعديل والحذف للمسؤولين فقط (is_admin()).
-- ملاحظة: "جديد" تعني أن الزبون ضغط زر الإرسال، وليس أنه أرسل الرسالة أو دفع.
-- =====================================================================

create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique check (ref ~ '^TA-[0-9]{6}-[A-Z2-9]{4}$'),
  lang         text not null check (lang in ('ar','fr','en')),
  status       text not null default 'new' check (status in ('new','confirmed','completed','cancelled')),
  total        numeric(12,2) not null default 0 check (total >= 0),
  has_estimate boolean not null default false,
  admin_note   text check (char_length(admin_note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,            -- لقطة من اسم المنتج وقت الطلب
  product_type text not null check (product_type in ('physical','digital','service')),
  options      jsonb not null default '{}'::jsonb,
  quantity     int  not null check (quantity between 1 and 999),
  unit_price   numeric(10,2) check (unit_price >= 0),   -- NULL = عرض سعر
  note         text check (char_length(note) <= 300)
);

create index if not exists idx_orders_created  on public.orders (created_at desc);
create index if not exists idx_orders_status   on public.orders (status);
create index if not exists idx_items_order     on public.order_items (order_id);

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- الأمان
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

revoke all on public.orders, public.order_items from anon, authenticated;
grant select, update, delete on public.orders      to authenticated;
grant select                 on public.order_items to authenticated;

drop policy if exists "admin all orders" on public.orders;
create policy "admin all orders" on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all order items" on public.order_items;
create policy "admin all order items" on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- الدالة الآمنة
create or replace function public.create_order(p_ref text, p_lang text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_prod     record;
  v_qty      int;
  v_max      int;
  v_opts     jsonb;
  v_clean    jsonb;
  v_val      text;
  v_name     text;
  v_note     text;
  v_unit     numeric(10,2);
  v_total    numeric(12,2) := 0;
  v_est      boolean := false;
  v_count    int;
  v_i        int;
begin
  if p_ref is null or p_ref !~ '^TA-[0-9]{6}-[A-Z2-9]{4}$' then raise exception 'invalid_ref'; end if;
  if p_lang is null or p_lang not in ('ar','fr','en') then raise exception 'invalid_lang'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_items'; end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 25 then raise exception 'invalid_items'; end if;

  -- حد بسيط ضد الإغراق: 60 طلباً في الدقيقة لكل الموقع
  select count(*) into v_i from public.orders where created_at > now() - interval '1 minute';
  if v_i >= 60 then raise exception 'rate_limited'; end if;

  -- نفس المرجع مرتين = نتجاهل (يمنع التكرار عند الضغط المزدوج)
  if exists (select 1 from public.orders where ref = p_ref) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into public.orders (ref, lang) values (p_ref, p_lang) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid_item'; end if;

    -- المنتج يجب أن يكون منشوراً (الأسعار تُقرأ من القاعدة فقط)
    select p.* into v_prod from public.products p
      where p.id = (v_item ->> 'product_id')::uuid and p.is_published;
    if not found then raise exception 'product_unavailable'; end if;
    if not v_prod.is_available then raise exception 'product_unavailable'; end if;

    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'invalid_quantity'; end if;

    -- نفس قواعد الواجهة: مادي بمخزون = حتى المخزون (حد أقصى 20)، مورّد خارجي = حتى 20، رقمي/خدمة = 1
    if v_prod.type = 'physical' then
      if v_prod.fulfillment = 'own_stock' then
        v_max := least(coalesce(v_prod.stock_quantity, 0), 20);
      elsif v_prod.stock_quantity is null then
        v_max := 20;
      else
        v_max := least(v_prod.stock_quantity, 20);
      end if;
    else
      v_max := 1;
    end if;
    if v_max < 1 or v_qty > v_max then raise exception 'quantity_unavailable'; end if;

    -- الخيارات: كل مجموعة مطلوبة وبقيمة موجودة فعلاً في المنتج
    v_opts := coalesce(v_item -> 'options', '{}'::jsonb);
    if jsonb_typeof(v_opts) <> 'object' then raise exception 'invalid_options'; end if;
    v_clean := '{}'::jsonb;
    for v_i in 0 .. jsonb_array_length(v_prod.variants) - 1 loop
      v_val := v_opts ->> (v_i::text);
      if v_val is null or not exists (
        select 1 from jsonb_array_elements_text(v_prod.variants -> v_i -> 'options') as o(x) where o.x = v_val
      ) then
        raise exception 'invalid_options';
      end if;
      v_clean := v_clean || jsonb_build_object(v_i::text, v_val);
    end loop;

    select coalesce(
      (select tr.name from public.product_translations tr where tr.product_id = v_prod.id and tr.language = p_lang),
      (select tr.name from public.product_translations tr where tr.product_id = v_prod.id and tr.language = 'ar'),
      (select tr.name from public.product_translations tr where tr.product_id = v_prod.id order by tr.language limit 1),
      v_prod.slug
    ) into v_name;

    if v_prod.quote_only or v_prod.price is null then
      v_unit := null; v_est := true;
    else
      v_unit := v_prod.price;
      v_total := v_total + v_unit * v_qty;
      if v_prod.price_is_starting then v_est := true; end if;
    end if;

    v_note := left(coalesce(v_item ->> 'note', ''), 300);
    if v_note = '' then v_note := null; end if;

    insert into public.order_items (order_id, product_id, product_name, product_type, options, quantity, unit_price, note)
    values (v_order_id, v_prod.id, v_name, v_prod.type, v_clean, v_qty, v_unit, v_note);
  end loop;

  update public.orders set total = v_total, has_estimate = v_est where id = v_order_id;
  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;

revoke all on function public.create_order(text, text, jsonb) from public;
grant execute on function public.create_order(text, text, jsonb) to anon, authenticated;
