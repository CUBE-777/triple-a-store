/* Triple A Store — common.js
   النواة المشتركة لكل الصفحات: اللغة (ar/fr/en) + RTL/LTR + الثيم + الهيدر والفوتر + أدوات مساعدة.
   كل صفحة تستدعي TS.onRender(fn) لإعادة رسم محتواها عند تغيير اللغة. */
(function () {
  "use strict";
  var C = window.STORE_CONFIG, UI = window.STORE_UI, LANGS = ["ar", "fr", "en"];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = function (k, v) { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  var lang = store("lang"); if (LANGS.indexOf(lang) < 0) lang = "ar";
  var theme = store("theme"); if (theme !== "light" && theme !== "dark") theme = "dark";
  var hooks = [], built = false;

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* الترجمة: لا تُعرض مفاتيح ناقصة للزائر أبداً (تُرجع نصاً فارغاً وتُسجَّل في الكونسول للمطوّر) */
  function t(key, vars) {
    var e = UI[key];
    if (!e) { if (window.console) console.warn("[i18n] missing key:", key); return ""; }
    var s = e[LANGS.indexOf(lang)] || e[0] || "";
    return vars ? s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : vars[k]; }) : s;
  }
  // نص متعدد اللغات {ar,fr,en} → اللغة الحالية ثم احتياطياً العربية/الفرنسية/الإنجليزية
  function L(o) {
    if (!o) return ""; if (typeof o === "string") return o;
    var order = [lang, "ar", "fr", "en"];
    for (var i = 0; i < order.length; i++) if (o[order[i]]) return o[order[i]];
    return "";
  }
  // حقل مترجم من منتج: p.t = { ar:{name,short,...}, fr:{...}, en:{...} }
  function pick(p, field) {
    var order = [lang, "ar", "fr", "en"];
    for (var i = 0; i < order.length; i++) { var x = p.t && p.t[order[i]]; if (x && x[field]) return x[field]; }
    return "";
  }
  function money(n) { return t("money", { n: new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n) }); }
  function priceText(p) {
    if (p.quoteOnly || p.price == null) return t("price.quote");
    return p.priceIsStarting ? t("price.from", { p: money(p.price) }) : money(p.price);
  }
  // تطبيع نص البحث: حروف صغيرة + إزالة التشكيل واللكنات + توحيد الألف والياء والتاء المربوطة
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
  }

  /* ---------- أيقونات (SVG مضمّنة، بدون مكتبات) ---------- */
  var ICON = {
    search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    wa: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.3 14.8l-.4-.2-2.5.8.8-2.4-.3-.4A8 8 0 0 1 12 4zM8.600 7.500c-.3 0-.6.2-.8.5-.6.8-.6 1.900.4 3.400 1.400 2.100 3.200 3.300 4.800 3.600.9.2 1.800-.4 2-1.200l.1-.5-1.800-.9-.7.800c-1-.4-1.800-1.200-2.300-2.100l.6-.7-.8-1.800z"/></svg>',
    physical: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8 4.500v9L12 21l-8-4.500v-9z"/><path d="m4 7.500 8 4.500 8-4.500M12 12v9"/></svg>',
    digital: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 8v6m0 0-2.500-2.500M12 14l2.500-2.500M9 18h6"/></svg>',
    service: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.200 5.300 5.800.5-4.400 3.800 1.400 5.600L12 15.200 7 18.200l1.400-5.600L4 8.800l5.800-.5z"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
  };

  /* صورة منتج مع بديل عند غياب الصورة أو فشل تحميلها (لا أيقونات مكسورة) */
  function imgHtml(src, alt, type, eager) {
    var ph = '<div class="ph" role="img" aria-label="' + esc(alt) + '">' + (ICON[type] || ICON.physical) + "</div>";
    if (!src) return ph;
    return '<img class="pimg" src="' + esc(src) + '" alt="' + esc(alt) + '" data-type="' + esc(type) + '"' + (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
  }
  document.addEventListener("error", function (e) {
    var i = e.target;
    if (i && i.tagName === "IMG" && i.classList.contains("pimg")) {
      var d = document.createElement("div"); d.className = "ph"; d.setAttribute("role", "img"); d.setAttribute("aria-label", i.alt || "");
      d.innerHTML = ICON[i.dataset.type] || ICON.physical; i.replaceWith(d);
    }
  }, true);

  /* ---------- واتساب ---------- */
  function waLink(text) { return window.TSCart.waUrl(C.WHATSAPP_NUMBER, text); }

  /* ---------- إشعارات ---------- */
  function toast(msg, kind) {
    var box = $("#toasts"); if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    var el = document.createElement("div"); el.className = "toast " + (kind || "ok"); el.textContent = msg; box.appendChild(el);
    setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 300); }, kind === "err" ? 6000 : 2600);
  }

  /* ---------- SEO ---------- */
  function setMeta(o) {
    if (o.title) { document.title = o.title; ["meta[property='og:title']", "meta[name='twitter:title']"].forEach(function (q) { var m = $(q); if (m) m.content = o.title; }); }
    if (o.description) ["meta[name=description]", "meta[property='og:description']", "meta[name='twitter:description']"].forEach(function (q) { var m = $(q); if (m) m.content = o.description; });
    if (C.STORE_URL && /^https?:\/\//.test(C.STORE_URL)) {   // canonical فقط بعد ضبط الدومين الحقيقي
      var l = $("link[rel=canonical]"); if (!l) { l = document.createElement("link"); l.rel = "canonical"; document.head.appendChild(l); }
      l.href = C.STORE_URL.replace(/\/$/, "") + "/" + (o.path || "");
    }
    var ol = $("meta[property='og:locale']"); if (ol) ol.content = { ar: "ar_MA", fr: "fr_FR", en: "en_US" }[lang];
  }

  /* ---------- الهيكل المشترك ---------- */
  function build() {
    var admin = document.body.dataset.chrome === "admin";
    var studio = esc(C.STUDIO_URL);
    var head = '<a class="skip" href="#main" data-t="skip"></a>' +
      '<header class="bar" id="bar"><a class="brand" href="index.html"><img src="assets/logo-sm.webp" alt="" width="40" height="31"><span>TRIPLE A <em data-t="brand.store"></em></span></a>' +
      (admin ? "" : '<form class="hsearch" id="hsearch" role="search"><label class="sr" for="hq" data-t="search.label"></label><input id="hq" name="q" type="search" maxlength="80" autocomplete="off" data-tph="search.ph"><button class="ic" type="submit" data-taria="search.label">' + ICON.search + "</button></form>") +
      '<nav id="nav" data-taria="aria.main"><a href="index.html" data-nav="store" data-t="nav.store"></a>' +
      '<a href="' + studio + '/portfolio.html" rel="noopener" data-t="nav.portfolio"></a>' +
      '<a href="' + studio + '/" rel="noopener" class="studio-link"><span data-t="nav.studio"></span> ' + ICON.ext + "</a></nav>" +
      '<div class="tools"><div id="langs" role="group" data-taria="aria.lang"></div><button id="theme" class="ic" type="button" data-taria="aria.theme">◐</button>' +
      (admin ? "" : '<a class="ic cart" id="cartlink" href="cart.html">' + ICON.cart + '<b class="cart-count" id="cartcount" hidden>0</b></a>') +
      '<button id="menu" class="ic" type="button" data-taria="aria.menu" aria-controls="nav" aria-expanded="false"><span></span><span></span></button></div></header>';
    document.body.insertAdjacentHTML("afterbegin", head);
    if (!admin) {
      var foot = '<footer class="foot"><div class="wrap"><div class="foot-top"><div><b class="fb">Triple A Store</b><p class="note" data-t="foot.tag"></p></div>' +
        '<nav data-taria="aria.foot"><a href="index.html" data-t="nav.store"></a><a href="cart.html" data-t="nav.cart"></a><a href="' + studio + '/portfolio.html" rel="noopener" data-t="nav.portfolio"></a><a href="' + studio + '/" rel="noopener" data-t="nav.studio"></a></nav>' +
        '<div class="soc"><a id="f-wa" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">' + ICON.wa + "</a>" +
        (C.INSTAGRAM_URL ? '<a href="' + esc(C.INSTAGRAM_URL) + '" target="_blank" rel="noopener noreferrer" aria-label="Instagram">IG</a>' : "") +
        (C.TIKTOK_URL ? '<a href="' + esc(C.TIKTOK_URL) + '" target="_blank" rel="noopener noreferrer" aria-label="TikTok">TT</a>' : "") + "</div></div>" +
        '<p class="note" data-t="foot.note"></p><div class="foot-bot"><span data-t="foot.rights"></span><a href="mailto:' + esc(C.CONTACT_EMAIL) + '">' + esc(C.CONTACT_EMAIL) + "</a></div></div></footer>" +
        '<a id="wa" class="fab" target="_blank" rel="noopener noreferrer" data-taria="aria.wa">' + ICON.wa.replace('width="20" height="20"', 'width="28" height="28"') + "</a>";
      document.body.insertAdjacentHTML("beforeend", foot);
    }
    if (C.DEMO_MODE && !admin) document.body.insertAdjacentHTML("afterbegin", '<div class="demo" role="note" data-t="demo.banner"></div>');
    built = true;
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-l]"); if (b) { lang = b.dataset.l; store("lang", lang); render(); return; }
      if (e.target.closest("#nav a")) closeMenu();
    });
    $("#theme").addEventListener("click", function () { theme = theme === "dark" ? "light" : "dark"; store("theme", theme); document.documentElement.dataset.theme = theme; });
    $("#menu").addEventListener("click", function () { var o = $("#nav").classList.toggle("open"); $("#menu").setAttribute("aria-expanded", String(o)); document.body.classList.toggle("navopen", o); });
    addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    matchMedia("(min-width: 861px)").addEventListener("change", closeMenu);
    var hs = $("#hsearch");
    if (hs) hs.addEventListener("submit", function (e) {
      e.preventDefault(); var q = $("#hq").value.trim();
      if (TS.onSearch) TS.onSearch(q); else location.href = "index.html" + (q ? "?q=" + encodeURIComponent(q) : "") + "#catalog";
    });
    addEventListener("ta:cart", updateCart); addEventListener("storage", function (e) { if (e.key === window.TSCart.KEY) updateCart(); });
  }
  function closeMenu() { var n = $("#nav"); if (!n) return; n.classList.remove("open"); $("#menu").setAttribute("aria-expanded", "false"); document.body.classList.remove("navopen"); }
  function updateCart() {
    var b = $("#cartcount"); if (!b) return;
    var n = window.TSCart.count(window.TSCart.load(localStorage));
    b.textContent = n > 99 ? "99+" : n; b.hidden = n === 0;
    var a = $("#cartlink"); if (a) a.setAttribute("aria-label", t("aria.cart", { n: n }));
  }

  function render() {
    var h = document.documentElement; h.lang = lang; h.dir = lang === "ar" ? "rtl" : "ltr"; h.dataset.theme = theme;
    if (!built) build();
    $$("[data-t]").forEach(function (e) { e.textContent = t(e.dataset.t); });
    $$("[data-tph]").forEach(function (e) { e.placeholder = t(e.dataset.tph); });
    $$("[data-taria]").forEach(function (e) { e.setAttribute("aria-label", t(e.dataset.taria)); });
    $$("[data-talt]").forEach(function (e) { e.alt = t(e.dataset.talt); });
    $("#langs").innerHTML = LANGS.map(function (l) { return '<button type="button" data-l="' + l + '" aria-pressed="' + (l === lang) + '">' + { ar: "عربي", fr: "FR", en: "EN" }[l] + "</button>"; }).join("");
    var fw = $("#f-wa"); if (fw) fw.href = waLink(t("wa.hello"));
    var wa = $("#wa"); if (wa) wa.href = waLink(t("wa.hello"));
    var cur = document.body.dataset.nav; $$("#nav a[data-nav]").forEach(function (a) { if (a.dataset.nav === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    updateCart();
    hooks.forEach(function (fn) { fn(); });
  }

  var TS = window.TS = {
    C: C, LANGS: LANGS, $: $, $$: $$, esc: esc, t: t, L: L, pick: pick, money: money, priceText: priceText, norm: norm, ICON: ICON,
    imgHtml: imgHtml, waLink: waLink, toast: toast, setMeta: setMeta, closeMenu: closeMenu, updateCart: updateCart,
    get lang() { return lang; }, get theme() { return theme; },
    onRender: function (fn) { hooks.push(fn); },
    start: function () { render(); document.body.classList.add("ready"); }
  };
})();
