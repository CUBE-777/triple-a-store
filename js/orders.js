/* Triple A Store — orders.js (إضافة مستقلة: تسجيل الطلب عند الضغط على زر واتساب)
   يرسل فقط: المرجع + اللغة + (معرّف المنتج، الكمية، الخيارات، الملاحظة). لا أسعار ولا مجاميع:
   الخادم (دالة create_order) يحسبها من جدول المنتجات. لا بيانات شخصية.
   الفشل صامت: لا يمنع فتح واتساب أبداً. لإلغاء الميزة احذف وسم <script> الخاص بهذا الملف. */
(function () {
  "use strict";
  var TS = window.TS, C = TS.C;
  function payload(items) {
    return items.filter(function (i) { return i.status === "ok"; }).map(function (i) {
      return { product_id: i.product.id, quantity: i.qty, options: i.line.options || {}, note: i.line.note || "" };
    });
  }
  function record(ref, items) {
    if (C.DEMO_MODE || !TS.api.configured()) return;
    var p = payload(items); if (!p.length) return;
    try {
      TS.api.client().rpc("create_order", { p_ref: ref, p_lang: TS.lang, p_items: p })
        .then(function (r) { if (r && r.error && window.console) console.warn("[orders] لم يُسجَّل الطلب:", r.error.message); }, function () {});
    } catch (e) { if (window.console) console.warn("[orders]", e); }
  }
  window.TSOrders = { record: record, payload: payload };
})();
