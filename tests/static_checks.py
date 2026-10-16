#!/usr/bin/env python3
"""فحوص ثابتة: الروابط الداخلية، الأصول، غياب الأسرار، قيم الإعداد الافتراضية. تشغيل: python3 tests/static_checks.py"""
import os, re, sys, glob
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..")); os.chdir(ROOT); R = []
def check(n, ok, extra=""): R.append(bool(ok)); print(("  ✔ " if ok else "  ✘ ") + n + ("" if ok else f"   [{extra}]"))
htmls = glob.glob("*.html"); bad = []
for f in htmls:
    src = open(f, encoding="utf-8").read()
    for m in re.finditer(r'(?:href|src)="([^"#?]+)', src):
        u = m.group(1)
        if re.match(r"(https?:|mailto:|data:|/)", u) and not u.startswith("/"): continue
        if u.startswith("/"): continue
        if not os.path.exists(u): bad.append((f, u))
check("كل href/src المحلية في صفحات HTML موجودة", not bad, bad)
js_links = set()
for f in glob.glob("js/*.js"):
    for m in re.finditer(r'["\'](?:index|product|cart|admin)\.html', open(f, encoding="utf-8").read()): js_links.add(m.group(0)[1:])
check("الصفحات المشار إليها من JS موجودة", all(os.path.exists(x) for x in js_links), js_links)
check("ملفات الترحيلات الأربعة + إنشاء المسؤول موجودة", all(os.path.exists(x) for x in ["supabase/migrations/001_schema.sql", "supabase/migrations/002_rls_policies.sql", "supabase/migrations/003_storage.sql", "supabase/migrations/004_seed_categories.sql", "supabase/migrations/005_orders.sql", "supabase/create_first_admin.sql"]))
hits = []
pat = re.compile(r"service_role\s*[:=]\s*[\"'][^\"']{10,}|sb_secret_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{5,}|-----BEGIN [A-Z ]*PRIVATE KEY|SUPABASE_SERVICE")
for f in [x for x in glob.glob("**/*", recursive=True) if os.path.isfile(x) and not x.endswith("static_checks.py")]:
    try: t = open(f, encoding="utf-8").read()
    except Exception: continue
    for m in pat.finditer(t): hits.append((f, m.group(0)[:30]))
check("لا أسرار/مفاتيح/JWT في أي ملف", not hits, hits)
cfg = open("js/config.js", encoding="utf-8").read()
check("config.js: مفاتيح Supabase فارغة وDEMO_MODE=false", 'SUPABASE_URL: ""' in cfg and 'SUPABASE_ANON_KEY: ""' in cfg and "DEMO_MODE: false" in cfg)
check("لا ملف .env حقيقي", not any(os.path.exists(x) for x in [".env", ".env.local", ".env.production"]) and os.path.exists(".env.example"))
check("لا استعمال لـ localStorage لبيانات حساسة (فقط lang/theme/cart)", set(re.findall(r'localStorage\.(?:getItem|setItem)\(\s*"([^"]+)"', "".join(open(f, encoding="utf-8").read() for f in glob.glob("js/*.js") + ["js/boot.js"]))) <= {"lang", "theme"})
check("لا eval/new Function/document.write في الكود", not re.search(r"\beval\(|new Function\(|document\.write\(", "".join(open(f, encoding="utf-8").read() for f in glob.glob("js/*.js"))))
check("لا onclick/onerror مضمّنة (متوافق مع CSP)", not any(re.search(r"\son(click|error|load)=", open(f, encoding="utf-8").read()) for f in htmls))
check("أي سكربت HTML مضمّن غير موجود (CSP script-src 'self')", not any(re.search(r"<script(?![^>]*\bsrc=)[^>]*>", open(f, encoding="utf-8").read()) for f in htmls))
sql = open("supabase/migrations/002_rls_policies.sql", encoding="utf-8").read() + open("supabase/migrations/005_orders.sql", encoding="utf-8").read() + open("supabase/migrations/006_portfolio.sql", encoding="utf-8").read()
tables = re.findall(r"create table if not exists public\.(\w+)", open("supabase/migrations/001_schema.sql", encoding="utf-8").read() + open("supabase/migrations/005_orders.sql", encoding="utf-8").read() + open("supabase/migrations/006_portfolio.sql", encoding="utf-8").read())
check("RLS مفعّل على كل جدول معرَّف: " + ", ".join(tables), all(re.search(rf"alter table public\.{t}\s+enable row level security", sql) for t in tables))
check("لا سياسة insert/update/delete لـ anon", not re.search(r"for (insert|update|delete|all) to anon", sql))
check("جداول الطلبات: لا صلاحية كتابة مباشرة للزوار؛ الدالة create_order فقط", not re.search(r"grant\s+(insert|update|delete)[^;]*public\.(orders|order_items)[^;]*to[^;]*anon", sql) and "grant execute on function public.create_order(text, text, jsonb) to anon, authenticated" in sql and "revoke all on function public.create_order(text, text, jsonb) from public" in sql)
check("admin_users بدون أي سياسة كتابة", not re.search(r"on public\.admin_users\s+for (insert|update|delete|all)", sql))
p6 = open("supabase/migrations/006_portfolio.sql", encoding="utf-8").read()
check("006: يحوي ثلاثة جداول معرض فقط ولا يلمس جداول المتجر", sorted(re.findall(r"create table if not exists public\.(\w+)", p6)) == ["portfolio_categories", "portfolio_collections", "portfolio_projects"] and not re.search(r"(alter|drop|truncate|delete\s+from|update)\s+(table\s+)?(if exists\s+)?public\.(products|categories|category_translations|product_translations|product_private|admin_users|orders|order_items)\b", p6, re.I))
p6c = re.sub(r"--[^\n]*", "", p6)   # بدون التعليقات (فيها تعليمات التراجع اليدوية)
check("006: لا drop table/truncate/delete في الكود التنفيذي (فقط drop policy/trigger لجداول المعرض)", not re.search(r"drop\s+table|truncate|delete\s+from", p6c, re.I) and all("portfolio" in m or "pproj" in m for m in re.findall(r"drop (?:policy|trigger) if exists ([^\n]+)", p6c)))
check("006: سياسات الكتابة كلها عبر is_admin() ولا سياسة لـ anon غير القراءة", len(re.findall(r"for all to authenticated using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)", p6)) == 3 and not re.search(r"for (insert|update|delete|all) to anon", p6) and not re.search(r"grant\s+(insert|update|delete)[^;]*\bto\s+anon", p6, re.I))
check("006: القراءة العامة مقيّدة بالمنشور/الفعّال فقط", p6.count("using (is_published)") == 1 and p6.count("using (is_active)") == 2)
check("007/008: بيانات مبدئية بـ on conflict do nothing (لا تعدّل شيئاً موجوداً)", all(open(f"supabase/migrations/{f}", encoding="utf-8").read().count("on conflict (slug) do nothing") >= 1 for f in ["007_portfolio_seed_taxonomy.sql", "008_portfolio_seed_existing_project.sql"]))
check("لا كتابة إلى جداول أخرى من admin-portfolio.js ولا مفاتيح سرية", not re.search(r'from\("(products|categories|orders|order_items|admin_users|product_[a-z]+)"\)', open("js/admin-portfolio.js", encoding="utf-8").read()) and "service_role" not in open("js/admin-portfolio.js", encoding="utf-8").read())
print(f"\nالنتيجة: {sum(R)} نجح، {len(R)-sum(R)} فشل"); sys.exit(0 if all(R) else 1)
