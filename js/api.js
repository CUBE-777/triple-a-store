/* Triple A Store — api.js
   طبقة الوصول للبيانات العامة (للزوار): تقرأ المنشور فقط، والأمان الفعلي تفرضه سياسات RLS في Supabase.
   تُحوِّل صفوف قاعدة البيانات إلى كائنات بسيطة تستعملها الصفحات. */
(function () {
  "use strict";
  var C = TS.C, sb = null, SB_LIB_URL = "";

  function configured() { return !!(C.DEMO_MODE || (/^https:\/\//.test(C.SUPABASE_URL || "") && (C.SUPABASE_ANON_KEY || "").length > 20)); }

  function client(opts) {
    if (sb) return sb;
    if (!window.supabase || !window.supabase.createClient) throw new Error("SUPABASE_LIB_MISSING");
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: !!(opts && opts.auth), autoRefreshToken: !!(opts && opts.auth), detectSessionInUrl: false }
    });
    return sb;
  }

  // رابط الصورة العامة (bucket عام: product-images). في الوضع التجريبي تُستعمل صور data: المضمّنة فقط.
  function imageUrl(path) {
    if (!path) return "";
    if (C.DEMO_MODE && /^data:image\//.test(path)) return path;
    return String(C.SUPABASE_URL).replace(/\/$/, "") + "/storage/v1/object/public/product-images/" + String(path).split("/").map(encodeURIComponent).join("/");
  }

  function normVariants(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(function (g) { return g && g.name && typeof g.name === "object" && Array.isArray(g.options) && g.options.length; })
      .map(function (g) { return { name: g.name, options: g.options.filter(function (o) { return typeof o === "string" && o; }) }; });
  }
  function normProduct(r) {
    var t = {};
    (r.product_translations || []).forEach(function (x) {
      t[x.language] = { name: x.name || "", short: x.short_description || "", full: x.full_description || "", specs: x.specifications || "", deliverables: x.deliverables || "", delivery: x.delivery_info || "" };
    });
    return {
      id: r.id, slug: r.slug, type: r.type, categoryId: r.category_id || null,
      price: r.price == null ? null : Number(r.price), priceIsStarting: !!r.price_is_starting, quoteOnly: !!r.quote_only,
      fulfillment: r.fulfillment || null, stock: r.stock_quantity == null ? null : Number(r.stock_quantity), isAvailable: r.is_available !== false,
      fileFormat: r.file_format || "", deliveryMethod: r.delivery_method || "", variants: normVariants(r.variants),
      imagePaths: r.images || [], images: (r.images || []).map(imageUrl), published: !!r.is_published, featured: !!r.is_featured,
      createdAt: r.created_at || "", t: t
    };
  }
  function normCategory(r) {
    var names = {}; (r.category_translations || []).forEach(function (x) { names[x.language] = x.name; });
    return { id: r.id, slug: r.slug, sortOrder: r.sort_order || 0, active: r.is_active !== false, names: names };
  }

  var SELECT_P = "*, product_translations(*)";

  async function fetchCatalog() {
    if (C.DEMO_MODE) { var d = window.STORE_DEMO; return { categories: d.categories.map(normCategory), products: d.products.map(normProduct) }; }
    var s = client();
    var r = await Promise.all([
      s.from("categories").select("*, category_translations(*)").eq("is_active", true).order("sort_order"),
      s.from("products").select(SELECT_P).eq("is_published", true).order("created_at", { ascending: false }).limit(500)
    ]);
    if (r[0].error) throw r[0].error; if (r[1].error) throw r[1].error;
    return { categories: r[0].data.map(normCategory), products: r[1].data.map(normProduct) };
  }
  async function fetchProductBySlug(slug) {
    if (C.DEMO_MODE) { var row = window.STORE_DEMO.products.filter(function (p) { return p.slug === slug; })[0]; return row ? normProduct(row) : null; }
    var r = await client().from("products").select(SELECT_P).eq("slug", slug).eq("is_published", true).maybeSingle();
    if (r.error) throw r.error; return r.data ? normProduct(r.data) : null;
  }
  // للسلة: نجلب المنتجات المنشورة فقط؛ أي منتج غير موجود في النتيجة يُعتبر "لم يعد متاحاً"
  async function fetchProductsByIds(ids) {
    if (!ids.length) return {};
    var rows;
    if (C.DEMO_MODE) rows = window.STORE_DEMO.products.filter(function (p) { return ids.indexOf(p.id) >= 0; });
    else { var r = await client().from("products").select(SELECT_P).in("id", ids).eq("is_published", true); if (r.error) throw r.error; rows = r.data; }
    var by = {}; rows.forEach(function (x) { var p = normProduct(x); by[p.id] = p; }); return by;
  }

  window.TS.api = { configured: configured, client: client, imageUrl: imageUrl, normProduct: normProduct, normCategory: normCategory,
    fetchCatalog: fetchCatalog, fetchProductBySlug: fetchProductBySlug, fetchProductsByIds: fetchProductsByIds, SELECT_P: SELECT_P };
})();
