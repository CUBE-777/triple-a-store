/* Triple A Store — cards.js
   بناء بطاقة المنتج (تُستعمل في الصفحة الرئيسية وصفحة المنتج "منتجات مشابهة"). */
(function () {
  "use strict";
  var TS = window.TS, C = TS.C, Cart = window.TSCart, esc = TS.esc;

  function availLabel(av) { return TS.t("avail." + av.status, { n: av.left }); }

  function card(p) {
    var av = Cart.availability(p, C), href = "product.html?slug=" + encodeURIComponent(p.slug), name = TS.pick(p, "name"), short = TS.pick(p, "short");
    var q = p.quoteOnly || p.price == null, act;
    if (av.max < 1) act = '<span class="btn sm block" aria-disabled="true">' + esc(TS.t("avail.out")) + "</span>";
    else if (p.variants.length) act = '<a class="btn sm block" href="' + href + '">' + esc(TS.t("btn.options")) + "</a>";
    else if (q) act = '<a class="btn sm block" href="' + href + '">' + esc(TS.t("btn.quote")) + "</a>";
    else act = '<button class="btn pri sm block" type="button" data-add="' + esc(p.id) + '">' + esc(TS.t("btn.add")) + "</button>";
    return '<article class="card"><a class="media" href="' + href + '" tabindex="-1" aria-hidden="true">' + TS.imgHtml(p.images[0], name, p.type) +
      '<span class="badges"><span class="badge">' + esc(TS.t("type." + p.type + ".s")) + "</span>" + (p.featured ? '<span class="badge feat">' + esc(TS.t("badge.featured")) + "</span>" : "") + "</span></a>" +
      '<div class="body"><h3><a href="' + href + '">' + esc(name) + "</a></h3>" + (short ? '<p class="short">' + esc(short) + "</p>" : "") +
      '<div class="price' + (q ? " q" : "") + '">' + esc(TS.priceText(p)) + '</div><div class="av ' + av.status + '">' + esc(availLabel(av)) + "</div></div>" +
      '<div class="foot-c">' + act + "</div></article>";
  }

  // زر "أضف إلى السلة" في البطاقات (تفويض أحداث على مستوى المستند)
  function bindAdd(getProduct) {
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-add]"); if (!b) return;
      var p = getProduct(b.dataset.add); if (!p) return;
      var r = Cart.addToCart(Cart.load(localStorage), p, { qty: 1 }, C);
      if (!r.ok) { TS.toast(TS.t("toast.limit"), "err"); return; }
      Cart.save(localStorage, r.lines); TS.toast(r.clamped ? TS.t("toast.limit") : TS.t("toast.added"), r.clamped ? "err" : "ok");
    });
  }
  TS.cards = { card: card, bindAdd: bindAdd, availLabel: availLabel };
})();
