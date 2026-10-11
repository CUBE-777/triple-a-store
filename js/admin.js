/* Triple A Store — admin.js (لوحة الإدارة: admin.html)
   ⚠ الأمان الحقيقي يأتي من Supabase: تسجيل دخول حقيقي + سياسات RLS (is_admin()) + سياسات Storage.
   هذا الملف واجهة فقط: حتى لو عدّل شخص الكود في متصفحه فلن يستطيع الكتابة بدون حساب مسؤول.
   لا يوجد هنا أي مفتاح سري. */
(function () {
  "use strict";
  var TS = window.TS, C = TS.C, t = TS.t, esc = TS.esc, $ = TS.$, Cart = window.TSCart;
  var root = $("#adm-root"), sb = null, session = null, manualOut = false, busy = false, bootMsg = "";
  var view = "login", products = [], cats = [], page = 1, PER = 10, F = { q: "", type: "", status: "", cat: "" }, form = null, catForm = null, linkUrl = "";
  var LANGS = ["ar", "fr", "en"], TYPES = ["physical", "digital", "service"], MAXIMG = 8;
  var SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  /* ---------------------------------------------------------------- أدوات */
  function Handled() { this.handled = true; }
  var isAuthErr = function (e) { return e && (e.code === "PGRST301" || e.status === 401 || /jwt|token.*expired/i.test(e.message || "")); };
  async function db(promise) {   // يلتقط أخطاء Supabase؛ وإذا انتهت الجلسة يعيد المسؤول لشاشة الدخول بأمان
    var r = await promise;
    if (r.error) { if (isAuthErr(r.error)) { expire(); throw new Handled(); } throw r.error; }
    return r.data;
  }
  function fail(e) { if (e && e.handled) return; if (window.console) console.error(e); TS.toast(t("a.failed", { msg: (e && e.message) || String(e) }), "err"); }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
  function slugify(s) { return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function setBusy(on, label) {
    busy = on;
    TS.$$("#adm-root button, #adm-root input, #adm-root select, #adm-root textarea").forEach(function (e) { if (on) { e.dataset.wasDis = e.disabled ? "1" : ""; e.disabled = true; } else { e.disabled = e.dataset.wasDis === "1"; } });
    var s = $("#save"); if (s && label) s.textContent = label; var p = $("#progress"); if (p && !on) p.textContent = "";
  }
  function confirmDialog(title, msg, okLabel) {
    return new Promise(function (resolve) {
      var d = document.createElement("dialog");
      d.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3><p style="margin-top:10px">' + esc(msg) + '</p><div class="acts"><button class="btn" value="cancel">' + esc(t("cancel")) + '</button><button class="btn danger" value="ok">' + esc(okLabel) + "</button></div></form>";
      document.body.appendChild(d); d.addEventListener("close", function () { var ok = d.returnValue === "ok"; d.remove(); resolve(ok); }); d.showModal();
    });
  }
  function nameOf(p) { return TS.pick(p, "name") || p.slug; }
  function catName(id) { var c = cats.filter(function (x) { return x.id === id; })[0]; return c ? TS.L(c.names) : ""; }

  /* ---------------------------------------------------------------- الجلسة */
  function expire() {
    if (view === "login") return;
    try { sb.auth.signOut({ scope: "local" }); } catch (e) {}
    session = null; showLogin(t("a.expired"));
  }
  function msgBox(key) { root.innerHTML = '<div class="msg err" role="alert" style="margin-top:24px">' + esc(t(key)) + '</div><p style="margin-top:14px"><a class="btn" href="index.html">' + esc(t("btn.back")) + "</a></p>"; }

  function showLogin(message) {
    view = "login"; form = null; busy = false;
    root.innerHTML = '<form class="login" id="login" novalidate><h1 style="font-size:1.3rem">' + esc(t("a.login")) + "</h1>" +
      (message ? '<div class="errs" role="alert">' + esc(message) + "</div>" : "") +
      '<label class="fld">' + esc(t("a.email")) + '<input type="email" id="l-email" autocomplete="username" required></label>' +
      '<label class="fld">' + esc(t("a.password")) + '<input type="password" id="l-pass" autocomplete="current-password" required></label>' +
      '<button class="btn pri block" type="submit" id="l-btn">' + esc(t("a.signin")) + "</button></form>";
  }
  async function doLogin() {
    if (busy) return;
    var email = $("#l-email").value.trim(), pass = $("#l-pass").value; if (!email || !pass) return;
    setBusy(true); $("#l-btn").textContent = t("a.signingin");
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) { setBusy(false); return showLogin(t("a.badcreds")); }
      session = r.data.session; await enter();
    } catch (err) { setBusy(false); showLogin(t("a.failed", { msg: err.message })); }
  }

  // التحقق من أن الحساب مسؤول (للواجهة فقط؛ الخادم يفرض الصلاحية بنفسه في كل عملية)
  async function enter() {
    var uid = session && session.user && session.user.id, r = await sb.from("admin_users").select("user_id").eq("user_id", uid).maybeSingle();
    if (r.error || !r.data) { manualOut = true; await sb.auth.signOut(); manualOut = false; session = null; setBusy(false); return showLogin(t("a.denied")); }
    setBusy(false); view = "list"; page = 1;
    try { await loadAll(); } catch (e) { fail(e); }
    render();
  }

  async function loadAll() {
    var r = await Promise.all([
      db(sb.from("products").select("*, product_translations(*), product_private(*)").order("created_at", { ascending: false }).limit(1000)),
      db(sb.from("categories").select("*, category_translations(*)").order("sort_order"))
    ]);
    products = r[0].map(function (row) { var p = TS.api.normProduct(row); p._priv = one(row.product_private) || null; return p; });
    cats = r[1].map(TS.api.normCategory);
  }

  /* ---------------------------------------------------------------- الإطار العام */
  function frame(inner) {
    var tabs = '<div class="tabs"><button class="btn sm' + (view === "list" || view === "form" ? " pri" : "") + '" data-go="list">' + esc(t("a.products")) + '</button><button class="btn sm' + (view === "cats" ? " pri" : "") + '" data-go="cats">' + esc(t("a.categories")) + "</button></div>";
    return '<div class="adm-top"><h1 style="font-size:1.3rem">' + esc(t("a.title")) + '</h1><div class="acts"><span class="note" dir="ltr">' + esc(session.user.email || "") + '</span><button class="btn sm" data-signout>' + esc(t("a.signout")) + "</button></div></div>" + tabs + '<div style="margin-top:18px">' + inner + "</div>";
  }
  function render() {
    if (view === "login") return showLogin();
    if (view === "form") { collect(); return renderForm(); }
    if (view === "cats") return renderCats();
    renderList();
  }

  /* ---------------------------------------------------------------- قائمة المنتجات */
  function filteredProducts() {
    var q = TS.norm(F.q);
    return products.filter(function (p) {
      if (F.type && p.type !== F.type) return false; if (F.cat && p.categoryId !== F.cat) return false;
      if (F.status === "published" && !p.published) return false; if (F.status === "hidden" && p.published) return false;
      if (q) { var h = TS.norm(p.slug + " " + LANGS.map(function (l) { return p.t[l] ? p.t[l].name : ""; }).join(" ")); if (h.indexOf(q) < 0) return false; }
      return true;
    });
  }
  function renderList() {
    var list = filteredProducts(), pages = Math.max(1, Math.ceil(list.length / PER)); page = Math.min(page, pages);
    var rows = list.slice((page - 1) * PER, page * PER).map(function (p) {
      var av = Cart.availability(p, C), stock = p.type === "physical" ? t("avail." + av.status, { n: av.left }) : "—";
      return '<tr><td><div class="acts" style="flex-wrap:nowrap"><div class="thm">' + TS.imgHtml(p.images[0], nameOf(p), p.type) + "</div><div><b>" + esc(nameOf(p)) + '</b><br><small class="note" dir="ltr">' + esc(p.slug) + "</small></div></div></td>" +
        "<td>" + esc(t("type." + p.type + ".s")) + '<br><small class="note">' + esc(catName(p.categoryId)) + "</small></td><td>" + esc(TS.priceText(p)) + "</td><td>" + esc(stock) + "</td>" +
        '<td><span class="pill ' + (p.published ? "on" : "off") + '">' + esc(t(p.published ? "a.status.published" : "a.status.hidden")) + "</span>" + (p.featured ? ' <span class="pill on">★</span>' : "") + "</td>" +
        '<td><div class="acts"><button class="btn sm" data-edit="' + esc(p.id) + '">' + esc(t("a.edit")) + '</button><button class="btn sm" data-pub="' + esc(p.id) + '">' + esc(t(p.published ? "a.hide" : "a.publish")) + '</button><button class="btn sm" data-feat="' + esc(p.id) + '">' + esc(t(p.featured ? "a.unfeature" : "a.feature")) + '</button><button class="btn sm danger" data-del="' + esc(p.id) + '">' + esc(t("a.delete")) + "</button></div></td></tr>";
    }).join("");
    var opts = function (arr, cur, all) { return '<option value="">' + esc(all) + "</option>" + arr.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); };
    root.innerHTML = frame(
      '<div class="acts" style="justify-content:space-between;margin-bottom:14px"><div class="note">' + esc(t("a.total", { n: list.length })) + '</div><button class="btn pri" data-new>' + esc(t("a.add")) + "</button></div>" +
      '<div class="filters" id="adm-filters"><label class="sr" for="a-q">' + esc(t("a.search")) + '</label><input id="a-q" type="search" value="' + esc(F.q) + '" placeholder="' + esc(t("a.search")) + '">' +
      '<label class="sr" for="a-t">' + esc(t("f.type")) + '</label><select id="a-t">' + opts(TYPES.map(function (x) { return [x, t("type." + x)]; }), F.type, t("type.all")) + "</select>" +
      '<label class="sr" for="a-s">' + esc(t("a.status")) + '</label><select id="a-s">' + opts([["published", t("a.status.published")], ["hidden", t("a.status.hidden")]], F.status, t("a.status")) + "</select>" +
      '<label class="sr" for="a-c">' + esc(t("a.f.category")) + '</label><select id="a-c">' + opts(cats.map(function (c) { return [c.id, TS.L(c.names)]; }), F.cat, t("a.f.category")) + "</select></div>" +
      (rows ? '<div class="scroll-x"><table class="tbl"><thead><tr><th>' + esc(t("a.col.product")) + "</th><th>" + esc(t("f.type")) + "</th><th>" + esc(t("a.col.price")) + "</th><th>" + esc(t("a.col.stock")) + "</th><th>" + esc(t("a.status")) + "</th><th>" + esc(t("a.col.actions")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : '<div class="empty">' + esc(t("a.none")) + "</div>") +
      '<div class="pager"><button class="btn sm" data-pg="-1"' + (page <= 1 ? " disabled" : "") + ">" + esc(t("a.prev")) + "</button><span>" + esc(t("a.page", { p: page, n: pages })) + '</span><button class="btn sm" data-pg="1"' + (page >= pages ? " disabled" : "") + ">" + esc(t("a.next")) + "</button></div>");
    if (F._focus) { var q = $("#a-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  async function patchProduct(id, patch) {
    if (busy) return; setBusy(true);
    try { await db(sb.from("products").update(patch).eq("id", id)); await loadAll(); TS.toast(t("a.saved")); } catch (e) { fail(e); }
    if (view !== "login") { setBusy(false); render(); }
  }
  async function deleteProduct(id) {
    var p = products.filter(function (x) { return x.id === id; })[0]; if (!p || busy) return;
    if (!(await confirmDialog(t("a.confirm.title"), t("a.confirm.product", { name: nameOf(p) }), t("a.delete")))) return;
    setBusy(true);
    try {
      await db(sb.from("products").delete().eq("id", id));
      try { if (p.imagePaths.length) await sb.storage.from("product-images").remove(p.imagePaths); if (p._priv && p._priv.digital_file_path) await sb.storage.from("digital-files").remove([p._priv.digital_file_path]); } catch (e) { /* تنظيف ملفات اختياري */ }
      await loadAll(); TS.toast(t("a.deleted"));
    } catch (e) { fail(e); }
    if (view !== "login") { setBusy(false); render(); }
  }

  /* ---------------------------------------------------------------- نموذج المنتج */
  function emptyForm() {
    var tr = {}; LANGS.forEach(function (l) { tr[l] = { name: "", short: "", full: "", specs: "", deliverables: "", delivery: "" }; });
    return { id: null, type: "physical", categoryId: "", slug: "", slugTouched: false, price: "", starting: false, quote: false, fulfillment: "own_stock", stock: "", available: true, published: false, featured: false,
      tr: tr, fileFormat: "", deliveryMethod: "whatsapp_manual", variants: [], images: [], origPaths: [], supName: "", supNotes: "", cost: "", privPath: "", hadPriv: false };
  }
  function formFrom(p) {
    var f = emptyForm(), pr = p._priv || {};
    f.id = p.id; f.type = p.type; f.categoryId = p.categoryId || ""; f.slug = p.slug; f.slugTouched = true; f.price = p.price == null ? "" : String(p.price);
    f.starting = p.priceIsStarting; f.quote = p.quoteOnly; f.fulfillment = p.fulfillment || "own_stock"; f.stock = p.stock == null ? "" : String(p.stock);
    f.available = p.isAvailable; f.published = p.published; f.featured = p.featured;
    LANGS.forEach(function (l) { var x = p.t[l]; if (x) f.tr[l] = { name: x.name, short: x.short, full: x.full, specs: x.specs, deliverables: x.deliverables, delivery: x.delivery }; });
    f.fileFormat = p.fileFormat; f.deliveryMethod = p.deliveryMethod || "whatsapp_manual";
    f.variants = p.variants.map(function (g) { return { ar: g.name.ar || "", fr: g.name.fr || "", en: g.name.en || "", options: g.options.join(", ") }; });
    f.images = p.imagePaths.map(function (path) { return { path: path, url: TS.api.imageUrl(path) }; }); f.origPaths = p.imagePaths.slice();
    f.supName = pr.supplier_name || ""; f.supNotes = pr.supplier_notes || ""; f.cost = pr.cost_price == null ? "" : String(pr.cost_price); f.privPath = pr.digital_file_path || ""; f.hadPriv = !!p._priv;
    return f;
  }
  var V = function (id) { var e = $("#" + id); return e ? e.value : ""; }, Ck = function (id) { var e = $("#" + id); return e ? e.checked : false; };

  // قراءة قيم الحقول من الصفحة إلى كائن الحالة (قبل أي إعادة رسم)
  function collect() {
    if (!form || !$("#pform")) return;
    var f = form; f.type = V("f-type"); f.categoryId = V("f-cat"); f.slug = V("f-slug").trim().toLowerCase(); f.price = V("f-price"); f.starting = Ck("f-starting"); if ($("#f-quote")) f.quote = Ck("f-quote");
    if ($("#f-ful")) f.fulfillment = V("f-ful"); if ($("#f-stock")) f.stock = V("f-stock"); f.available = Ck("f-avail"); f.published = Ck("f-pub"); f.featured = Ck("f-feat");
    LANGS.forEach(function (l) { ["name", "short", "full", "specs", "deliverables", "delivery"].forEach(function (k) { var e = $("#f-" + k + "-" + l); if (e) f.tr[l][k] = e.value; }); });
    if ($("#f-ff")) { f.fileFormat = V("f-ff"); f.deliveryMethod = V("f-dm"); }
    if ($("#f-supname")) { f.supName = V("f-supname"); f.supNotes = V("f-supnotes"); f.cost = V("f-cost"); }
    f.variants = TS.$$(".vrow").map(function (r) { return { ar: $("[data-v=ar]", r).value, fr: $("[data-v=fr]", r).value, en: $("[data-v=en]", r).value, options: $("[data-v=options]", r).value }; });
  }

  function renderForm() {
    var f = form, ty = f.type, isP = ty === "physical", isD = ty === "digital", isS = ty === "service";
    var fld = function (label, id, inner, hint) { return '<div class="fld"><label for="' + id + '">' + esc(label) + "</label>" + inner + (hint ? "<small>" + esc(hint) + "</small>" : "") + "</div>"; };
    var inp = function (id, val, extra) { return '<input id="' + id + '" value="' + esc(val) + '" ' + (extra || "") + ">"; };
    var ck = function (id, label, on) { return '<label class="chk"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span>" + esc(label) + "</span></label>"; };
    var dLabel = t("p.delivery." + ty);
    var langs = LANGS.map(function (l) {
      var x = f.tr[l];
      return '<div class="lang-b" lang="' + l + '" dir="' + (l === "ar" ? "rtl" : "ltr") + '"><h4>' + { ar: "العربية", fr: "Français", en: "English" }[l] + "</h4>" +
        fld(t("a.f.name") + (l === "ar" ? " *" : ""), "f-name-" + l, inp("f-name-" + l, x.name, 'maxlength="200"')) +
        fld(t("a.f.short"), "f-short-" + l, '<textarea id="f-short-' + l + '" maxlength="300" rows="2">' + esc(x.short) + "</textarea>") +
        fld(t("a.f.full"), "f-full-" + l, '<textarea id="f-full-' + l + '" maxlength="5000" rows="4">' + esc(x.full) + "</textarea>") +
        (isP || isD ? fld(t("a.f.specs"), "f-specs-" + l, '<textarea id="f-specs-' + l + '" maxlength="3000" rows="3">' + esc(x.specs) + "</textarea>") : "") +
        (isS ? fld(t("a.f.deliverables"), "f-deliverables-" + l, '<textarea id="f-deliverables-' + l + '" maxlength="2000" rows="3">' + esc(x.deliverables) + "</textarea>") : "") +
        fld(dLabel, "f-delivery-" + l, '<textarea id="f-delivery-' + l + '" maxlength="1000" rows="2">' + esc(x.delivery) + "</textarea>") + "</div>";
    }).join("");
    var vrows = f.variants.map(function (v, i) {
      return '<div class="vrow" data-vi="' + i + '">' + LANGS.map(function (l) { return '<div class="fld"><label>' + { ar: "AR", fr: "FR", en: "EN" }[l] + '</label><input data-v="' + l + '" value="' + esc(v[l]) + '" maxlength="50"></div>'; }).join("") +
        '<div class="fld"><label>' + esc(t("a.f.variants.values")) + '</label><input data-v="options" value="' + esc(v.options) + '"></div><button class="btn sm danger" type="button" data-vdel="' + i + '">✕</button></div>';
    }).join("");
    var imgs = f.images.map(function (im, i) {
      return '<div class="im"><div class="pv">' + TS.imgHtml(im.url, "", ty) + "</div>" + (i === 0 ? '<span class="pill on">' + esc(t("a.f.img.main")) + "</span>" : "") +
        '<div class="row"><button type="button" data-imup="' + (i + 1) + '">' + esc(t("a.f.img.left")) + '</button><button type="button" data-imdown="' + (i + 1) + '">' + esc(t("a.f.img.right")) + '</button><button type="button" data-imdel="' + (i + 1) + '">✕</button></div></div>';
    }).join("");
    var privFile = "";
    if (isD) {
      privFile = '<div class="fld"><label for="f-file">' + esc(t("a.f.file")) + '</label><input type="file" id="f-file">' +
        (f.privPath ? "<small>" + esc(t("a.f.file.current")) + ' <span dir="ltr">' + esc(f.privPath.split("/").pop()) + '</span></small><div><button class="btn sm" type="button" data-link>' + esc(t("a.f.link")) + "</button></div>" : "") +
        (linkUrl ? '<div class="copyrow"><input readonly id="f-linkout" value="' + esc(linkUrl) + '"><button class="btn sm" type="button" data-copy>' + esc(t("a.f.copy")) + "</button></div>" : "") +
        "<small>" + esc(t("a.f.link.note")) + "</small></div>";
    }
    root.innerHTML = frame('<form id="pform" class="form" novalidate><h2>' + esc(t(f.id ? "a.edit.title" : "a.new.title")) + '</h2><div id="errs" role="alert"></div>' +
      '<fieldset class="fs"><legend>' + esc(t("a.f.type")) + '</legend><div class="g2">' +
      fld(t("a.f.type"), "f-type", '<select id="f-type">' + TYPES.map(function (x) { return '<option value="' + x + '"' + (x === ty ? " selected" : "") + ">" + esc(t("type." + x + ".s")) + "</option>"; }).join("") + "</select>") +
      fld(t("a.f.category"), "f-cat", '<select id="f-cat"><option value="">' + esc(t("a.f.nocat")) + "</option>" + cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === f.categoryId ? " selected" : "") + ">" + esc(TS.L(c.names)) + "</option>"; }).join("") + "</select>") +
      fld(t("a.f.slug"), "f-slug", inp("f-slug", f.slug, 'dir="ltr" maxlength="100" autocapitalize="off" spellcheck="false"')) + "</div>" +
      '<div class="g2">' + ck("f-pub", t("a.f.published"), f.published) + ck("f-feat", t("a.f.featured"), f.featured) + ck("f-avail", t("a.f.available"), f.available) + "</div></fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.f.price")) + '</legend><div class="g2">' +
      fld(t("a.f.price"), "f-price", inp("f-price", f.price, 'type="number" min="0" max="9999999" step="0.01" inputmode="decimal"' + (isS && f.quote ? " disabled" : ""))) +
      "<div>" + ck("f-starting", t("a.f.starting"), f.starting) + (isS ? ck("f-quote", t("a.f.quote"), f.quote) : "") + "</div></div>" +
      (isP ? '<div class="g2">' + fld(t("a.f.fulfillment"), "f-ful", '<select id="f-ful"><option value="own_stock"' + (f.fulfillment === "own_stock" ? " selected" : "") + ">" + esc(t("a.f.own")) + '</option><option value="external_supplier"' + (f.fulfillment === "external_supplier" ? " selected" : "") + ">" + esc(t("a.f.supplier")) + "</option></select>") +
        fld(t(f.fulfillment === "own_stock" ? "a.f.stock" : "a.f.stock.opt"), "f-stock", inp("f-stock", f.stock, 'type="number" min="0" max="100000" step="1" inputmode="numeric"')) + "</div>" : "") + "</fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.f.texts")) + "</legend>" + langs + "</fieldset>" +
      (isD ? '<fieldset class="fs"><legend>' + esc(t("type.digital.s")) + '</legend><div class="g2">' + fld(t("a.f.fileformat"), "f-ff", inp("f-ff", f.fileFormat, 'maxlength="100"')) +
        fld(t("a.f.method"), "f-dm", '<select id="f-dm"><option value="whatsapp_manual"' + (f.deliveryMethod === "whatsapp_manual" ? " selected" : "") + ">" + esc(t("dm.whatsapp_manual")) + '</option><option value="signed_link"' + (f.deliveryMethod === "signed_link" ? " selected" : "") + ">" + esc(t("dm.signed_link")) + "</option></select>") + "</div>" + privFile + "</fieldset>" : "") +
      '<fieldset class="fs"><legend>' + esc(t("a.f.variants")) + '</legend><p class="hint">' + esc(t("a.f.variants.hint")) + "</p>" + vrows + '<div><button class="btn sm" type="button" data-vadd' + (f.variants.length >= 5 ? " disabled" : "") + ">" + esc(t("a.f.variants.add")) + "</button></div></fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.f.images")) + '</legend><div class="imgs">' + imgs + '</div><div><label class="btn sm" for="f-img" style="cursor:pointer">' + esc(t("a.f.images.pick")) + '</label><input id="f-img" type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr"></div></fieldset>' +
      (isP ? '<fieldset class="fs"><legend>' + esc(t("a.f.private")) + '</legend><div class="g2">' + fld(t("a.f.supname"), "f-supname", inp("f-supname", f.supName, 'maxlength="200"')) + fld(t("a.f.cost"), "f-cost", inp("f-cost", f.cost, 'type="number" min="0" step="0.01"')) + "</div>" + fld(t("a.f.supnotes"), "f-supnotes", '<textarea id="f-supnotes" maxlength="2000" rows="2">' + esc(f.supNotes) + "</textarea>") + "</fieldset>" : "") +
      '<div class="acts"><button class="btn pri lg" type="submit" id="save">' + esc(t("a.f.save")) + '</button><button class="btn lg" type="button" data-go="list">' + esc(t("a.f.cancel")) + '</button></div><p class="progress" id="progress" role="status" aria-live="polite"></p></form>');
  }

  /* ---------------------------------------------------------------- التحقق (واجهة؛ الخادم يفرض نفس القيود عبر CHECK constraints) */
  function parseOptions(s) { var seen = {}; return String(s || "").split(/[,،]/).map(function (x) { return x.trim(); }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return x.length <= 100; }).slice(0, 20); }
  function validate(f) {
    var e = [], isP = f.type === "physical", isS = f.type === "service";
    if (!f.tr.ar.name.trim()) e.push(t("a.v.name"));
    if (!f.slug) f.slug = slugify(f.tr.en.name || f.tr.fr.name) || ("item-" + uuid().slice(0, 6));
    if (!SLUG.test(f.slug) || f.slug.length > 100) e.push(t("a.v.slug"));
    if (!(isS && f.quote)) { var p = Number(f.price); if (f.price === "" || !isFinite(p) || p < 0 || p >= 1e7) e.push(t("a.v.price")); }
    if (isP && (f.stock !== "" || f.fulfillment === "own_stock")) { var s = Number(f.stock); if (f.stock === "" || !Number.isInteger(s) || s < 0 || s > 100000) e.push(t("a.v.stock")); }
    if (LANGS.some(function (l) { return f.tr[l].short.length > 300; })) e.push(t("a.v.short"));
    if (f.variants.some(function (v) { return !v.ar.trim() || !parseOptions(v.options).length; })) e.push(t("a.v.variant"));
    return e;
  }

  function buildProduct(f, paths) {
    var isP = f.type === "physical", isD = f.type === "digital", isS = f.type === "service", quote = isS && f.quote, hasStock = isP && f.stock !== "";
    return {
      slug: f.slug, type: f.type, category_id: f.categoryId || null, price: quote ? null : Number(f.price), price_is_starting: !!f.starting && !quote, quote_only: quote, currency: "MAD",
      fulfillment: isP ? f.fulfillment : null, stock_quantity: hasStock ? parseInt(f.stock, 10) : null, is_available: f.available,
      file_format: isD ? (f.fileFormat.trim() || null) : null, delivery_method: isD ? f.deliveryMethod : null,
      variants: f.variants.map(function (v) { var n = {}; LANGS.forEach(function (l) { if (v[l].trim()) n[l] = v[l].trim(); }); return { name: n, options: parseOptions(v.options) }; }),
      images: paths, is_published: f.published, is_featured: f.featured
    };
  }

  /* ---------------------------------------------------------------- الصور */
  function processImage(file) {   // تصغير إلى 1600px كحد أقصى وتحويل إلى WebP لتوفير مساحة التخزين المجاني
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); if (!b) return reject(new Error("image")); if (b.size > 5 * 1048576) return reject(new Error(t("a.v.imgsize"))); resolve(b); }, "image/webp", 0.82);
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error(t("a.v.imgtype"))); }; im.src = url;
    });
  }
  function addFiles(files) {
    collect(); var errs = [];
    Array.prototype.forEach.call(files, function (file) {
      if (form.images.length >= MAXIMG) { errs.push(t("a.v.imgmax")); return; }
      if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0) { errs.push(file.name + ": " + t("a.v.imgtype")); return; }
      if (file.size > 8 * 1048576) { errs.push(file.name + ": " + t("a.v.imgsize")); return; }
      form.images.push({ file: file, url: URL.createObjectURL(file) });
    });
    renderForm(); if (errs.length) showErrs(errs);
  }
  function showErrs(list) { var b = $("#errs"); if (!b) return; b.innerHTML = '<div class="errs"><b>' + esc(t("a.v.fix")) + "</b><ul>" + list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; b.scrollIntoView({ block: "center" }); }

  /* ---------------------------------------------------------------- الحفظ */
  async function save() {
    if (busy) return; collect(); var f = form, errs = validate(f);
    if (errs.length) return showErrs(errs); $("#errs").innerHTML = "";
    var fileInput = $("#f-file"), file = f.type === "digital" && fileInput && fileInput.files[0];
    setBusy(true, t("a.f.saving")); var uploaded = [], createdId = null, newPriv = null;
    try {
      if (file && file.size > 50 * 1048576) throw new Error(t("a.v.filesize"));
      var fresh = f.images.filter(function (i) { return i.file; }), n = 0;
      for (var i = 0; i < fresh.length; i++) {
        $("#progress").textContent = t("a.f.uploading", { i: ++n, n: fresh.length });
        var blob = await processImage(fresh[i].file), ext = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" }[blob.type] || "webp", path = "products/" + uuid() + "." + ext;
        var up = await sb.storage.from("product-images").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
        if (up.error) { if (isAuthErr(up.error)) { expire(); throw new Handled(); } throw up.error; }
        uploaded.push(path); fresh[i].path = path;
      }
      var paths = f.images.map(function (im) { return im.path; }), row = buildProduct(f, paths), id = f.id;
      try {
        if (!id) { var ins = await db(sb.from("products").insert(row).select("id").single()); id = ins.id; createdId = id; }
        else await db(sb.from("products").update(row).eq("id", id));
      } catch (e) { if (e && e.code === "23505") throw new Error(t("a.v.dupslug")); throw e; }
      // النصوص: upsert للغات المعبّأة، وحذف اللغات التي أُفرغ اسمها
      var rows = [], empty = [];
      LANGS.forEach(function (l) {
        var x = f.tr[l];
        if (x.name.trim()) rows.push({ product_id: id, language: l, name: x.name.trim(), short_description: x.short.trim() || null, full_description: x.full.trim() || null, specifications: (f.type !== "service" ? x.specs.trim() : "") || null, deliverables: (f.type === "service" ? x.deliverables.trim() : "") || null, delivery_info: x.delivery.trim() || null });
        else empty.push(l);
      });
      await db(sb.from("product_translations").upsert(rows, { onConflict: "product_id,language" }));
      if (empty.length) await db(sb.from("product_translations").delete().eq("product_id", id).in("language", empty));
      // الملف الرقمي الخاص + بيانات المورّد (جدول خاص بالإدارة)
      var privPath = f.type === "digital" ? f.privPath : "";
      if (file) {
        $("#progress").textContent = t("a.f.uploadingfile");
        var safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+/, "").slice(-60) || "file", np = id + "/" + uuid() + "-" + safe;
        var u2 = await sb.storage.from("digital-files").upload(np, file, { upsert: false, contentType: file.type || "application/octet-stream" });
        if (u2.error) { if (isAuthErr(u2.error)) { expire(); throw new Handled(); } throw u2.error; }
        newPriv = np; var old = privPath; privPath = np; if (old) { try { await sb.storage.from("digital-files").remove([old]); } catch (e) {} }
      }
      var isP = f.type === "physical", hasPriv = (isP && (f.supName.trim() || f.supNotes.trim() || f.cost !== "")) || privPath;
      if (hasPriv || f.hadPriv) await db(sb.from("product_private").upsert({ product_id: id, supplier_name: isP ? (f.supName.trim() || null) : null, supplier_notes: isP ? (f.supNotes.trim() || null) : null, cost_price: isP && f.cost !== "" ? Number(f.cost) : null, digital_file_path: privPath || null }, { onConflict: "product_id" }));
      // حذف الصور التي أزالها المسؤول (بعد نجاح الحفظ فقط)
      var gone = f.origPaths.filter(function (p) { return paths.indexOf(p) < 0; });
      if (gone.length) { try { await sb.storage.from("product-images").remove(gone); } catch (e) {} }
      await loadAll(); setBusy(false); TS.toast(t("a.saved")); view = "list"; form = null; linkUrl = ""; render();
    } catch (e) {
      // تراجع: حذف المنتج الجديد (تُحذف نصوصه بالتتالي) والملفات المرفوعة حديثاً حتى لا تبقى بقايا
      if (createdId) { try { await sb.from("products").delete().eq("id", createdId); } catch (x) {} }
      if (uploaded.length) { try { await sb.storage.from("product-images").remove(uploaded); } catch (x) {} }
      if (newPriv) { try { await sb.storage.from("digital-files").remove([newPriv]); } catch (x) {} }
      if (!(e && e.handled)) { setBusy(false); var sv = $("#save"); if (sv) sv.textContent = t("a.f.save"); fail(e); showErrs([t("a.failed", { msg: (e && e.message) || String(e) })]); }
    }
  }

  /* ---------------------------------------------------------------- الأقسام */
  function renderCats() {
    var rows = cats.map(function (c) { return '<tr><td dir="ltr">' + esc(c.slug) + "</td><td>" + esc(TS.L(c.names)) + "</td><td>" + c.sortOrder + '</td><td><span class="pill ' + (c.active ? "on" : "off") + '">' + esc(t(c.active ? "a.status.published" : "a.status.hidden")) + '</span></td><td><div class="acts"><button class="btn sm" data-cedit="' + esc(c.id) + '">' + esc(t("a.edit")) + '</button><button class="btn sm danger" data-cdel="' + esc(c.id) + '">' + esc(t("a.delete")) + "</button></div></td></tr>"; }).join("");
    var ed = "";
    if (catForm) {
      ed = '<form id="cform" class="form fs" novalidate style="margin-bottom:18px"><div id="cerrs" role="alert"></div><div class="g2"><div class="fld"><label for="c-slug">' + esc(t("a.cat.slug")) + '</label><input id="c-slug" dir="ltr" maxlength="80" value="' + esc(catForm.slug) + '"></div><div class="fld"><label for="c-order">' + esc(t("a.cat.order")) + '</label><input id="c-order" type="number" step="1" value="' + esc(catForm.order) + '"></div></div>' +
        '<label class="chk"><input type="checkbox" id="c-active"' + (catForm.active ? " checked" : "") + "><span>" + esc(t("a.cat.active")) + '</span></label><div class="g2">' +
        LANGS.map(function (l) { return '<div class="fld"><label for="c-n-' + l + '">' + esc(t("a.cat.name")) + " (" + l.toUpperCase() + ")" + (l === "ar" ? " *" : "") + '</label><input id="c-n-' + l + '" maxlength="80" value="' + esc(catForm.names[l] || "") + '" dir="' + (l === "ar" ? "rtl" : "ltr") + '"></div>'; }).join("") + '</div><div class="acts"><button class="btn pri" type="submit" id="c-save">' + esc(t("a.f.save")) + '</button><button class="btn" type="button" data-ccancel>' + esc(t("cancel")) + "</button></div></form>";
    }
    root.innerHTML = frame('<div class="acts" style="margin-bottom:14px"><button class="btn pri" data-cnew>' + esc(t("a.cat.add")) + "</button></div>" + ed +
      (rows ? '<div class="scroll-x"><table class="tbl"><thead><tr><th>' + esc(t("a.cat.slug")) + "</th><th>" + esc(t("a.cat.name")) + "</th><th>" + esc(t("a.cat.order")) + "</th><th>" + esc(t("a.status")) + "</th><th>" + esc(t("a.col.actions")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : '<div class="empty">' + esc(t("a.none")) + "</div>"));
  }
  async function saveCat() {
    if (busy) return; var c = catForm, slug = V("c-slug").trim().toLowerCase(), names = {}; LANGS.forEach(function (l) { names[l] = V("c-n-" + l).trim(); });
    var order = parseInt(V("c-order"), 10); if (!isFinite(order)) order = 0;
    if (!SLUG.test(slug) || slug.length > 80 || !names.ar) { $("#cerrs").innerHTML = '<div class="errs">' + esc(t("a.cat.v")) + "</div>"; return; }
    var active = Ck("c-active"); setBusy(true); var createdId = null;
    try {
      var row = { slug: slug, sort_order: order, is_active: active }, id = c.id;
      try { if (!id) { var r = await db(sb.from("categories").insert(row).select("id").single()); id = r.id; createdId = id; } else await db(sb.from("categories").update(row).eq("id", id)); }
      catch (e) { if (e && e.code === "23505") throw new Error(t("a.v.dupslug")); throw e; }
      var rows = [], empty = []; LANGS.forEach(function (l) { if (names[l]) rows.push({ category_id: id, language: l, name: names[l] }); else empty.push(l); });
      await db(sb.from("category_translations").upsert(rows, { onConflict: "category_id,language" }));
      if (empty.length) await db(sb.from("category_translations").delete().eq("category_id", id).in("language", empty));
      await loadAll(); catForm = null; TS.toast(t("a.saved"));
    } catch (e) { if (createdId) { try { await sb.from("categories").delete().eq("id", createdId); } catch (x) {} } fail(e); }
    if (view !== "login") { setBusy(false); renderCats(); }
  }
  async function deleteCat(id) {
    var c = cats.filter(function (x) { return x.id === id; })[0]; if (!c || busy) return;
    if (!(await confirmDialog(t("a.confirm.title"), t("a.confirm.category", { name: TS.L(c.names) }), t("a.delete")))) return;
    setBusy(true); try { await db(sb.from("categories").delete().eq("id", id)); await loadAll(); TS.toast(t("a.deleted")); } catch (e) { fail(e); }
    if (view !== "login") { setBusy(false); renderCats(); }
  }

  /* ---------------------------------------------------------------- الأحداث */
  root.addEventListener("click", async function (e) {
    var b = e.target.closest("button"); if (!b || busy) return; var d = b.dataset;
    if (d.signout !== undefined) { manualOut = true; await sb.auth.signOut(); manualOut = false; session = null; return showLogin(); }
    if (d.go) { collect(); view = d.go; form = null; catForm = null; linkUrl = ""; return render(); }
    if (d.new !== undefined) { form = emptyForm(); view = "form"; linkUrl = ""; return renderForm(); }
    if (d.edit) { form = formFrom(products.filter(function (p) { return p.id === d.edit; })[0]); view = "form"; linkUrl = ""; return renderForm(); }
    if (d.pub) { var p1 = products.filter(function (p) { return p.id === d.pub; })[0]; return patchProduct(d.pub, { is_published: !p1.published }); }
    if (d.feat) { var p2 = products.filter(function (p) { return p.id === d.feat; })[0]; return patchProduct(d.feat, { is_featured: !p2.featured }); }
    if (d.del) return deleteProduct(d.del);
    if (d.pg) { page = Math.max(1, page + (+d.pg)); return renderList(); }
    if (d.vadd !== undefined) { collect(); form.variants.push({ ar: "", fr: "", en: "", options: "" }); return renderForm(); }
    if (d.vdel) { collect(); form.variants.splice(+d.vdel, 1); return renderForm(); }
    if (d.imdel) { collect(); form.images.splice(+d.imdel - 1, 1); return renderForm(); }
    if (d.imup || d.imdown) { collect(); var i = +(d.imup || d.imdown) - 1, j = d.imup ? i - 1 : i + 1; if (j >= 0 && j < form.images.length) { var tmp = form.images[i]; form.images[i] = form.images[j]; form.images[j] = tmp; } return renderForm(); }
    if (d.link !== undefined) {
      try { var r = await sb.storage.from("digital-files").createSignedUrl(form.privPath, 86400); if (r.error) { if (isAuthErr(r.error)) { expire(); return; } throw r.error; } linkUrl = r.data.signedUrl; collect(); renderForm(); } catch (err) { fail(err); } return;
    }
    if (d.copy !== undefined) { try { await navigator.clipboard.writeText(linkUrl); } catch (x) { var o = $("#f-linkout"); o.select(); document.execCommand("copy"); } TS.toast(t("a.f.copied")); return; }
    if (d.cnew !== undefined) { catForm = { id: null, slug: "", order: String((cats.length + 1) * 10), active: true, names: {} }; return renderCats(); }
    if (d.cedit) { var c = cats.filter(function (x) { return x.id === d.cedit; })[0]; catForm = { id: c.id, slug: c.slug, order: String(c.sortOrder), active: c.active, names: Object.assign({}, c.names) }; return renderCats(); }
    if (d.ccancel !== undefined) { catForm = null; return renderCats(); }
    if (d.cdel) return deleteCat(d.cdel);
  });
  root.addEventListener("submit", function (e) { e.preventDefault(); if (e.target.id === "pform") save(); else if (e.target.id === "cform") saveCat(); else if (e.target.id === "login") doLogin(); });
  root.addEventListener("change", function (e) {
    var id = e.target.id;
    if (id === "f-type" || id === "f-ful" || id === "f-quote") { collect(); renderForm(); }
    else if (id === "f-img") { addFiles(e.target.files); e.target.value = ""; }
    else if (id === "a-t") { F.type = e.target.value; page = 1; renderList(); } else if (id === "a-s") { F.status = e.target.value; page = 1; renderList(); } else if (id === "a-c") { F.cat = e.target.value; page = 1; renderList(); }
  });
  root.addEventListener("input", function (e) {
    var id = e.target.id;
    if (id === "a-q") { F.q = e.target.value; F._focus = true; page = 1; renderList(); F._focus = false; }
    else if (id === "f-slug") form.slugTouched = true;
    else if (/^f-name-(fr|en)$/.test(id) && form && !form.slugTouched && !form.id) { $("#f-slug").value = slugify(V("f-name-en") || V("f-name-fr")); }
  });

  /* ---------------------------------------------------------------- الإقلاع */
  TS.onRender(function () { if (bootMsg) msgBox(bootMsg); else if (sb) render(); });
  TS.start();
  if (C.DEMO_MODE || !TS.api.configured()) { bootMsg = "a.notconfigured"; msgBox(bootMsg); return; }
  try { sb = TS.api.client({ auth: true }); } catch (e) { bootMsg = "a.nolib"; msgBox(bootMsg); return; }
  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT" && !manualOut && view !== "login") { session = null; showLogin(t("a.expired")); } });
  showLogin();
  sb.auth.getSession().then(function (r) { session = r.data.session; if (session) enter(); }).catch(function () {});
})();
