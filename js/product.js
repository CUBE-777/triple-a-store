/* Triple A Store — product.js (صفحة المنتج: product.html?slug=...) */
(function () {
  "use strict";
  var TS = window.TS, C = TS.C, Cart = window.TSCart, $ = TS.$, esc = TS.esc;
  var root = $("#pd-root"), P = null, related = [], opts = {}, qty = 1, note = "", img = 0, state = "loading", ref = Cart.makeRef();
  var slug = (new URLSearchParams(location.search).get("slug") || "").toLowerCase();

  function lines(s) { return String(s || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }

  function render() {
    if (state === "loading") { root.innerHTML = '<div class="skel" style="max-width:420px"></div>'; return; }
    if (state === "config" || state === "error") {
      root.innerHTML = '<div class="msg err" role="alert">' + esc(TS.t(state === "config" ? "err.config" : "err.load")) + (state === "error" ? ' <button class="btn sm" type="button" id="retry">' + esc(TS.t("btn.retry")) + "</button>" : "") + '</div><p style="margin-top:16px"><a class="btn" href="index.html">' + esc(TS.t("btn.back")) + "</a></p>";
      var rb = $("#retry"); if (rb) rb.onclick = load; return;
    }
    if (!P) {
      TS.setMeta({ title: TS.t("p.notfound") + " — Triple A Store" });
      root.innerHTML = '<div class="empty"><h1 style="font-size:1.4rem">' + esc(TS.t("p.notfound")) + "</h1><p>" + esc(TS.t("p.notfound.d")) + '</p><a class="btn pri" href="index.html">' + esc(TS.t("btn.back")) + "</a></div>";
      return;
    }
    var name = TS.pick(P, "name"), av = Cart.availability(P, C), quote = P.quoteOnly || P.price == null;
    qty = Cart.clamp(qty, 1, Math.max(1, av.max));
    TS.setMeta({ title: name + " — Triple A Store", description: (TS.pick(P, "short") || TS.pick(P, "full")).slice(0, 160), path: "product.html?slug=" + encodeURIComponent(P.slug) });

    var gal = '<div class="gal" role="group" aria-label="' + esc(TS.t("aria.gallery")) + '"><div class="main">' + TS.imgHtml(P.images[img], name, P.type, true) + "</div>" +
      (P.images.length > 1 ? '<div class="thumbs">' + P.images.map(function (u, i) { return '<button type="button" data-img="' + i + '" aria-current="' + (i === img) + '" aria-label="' + esc(name) + " " + (i + 1) + '">' + TS.imgHtml(u, "", P.type) + "</button>"; }).join("") + "</div>" : "") + "</div>";

    var optHtml = P.variants.map(function (g, i) {
      return '<div class="opt"><label for="opt' + i + '">' + esc(TS.L(g.name)) + '</label><select id="opt' + i + '" data-opt="' + i + '"><option value="">' + esc(TS.t("p.select")) + "</option>" +
        g.options.map(function (o) { return '<option value="' + esc(o) + '"' + (opts[i] === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select></div>";
    }).join("");
    var qtyHtml = P.type === "physical" && av.max > 1 ? '<div class="opt"><span class="note">' + esc(TS.t("p.qty")) + '</span><div class="qty"><button type="button" data-q="-1" aria-label="' + esc(TS.t("aria.qty.minus")) + '"' + (qty <= 1 ? " disabled" : "") + '>−</button><output aria-live="polite">' + qty + '</output><button type="button" data-q="1" aria-label="' + esc(TS.t("aria.qty.plus")) + '"' + (qty >= av.max ? " disabled" : "") + ">+</button></div></div>" : "";
    var noteHtml = P.type === "service" ? '<div class="opt"><label for="pnote">' + esc(TS.t("p.note")) + '</label><textarea id="pnote" maxlength="' + Cart.NOTE_MAX + '" placeholder="' + esc(TS.t("p.note.ph")) + '">' + esc(note) + "</textarea></div>" : "";

    var buy = av.max < 1 ? '<span class="btn lg block" aria-disabled="true">' + esc(TS.t("avail.out")) + "</span>" :
      (quote ? "" : '<button class="btn pri lg block" type="button" id="add">' + esc(TS.t("btn.add")) + "</button>") +
      '<a class="btn wa lg block" id="wa-order" target="_blank" rel="noopener noreferrer" href="#">' + TS.ICON.wa + "<span>" + esc(TS.t(quote ? "btn.quote" : "btn.order")) + "</span></a>";

    var info = "", full = TS.pick(P, "full"), specs = lines(TS.pick(P, "specs")), deliv = lines(TS.pick(P, "deliverables")), dinfo = TS.pick(P, "delivery");
    if (full) info += "<section><h2>" + esc(TS.t("p.desc")) + '</h2><p class="pre">' + esc(full) + "</p></section>";
    if (deliv.length) info += "<section><h2>" + esc(TS.t("p.deliverables")) + '</h2><ul class="tl-list">' + deliv.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul></section>";
    var rows = specs.map(function (s) { var k = s.indexOf(":"); return k > 0 ? "<tr><th>" + esc(s.slice(0, k).trim()) + "</th><td>" + esc(s.slice(k + 1).trim()) + "</td></tr>" : '<tr><td colspan="2">' + esc(s) + "</td></tr>"; });
    if (P.type === "digital" && P.fileFormat) rows.unshift("<tr><th>" + esc(TS.t("p.format")) + "</th><td>" + esc(P.fileFormat) + "</td></tr>");
    if (rows.length) info += "<section><h2>" + esc(TS.t("p.specs")) + '</h2><table class="specs"><tbody>' + rows.join("") + "</tbody></table></section>";
    var dText = dinfo; if (P.type === "digital" && P.deliveryMethod) dText = (dText ? dText + "\n" : "") + TS.t("dm." + P.deliveryMethod);
    if (P.type === "physical" && P.fulfillment === "external_supplier") dText = (dText ? dText + "\n" : "") + TS.t("p.supplier");
    if (dText) info += "<section><h2>" + esc(TS.t("p.delivery." + P.type)) + '</h2><p class="pre">' + esc(dText) + "</p></section>";

    var rel = related.length ? '<section class="sec"><div class="sh"><h2>' + esc(TS.t("sec.related")) + '</h2></div><div class="grid">' + related.map(TS.cards.card).join("") + "</div></section>" : "";
    root.innerHTML = '<nav class="crumbs" aria-label="breadcrumb"><a href="index.html">' + esc(TS.t("nav.store")) + "</a> / <span>" + esc(name) + "</span></nav>" +
      '<div class="pd">' + gal + '<div class="pi"><div><span class="badge">' + esc(TS.t("type." + P.type + ".s")) + "</span>" + (P.featured ? ' <span class="badge feat">' + esc(TS.t("badge.featured")) + "</span>" : "") + "</div><h1>" + esc(name) + "</h1>" +
      '<div class="price' + (quote ? " q" : "") + '">' + esc(TS.priceText(P)) + '</div><div class="av ' + av.status + '">' + esc(TS.cards.availLabel(av)) + "</div>" +
      (TS.pick(P, "short") ? '<p class="note" style="font-size:1rem">' + esc(TS.pick(P, "short")) + "</p>" : "") + optHtml + qtyHtml + noteHtml +
      '<div class="acts" style="display:grid;gap:10px">' + buy + '</div><p class="disc">' + esc(TS.t("p.disclaimer")) + "</p></div></div>" +
      (info ? '<div class="info">' + info + "</div>" : "") + rel;
    syncLinks(); jsonLd(name);
  }

  // رابط واتساب الحالي حسب الخيارات والكمية المختارة (يُبنى من بيانات حديثة جُلبت عند فتح الصفحة)
  function current() { return Cart.priceLines([{ id: P.id, qty: qty, options: Object.assign({}, opts), note: note }], (function () { var o = {}; o[P.id] = P; return o; })(), C); }
  function syncLinks() {
    var a = $("#wa-order"); if (!a) return;
    var pl = current(), it = pl.items[0];
    if (it.status !== "ok") { a.href = "#"; a.dataset.invalid = "1"; return; }
    delete a.dataset.invalid;
    var msg = Cart.buildMessage(pl.items, pl.totals, { t: TS.t, money: TS.money, pick: TS.pick, L: TS.L, ref: ref, single: true });
    a.href = Cart.waUrl(C.WHATSAPP_NUMBER, msg);
  }
  function firstMissing() { var m = Cart.validateOptions(P, opts).missing[0]; return m == null ? "" : TS.t("p.opt.required", { name: TS.L(P.variants[m].name) }); }
  function jsonLd(name) {
    var old = $("#ld"); if (old) old.remove();
    var o = { "@context": "https://schema.org", "@type": "Product", name: name, description: TS.pick(P, "short") || TS.pick(P, "full") };
    var im = P.images.filter(function (u) { return /^https:\/\//.test(u); }); if (im.length) o.image = im;
    if (P.price != null && !P.quoteOnly) o.offers = { "@type": "Offer", priceCurrency: "MAD", price: String(P.price), availability: Cart.availability(P, C).max > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" };
    var s = document.createElement("script"); s.type = "application/ld+json"; s.id = "ld"; s.textContent = JSON.stringify(o).replace(/</g, "\\u003c"); document.head.appendChild(s);
  }

  root.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-img]"))) { img = +b.dataset.img; render(); return; }
    if ((b = e.target.closest("[data-q]"))) { qty += +b.dataset.q; render(); return; }
    if (e.target.closest("#add")) {
      var r = Cart.addToCart(Cart.load(localStorage), P, { qty: qty, options: opts, note: note }, C);
      if (!r.ok) { TS.toast(r.reason === "options" ? firstMissing() : TS.t("toast.limit"), "err"); return; }
      Cart.save(localStorage, r.lines); TS.toast(r.clamped ? TS.t("toast.limit") : TS.t("toast.added"), r.clamped ? "err" : "ok"); return;
    }
    if ((b = e.target.closest("#wa-order")) && b.dataset.invalid) { e.preventDefault(); TS.toast(firstMissing(), "err"); }
    else if (b) { if (window.TSOrders) TSOrders.record(ref, current().items); ref = Cart.makeRef(); setTimeout(syncLinks, 400); }   // مرجع جديد لكل إرسال
  });
  root.addEventListener("change", function (e) { var s = e.target.closest("[data-opt]"); if (s) { if (s.value) opts[s.dataset.opt] = s.value; else delete opts[s.dataset.opt]; syncLinks(); } });
  root.addEventListener("input", function (e) { if (e.target.id === "pnote") { note = e.target.value; syncLinks(); } });

  async function load() {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { state = "ready"; P = null; return render(); }
    if (!TS.api.configured()) { state = "config"; return render(); }
    state = "loading"; render();
    try {
      P = await TS.api.fetchProductBySlug(slug); state = "ready"; render();
      if (P) TS.api.fetchCatalog().then(function (d) {
        related = d.products.filter(function (x) { return x.id !== P.id && (x.categoryId && x.categoryId === P.categoryId || x.type === P.type); }).slice(0, 4);
        if (related.length) render();
      }).catch(function () {});
    } catch (e) { if (window.console) console.error(e); state = "error"; render(); }
  }
  TS.cards.bindAdd(function (id) { return related.filter(function (p) { return p.id === id; })[0]; });
  TS.onRender(function () { if (state !== "loading") render(); });
  TS.start(); load();
})();
