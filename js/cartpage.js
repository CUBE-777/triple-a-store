/* Triple A Store — cartpage.js (cart.html)
   السلة في localStorage "غير موثوقة": عند فتح الصفحة نجلب من Supabase الأسعار والتوفر الحالية
   ونبني الرسالة منها فقط. لا يوجد دفع هنا: الزر يفتح واتساب برسالة جاهزة. */
(function () {
  "use strict";
  var TS = window.TS, C = TS.C, Cart = window.TSCart, $ = TS.$, esc = TS.esc;
  var root = $("#cart-root"), lines = Cart.load(localStorage), byId = {}, status = "loading", ref = Cart.makeRef(), priced = null, adjustedMsg = false;

  function persist() { Cart.save(localStorage, lines); }

  async function refresh() {
    lines = Cart.load(localStorage);
    if (!lines.length) { status = "ready"; byId = {}; return render(); }
    if (!TS.api.configured()) { status = "config"; return render(); }
    try {
      byId = await TS.api.fetchProductsByIds(lines.map(function (l) { return l.id; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));
      status = "ready";
    } catch (e) { if (window.console) console.error(e); status = "error"; }
    render();
  }

  function render() {
    if (!lines.length) {
      root.innerHTML = '<div class="empty"><h2>' + esc(TS.t("c.empty")) + "</h2><p>" + esc(TS.t("c.empty.d")) + '</p><a class="btn pri lg" href="index.html">' + esc(TS.t("btn.back")) + "</a></div>"; return;
    }
    if (status === "loading") { root.innerHTML = '<div class="skel" style="max-width:420px"></div>'; return; }
    if (status === "config") { root.innerHTML = '<div class="msg err" role="alert">' + esc(TS.t("err.config")) + "</div>"; return; }
    var banner = "";
    if (status === "error") banner = '<div class="msg err" role="alert" style="margin-bottom:14px">' + esc(TS.t("c.err")) + ' <button class="btn sm" type="button" id="retry">' + esc(TS.t("btn.retry")) + "</button></div>";
    priced = status === "error" ? null : Cart.priceLines(lines, byId, C);

    // تعديل الكميات التي تجاوزت المخزون الحالي وحفظها
    if (priced && priced.totals.adjusted) {
      priced.items.forEach(function (it, i) { if (it.status === "ok" && it.adjusted) lines[i].qty = it.qty; });
      persist(); adjustedMsg = true;
    }
    if (adjustedMsg) banner += '<div class="msg warn" style="margin-bottom:14px">' + esc(TS.t("c.adjusted")) + "</div>";

    var list = lines.map(function (l, i) {
      var it = priced ? priced.items[i] : null, p = it && it.product;
      var name = p ? TS.pick(p, "name") : (it ? TS.t("p.notfound") : "…");
      var th = p ? TS.imgHtml(p.images[0], name, p.type) : TS.imgHtml("", name, "physical");
      var meta = "";
      if (p && p.variants.length) meta = p.variants.map(function (g, gi) { return TS.L(g.name) + ": " + (l.options[String(gi)] || "—"); }).join(" | ");
      var warn = "";
      if (it && it.status === "missing" || it && it.status === "unavailable") warn = TS.t("c.unavail"); else if (it && it.status === "options_invalid") warn = TS.t("c.opts.bad");
      var ok = it && it.status === "ok", max = ok ? it.av.max : l.qty;
      var price = ok ? (it.quote ? TS.t("price.quote") : (it.estimate ? TS.t("price.from", { p: TS.money(it.unit) }) : TS.money(it.unit))) : "";
      var qtyUi = ok && p.type === "physical" && max > 1 ?
        '<div class="qty"><button type="button" data-i="' + i + '" data-q="-1" aria-label="' + esc(TS.t("aria.qty.minus")) + '"' + (it.qty <= 1 ? " disabled" : "") + '>−</button><output aria-live="polite">' + it.qty + '</output><button type="button" data-i="' + i + '" data-q="1" aria-label="' + esc(TS.t("aria.qty.plus")) + '"' + (it.qty >= max ? " disabled" : "") + ">+</button></div>" :
        (ok ? '<span class="note">' + esc(TS.t("p.qty")) + ": " + it.qty + "</span>" : "");
      var sub = ok && !it.quote ? '<span class="price">' + esc(TS.money(it.subtotal)) + "</span>" : "";
      return '<article class="line' + (ok || !it ? "" : " bad") + '"><div class="th">' + th + '</div><div class="ln-b"><div class="ln-top">' +
        (p ? '<a href="product.html?slug=' + encodeURIComponent(p.slug) + '">' + esc(name) + "</a>" : "<strong>" + esc(name) + "</strong>") +
        '<button class="linkbtn" type="button" data-rm="' + i + '">' + esc(TS.t("btn.remove")) + "</button></div>" +
        (meta ? '<div class="ln-meta">' + esc(meta) + "</div>" : "") + (price ? '<div class="ln-meta">' + esc(TS.t("c.unit")) + ": " + esc(price) + "</div>" : "") +
        (warn ? '<div class="av out" role="alert">' + esc(warn) + "</div>" : "") +
        (ok && it.av.status === "low" ? '<div class="av low">' + esc(TS.t("c.max", { n: max })) + "</div>" : "") +
        '<div class="ln-row">' + qtyUi + sub + "</div>" +
        (ok ? '<textarea data-note="' + i + '" maxlength="' + Cart.NOTE_MAX + '" rows="2" aria-label="' + esc(TS.t("p.note")) + '" placeholder="' + esc(TS.t("p.note")) + '">' + esc(l.note || "") + "</textarea>" : "") + "</div></article>";
    }).join("");

    var tt = priced ? priced.totals : null, blocked = !priced || tt.blocked > 0 || tt.okCount === 0;
    var sum = '<aside class="sum" aria-label="' + esc(TS.t("c.total")) + '">' +
      (tt ? '<div class="tot"><span>' + esc(TS.t(tt.hasEstimate ? "c.total.est" : "c.total")) + "</span><span>" + esc(TS.money(tt.sum)) + "</span></div>" + (tt.hasEstimate ? '<p class="note">' + esc(TS.t("c.note.est")) + "</p>" : "") : "") +
      '<a class="btn wa lg block" id="wa-send" target="_blank" rel="noopener noreferrer" href="#"' + (blocked ? ' aria-disabled="true"' : "") + ">" + TS.ICON.wa + "<span>" + esc(TS.t("btn.send")) + "</span></a>" +
      '<p class="ref">' + esc(TS.t("c.refs")) + ": <b dir=\"ltr\">" + esc(ref) + "</b></p><p class=\"disc\">" + esc(TS.t("c.disclaimer")) + "</p>" +
      (priced && tt.blocked > 0 ? '<button class="btn sm" type="button" id="rm-bad">' + esc(TS.t("btn.removeUnavail")) + "</button>" : "") +
      '<button class="btn sm danger" type="button" id="clear">' + esc(TS.t("btn.clear")) + "</button></aside>";
    root.innerHTML = banner + '<div class="cart-wrap"><div class="lines">' + list + "</div>" + sum + "</div>";
    syncSend();
    var rb = $("#retry"); if (rb) rb.onclick = refresh;
  }

  function syncSend() {
    var a = $("#wa-send"); if (!a || !priced) return;
    if (priced.totals.blocked > 0 || priced.totals.okCount === 0) { a.href = "#"; return; }
    var msg = Cart.buildMessage(priced.items, priced.totals, { t: TS.t, money: TS.money, pick: TS.pick, L: TS.L, ref: ref, single: false });
    a.href = Cart.waUrl(C.WHATSAPP_NUMBER, msg);
  }

  root.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-q]"))) { var i = +b.dataset.i, it = priced && priced.items[i]; if (!it || it.status !== "ok") return; lines[i].qty = Cart.clamp(lines[i].qty + (+b.dataset.q), 1, it.av.max); adjustedMsg = false; persist(); render(); return; }
    if ((b = e.target.closest("[data-rm]"))) { lines.splice(+b.dataset.rm, 1); persist(); render(); return; }
    if (e.target.closest("#clear")) { lines = []; persist(); render(); return; }
    if (e.target.closest("#rm-bad")) { lines = lines.filter(function (l, i) { return priced.items[i].status === "ok"; }); persist(); render(); return; }
    if ((b = e.target.closest("#wa-send"))) { if (b.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; } ref = Cart.makeRef(); setTimeout(function () { var r = $(".ref b"); if (r) r.textContent = ref; syncSend(); }, 400); }
  });
  root.addEventListener("input", function (e) {
    var t = e.target.closest("[data-note]"); if (!t) return;
    lines[+t.dataset.note].note = Cart.cleanNote(t.value); Cart.save(localStorage, lines);
    if (priced) priced.items[+t.dataset.note].line.note = lines[+t.dataset.note].note; syncSend();
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && status !== "loading") refresh(); });   // إعادة التحقق من الأسعار عند العودة للصفحة
  TS.onRender(function () { render(); });
  TS.start(); refresh();
})();
