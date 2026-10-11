/* Triple A Store — demo-data.js
   ⚠ بيانات عرض وهمية للتجربة المحلية فقط. تُستعمل فقط إذا ضبطت DEMO_MODE: true في config.js.
   لا تُحمَّل هذه الصفحة في الإنتاج (احذف وسمها من الصفحات أو اترك DEMO_MODE=false فلن تُستعمل). */
(function () {
  if (!(window.STORE_CONFIG && window.STORE_CONFIG.DEMO_MODE)) return;   // خامل تماماً في الإنتاج
  function img(bg, fg, label) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="' + bg + '"/><path d="M200 70l70 120H130z" fill="' + fg + '" opacity=".25"/><text x="200" y="250" text-anchor="middle" font-family="Arial" font-size="22" fill="' + fg + '">' + label + '</text></svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(s);
  }
  function tr(id, lang, name, short, extra) { return Object.assign({ id: id + lang, product_id: id, language: lang, name: name, short_description: short }, extra || {}); }
  function cat(id, slug, o, ar, fr, en) { return { id: id, slug: slug, sort_order: o, is_active: true, category_translations: [{ language: "ar", name: ar }, { language: "fr", name: fr }, { language: "en", name: en }] }; }
  var now = Date.now(), day = 864e5;
  function P(o) { return Object.assign({ category_id: null, price: null, price_is_starting: false, quote_only: false, currency: "MAD", fulfillment: null, stock_quantity: null, is_available: true, file_format: null, delivery_method: null, variants: [], images: [], is_published: true, is_featured: false }, o); }

  window.STORE_DEMO = {
    categories: [
      cat("c1", "drawing-tools", 10, "أدوات الرسم", "Matériel de dessin", "Drawing tools"),
      cat("c2", "photography", 20, "التصوير والإضاءة", "Photo & éclairage", "Photography & lighting"),
      cat("c3", "digital-templates", 40, "قوالب رقمية", "Modèles numériques", "Digital templates"),
      cat("c4", "design-services", 50, "خدمات التصميم", "Services de design", "Design services"),
      cat("c5", "web-services", 60, "خدمات المواقع", "Services web", "Web services")
    ],
    products: [
      P({ id: "d1", slug: "demo-sketchbook-set", type: "physical", category_id: "c1", price: 129, fulfillment: "own_stock", stock_quantity: 12, is_featured: true, created_at: new Date(now - 2 * day).toISOString(),
        images: [img("#1a1428", "#b9a0ff", "Sketchbook"), img("#2a2238", "#8b5cf6", "Markers")],
        variants: [{ name: { ar: "المقاس", fr: "Taille", en: "Size" }, options: ["A5", "A4"] }],
        product_translations: [
          tr("d1", "ar", "دفتر رسم مع أقلام ماركر (عرض تجريبي)", "دفتر رسم احترافي مع 12 قلماً.", { full_description: "منتج تجريبي لعرض شكل المتجر.\nورق سميك مناسب للماركر.", specifications: "الورق: 200 غرام\nعدد الأقلام: 12", delivery_info: "الشحن داخل المغرب خلال 2–4 أيام." }),
          tr("d1", "fr", "Carnet de croquis + marqueurs (démo)", "Carnet pro avec 12 marqueurs.", { full_description: "Produit de démonstration.\nPapier épais adapté aux marqueurs.", specifications: "Papier : 200 g\nMarqueurs : 12", delivery_info: "Livraison au Maroc en 2 à 4 jours." }),
          tr("d1", "en", "Sketchbook & marker set (demo)", "Pro sketchbook with 12 markers.", { full_description: "Demo product.\nThick paper suited to markers.", specifications: "Paper: 200 gsm\nMarkers: 12", delivery_info: "Delivery within Morocco in 2–4 days." })] }),
      P({ id: "d2", slug: "demo-led-ring-light", type: "physical", category_id: "c2", price: 349, fulfillment: "own_stock", stock_quantity: 2, is_featured: true, created_at: new Date(now - 4 * day).toISOString(),
        images: [img("#0f1a2a", "#7dd3fc", "Ring light")],
        product_translations: [tr("d2", "ar", "إضاءة حلقية LED (عرض تجريبي)", "إضاءة مناسبة للتصوير والبث."), tr("d2", "fr", "Anneau lumineux LED (démo)", "Éclairage pour photo et vidéo."), tr("d2", "en", "LED ring light (demo)", "Lighting for photo and video.")] }),
      P({ id: "d3", slug: "demo-mirrorless-camera", type: "physical", category_id: "c2", price: 6200, fulfillment: "external_supplier", created_at: new Date(now - 6 * day).toISOString(),
        images: [],
        product_translations: [tr("d3", "ar", "كاميرا ميرورليس (عرض تجريبي)", "تُورَّد عند الطلب من مورّد."), tr("d3", "fr", "Appareil photo hybride (démo)", "Approvisionné sur commande."), tr("d3", "en", "Mirrorless camera (demo)", "Sourced on order from a supplier.")] }),
      P({ id: "d4", slug: "demo-wireless-mic", type: "physical", category_id: "c2", price: 219, fulfillment: "own_stock", stock_quantity: 0, created_at: new Date(now - 9 * day).toISOString(),
        images: [img("#221a14", "#fbbf24", "Mic")],
        product_translations: [tr("d4", "ar", "ميكروفون لاسلكي (عرض تجريبي)", "نفدت الكمية."), tr("d4", "fr", "Micro sans fil (démo)", "Rupture de stock."), tr("d4", "en", "Wireless microphone (demo)", "Out of stock.")] }),
      P({ id: "d5", slug: "demo-canva-social-pack", type: "digital", category_id: "c3", price: 79, file_format: "Canva", delivery_method: "whatsapp_manual", is_featured: true, created_at: new Date(now - 1 * day).toISOString(),
        images: [img("#1b1330", "#c4b5fd", "Canva pack")],
        product_translations: [
          tr("d5", "ar", "حزمة قوالب Canva للسوشيال ميديا (تجريبي)", "30 قالباً قابلاً للتعديل.", { full_description: "حزمة قوالب جاهزة للتعديل في Canva.", delivery_info: "ستتلقى رابط القوالب عبر واتساب بعد التحقق من الدفع." }),
          tr("d5", "fr", "Pack de modèles Canva réseaux sociaux (démo)", "30 modèles modifiables.", { full_description: "Modèles prêts à modifier dans Canva.", delivery_info: "Vous recevrez le lien sur WhatsApp après vérification du paiement." }),
          tr("d5", "en", "Canva social media template pack (demo)", "30 editable templates.", { full_description: "Ready-to-edit templates for Canva.", delivery_info: "You'll receive the link on WhatsApp after payment is verified." })] }),
      P({ id: "d6", slug: "demo-business-card-template", type: "digital", category_id: "c3", price: 49, file_format: "PSD, PDF", delivery_method: "signed_link", created_at: new Date(now - 12 * day).toISOString(),
        images: [img("#14202a", "#67e8f9", "Card")],
        product_translations: [tr("d6", "ar", "قالب بطاقة أعمال (تجريبي)", "قالب PSD عالي الجودة."), tr("d6", "fr", "Modèle de carte de visite (démo)", "Modèle PSD haute qualité."), tr("d6", "en", "Business card template (demo)", "High-quality PSD template.")] }),
      P({ id: "d7", slug: "demo-logo-design", type: "service", category_id: "c4", price: 500, price_is_starting: true, is_featured: true, created_at: new Date(now - 3 * day).toISOString(),
        images: [img("#25143a", "#a78bfa", "Logo")],
        product_translations: [
          tr("d7", "ar", "تصميم شعار احترافي (تجريبي)", "شعار فريد مع ملفات جاهزة.", { deliverables: "3 مقترحات أولية\nتعديلات حتى الاعتماد\nملفات PNG وSVG وPDF", delivery_info: "3 إلى 5 أيام عمل" }),
          tr("d7", "fr", "Création de logo professionnel (démo)", "Logo unique avec fichiers prêts.", { deliverables: "3 propositions initiales\nRévisions jusqu'à validation\nFichiers PNG, SVG, PDF", delivery_info: "3 à 5 jours ouvrés" }),
          tr("d7", "en", "Professional logo design (demo)", "A unique logo with ready files.", { deliverables: "3 initial concepts\nRevisions until approval\nPNG, SVG and PDF files", delivery_info: "3 to 5 business days" })] }),
      P({ id: "d8", slug: "demo-landing-page", type: "service", category_id: "c5", price: 1500, price_is_starting: true, created_at: new Date(now - 5 * day).toISOString(),
        images: [],
        product_translations: [tr("d8", "ar", "صفحة هبوط (تجريبي)", "صفحة سريعة ومتجاوبة."), tr("d8", "fr", "Landing page (démo)", "Page rapide et responsive."), tr("d8", "en", "Landing page (demo)", "A fast, responsive page.")] }),
      P({ id: "d9", slug: "demo-full-branding", type: "service", category_id: "c4", quote_only: true, created_at: new Date(now - 7 * day).toISOString(),
        images: [img("#1a1030", "#f0abfc", "Branding")],
        product_translations: [tr("d9", "ar", "هوية بصرية متكاملة (تجريبي)", "عرض سعر حسب حجم المشروع."), tr("d9", "fr", "Identité visuelle complète (démo)", "Devis selon le projet."), tr("d9", "en", "Full branding package (demo)", "Quote based on project scope.")] })
    ]
  };
})();
