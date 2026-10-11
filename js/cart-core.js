/* Triple A Store — cart-core.js
   منطق السلة ورسالة واتساب (بدون أي تعامل مع DOM، لذلك يمكن اختباره في Node).
   ⚠ بيانات السلة في localStorage "غير موثوقة": المتصفح يخزّن فقط (id, qty, options, note).
   الأسعار والتوفر تُجلب من قاعدة البيانات في كل مرة تُعرض فيها السلة أو تُبنى فيها الرسالة. */
(function (root) {
  "use strict";
  var KEY = "ta_store_cart_v1";
  var MAX_LINES = 25, NOTE_MAX = 300;

  function round2(x) { return Math.round(x * 100) / 100; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function cleanNote(s) { return String(s == null ? "" : s).replace(/\r/g, "").slice(0, NOTE_MAX); }
  function optionsKey(o) { var k = Object.keys(o || {}).sort(); return JSON.stringify(k.map(function (x) { return [x, o[x]]; })); }
  function lineKey(id, o) { return id + "|" + optionsKey(o); }

  /* ---------- التخزين ---------- */
  function validLine(l) {
    if (!l || typeof l.id !== "string" || l.id.length > 64) return false;
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 999) return false;
    if (l.options == null || typeof l.options !== "object" || Array.isArray(l.options)) return false;
    return Object.keys(l.options).every(function (k) { return typeof l.options[k] === "string" && l.options[k].length <= 100; });
  }
  function load(storage) {
    try {
      var a = JSON.parse(storage.getItem(KEY) || "[]");
      if (!Array.isArray(a)) return [];
      return a.filter(validLine).slice(0, MAX_LINES).map(function (l) { return { id: l.id, qty: l.qty, options: l.options, note: cleanNote(l.note) }; });
    } catch (e) { return []; }
  }
  function save(storage, lines) {
    try { storage.setItem(KEY, JSON.stringify(lines)); } catch (e) {}
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent("ta:cart"));
  }
  function count(lines) { return lines.reduce(function (s, l) { return s + l.qty; }, 0); }

  /* ---------- التوفر وقواعد الكمية ---------- */
  // يرجع { status, max, left }.  status: in_stock | low | out | on_order | available
  function availability(p, cfg) {
    var MAXQ = cfg.MAX_QTY, LOW = cfg.LOW_STOCK_THRESHOLD;
    if (!p.isAvailable) return { status: "out", max: 0 };
    if (p.type === "physical") {
      if (p.fulfillment === "external_supplier") {
        if (p.stock === 0) return { status: "out", max: 0 };
        return { status: "on_order", max: p.stock == null ? MAXQ : Math.min(p.stock, MAXQ) };
      }
      var s = p.stock || 0;
      if (s <= 0) return { status: "out", max: 0 };
      return { status: s <= LOW ? "low" : "in_stock", max: Math.min(s, MAXQ), left: s };
    }
    return { status: "available", max: 1 };   // رقمي/خدمة: كمية واحدة لكل سطر (التفاصيل في الملاحظات)
  }

  // هل اختار الزبون كل الخيارات المطلوبة وبقيم موجودة فعلاً؟  يرجع { ok, missing:[index] }
  function validateOptions(p, opts) {
    var missing = [];
    (p.variants || []).forEach(function (g, i) {
      var v = opts && opts[String(i)];
      if (typeof v !== "string" || (g.options || []).indexOf(v) === -1) missing.push(i);
    });
    return { ok: missing.length === 0, missing: missing };
  }

  /* ---------- الإضافة ---------- */
  function addToCart(lines, product, req, cfg) {
    var av = availability(product, cfg), opts = req.options || {};
    if (av.max < 1) return { lines: lines, ok: false, reason: "unavailable" };
    var vo = validateOptions(product, opts);
    if (!vo.ok) return { lines: lines, ok: false, reason: "options", missing: vo.missing };
    var key = lineKey(product.id, opts), want = clamp(parseInt(req.qty, 10) || 1, 1, 999), out = lines.map(function (l) { return Object.assign({}, l); });
    var found = out.filter(function (l) { return lineKey(l.id, l.options) === key; })[0], clamped = false;
    if (found) {
      var nq = clamp(found.qty + want, 1, av.max); clamped = nq < found.qty + want; found.qty = nq;
      if (req.note != null && String(req.note).trim()) found.note = cleanNote(req.note);
    } else {
      if (out.length >= MAX_LINES) return { lines: lines, ok: false, reason: "full" };
      var q = clamp(want, 1, av.max); clamped = q < want;
      out.push({ id: product.id, qty: q, options: Object.assign({}, opts), note: cleanNote(req.note) });
    }
    return { lines: out, ok: true, clamped: clamped };
  }

  /* ---------- التسعير: يُحسب دائماً من منتجات حديثة (byId) ---------- */
  function priceLines(lines, byId, cfg) {
    var items = lines.map(function (l) {
      var p = byId[l.id];
      if (!p) return { line: l, product: null, status: "missing", qty: l.qty };
      var av = availability(p, cfg);
      if (av.max < 1) return { line: l, product: p, status: "unavailable", qty: l.qty, av: av };
      if (!validateOptions(p, l.options).ok) return { line: l, product: p, status: "options_invalid", qty: l.qty, av: av };
      var qty = clamp(l.qty, 1, av.max), quote = p.quoteOnly || p.price == null;
      return {
        line: l, product: p, status: "ok", av: av, qty: qty, adjusted: qty !== l.qty,
        unit: quote ? null : p.price, quote: quote, estimate: !!p.priceIsStarting && !quote,
        subtotal: quote ? null : round2(Math.round(p.price * 100) * qty / 100)
      };
    });
    var ok = items.filter(function (i) { return i.status === "ok"; });
    return {
      items: items,
      totals: {
        sum: round2(ok.reduce(function (s, i) { return s + (i.subtotal || 0); }, 0)),
        hasEstimate: ok.some(function (i) { return i.estimate || i.quote; }),
        okCount: ok.length, blocked: items.length - ok.length,
        adjusted: ok.some(function (i) { return i.adjusted; })
      }
    };
  }

  /* ---------- رسالة واتساب ---------- */
  // ctx: { t(key, vars), money(n), pick(product, field), L(multiLangObj), ref, single }
  function buildMessage(items, totals, ctx) {
    var t = ctx.t, out = [];
    out.push(t(ctx.single ? "wa.greet1" : "wa.greet"));
    out.push(t("wa.ref") + ": " + ctx.ref);
    out.push(t("wa.lang") + ": " + t("wa.langname"));
    out.push("");
    items.filter(function (i) { return i.status === "ok"; }).forEach(function (it, n) {
      var p = it.product;
      out.push((n + 1) + ") *" + ctx.pick(p, "name") + "*");
      out.push("   " + t("wa.type") + ": " + t("type." + p.type + ".s"));
      var og = (p.variants || []).map(function (g, i) { return ctx.L(g.name) + ": " + it.line.options[String(i)]; });
      if (og.length) out.push("   " + t("wa.opts") + ": " + og.join(" | "));
      out.push("   " + t("wa.qty") + ": " + it.qty);
      if (it.quote) out.push("   " + t("wa.unit") + ": " + t("wa.quote"));
      else {
        out.push("   " + t("wa.unit") + ": " + (it.estimate ? t("price.from", { p: ctx.money(it.unit) }) : ctx.money(it.unit)));
        out.push("   " + t("wa.sub") + ": " + ctx.money(it.subtotal));
      }
      var note = cleanNote(it.line.note).replace(/\s*\n\s*/g, " ").trim();
      if (note) out.push("   " + t("wa.notes") + ": " + note);
      out.push("");
    });
    out.push("*" + t(totals.hasEstimate ? "wa.total.est" : "wa.total") + "*: " + ctx.money(totals.sum));
    out.push("");
    out.push(t("wa.foot"));
    return out.join("\n");
  }

  function makeRef(now, rnd) {
    var d = now || new Date(), r = rnd || Math.random, A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < 4; i++) s += A[Math.floor(r() * A.length)];
    var p = function (n) { return String(n).padStart(2, "0"); };
    return "TA-" + p(d.getFullYear() % 100) + p(d.getMonth() + 1) + p(d.getDate()) + "-" + s;
  }
  function waUrl(number, text) { return "https://wa.me/" + String(number).replace(/\D/g, "") + "?text=" + encodeURIComponent(text); }

  var api = { KEY: KEY, MAX_LINES: MAX_LINES, NOTE_MAX: NOTE_MAX, load: load, save: save, count: count, lineKey: lineKey, availability: availability,
    validateOptions: validateOptions, addToCart: addToCart, priceLines: priceLines, buildMessage: buildMessage, makeRef: makeRef, waUrl: waUrl, cleanNote: cleanNote, clamp: clamp };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TSCart = api;
})(typeof window !== "undefined" ? window : globalThis);
