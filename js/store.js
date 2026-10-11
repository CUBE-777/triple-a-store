/* Triple A Store — store.js (الصفحة الرئيسية: الأقسام + الفلاتر + البحث + الشبكة)
   كل التصفية تتم في المتصفح على قائمة المنتجات المنشورة (مناسب لـ 20–100 منتج). */
(function () {
  "use strict";
  var TS = window.TS, C = TS.C, Cart = window.TSCart, $ = TS.$, esc = TS.esc;
  var TYPES = ["physical", "digital", "service"], SORTS = ["relevance", "newest", "price_asc", "price_desc"];
  var S = { q: "", cat: "", type: "", min: "", max: "", stock: false, sort: "relevance" }, DATA = null, timer;

  /* ---------- حالة الصفحة في الرابط (لكي تعمل روابط الأقسام ويمكن مشاركة النتائج) ---------- */
  function readUrl() {
    var p = new URLSearchParams(location.search);
    S.q = (p.get("q") || "").slice(0, 80); S.cat = (p.get("cat") || "").slice(0, 80);
    S.type = TYPES.indexOf(p.get("type")) >= 0 ? p.get("type") : "";
    S.min = /^\d+(\.\d+)?$/.test(p.get("min") || "") ? p.get("min") : ""; S.max = /^\d+(\.\d+)?$/.test(p.get("max") || "") ? p.get("max") : "";
    S.stock = p.get("stock") === "1"; S.sort = SORTS.indexOf(p.get("sort")) >= 0 ? p.get("sort") : "relevance";
  }
  function writeUrl() {
    var p = new URLSearchParams();
    if (S.q) p.set("q", S.q); if (S.cat) p.set("cat", S.cat); if (S.type) p.set("type", S.type);
    if (S.min) p.set("min", S.min); if (S.max) p.set("max", S.max); if (S.stock) p.set("stock", "1"); if (S.sort !== "relevance") p.set("sort", S.sort);
    var qs = p.toString(); try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) {}
  }
  var active = function () { return !!(S.q || S.cat || S.type || S.min || S.max || S.stock); };

  /* ---------- التصفية والترتيب ---------- */
  function catById(id) { return DATA.categories.filter(function (c) { return c.id === id; })[0]; }
  function hay(p) {   // نص البحث: كل أسماء/أوصاف المنتج بكل اللغات + اسم القسم بكل اللغات
    if (p._h) return p._h;
    var parts = []; ["ar", "fr", "en"].forEach(function (l) { var x = p.t[l]; if (x) parts.push(x.name, x.short); });
    var c = catById(p.categoryId); if (c) Object.keys(c.names).forEach(function (k) { parts.push(c.names[k]); });
    return (p._h = TS.norm(parts.join(" ")));
  }
  function score(p, toks) {
    var n = TS.norm(TS.pick(p, "name")), s = 0;
    toks.forEach(function (t) { if (n.indexOf(t) === 0) s += 3; else if (n.indexOf(t) >= 0) s += 2; else s += 1; });
    return s + (p.featured ? .5 : 0);
  }
  function filtered() {
    var toks = TS.norm(S.q).split(" ").filter(Boolean), cat = DATA.categories.filter(function (c) { return c.slug === S.cat; })[0];
    var min = S.min === "" ? null : Number(S.min), max = S.max === "" ? null : Number(S.max);
    var list = DATA.products.filter(function (p) {
      if (S.cat && (!cat || p.categoryId !== cat.id)) return false;
      if (S.type && p.type !== S.type) return false;
      if (S.stock && Cart.availability(p, C).max < 1) return false;
      if (min !== null || max !== null) { if (p.price == null || p.quoteOnly) return false; if (min !== null && p.price < min) return false; if (max !== null && p.price > max) return false; }
      if (toks.length) { var h = hay(p); if (!toks.every(function (t) { return h.indexOf(t) >= 0; })) return false; }
      return true;
    });
    var byNew = function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; };
    if (S.sort === "price_asc" || S.sort === "price_desc") {
      var dir = S.sort === "price_asc" ? 1 : -1;
      list.sort(function (a, b) { var x = a.price == null ? Infinity : a.price, y = b.price == null ? Infinity : b.price; if (x === y) return byNew(a, b); if (x === Infinity) return 1; if (y === Infinity) return -1; return (x - y) * dir; });
    } else if (S.sort === "newest") list.sort(byNew);
    else if (toks.length) list.sort(function (a, b) { return score(b, toks) - score(a, toks) || byNew(a, b); });
    else list.sort(function (a, b) { return (b.featured - a.featured) || byNew(a, b); });
    return list;
  }

  /* ---------- الرسم ---------- */
  function renderTypes() {
    $("#types").innerHTML = TYPES.map(function (ty) {
      return '<button class="type-card" type="button" data-type-pick="' + ty + '">' + TS.ICON[ty] + "<h3>" + esc(TS.t("type." + ty)) + "</h3><p>" + esc(TS.t("type." + ty + ".d")) + "</p></button>";
    }).join("");
  }
  function renderChips() {
    var all = '<button class="chip" type="button" data-cat="" aria-pressed="' + (S.cat === "") + '">' + esc(TS.t("f.all")) + "</button>";
    $("#cats").innerHTML = all + DATA.categories.map(function (c) { return '<button class="chip" type="button" data-cat="' + esc(c.slug) + '" aria-pressed="' + (S.cat === c.slug) + '">' + esc(TS.L(c.names)) + "</button>"; }).join("");
  }
  function renderControls() {
    $("#f-type").innerHTML = '<option value="">' + esc(TS.t("type.all")) + "</option>" + TYPES.map(function (ty) { return '<option value="' + ty + '">' + esc(TS.t("type." + ty)) + "</option>"; }).join("");
    $("#f-sort").innerHTML = SORTS.map(function (s) { return '<option value="' + s + '">' + esc(TS.t("sort." + s)) + "</option>"; }).join("");
    $("#f-type").value = S.type; $("#f-sort").value = S.sort; $("#f-min").value = S.min; $("#f-max").value = S.max; $("#f-stock").checked = S.stock;
    if (document.activeElement !== $("#hq")) $("#hq").value = S.q;
  }
  function renderList() {
    var list = filtered(), grid = $("#grid"), st = $("#status");
    writeUrl(); $("#reset").hidden = !(active() || S.sort !== "relevance"); $("#count").textContent = TS.t("f.results", { n: list.length });
    $$chips();
    var feat = DATA.products.filter(function (p) { return p.featured; }).slice(0, 4);
    $("#featured-sec").hidden = active() || !feat.length;
    $("#featured").innerHTML = feat.map(TS.cards.card).join("");
    if (!DATA.products.length) { st.innerHTML = '<div class="empty"><h3>' + esc(TS.t("empty.store")) + "</h3></div>"; grid.innerHTML = ""; return; }
    if (!list.length) { st.innerHTML = '<div class="empty"><h3>' + esc(TS.t("empty.title")) + "</h3><p>" + esc(TS.t("empty.desc")) + '</p><button class="btn" type="button" data-reset>' + esc(TS.t("f.reset")) + "</button></div>"; grid.innerHTML = ""; return; }
    st.innerHTML = ""; grid.innerHTML = list.map(TS.cards.card).join("");
  }
  function $$chips() { TS.$$("#cats .chip").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.cat === S.cat)); }); }
  function renderAll() { if (!DATA) return; renderTypes(); renderChips(); renderControls(); renderList(); }

  function showMsg(key, retry) {
    $("#grid").innerHTML = ""; $("#count").textContent = ""; $("#reset").hidden = true;
    $("#status").innerHTML = '<div class="msg err" role="alert">' + esc(TS.t(key)) + (retry ? ' <button class="btn sm" type="button" data-retry>' + esc(TS.t("btn.retry")) + "</button>" : "") + "</div>";
  }
  var lastErr = null;
  async function load() {
    if (!TS.api.configured()) { lastErr = "err.config"; return showMsg("err.config"); }
    $("#grid").innerHTML = new Array(8 + 1).join('<div class="skel"></div>');
    try { DATA = await TS.api.fetchCatalog(); lastErr = null; $("#status").innerHTML = ""; renderAll(); }
    catch (e) { if (window.console) console.error(e); lastErr = "err.load"; showMsg("err.load", true); }
  }

  /* ---------- الأحداث ---------- */
  function setS(patch) { Object.assign(S, patch); renderControls(); renderList(); }
  function resetAll() { S = { q: "", cat: "", type: "", min: "", max: "", stock: false, sort: "relevance" }; setS({}); }
  document.addEventListener("click", function (e) {
    var el;
    if ((el = e.target.closest("[data-cat]"))) setS({ cat: el.dataset.cat });
    else if ((el = e.target.closest("[data-type-pick]"))) { setS({ type: el.dataset.typePick }); location.hash = "#catalog"; $("#catalog").scrollIntoView(); }
    else if ((el = e.target.closest("[data-type-link]"))) setS({ type: el.dataset.typeLink });
    else if (e.target.closest("[data-reset]") || e.target.closest("#reset")) resetAll();
    else if (e.target.closest("[data-retry]")) load();
  });
  $("#filters").addEventListener("input", function () { setS({ type: $("#f-type").value, sort: $("#f-sort").value, min: $("#f-min").value.trim(), max: $("#f-max").value.trim(), stock: $("#f-stock").checked }); });
  $("#filters").addEventListener("submit", function (e) { e.preventDefault(); });
  TS.onSearch = function (q) { setS({ q: q }); $("#catalog").scrollIntoView(); };

  TS.cards.bindAdd(function (id) { return DATA && DATA.products.filter(function (p) { return p.id === id; })[0]; });
  TS.onRender(function () { if (lastErr && !DATA) showMsg(lastErr, lastErr === "err.load"); renderAll(); });

  readUrl(); TS.start();
  $("#hq").addEventListener("input", function () { clearTimeout(timer); var v = this.value; timer = setTimeout(function () { setS({ q: v.trim().slice(0, 80) }); }, 160); });
  $("#fwrap").open = matchMedia("(min-width: 861px)").matches;
  $("#hq").value = S.q;
  load();
})();
