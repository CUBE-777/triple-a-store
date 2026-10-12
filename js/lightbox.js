/* Triple A Store — lightbox.js (إضافة مستقلة)
   تكبير صورة المنتج بالنقر مع تنقل (أسهم/أزرار/سحب بالإصبع). لا يعدّل أي كود آخر:
   يقرأ الصور من الصفحة نفسها (.gal) ويعمل بالتفويض. لإلغائه احذف وسم <script> الخاص به من product.html. */
(function () {
  "use strict";
  var TS = window.TS, t = TS.t, dlg = null, urls = [], idx = 0, sx = null;

  function build() {
    dlg = document.createElement("dialog"); dlg.className = "lb";
    dlg.innerHTML = '<button class="lb-x" type="button" data-lb="close">✕</button><button class="lb-n lb-prev" type="button" data-lb="prev">‹</button>' +
      '<div class="lb-stage"><img alt=""></div><button class="lb-n lb-next" type="button" data-lb="next">›</button><div class="lb-count" aria-live="polite"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", function (e) { var b = e.target.closest("[data-lb]"); if (b) { var a = b.dataset.lb; if (a === "close") dlg.close(); else go(a === "next" ? 1 : -1); } else if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("keydown", function (e) {
      var rtl = document.documentElement.dir === "rtl";
      if (e.key === "ArrowLeft") go(rtl ? 1 : -1); else if (e.key === "ArrowRight") go(rtl ? -1 : 1);
    });
    var st = dlg.querySelector(".lb-stage");
    st.addEventListener("pointerdown", function (e) { sx = e.clientX; });
    st.addEventListener("pointerup", function (e) {
      if (sx === null) return; var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) go((dx < 0) === (document.documentElement.dir !== "rtl") ? 1 : -1);   // السحب يتبع اتجاه اللغة
    });
  }
  function go(d) { if (urls.length < 2) return; idx = (idx + d + urls.length) % urls.length; show(); }
  function show() {
    dlg.querySelector("img").src = urls[idx];
    dlg.querySelector("img").alt = (TS.$(".pi h1") || {}).textContent || "";
    dlg.querySelector(".lb-count").textContent = urls.length > 1 ? t("lb.count", { i: idx + 1, n: urls.length }) : "";
    dlg.querySelector("[data-lb=close]").setAttribute("aria-label", t("lb.close"));
    dlg.querySelector(".lb-prev").setAttribute("aria-label", t("lb.prev")); dlg.querySelector(".lb-next").setAttribute("aria-label", t("lb.next"));
    dlg.classList.toggle("single", urls.length < 2);
  }
  function open() {
    var main = TS.$(".gal .main .pimg"); if (!main) return;
    var th = TS.$$(".gal .thumbs .pimg"); urls = th.length ? th.map(function (i) { return i.src; }) : [main.src];
    var cur = TS.$$(".gal .thumbs button").map(function (b) { return b.getAttribute("aria-current") === "true"; }).indexOf(true); idx = cur < 0 ? 0 : cur;
    if (!dlg) build(); show(); dlg.showModal();
  }
  document.addEventListener("click", function (e) { if (e.target.closest(".gal .main") && TS.$(".gal .main .pimg")) open(); });
  document.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".gal .main")) { e.preventDefault(); open(); } });
  // لإمكانية الوصول بلوحة المفاتيح: نجعل الإطار زراً قابلاً للتركيز
  function mark() { var m = TS.$(".gal .main"); if (m && m.querySelector(".pimg") && !m.hasAttribute("role")) { m.setAttribute("role", "button"); m.setAttribute("tabindex", "0"); } if (m) m.setAttribute("aria-label", t("lb.open")); }
  var root = document.getElementById("pd-root"); if (root) { new MutationObserver(mark).observe(root, { childList: true, subtree: true }); mark(); }
})();
