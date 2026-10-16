/* Triple A Store — admin-portfolio.js (إضافة مستقلة: تبويب "إدارة المعرض" في لوحة الإدارة)
   يدير مشاريع موقع المعرض (Triple A Studio) المخزَّنة في نفس مشروع Supabase.
   يعمل فقط إذا نُفِّذ 006_portfolio.sql (و007). يستدعيه admin.js عبر window.TSAdminPortfolio.
   لإلغاء الميزة احذف وسم <script> الخاص به من admin.html (يختفي التبويب ولا يتأثر شيء آخر).
   ⚠ الأمان الحقيقي في Supabase (RLS + is_admin()). هذا الملف واجهة فقط ولا يحوي أي مفتاح سري.
   الصور: تُرفع إلى الـbucket العام الموجود "product-images" تحت المسار portfolio/ بنفس سياساته الحالية. */
(function () {
  "use strict";
  var TS = window.TS, t = TS.t, esc = TS.esc, $ = TS.$, LANGS = ["ar", "fr", "en"];
  var TABLE = "portfolio_projects", BUCKET = "product-images", PREFIX = "portfolio/", MAXGAL = 20, PER = 10;
  var SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  var LINKS = [["live", "a.pf.l.live"], ["github", "GitHub"], ["behance", "Behance"], ["instagram", "Instagram"], ["video", "a.pf.l.video"], ["website", "a.pf.l.website"]];
  var TEXTS = [["title", "a.pf.f.title", 120, 1], ["desc", "a.pf.f.desc", 300, 2], ["overview", "a.pf.f.overview", 1800, 4], ["challenge", "a.pf.f.challenge", 1800, 4], ["solution", "a.pf.f.solution", 1800, 4], ["results", "a.pf.f.results", 1800, 4]];

  var ctx = null, wired = false, navClick = false, mode = "list", loaded = false;
  var projects = [], cats = [], colls = [], F = { q: "", status: "", cat: "" }, page = 1, form = null;

  /* ---------------------------------------------------------------- أدوات */
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
  function slugify(s) { return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
  function isStorage(s) { return /^portfolio\//.test(s || ""); }
  // رابط العرض داخل لوحة الإدارة: مسار التخزين → رابط عام، https → كما هو، غير ذلك (مسار محلي قديم) → لا معاينة
  function imgUrl(s) { if (!s) return ""; if (isStorage(s)) return TS.api.imageUrl(s); return /^https:\/\//i.test(s) ? s : ""; }
  function norm(r) {
    var o = function (x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; };
    return { id: r.id, slug: r.slug, category: r.category_slug, collection: r.collection_slug || "", title: o(r.title), desc: o(r.description), overview: o(r.overview), challenge: o(r.challenge), solution: o(r.solution), results: o(r.results),
      services: o(r.services), tools: Array.isArray(r.tools) ? r.tools : [], year: r.year || "", client: r.client || "", cover: r.cover || "", coverRatio: r.cover_ratio || "", coverW: r.cover_w || null, coverH: r.cover_h || null,
      gallery: Array.isArray(r.gallery) ? r.gallery : [], pdf: r.pdf_url || "", links: o(r.links), order: r.sort_order || 0, featured: !!r.is_featured, published: !!r.is_published, created: r.created_at || "" };
  }
  function titleOf(p) { return TS.L(p.title) || p.slug; }
  function catName(slug) { var c = cats.filter(function (x) { return x.slug === slug; })[0]; return c ? TS.L(c.names) : slug; }
  function collName(slug) { var c = colls.filter(function (x) { return x.slug === slug; })[0]; return c ? TS.L(c.names) : slug; }
  function sortProjects() { projects.sort(function (a, b) { return (a.order - b.order) || (a.created < b.created ? 1 : -1); }); }
  function storagePaths(p) { var out = []; if (isStorage(p.cover)) out.push(p.cover); (p.gallery || []).forEach(function (g) { if (g && isStorage(g.src)) out.push(g.src); }); return out; }
  var V = function (id) { var e = $("#" + id); return e ? e.value : ""; }, Ck = function (id) { var e = $("#" + id); return e ? e.checked : false; };

  function tab(active) { return '<button class="btn sm' + (active ? " pri" : "") + '" data-go="portfolio">' + esc(t("a.pf")) + "</button>"; }

  /* ---------------------------------------------------------------- الحالة */
  function start(c) { ctx = c; wire(); stop(); }
  function stop() { releaseForm(); projects = []; cats = []; colls = []; F = { q: "", status: "", cat: "" }; page = 1; form = null; mode = "list"; loaded = false; navClick = false; }

  async function load() {
    var r = await Promise.all([
      ctx.db(ctx.sb.from(TABLE).select("*").order("sort_order").limit(1000)),
      ctx.db(ctx.sb.from("portfolio_categories").select("*").order("sort_order")),
      ctx.db(ctx.sb.from("portfolio_collections").select("*").order("sort_order"))
    ]);
    projects = r[0].map(norm); sortProjects();
    cats = r[1].map(function (c) { return { id: c.id, slug: c.slug, names: c.names || {}, active: c.is_active !== false }; });
    colls = r[2].map(function (c) { return { id: c.id, slug: c.slug, category: c.category_slug, names: c.names || {}, active: c.is_active !== false }; });
    loaded = true;
  }

  async function render(c) {
    ctx = c; wire();
    if (navClick) { navClick = false; if (mode === "form") { releaseForm(); form = null; } mode = "list"; }
    if (mode === "form" && form) { collectForm(); return renderForm(); }
    if (!loaded) {
      ctx.root.innerHTML = ctx.frame('<div class="skel" style="max-width:420px"></div>');
      try { await load(); } catch (e) {
        if (e && e.handled) return; if (ctx.view() !== "portfolio") return;
        var missing = e && (e.code === "42P01" || e.code === "PGRST205" || /portfolio_/.test(e.message || ""));
        ctx.root.innerHTML = ctx.frame('<div class="msg err" role="alert">' + esc(missing ? t("a.pf.missing") : (e && e.message) || String(e)) + "</div>"); return;
      }
      if (ctx.view() !== "portfolio") return;
    }
    draw();
  }

  /* ---------------------------------------------------------------- القائمة */
  function filtered() {
    var q = TS.norm(F.q);
    return projects.filter(function (p) {
      if (F.cat && p.category !== F.cat) return false;
      if (F.status === "published" && !p.published) return false; if (F.status === "hidden" && p.published) return false;
      if (q) { var h = TS.norm(p.slug + " " + LANGS.map(function (l) { return p.title[l] || ""; }).join(" ")); if (h.indexOf(q) < 0) return false; }
      return true;
    });
  }
  function draw() {
    var opt = function (arr, cur, all) { return '<option value="">' + esc(all) + "</option>" + arr.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); };
    ctx.root.innerHTML = ctx.frame(
      '<p class="disc" style="margin-bottom:14px">' + esc(t("a.pf.help")) + "</p>" +
      '<div class="acts" style="justify-content:space-between;align-items:center;margin-bottom:14px"><div class="acts" style="align-items:center"><span class="note" id="pf-total"></span><button class="btn sm" type="button" data-pact="refresh">' + esc(t("a.pf.refresh")) + '</button></div><button class="btn pri" type="button" data-pact="new">' + esc(t("a.pf.add")) + "</button></div>" +
      '<div class="filters"><label class="sr" for="pf-q">' + esc(t("a.pf.search")) + '</label><input id="pf-q" type="search" value="' + esc(F.q) + '" placeholder="' + esc(t("a.pf.search")) + '">' +
      '<label class="sr" for="pf-st">' + esc(t("a.status")) + '</label><select id="pf-st">' + opt([["published", t("a.status.published")], ["hidden", t("a.status.hidden")]], F.status, t("a.pf.f.allstatus")) + "</select>" +
      '<label class="sr" for="pf-cat">' + esc(t("a.pf.col.category")) + '</label><select id="pf-cat">' + opt(cats.map(function (c) { return [c.slug, TS.L(c.names)]; }), F.cat, t("a.pf.f.allcat")) + "</select></div>" +
      '<div id="pf-results"></div>');
    drawResults();
  }
  function drawResults() {
    var box = $("#pf-results"); if (!box) return;
    var list = filtered(), pages = Math.max(1, Math.ceil(list.length / PER)); page = Math.min(page, pages);
    var tot = $("#pf-total"); if (tot) tot.textContent = t("a.pf.total", { n: list.length });
    var rows = list.slice((page - 1) * PER, page * PER).map(function (p) {
      var u = imgUrl(p.cover), id = esc(p.id);
      return '<tr data-pid="' + id + '"><td><div class="acts" style="flex-wrap:nowrap"><div class="thm">' + TS.imgHtml(u, titleOf(p), "service") + "</div><div><b>" + esc(titleOf(p)) + '</b><br><small class="note" dir="ltr">' + esc(p.slug) + "</small></div></div></td>" +
        "<td>" + esc(catName(p.category)) + (p.collection ? '<br><small class="note">' + esc(collName(p.collection)) + "</small>" : "") + "</td><td>" + p.order + "</td>" +
        '<td><span class="pill ' + (p.published ? "on" : "off") + '">' + esc(t(p.published ? "a.status.published" : "a.status.hidden")) + "</span>" + (p.featured ? ' <span class="pill on">★</span>' : "") + "</td>" +
        '<td><div class="acts"><button class="btn sm" type="button" data-pact="edit" data-id="' + id + '">' + esc(t("a.edit")) + '</button><button class="btn sm" type="button" data-pact="pub" data-id="' + id + '">' + esc(t(p.published ? "a.hide" : "a.publish")) + '</button><button class="btn sm" type="button" data-pact="feat" data-id="' + id + '">' + esc(t(p.featured ? "a.unfeature" : "a.feature")) + '</button><button class="btn sm danger" type="button" data-pact="del" data-id="' + id + '">' + esc(t("a.delete")) + "</button></div></td></tr>";
    }).join("");
    box.innerHTML = (rows ? '<div class="scroll-x"><table class="tbl"><thead><tr><th>' + esc(t("a.pf.col.project")) + "</th><th>" + esc(t("a.pf.col.category")) + "</th><th>" + esc(t("a.pf.col.order")) + "</th><th>" + esc(t("a.status")) + "</th><th>" + esc(t("a.col.actions")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" : '<div class="empty">' + esc(t(projects.length ? "a.none" : "a.pf.empty")) + "</div>") +
      '<div class="pager"><button class="btn sm" type="button" data-pact="pg" data-d="-1"' + (page <= 1 ? " disabled" : "") + ">" + esc(t("a.prev")) + "</button><span>" + esc(t("a.page", { p: page, n: pages })) + '</span><button class="btn sm" type="button" data-pact="pg" data-d="1"' + (page >= pages ? " disabled" : "") + ">" + esc(t("a.next")) + "</button></div>";
  }

  // أي عملية تنتهي: أعد الرسم فقط إذا بقينا في هذا التبويب (وليس بعد انتهاء الجلسة)
  function done() { var v = ctx.view(); if (v === "portfolio") { ctx.setBusy(false); if (mode === "form" && form) renderForm(); else draw(); } else if (v !== "login") ctx.setBusy(false); }
  async function patch(id, p) {
    if (ctx.busy()) return; ctx.setBusy(true);
    try { await ctx.db(ctx.sb.from(TABLE).update(p).eq("id", id)); await load(); TS.toast(t("a.saved")); } catch (e) { ctx.fail(e); }
    done();
  }
  async function remove(id) {
    var p = projects.filter(function (x) { return x.id === id; })[0]; if (!p || ctx.busy()) return;
    if (!(await ctx.confirmDialog(t("a.confirm.title"), t("a.pf.confirm", { name: titleOf(p) }), t("a.delete")))) return;
    ctx.setBusy(true);
    try {
      await ctx.db(ctx.sb.from(TABLE).delete().eq("id", id));
      var paths = storagePaths(p);   // نحذف فقط ما رفعه المعرض نفسه (portfolio/) — لا صور المنتجات ولا الروابط الخارجية ولا الملفات المحلية
      if (paths.length) { try { await ctx.sb.storage.from(BUCKET).remove(paths); } catch (e) { /* تنظيف اختياري */ } }
      await load(); TS.toast(t("a.deleted"));
    } catch (e) { ctx.fail(e); }
    done();
  }

  /* ---------------------------------------------------------------- النموذج */
  function emptyForm() {
    var tr = {}; LANGS.forEach(function (l) { tr[l] = { title: "", desc: "", overview: "", challenge: "", solution: "", results: "", services: "" }; });
    var max = projects.reduce(function (m, p) { return Math.max(m, p.order); }, 0);
    return { id: null, slug: "", slugTouched: false, category: "", collection: "", published: false, featured: false, order: String(max + 10), year: "", client: "", tr: tr, tools: "",
      cover: null, coverRatio: "", gallery: [], pdf: "", links: { live: "", github: "", behance: "", instagram: "", video: "", website: "" }, whatsapp: false, origLinks: {}, origPaths: [] };
  }
  function formFrom(p) {
    var f = emptyForm(); f.id = p.id; f.slug = p.slug; f.slugTouched = true; f.category = p.category; f.collection = p.collection; f.published = p.published; f.featured = p.featured; f.order = String(p.order);
    f.year = p.year; f.client = p.client; f.tools = p.tools.join(", "); f.pdf = p.pdf; f.coverRatio = p.coverRatio;
    LANGS.forEach(function (l) { var x = f.tr[l]; x.title = p.title[l] || ""; x.desc = p.desc[l] || ""; x.overview = p.overview[l] || ""; x.challenge = p.challenge[l] || ""; x.solution = p.solution[l] || ""; x.results = p.results[l] || ""; x.services = (Array.isArray(p.services[l]) ? p.services[l] : []).join("\n"); });
    if (p.cover) f.cover = { src: p.cover, url: imgUrl(p.cover), w: p.coverW, h: p.coverH };
    f.gallery = p.gallery.filter(function (g) { return g && g.src; }).map(function (g) { return { src: g.src, url: imgUrl(g.src), w: g.w || null, h: g.h || null }; });
    LINKS.forEach(function (k) { f.links[k[0]] = typeof p.links[k[0]] === "string" ? p.links[k[0]] : ""; });
    f.whatsapp = !!p.links.whatsapp; f.origLinks = JSON.parse(JSON.stringify(p.links)); f.origPaths = storagePaths(p);
    return f;
  }
  function releaseForm() {
    if (!form) return;
    [form.cover].concat(form.gallery || []).forEach(function (i) { if (i && i.file && i.url) { try { URL.revokeObjectURL(i.url); } catch (e) {} } });
  }
  function collect() { collectForm(); }
  function collectForm() {
    if (!form || !$("#pf-form")) return; var f = form;
    f.slug = V("pf-slug").trim().toLowerCase(); f.category = V("pf-category"); f.collection = V("pf-collection"); f.published = Ck("pf-pub"); f.featured = Ck("pf-feat"); f.order = V("pf-order");
    f.year = V("pf-year"); f.client = V("pf-client"); f.tools = V("pf-tools"); f.pdf = V("pf-pdf"); f.whatsapp = Ck("pf-wa");
    LANGS.forEach(function (l) { TEXTS.forEach(function (x) { var e = $("#pf-" + x[0] + "-" + l); if (e) f.tr[l][x[0]] = e.value; }); var s = $("#pf-services-" + l); if (s) f.tr[l].services = s.value; });
    LINKS.forEach(function (k) { var e = $("#pf-l-" + k[0]); if (e) f.links[k[0]] = e.value; });
  }

  function thumb(it, alt) {
    var u = it.url || "";
    if (u) return TS.imgHtml(u, alt || "", "service");
    var name = String(it.src || "").split("/").pop();
    return TS.imgHtml("", alt || "", "service") + (name ? '<small class="note" dir="ltr" title="' + esc(t("a.pf.f.img.local")) + '" style="display:block;font-size:.65rem;word-break:break-all;padding:2px 4px">' + esc(name) + "</small>" : "");
  }
  function renderForm() {
    var f = form, fld = function (label, id, inner, hint) { return '<div class="fld"><label for="' + id + '">' + esc(label) + "</label>" + inner + (hint ? "<small>" + esc(hint) + "</small>" : "") + "</div>"; };
    var inp = function (id, val, extra) { return '<input id="' + id + '" value="' + esc(val) + '" ' + (extra || "") + ">"; };
    var ck = function (id, label, on) { return '<label class="chk"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "><span>" + esc(label) + "</span></label>"; };
    var lbl = function (k) { return k.indexOf("a.") === 0 ? t(k) : k; };
    var catOpts = '<option value="">' + esc(t("a.pf.f.pickcat")) + "</option>" + cats.map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === f.category ? " selected" : "") + ">" + esc(TS.L(c.names)) + "</option>"; }).join("");
    var collOpts = '<option value="">' + esc(t("a.pf.f.nocoll")) + "</option>" + colls.filter(function (c) { return c.category === f.category; }).map(function (c) { return '<option value="' + esc(c.slug) + '"' + (c.slug === f.collection ? " selected" : "") + ">" + esc(TS.L(c.names)) + "</option>"; }).join("");
    var langs = LANGS.map(function (l) {
      var x = f.tr[l];
      return '<div class="lang-b" lang="' + l + '" dir="' + (l === "ar" ? "rtl" : "ltr") + '"><h4>' + { ar: "العربية", fr: "Français", en: "English" }[l] + "</h4>" +
        TEXTS.map(function (d) {
          var label = t(d[1]) + (d[0] === "title" && l === "ar" ? " *" : "");
          return fld(label, "pf-" + d[0] + "-" + l, d[3] === 1 ? inp("pf-" + d[0] + "-" + l, x[d[0]], 'maxlength="' + d[2] + '"') : '<textarea id="pf-' + d[0] + "-" + l + '" maxlength="' + d[2] + '" rows="' + d[3] + '">' + esc(x[d[0]]) + "</textarea>");
        }).join("") +
        fld(t("a.pf.f.services"), "pf-services-" + l, '<textarea id="pf-services-' + l + '" maxlength="800" rows="3">' + esc(x.services) + "</textarea>") + "</div>";
    }).join("");
    var gal = f.gallery.map(function (g, i) {
      return '<div class="im"><div class="pv">' + thumb(g) + '</div><div class="row"><button type="button" data-pact="gup" data-i="' + i + '">' + esc(t("a.f.img.left")) + '</button><button type="button" data-pact="gdown" data-i="' + i + '">' + esc(t("a.f.img.right")) + '</button><button type="button" data-pact="gdel" data-i="' + i + '" aria-label="' + esc(t("a.delete")) + '">✕</button></div></div>';
    }).join("");
    var cover = f.cover ? '<div class="imgs"><div class="im"><div class="pv">' + thumb(f.cover) + '</div><span class="pill on">' + esc(t("a.f.img.main")) + '</span><div class="row"><button type="button" data-pact="cdel" aria-label="' + esc(t("a.delete")) + '">✕</button></div></div></div>' : '<p class="hint">' + esc(t("a.pf.f.cover.none")) + "</p>";
    var links = LINKS.map(function (k) { return fld(lbl(k[1]), "pf-l-" + k[0], inp("pf-l-" + k[0], f.links[k[0]], 'dir="ltr" inputmode="url" maxlength="500" autocapitalize="off" spellcheck="false"')); }).join("");
    ctx.root.innerHTML = ctx.frame('<form id="pf-form" class="form" novalidate><h2>' + esc(t(f.id ? "a.pf.edit.title" : "a.pf.new.title")) + '</h2><div id="errs" role="alert"></div>' +
      '<fieldset class="fs"><legend>' + esc(t("a.pf.f.basic")) + '</legend><div class="g2">' +
      fld(t("a.pf.f.category") + " *", "pf-category", '<select id="pf-category">' + catOpts + "</select>") +
      fld(t("a.pf.f.collection"), "pf-collection", '<select id="pf-collection">' + collOpts + "</select>") +
      fld(t("a.pf.f.slug"), "pf-slug", inp("pf-slug", f.slug, 'dir="ltr" maxlength="100" autocapitalize="off" spellcheck="false"'), t("a.pf.f.slug.hint")) +
      fld(t("a.pf.f.order"), "pf-order", inp("pf-order", f.order, 'type="number" step="1" min="-100000" max="100000" inputmode="numeric"')) +
      fld(t("a.pf.f.year"), "pf-year", inp("pf-year", f.year, 'maxlength="10"')) + fld(t("a.pf.f.client"), "pf-client", inp("pf-client", f.client, 'maxlength="200"')) + "</div>" +
      '<div class="g2">' + ck("pf-pub", t("a.f.published"), f.published) + ck("pf-feat", t("a.pf.f.featured"), f.featured) + "</div></fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.f.texts")) + "</legend>" + langs + "</fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.pf.f.tools")) + "</legend>" + inp("pf-tools", f.tools, 'maxlength="600"') + "</fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.pf.f.cover")) + "</legend>" + cover + '<div><label class="btn sm" for="pf-cover" style="cursor:pointer">' + esc(t("a.pf.f.cover.pick")) + '</label><input id="pf-cover" type="file" accept="image/jpeg,image/png,image/webp" class="sr"></div><p class="hint">' + esc(t("a.pf.f.img.hint")) + "</p></fieldset>" +
      '<fieldset class="fs"><legend>' + esc(t("a.pf.f.gallery")) + '</legend><div class="imgs">' + gal + '</div><div><label class="btn sm" for="pf-gal" style="cursor:pointer">' + esc(t("a.pf.f.gallery.add")) + '</label><input id="pf-gal" type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr"></div></fieldset>' +
      '<fieldset class="fs"><legend>' + esc(t("a.pf.f.links")) + '</legend><div class="g2">' + links + fld(t("a.pf.l.pdf"), "pf-pdf", inp("pf-pdf", f.pdf, 'dir="ltr" inputmode="url" maxlength="500" autocapitalize="off" spellcheck="false"')) + "</div>" + ck("pf-wa", t("a.pf.l.whatsapp"), f.whatsapp) + "</fieldset>" +
      '<div class="acts"><button class="btn pri lg" type="submit" id="save">' + esc(t("a.f.save")) + '</button><button class="btn lg" type="button" data-pact="cancel">' + esc(t("a.f.cancel")) + '</button></div><p class="progress" id="progress" role="status" aria-live="polite"></p></form>');
  }
  function showErrs(list) { var b = $("#errs"); if (!b) return; b.innerHTML = '<div class="errs"><b>' + esc(t("a.v.fix")) + "</b><ul>" + list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>"; b.scrollIntoView({ block: "center" }); }

  /* ---------------------------------------------------------------- التحقق (واجهة؛ الخادم يفرض قيوداً مماثلة عبر CHECK) */
  function lines(s) { return String(s || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function parseTools(s) { var seen = {}; return String(s || "").split(/[,،]/).map(function (x) { return x.trim(); }).filter(function (x) { if (!x || seen[x.toLowerCase()]) return false; seen[x.toLowerCase()] = 1; return true; }); }
  function validUrl(u) { return /^https?:\/\/[^\s]+$/i.test(u); }
  function validate(f) {
    var e = [];
    if (!f.tr.ar.title.trim()) e.push(t("a.pf.v.title"));
    if (!f.slug) f.slug = slugify(f.tr.en.title || f.tr.fr.title) || ("project-" + uuid().slice(0, 6));
    if (!SLUG.test(f.slug) || f.slug.length > 100) e.push(t("a.v.slug"));
    if (!f.category) e.push(t("a.pf.v.cat"));
    else if (f.collection && !colls.some(function (c) { return c.slug === f.collection && c.category === f.category; })) e.push(t("a.pf.v.coll"));
    var o = Number(f.order); if (f.order === "" || !Number.isInteger(o) || Math.abs(o) > 100000) e.push(t("a.pf.v.order"));
    if (f.year.length > 10) e.push(t("a.pf.v.long", { name: t("a.pf.f.year") })); if (f.client.length > 200) e.push(t("a.pf.v.long", { name: t("a.pf.f.client") }));
    LANGS.forEach(function (l) {
      var ls = lines(f.tr[l].services);
      if (ls.length > 10 || ls.some(function (x) { return x.length > 80; })) e.push(t("a.pf.v.long", { name: t("a.pf.f.services") + " (" + l.toUpperCase() + ")" }));
    });
    var tools = parseTools(f.tools); if (tools.length > 20 || tools.some(function (x) { return x.length > 40; })) e.push(t("a.pf.v.long", { name: t("a.pf.f.tools") }));
    LINKS.forEach(function (k) { var v = (f.links[k[0]] || "").trim(); if (v && (!validUrl(v) || v.length > 500)) e.push(t("a.pf.v.url", { name: k[1].indexOf("a.") === 0 ? t(k[1]) : k[1] })); });
    var pdf = f.pdf.trim(); if (pdf && !(validUrl(pdf) || /^[\w .\/()-]+\.pdf$/i.test(pdf))) e.push(t("a.pf.v.url", { name: t("a.pf.l.pdf") }));
    if (f.gallery.length > MAXGAL) e.push(t("a.pf.v.gal", { n: MAXGAL }));
    return e;
  }

  function buildRow(f) {
    var obj = function (key) { var o = {}; LANGS.forEach(function (l) { var v = f.tr[l][key].trim(); if (v) o[l] = v; }); return o; };
    var services = {}; LANGS.forEach(function (l) { var a = lines(f.tr[l].services); if (a.length) services[l] = a; });
    var links = Object.assign({}, f.origLinks || {});
    LINKS.forEach(function (k) { var v = (f.links[k[0]] || "").trim(); if (v) links[k[0]] = v; else delete links[k[0]]; });
    if (f.whatsapp) { if (typeof links.whatsapp !== "string") links.whatsapp = true; } else delete links.whatsapp;
    var cv = f.cover, np = function (i) { return i._np || i.src; };
    return {
      slug: f.slug, category_slug: f.category, collection_slug: f.collection || null,
      title: obj("title"), description: obj("desc"), overview: obj("overview"), challenge: obj("challenge"), solution: obj("solution"), results: obj("results"),
      services: services, tools: parseTools(f.tools), year: f.year.trim() || null, client: f.client.trim() || null,
      cover: cv ? np(cv) : null, cover_ratio: cv && !cv.file && f.coverRatio ? f.coverRatio : null, cover_w: cv && cv.w && cv.h ? cv.w : null, cover_h: cv && cv.w && cv.h ? cv.h : null,
      gallery: f.gallery.map(function (g) { var o = { src: np(g) }; if (g.w && g.h) { o.w = g.w; o.h = g.h; } return o; }),
      pdf_url: f.pdf.trim() || null, links: links, sort_order: parseInt(f.order, 10), is_featured: f.featured, is_published: f.published
    };
  }

  /* ---------------------------------------------------------------- الصور */
  function processImage(file) {   // تصغير إلى 1600px كحد أقصى وتحويل إلى WebP (نفس معالجة صور المنتجات)
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); if (!b) return reject(new Error("image")); if (b.size > 5 * 1048576) return reject(new Error(t("a.v.imgsize"))); resolve({ blob: b, w: c.width, h: c.height }); }, "image/webp", 0.82);
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error(t("a.v.imgtype"))); }; im.src = url;
    });
  }
  function okFile(file, errs) {
    if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0) { errs.push(file.name + ": " + t("a.v.imgtype")); return false; }
    if (file.size > 8 * 1048576) { errs.push(file.name + ": " + t("a.v.imgsize")); return false; } return true;
  }
  function setCover(file) {
    collectForm(); var errs = []; if (!okFile(file, errs)) { renderForm(); return showErrs(errs); }
    if (form.cover && form.cover.file && form.cover.url) { try { URL.revokeObjectURL(form.cover.url); } catch (e) {} }
    form.cover = { file: file, url: URL.createObjectURL(file) }; renderForm();
  }
  function addGallery(files) {
    collectForm(); var errs = [];
    Array.prototype.forEach.call(files, function (file) {
      if (form.gallery.length >= MAXGAL) { errs.push(t("a.pf.v.gal", { n: MAXGAL })); return; }
      if (okFile(file, errs)) form.gallery.push({ file: file, url: URL.createObjectURL(file) });
    });
    renderForm(); if (errs.length) showErrs(errs);
  }

  /* ---------------------------------------------------------------- الحفظ */
  async function save() {
    if (ctx.busy()) return; collectForm(); var f = form, errs = validate(f);
    if (errs.length) return showErrs(errs); $("#errs").innerHTML = "";
    ctx.setBusy(true, t("a.f.saving")); var uploaded = [], items = [], written = false;
    try {
      var fresh = [f.cover].concat(f.gallery).filter(function (i) { return i && i.file; }), n = 0;
      for (var i = 0; i < fresh.length; i++) {
        $("#progress").textContent = t("a.f.uploading", { i: ++n, n: fresh.length });
        var r = await processImage(fresh[i].file), path = PREFIX + uuid() + ".webp";
        var up = await ctx.sb.storage.from(BUCKET).upload(path, r.blob, { contentType: r.blob.type, cacheControl: "31536000", upsert: false });
        if (up.error) { if (ctx.isAuthErr(up.error)) { ctx.expire(); throw new ctx.Handled(); } throw up.error; }
        uploaded.push(path); fresh[i]._np = path; fresh[i]._w = r.w; fresh[i]._h = r.h; items.push(fresh[i]);
      }
      items.forEach(function (it) { it.w = it._w; it.h = it._h; });   // الأبعاد الحقيقية بعد التصغير (لتحسين تحميل المعرض)
      var row = buildRow(f), id = f.id;
      try {
        if (!id) await ctx.db(ctx.sb.from(TABLE).insert(row));
        else await ctx.db(ctx.sb.from(TABLE).update(row).eq("id", id));
      } catch (e) { if (e && e.code === "23505") throw new Error(t("a.pf.v.dupslug")); throw e; }
      written = true;   // من هنا فصاعداً الصور المرفوعة مرتبطة بصف محفوظ: لا يجوز حذفها عند أي خطأ لاحق
      // احذف صور المعرض التي أزالها المسؤول (فقط ما تحت portfolio/ — لا صور المنتجات ولا الروابط الخارجية)
      var finalPaths = [row.cover].concat(row.gallery.map(function (g) { return g.src; })).filter(isStorage);
      var gone = f.origPaths.filter(function (p) { return finalPaths.indexOf(p) < 0; });
      if (gone.length) { try { await ctx.sb.storage.from(BUCKET).remove(gone); } catch (e) { /* تنظيف اختياري */ } }
      releaseForm(); form = null; mode = "list"; TS.toast(t("a.saved"));
      try { await load(); } catch (e) { ctx.fail(e); }   // فشل إعادة التحميل لا يعني فشل الحفظ
      ctx.setBusy(false); if (ctx.view() === "portfolio") draw();
    } catch (e) {
      if (!written) {
        // تراجع: احذف الصور المرفوعة حديثاً حتى لا تبقى بقايا، وأبقِ النموذج كما هو ليعيد المسؤول المحاولة
        if (uploaded.length) { try { await ctx.sb.storage.from(BUCKET).remove(uploaded); } catch (x) {} }
        items.forEach(function (it) { delete it._np; });
      }
      if (!(e && e.handled)) { ctx.setBusy(false); var sv = $("#save"); if (sv) sv.textContent = t("a.f.save"); ctx.fail(e); showErrs([t("a.failed", { msg: (e && e.message) || String(e) })]); }
    }
  }

  /* ---------------------------------------------------------------- الأحداث */
  async function act(b) {
    var a = b.dataset.pact, id = b.dataset.id;
    if (a === "pg") { page = Math.max(1, page + (+b.dataset.d)); return drawResults(); }
    if (ctx.busy()) return;
    if (a === "refresh") { loaded = false; return render(ctx); }
    if (a === "new") { form = emptyForm(); mode = "form"; return renderForm(); }
    if (a === "edit") { var p0 = projects.filter(function (x) { return x.id === id; })[0]; if (!p0) return; form = formFrom(p0); mode = "form"; return renderForm(); }
    if (a === "cancel") { releaseForm(); form = null; mode = "list"; return draw(); }
    if (a === "pub" || a === "feat") { var p = projects.filter(function (x) { return x.id === id; })[0]; if (!p) return; return patch(id, a === "pub" ? { is_published: !p.published } : { is_featured: !p.featured }); }
    if (a === "del") return remove(id);
    if (!form) return; collectForm();
    if (a === "cdel") { if (form.cover && form.cover.file && form.cover.url) { try { URL.revokeObjectURL(form.cover.url); } catch (e) {} } form.cover = null; return renderForm(); }
    var i = +b.dataset.i;
    if (a === "gdel") { var g = form.gallery[i]; if (g && g.file && g.url) { try { URL.revokeObjectURL(g.url); } catch (e) {} } form.gallery.splice(i, 1); return renderForm(); }
    if (a === "gup" || a === "gdown") { var j = a === "gup" ? i - 1 : i + 1; if (j >= 0 && j < form.gallery.length) { var tmp = form.gallery[i]; form.gallery[i] = form.gallery[j]; form.gallery[j] = tmp; } return renderForm(); }
  }
  function wire() {
    if (wired) return; wired = true; var root = ctx.root;
    // النقر على تبويب "إدارة المعرض" يعيد دائماً إلى القائمة (يُلتقط في مرحلة capture قبل معالج admin.js)
    root.addEventListener("click", function (e) { if (!ctx.busy() && e.target.closest && e.target.closest('[data-go="portfolio"]')) navClick = true; }, true);
    root.addEventListener("click", function (e) { var b = e.target.closest("[data-pact]"); if (b && ctx.view() === "portfolio") act(b); });
    root.addEventListener("submit", function (e) { if (e.target.id === "pf-form") { e.preventDefault(); if (ctx.view() === "portfolio") save(); } });
    root.addEventListener("change", function (e) {
      if (ctx.view() !== "portfolio") return; var id = e.target.id;
      if (id === "pf-st") { F.status = e.target.value; page = 1; drawResults(); }
      else if (id === "pf-cat") { F.cat = e.target.value; page = 1; drawResults(); }
      else if (id === "pf-category" && form) { collectForm(); if (form.collection && !colls.some(function (c) { return c.slug === form.collection && c.category === form.category; })) form.collection = ""; renderForm(); }
      else if (id === "pf-cover" && form) { if (e.target.files[0]) setCover(e.target.files[0]); e.target.value = ""; }
      else if (id === "pf-gal" && form) { addGallery(e.target.files); e.target.value = ""; }
    });
    root.addEventListener("input", function (e) {
      if (ctx.view() !== "portfolio") return; var id = e.target.id;
      if (id === "pf-q") { F.q = e.target.value; page = 1; drawResults(); }
      else if (id === "pf-slug" && form) form.slugTouched = true;
      else if (/^pf-title-(fr|en)$/.test(id) && form && !form.slugTouched && !form.id) { $("#pf-slug").value = slugify(V("pf-title-en") || V("pf-title-fr")); }
    });
  }

  window.TSAdminPortfolio = { tab: tab, render: render, start: start, stop: stop };
})();
