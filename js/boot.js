/* يُحمَّل في <head> قبل رسم الصفحة لتفادي وميض الثيم/اتجاه اللغة.
   نفس مفاتيح localStorage المستعملة في موقع Triple A Studio الأصلي: "lang" و"theme". */
(function () {
  try {
    var l = localStorage.getItem("lang"), t = localStorage.getItem("theme"), h = document.documentElement;
    if (l !== "ar" && l !== "fr" && l !== "en") l = "ar";            // العربية هي الافتراضية
    h.lang = l; h.dir = l === "ar" ? "rtl" : "ltr";
    h.dataset.theme = (t === "light" || t === "dark") ? t : "dark";  // الداكن افتراضي مثل الموقع الأصلي
  } catch (e) {}
})();
