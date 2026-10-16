/* مكتبة Supabase "وهمية" داخل المتصفح لاختبار واجهة الإدارة فقط (لا تُستعمل في الإنتاج).
   تحاكي: تسجيل الدخول، الجداول، قواعد وصول شبيهة بـ RLS (الكتابة للمسؤول فقط، القراءة العامة للمنشور فقط)، التخزين.
   ⚠ هذا لا يختبر سياسات RLS الحقيقية في Postgres — فقط سلوك الواجهة. */
(function () {
  var db = { categories: [{ id: "c1", slug: "photography", sort_order: 10, is_active: true }], category_translations: [{ id: "ct1", category_id: "c1", language: "ar", name: "التصوير" }, { id: "ct2", category_id: "c1", language: "en", name: "Photography" }],
    products: [], product_translations: [], product_private: [], admin_users: [{ user_id: "u1" }], orders: [], order_items: [],
    portfolio_projects: [],   // جداول المعرض (006/007) — نفس البيانات المبدئية لملف 007
    portfolio_categories: [
      { id: "pc1", slug: "web-development", service: "Digital", names: { ar: "تطوير المواقع", fr: "Développement web", en: "Web Development" }, sort_order: 10, is_active: true },
      { id: "pc2", slug: "graphic-design", service: "Design", names: { ar: "التصميم الجرافيكي", fr: "Design graphique", en: "Graphic Design" }, sort_order: 20, is_active: true },
      { id: "pc3", slug: "print", service: "Printing", names: { ar: "طباعة", fr: "Impression", en: "Print" }, sort_order: 30, is_active: true },
      { id: "pc4", slug: "video-motion", service: "Design", names: { ar: "فيديو / موشن", fr: "Vidéo / Motion", en: "Video / Motion" }, sort_order: 40, is_active: true },
      { id: "pc5", slug: "digital-services", service: "Digital", names: { ar: "خدمات رقمية", fr: "Services digitaux", en: "Digital Services" }, sort_order: 50, is_active: true }],
    portfolio_collections: [{ id: "pl1", slug: "business-cards", category_slug: "graphic-design", ratio: "9/5", names: { ar: "بطاقات الأعمال", fr: "Cartes de visite", en: "Business Cards" }, sort_order: 10, is_active: true }] };
  if (window.__SEED) Object.keys(window.__SEED).forEach(function (k) { db[k] = db[k].concat(window.__SEED[k]); });   // بيانات أولية للاختبار
  var users = { "admin@x.com": { id: "u1", pass: "pass123" }, "user@x.com": { id: "u2", pass: "pass123" } };
  var user = null, listeners = [], seq = 0, storage = { "product-images": {}, "digital-files": {} };
  window.__fake = { db: db, storage: storage, log: [], expireNext: false, get user() { return user; } };
  var isAdmin = function () { return !!user && db.admin_users.some(function (a) { return a.user_id === user.id; }); };
  var RLS = { message: "new row violates row-level security policy", code: "42501" };
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function embed(table, row) {
    var r = clone(row);
    if (table === "products") { r.product_translations = clone(db.product_translations.filter(function (x) { return x.product_id === row.id; })); r.product_private = isAdmin() ? clone(db.product_private.filter(function (x) { return x.product_id === row.id; })) : []; }
    if (table === "orders") r.order_items = clone(db.order_items.filter(function (x) { return x.order_id === row.id; }));
    if (table === "categories") r.category_translations = clone(db.category_translations.filter(function (x) { return x.category_id === row.id; }));
    return r;
  }
  function visible(table, row) {   // محاكاة سياسات القراءة العامة
    if (isAdmin()) return true;
    if (table === "orders" || table === "order_items") return false;
    if (table === "products") return !!row.is_published; if (table === "categories") return !!row.is_active;
    if (table === "portfolio_projects") return !!row.is_published; if (table === "portfolio_categories" || table === "portfolio_collections") return !!row.is_active;
    if (table === "product_private" || table === "admin_users") return table === "admin_users" && !!user && row.user_id === user.id;
    return true;
  }
  function Q(table) {
    var mode = "select", payload, filters = [], ord = null, lim = null, ret = false, single = null, conflict = null;
    var b = {
      select: function () { ret = true; return b; }, insert: function (p) { mode = "insert"; payload = p; return b; }, update: function (p) { mode = "update"; payload = p; return b; },
      upsert: function (p, o) { mode = "upsert"; payload = p; conflict = o && o.onConflict; return b; }, delete: function () { mode = "delete"; return b; },
      eq: function (c, v) { filters.push(function (r) { return r[c] === v; }); return b; }, in: function (c, a) { filters.push(function (r) { return a.indexOf(r[c]) >= 0; }); return b; },
      order: function (c, o) { ord = [c, !(o && o.ascending === false)]; return b; }, limit: function (n) { lim = n; return b; },
      maybeSingle: function () { single = "maybe"; return b; }, single: function () { single = "one"; return b; },
      then: function (res, rej) { return Promise.resolve(exec()).then(res, rej); }
    };
    function matched() { return db[table].filter(function (r) { return filters.every(function (f) { return f(r); }); }); }
    function uniq(row, skip) {
      if ((table === "products" || table === "categories" || table === "portfolio_projects" || table === "portfolio_categories" || table === "portfolio_collections") && db[table].some(function (r) { return r !== skip && r.slug === row.slug; })) return { code: "23505", message: "duplicate key value violates unique constraint" };
      if (table === "portfolio_projects") {   // قيود 006: شكل slug، عنوان غير فارغ، مفتاح أجنبي للفئة والمجموعة، أبعاد الغلاف معاً
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug || "")) return { code: "23514", message: "violates check constraint portfolio_projects_slug_check" };
        var tt = row.title || {}; if (!String(tt.ar || "").trim() && !String(tt.fr || "").trim() && !String(tt.en || "").trim()) return { code: "23514", message: "violates check constraint pp_title_shape" };
        if (!db.portfolio_categories.some(function (c) { return c.slug === row.category_slug; })) return { code: "23503", message: "violates foreign key constraint (category_slug)" };
        if (row.collection_slug && !db.portfolio_collections.some(function (c) { return c.slug === row.collection_slug; })) return { code: "23503", message: "violates foreign key constraint (collection_slug)" };
        if ((row.cover_w == null) !== (row.cover_h == null)) return { code: "23514", message: "violates check constraint pp_cover_size" };
        if (!Array.isArray(row.gallery || []) || (row.gallery || []).length > 20) return { code: "23514", message: "violates check constraint pp_gallery_shape" };
      }
      if (table === "products") {   // بعض قيود CHECK من قاعدة البيانات
        if (!row.quote_only && row.price == null) return { code: "23514", message: "violates check constraint price_required" };
        if (row.type === "physical" && row.fulfillment === "own_stock" && row.stock_quantity == null) return { code: "23514", message: "violates check constraint own_stock_has_qty" };
      }
    }
    function exec() {
      window.__fake.log.push(mode + ":" + table);
      if (window.__fake.expireNext) { window.__fake.expireNext = false; user = null; return { data: null, error: { code: "PGRST301", message: "JWT expired" } }; }
      var out;
      if (mode === "select") {
        var rows = matched().filter(function (r) { return visible(table, r); });
        if (ord) rows.sort(function (a, c) { return (a[ord[0]] > c[ord[0]] ? 1 : -1) * (ord[1] ? 1 : -1); }); if (lim) rows = rows.slice(0, lim);
        out = rows.map(function (r) { return embed(table, r); });
      } else {
        if (!isAdmin()) return { data: null, error: RLS };
        if (mode === "insert") { var row = Object.assign({ id: "id" + (++seq), created_at: new Date(Date.now() + seq).toISOString() }, clone(payload)); var er = uniq(row); if (er) return { data: null, error: er }; db[table].push(row); out = [row]; }
        else if (mode === "update") { var ms = matched(); for (var i = 0; i < ms.length; i++) { var er2 = uniq(Object.assign({}, ms[i], payload), ms[i]); if (er2) return { data: null, error: er2 }; } ms.forEach(function (r) { Object.assign(r, clone(payload)); }); out = ms; }
        else if (mode === "upsert") {
          var arr = Array.isArray(payload) ? payload : [payload], keys = conflict.split(","); out = [];
          arr.forEach(function (p) { var ex = db[table].filter(function (r) { return keys.every(function (k) { return r[k] === p[k]; }); })[0]; if (ex) { Object.assign(ex, clone(p)); out.push(ex); } else { var n = Object.assign({ id: "id" + (++seq) }, clone(p)); db[table].push(n); out.push(n); } });
        } else if (mode === "delete") {
          var del = matched(); db[table] = db[table].filter(function (r) { return del.indexOf(r) < 0; }); window.__fake.db[table] = db[table];
          del.forEach(function (r) { if (table === "products") { db.product_translations = db.product_translations.filter(function (x) { return x.product_id !== r.id; }); db.product_private = db.product_private.filter(function (x) { return x.product_id !== r.id; }); } if (table === "orders") db.order_items = db.order_items.filter(function (x) { return x.order_id !== r.id; });
 if (table === "categories") { db.category_translations = db.category_translations.filter(function (x) { return x.category_id !== r.id; }); db.products.forEach(function (p) { if (p.category_id === r.id) p.category_id = null; }); } });
          out = del;
        }
        if (!ret) out = null;
      }
      if (single && out) { if (out.length === 0) return single === "one" ? { data: null, error: { message: "no rows", code: "PGRST116" } } : { data: null, error: null }; return { data: out[0], error: null }; }
      if (single) return { data: null, error: null };
      return { data: out, error: null };
    }
    return b;
  }
  window.supabase = { createClient: function () {
    return {
      from: function (t) { return Q(t); },
      rpc: function (name, a) {   // يحاكي دالة create_order في 005_orders.sql (نفس القواعد، ليس نفس الكود)
        window.__fake.log.push("rpc:" + name); var err = function (m) { return Promise.resolve({ data: null, error: { message: m } }); };
        if (name !== "create_order") return err("unknown function");
        if (!/^TA-[0-9]{6}-[A-Z2-9]{4}$/.test(a.p_ref || "")) return err("invalid_ref"); if (["ar", "fr", "en"].indexOf(a.p_lang) < 0) return err("invalid_lang");
        if (!Array.isArray(a.p_items) || a.p_items.length < 1 || a.p_items.length > 25) return err("invalid_items");
        if (db.orders.some(function (o) { return o.ref === a.p_ref; })) return Promise.resolve({ data: { ok: true, duplicate: true }, error: null });
        var items = [], total = 0, est = false;
        for (var i = 0; i < a.p_items.length; i++) {
          var it = a.p_items[i], p = db.products.filter(function (x) { return x.id === it.product_id && x.is_published; })[0];
          if (!p || p.is_available === false) return err("product_unavailable");
          var q = it.quantity; if (!Number.isInteger(q) || q < 1 || q > 999) return err("invalid_quantity");
          var max = p.type === "physical" ? (p.fulfillment === "own_stock" ? Math.min(p.stock_quantity || 0, 20) : (p.stock_quantity == null ? 20 : Math.min(p.stock_quantity, 20))) : 1;
          if (max < 1 || q > max) return err("quantity_unavailable");
          var clean = {}, vs = p.variants || []; for (var g = 0; g < vs.length; g++) { var v = (it.options || {})[String(g)]; if (!v || vs[g].options.indexOf(v) < 0) return err("invalid_options"); clean[String(g)] = v; }
          var tr = db.product_translations.filter(function (x) { return x.product_id === p.id; }), nm = (tr.filter(function (x) { return x.language === a.p_lang; })[0] || tr.filter(function (x) { return x.language === "ar"; })[0] || tr[0] || { name: p.slug }).name;
          var unit = (p.quote_only || p.price == null) ? null : p.price; if (unit == null) est = true; else { total += unit * q; if (p.price_is_starting) est = true; }
          items.push({ id: "oi" + (++seq), product_id: p.id, product_name: nm, product_type: p.type, options: clean, quantity: q, unit_price: unit, note: (it.note || "").slice(0, 300) || null });
        }
        var o = { id: "o" + (++seq), ref: a.p_ref, lang: a.p_lang, status: "new", total: Math.round(total * 100) / 100, has_estimate: est, admin_note: null, created_at: new Date(Date.now() + seq).toISOString() };
        db.orders.push(o); items.forEach(function (x) { x.order_id = o.id; db.order_items.push(x); }); return Promise.resolve({ data: { ok: true, total: o.total }, error: null });
      },
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: user ? { user: { id: user.id, email: user.email } } : null } }); },
        signInWithPassword: function (c) { var u = users[c.email]; if (!u || u.pass !== c.password) return Promise.resolve({ data: null, error: { message: "Invalid login credentials" } }); user = { id: u.id, email: c.email }; return Promise.resolve({ data: { session: { user: user } }, error: null }); },
        signOut: function () { user = null; listeners.forEach(function (f) { f("SIGNED_OUT"); }); return Promise.resolve({ error: null }); },
        onAuthStateChange: function (cb) { listeners.push(cb); return { data: { subscription: {} } }; }
      },
      storage: { from: function (bucket) { return {
        upload: function (path, blob, o) { if (!isAdmin()) return Promise.resolve({ data: null, error: RLS }); if (storage[bucket][path] && !(o && o.upsert)) return Promise.resolve({ data: null, error: { message: "exists" } }); storage[bucket][path] = { size: blob.size, type: blob.type || (o && o.contentType) }; return Promise.resolve({ data: { path: path }, error: null }); },
        remove: function (paths) { if (!isAdmin()) return Promise.resolve({ data: null, error: RLS }); paths.forEach(function (p) { delete storage[bucket][p]; }); return Promise.resolve({ data: [], error: null }); },
        createSignedUrl: function (path, s) { if (!isAdmin()) return Promise.resolve({ data: null, error: RLS }); return Promise.resolve({ data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/" + bucket + "/" + path + "?token=t&exp=" + s }, error: null }); }
      }; } }
    };
  } };
})();
