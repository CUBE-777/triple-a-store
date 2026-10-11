// يعمل على Netlify أثناء البناء (node scripts/generate-config.mjs). اختياري.
// يقرأ متغيرات البيئة ويكتب القيم في js/config.js. لا يستعمل أي مكتبات.
// ⚠ يرفض تلقائياً أي مفتاح سري (service_role / sb_secret_) حتى لا يصل إلى المتصفح بالخطأ.
import { readFileSync, writeFileSync } from "node:fs";
const FILE = new URL("../js/config.js", import.meta.url);
const env = process.env, set = {}, fail = m => { console.error("✘ generate-config: " + m); process.exit(1); };

if (env.SUPABASE_URL || env.SUPABASE_ANON_KEY) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) fail("اضبط SUPABASE_URL و SUPABASE_ANON_KEY معاً.");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(env.SUPABASE_URL.replace(/\/$/, ""))) fail("SUPABASE_URL غير صالح (يجب أن يبدأ بـ https://).");
  const k = env.SUPABASE_ANON_KEY.trim();
  if (k.startsWith("sb_secret_")) fail("هذا مفتاح سري (sb_secret_). استعمل المفتاح العام فقط (anon / publishable).");
  if (!/^[A-Za-z0-9._-]{20,}$/.test(k)) fail("SUPABASE_ANON_KEY بصيغة غير متوقعة.");
  if (k.split(".").length === 3) {
    try { const role = JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role; if (role === "service_role") fail("هذا مفتاح service_role السري! لا تضعه أبداً في المتصفح. استعمل anon."); } catch { /* مفتاح غير JWT */ }
  }
  set.SUPABASE_URL = env.SUPABASE_URL.trim().replace(/\/$/, ""); set.SUPABASE_ANON_KEY = k;
}
if (env.WHATSAPP_NUMBER) { const d = env.WHATSAPP_NUMBER.replace(/\D/g, ""); if (d.length < 8 || d.length > 15) fail("WHATSAPP_NUMBER غير صالح."); set.WHATSAPP_NUMBER = d; }
for (const key of ["STORE_URL", "STUDIO_URL"]) if (env[key]) { if (!/^https:\/\/[^\s"'<>]+$/.test(env[key])) fail(key + " يجب أن يبدأ بـ https://"); set[key] = env[key].trim().replace(/\/$/, ""); }
if (env.CONTACT_EMAIL) { if (!/^[^\s"'<>@]+@[^\s"'<>@]+\.[^\s"'<>@]+$/.test(env.CONTACT_EMAIL)) fail("CONTACT_EMAIL غير صالح."); set.CONTACT_EMAIL = env.CONTACT_EMAIL.trim(); }

if (!Object.keys(set).length) { console.log("generate-config: لا متغيرات بيئة — يبقى js/config.js كما هو."); process.exit(0); }
let src = readFileSync(FILE, "utf8");
for (const [k, v] of Object.entries(set)) {
  const re = new RegExp("(\\b" + k + "\\s*:\\s*)\"[^\"]*\""); if (!re.test(src)) fail("لم أجد " + k + " في config.js");
  src = src.replace(re, (_, p) => p + JSON.stringify(v));
}
writeFileSync(FILE, src); console.log("generate-config: تم تحديث", Object.keys(set).join(", "));
