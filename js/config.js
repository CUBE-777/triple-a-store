/* =====================================================================
   Triple A Store — الإعدادات (هذا هو الملف الوحيد الذي تحتاج تعديله للإعداد)
   ⚠ مهم جداً:
   • مفتاح SUPABASE_ANON_KEY هو المفتاح "العام" (anon/publishable) ومصمَّم ليكون ظاهراً في المتصفح.
     الأمان يأتي من سياسات RLS في قاعدة البيانات وليس من إخفاء هذا المفتاح.
   • لا تضع أبداً مفتاح service_role أو كلمة مرور هنا — هذا ملف عام يراه كل زائر.
   ===================================================================== */
window.STORE_CONFIG = {
  // من Supabase: Project Settings → API
  SUPABASE_URL: "",        // مثال: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // المفتاح العام فقط (anon / publishable)

  // رقم واتساب بصيغة دولية وأرقام فقط، بدون + أو مسافات (يُرجى التحقق منه قبل الإطلاق)
  WHATSAPP_NUMBER: "212633740099",

  // رابط الموقع الأصلي (Triple A Studio) — للروابط المتبادلة
  STUDIO_URL: "https://triple-a-a-a.netlify.app",

  // رابط المتجر النهائي بعد النشر (بدون / في النهاية). اتركه فارغاً حتى تختار الدومين.
  // عند تعبئته تُضاف روابط canonical تلقائياً. لا تخترع دومين غير موجود.
  STORE_URL: "",

  // بيانات التواصل (مأخوذة من موقع Triple A Studio الحالي)
  CONTACT_EMAIL: "triple.a.code@gmail.com",
  INSTAGRAM_URL: "https://www.instagram.com/triple_a_code",
  TIKTOK_URL: "https://www.tiktok.com/@triple_a_code",

  // قواعد الكمية
  LOW_STOCK_THRESHOLD: 3,  // عند وصول المخزون لهذا الرقم أو أقل تظهر "بقي X فقط"
  MAX_QTY: 20,             // أقصى كمية لمنتج مادي في سطر واحد

  // وضع تجريبي: يعرض بيانات عرض وهمية موسومة بوضوح ولا يتصل بـ Supabase. اتركه false في الإنتاج.
  DEMO_MODE: false
};
