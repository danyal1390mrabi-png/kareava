/**
 * build.js
 * ----------------------------------------------------------------------
 * این اسکریپت رو GitHub Actions به‌صورت خودکار اجرا می‌کنه (و می‌تونی خودت هم
 * دستی با `node scripts/build.js` اجرا کنی).
 *
 * کارهایی که انجام می‌ده:
 *   ۱. فایل data/listings.json رو می‌خونه (لیست همه‌ی آگهی‌ها)
 *   ۲. برای هر آگهی که "slug" نداره، یه اسلاگ (لینک اختصاصی) از روی
 *      عنوانش می‌سازه و به خودِ فایل listings.json برمی‌گردونه (ذخیره می‌کنه)
 *   ۳. برای هر آگهی یک صفحه‌ی HTML مستقل و قابل ایندکس در گوگل، داخل
 *      پوشه‌ی ad/ می‌سازه (عنوان، توضیحات، canonical و JSON-LD مخصوص خودش)
 *   ۴. sitemap.xml و robots.txt رو به‌روز می‌کنه
 *
 * یعنی تو فقط کافیه آگهی جدید رو به data/listings.json اضافه کنی و پوش
 * کنی؛ بقیه‌ش (لینک‌سازی، صفحه‌سازی، sitemap) خودکاره.
 * ----------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://kareava.ir';
const LISTINGS_PATH = path.join(ROOT, 'data', 'listings.json');
const AD_DIR = path.join(ROOT, 'ad');
// عکس آگهی‌ها همون‌جایی هستن که index.html هست (پوشه‌ی اصلی سایت) — دقیقاً
// مثل چیزی که در کارت‌های index.html استفاده می‌شه: url('${l.img}')
const IMG_BASE = SITE_URL + '/';
const IMG_REL = '../'; // چون صفحات ad/*.html یک پوشه پایین‌تر از ریشه هستن

const CATEGORIES = {
  construction: 'ساختمان و تاسیسات',
  auto: 'خودرو و تعمیرگاه',
  beauty: 'آرایشی و زیبایی',
  tech: 'کامپیوتر، موبایل و فناوری',
  home: 'خدمات منزل و نظافت',
  education: 'آموزش و تدریس',
  food: 'خوراک، کیترینگ و قنادی',
  art: 'هنر، صنایع دستی و طراحی',
  health: 'سلامت و پزشکی',
  other: 'سایر مشاغل'
};

/* ---------- تبدیل عنوان فارسی به یک اسلاگ (بخش انتهایی لینک) ---------- */
function slugify(title, city) {
  let s = (title + ' ' + (city || '')).trim();
  // حذف نویسه‌های نامناسب برای URL؛ حروف فارسی/عربی و اعداد و فاصله نگه داشته می‌شن
  s = s.replace(/[^\u0600-\u06FF0-9a-zA-Z\s-]/g, '');
  s = s.trim().replace(/\s+/g, '-');
  s = s.replace(/-+/g, '-');
  // طول لینک رو معقول نگه می‌داریم؛ هم برای زیبایی URL هم چون بعضی سیستم‌فایل‌ها
  // (از جمله بعضی هاست‌ها) روی طول بایتی نام فایل محدودیت دارن (فارسی هر حرف ۲ بایته)
  s = truncateBytes(s, 90);
  return s || 'agahi';
}

// برش امن یک رشته‌ی UTF-8 طوری که از N بایت بیشتر نشه و وسط یک کاراکتر قطع نشه
function truncateBytes(str, maxBytes) {
  let buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  buf = buf.slice(0, maxBytes);
  // اگر وسط یک کاراکتر چندبایتی بریده شده، از انتها کم می‌کنیم تا معتبر باشه
  let out = buf.toString('utf8');
  while (out.includes('\uFFFD')) {
    buf = buf.slice(0, buf.length - 1);
    out = buf.toString('utf8');
  }
  return out.replace(/-+$/, '');
}

function uniqueSlug(base, id, used) {
  let slug = base;
  if (used.has(slug)) slug = `${base}-${id}`;
  let n = 2;
  while (used.has(slug)) { slug = `${base}-${id}-${n}`; n++; }
  used.add(slug);
  return slug;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str, n) {
  str = String(str || '').replace(/\s+/g, ' ').trim();
  return str.length > n ? str.slice(0, n - 1).trim() + '…' : str;
}

function fmtPrice(p) {
  if (!p || p === 0) return 'توافقی';
  return Number(p).toLocaleString('fa-IR') + ' تومان';
}

/* ---------- خواندن آگهی‌ها ---------- */
if (!fs.existsSync(LISTINGS_PATH)) {
  console.error('data/listings.json پیدا نشد!');
  process.exit(1);
}
const listings = JSON.parse(fs.readFileSync(LISTINGS_PATH, 'utf8'));

const usedSlugs = new Set(listings.filter(l => l.slug).map(l => l.slug));
let changed = false;
for (const l of listings) {
  if (!l.slug) {
    const base = slugify(l.title, l.city);
    l.slug = uniqueSlug(base, l.id, usedSlugs);
    changed = true;
    console.log(`لینک جدید ساخته شد: /ad/${l.slug}.html  (برای «${l.title}»)`);
  }
  if (!l.createdAt) { l.createdAt = Date.now(); changed = true; }
}

if (changed) {
  fs.writeFileSync(LISTINGS_PATH, JSON.stringify(listings, null, 2), 'utf8');
  console.log('data/listings.json به‌روزرسانی شد.');
}

/* ---------- ساخت پوشه‌ی ad ---------- */
if (!fs.existsSync(AD_DIR)) fs.mkdirSync(AD_DIR, { recursive: true });

const standardPageTemplate = (l) => {
  const catLabel = CATEGORIES[l.category] || 'سایر مشاغل';
  const title = `${l.title} در ${l.city} | کار اوا`;
  const desc = truncate(l.desc || l.title, 155);
  const url = `${SITE_URL}/ad/${l.slug}.html`;
  const img = l.img ? IMG_BASE + l.img : `${SITE_URL}/logo-social.png`; // برای og:image باید آدرس کامل باشه
  const imgSrc = l.img ? IMG_REL + l.img : ''; // برای <img src> داخل خود صفحه، نسبیه

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="کار اوا">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="fa_IR">
<link rel="icon" href="../favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="stylesheet" href="../styles.css">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Service",
  "name": l.title,
  "description": l.desc || l.title,
  "areaServed": l.city,
  "category": catLabel,
  "url": url,
  "image": img,
  "provider": {
    "@type": "LocalBusiness",
    "name": l.title,
    "address": { "@type": "PostalAddress", "addressLocality": l.city, "addressCountry": "IR" },
    "telephone": l.phone ? ("+98" + String(l.phone).replace(/^0/, '')) : undefined
  },
  "offers": {
    "@type": "Offer",
    "price": l.price || 0,
    "priceCurrency": "IRR",
    "availability": "https://schema.org/InStock"
  }
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "کار اوا", "item": SITE_URL + "/" },
    { "@type": "ListItem", "position": 2, "name": catLabel, "item": SITE_URL + "/?cat=" + l.category },
    { "@type": "ListItem", "position": 3, "name": l.title, "item": url }
  ]
}, null, 2)}
</script>
</head>
<body class="ad-page">
<header class="ad-header">
  <a class="ad-logo" href="../index.html"><img src="../logo-icon-1024.png" alt="کار اوا" class="logo-img">کار اوا</a>
  <a class="ad-back" href="../index.html">← بازگشت به همه‌ی آگهی‌ها</a>
</header>

<main class="ad-main">
  <nav class="ad-breadcrumb" aria-label="مسیر صفحه">
    <a href="../index.html">کار اوا</a> ›
    <a href="../index.html?cat=${l.category}">${escapeHtml(catLabel)}</a> ›
    <span>${escapeHtml(l.title)}</span>
  </nav>

  <article class="ad-card">
    ${l.img ? `<img class="ad-img" src="${imgSrc}" alt="${escapeHtml(l.title)}" loading="lazy">` : `<div class="ad-img ad-img-empty">بدون عکس</div>`}
    <span class="ad-cat">${escapeHtml(catLabel)}</span>
    <h1 class="ad-title">${escapeHtml(l.title)}</h1>
    <div class="ad-price">${fmtPrice(l.price)}</div>
    <div class="ad-meta"><span>📍 ${escapeHtml(l.city)}</span></div>
    <p class="ad-desc">${escapeHtml(l.desc || '')}</p>

    <div class="ad-phone-box">
      <div class="ad-phone-label">شماره تماس برای سفارش و همکاری</div>
      ${l.phone
        ? `<a class="ad-phone-link" href="tel:${l.phone}" dir="ltr">${l.phone}</a>`
        : `<div class="ad-phone-empty">شماره تماسی برای این کسب‌وکار ثبت نشده</div>`}
    </div>

    <a class="ad-cta" href="../index.html">مشاهده‌ی همه‌ی آگهی‌های ${escapeHtml(catLabel)}</a>
  </article>
</main>

<footer class="ad-footer">کار اوا — بازارچه معرفی کسب‌وکار، اصناف و صاحبان حرفه در سراسر ایران · <a href="../support.html">پشتیبانی</a></footer>
</body>
</html>
`;
};

/* ---------- قالب VIP (طلایی، با انیمیشن نمایشی کدنویسی) ----------
 * فقط برای آگهی‌هایی استفاده می‌شه که توی listings.json فیلد
 * "vip": true دارن. بقیه‌ی آگهی‌ها همیشه از standardPageTemplate
 * استفاده می‌کنن و این تغییری در ظاهرشون نمی‌ده. */
/* ---------- قالب VIP طلایی (تیره، با انیمیشن نمایشی کدنویسی) ---------- */
const vipGoldPageTemplate = (l) => {
  const catLabel = CATEGORIES[l.category] || 'سایر مشاغل';
  const title = `${l.title} در ${l.city} | کار اوا`;
  const desc = truncate(l.desc || l.title, 155);
  const url = `${SITE_URL}/ad/${l.slug}.html`;
  const img = l.img ? IMG_BASE + l.img : `${SITE_URL}/logo-social.png`;

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="کار اوا">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="fa_IR">
<link rel="icon" href="../favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="stylesheet" href="../styles.css">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Service",
  "name": l.title,
  "description": l.desc || l.title,
  "areaServed": l.city,
  "category": catLabel,
  "url": url,
  "image": img,
  "provider": {
    "@type": "LocalBusiness",
    "name": l.title,
    "address": { "@type": "PostalAddress", "addressLocality": l.city, "addressCountry": "IR" },
    "telephone": l.phone ? ("+98" + String(l.phone).replace(/^0/, '')) : undefined
  },
  "offers": {
    "@type": "Offer",
    "price": l.price || 0,
    "priceCurrency": "IRR",
    "availability": "https://schema.org/InStock"
  }
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "کار اوا", "item": SITE_URL + "/" },
    { "@type": "ListItem", "position": 2, "name": catLabel, "item": SITE_URL + "/?cat=" + l.category },
    { "@type": "ListItem", "position": 3, "name": l.title, "item": url }
  ]
}, null, 2)}
</script>

<style>
  :root{
    --bg-deep:#090c14;
    --bg-panel:#11162a;
    --bg-panel-2:#161c36;
    --line:#242c4d;
    --gold:#c9a227;
    --gold-bright:#f0cf72;
    --text-primary:#eef0f6;
    --text-muted:#8d93ad;
    --mono-accent:#5ee6a8;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body.ad-page{
    margin:0;
    min-height:100vh;
    background:
      radial-gradient(1100px 500px at 85% -10%, rgba(201,162,39,.10), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(94,230,168,.06), transparent 60%),
      var(--bg-deep);
    color:var(--text-primary);
    font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;
    line-height:1.7;
    overflow-x:hidden;
  }
  .vip-strip{
    background:linear-gradient(90deg,#1a1508,#2a2109 40%,#1a1508);
    border-bottom:1px solid var(--line);
    color:var(--gold-bright);
    font-size:.78rem;
    letter-spacing:.02em;
    padding:7px 0;
    overflow:hidden;
    white-space:nowrap;
    position:relative;
  }
  .vip-strip .track{
    display:inline-block;
    padding-inline-start:100%;
    animation:marquee 22s linear infinite;
  }
  .vip-strip .track span{margin-inline-end:3.2em;}
  @keyframes marquee{from{transform:translateX(0);} to{transform:translateX(-100%);}}
  .ad-header{
    display:flex; align-items:center; justify-content:space-between;
    max-width:920px; margin:0 auto; padding:22px 20px 8px;
  }
  .ad-logo{display:flex;align-items:center;gap:10px;color:var(--text-primary);text-decoration:none;font-weight:700;font-size:1.05rem;}
  .logo-img{width:30px;height:30px;border-radius:8px;}
  .ad-back{color:var(--text-muted);text-decoration:none;font-size:.85rem;transition:color .2s ease;}
  .ad-back:hover{color:var(--gold-bright);}
  .ad-breadcrumb{max-width:920px;margin:0 auto;padding:6px 20px 18px;font-size:.8rem;color:var(--text-muted);}
  .ad-breadcrumb a{color:var(--text-muted);text-decoration:none;}
  .ad-breadcrumb a:hover{color:var(--gold-bright);}
  .ad-breadcrumb span{color:var(--gold-bright);}
  .ad-main{padding:10px 20px 60px;}
  .ad-card{
    position:relative; max-width:760px; margin:0 auto;
    background:linear-gradient(180deg,var(--bg-panel),var(--bg-panel-2));
    border:1px solid var(--line); padding:38px 34px 34px;
    opacity:0; animation:rise .7s cubic-bezier(.2,.7,.2,1) .1s forwards;
  }
  @keyframes rise{from{opacity:0; transform:translateY(18px);} to{opacity:1; transform:translateY(0);}}
  .corner{position:absolute;width:26px;height:26px;border:2px solid var(--gold);opacity:.85;}
  .corner.tl{top:-1px;right:-1px;border-left:none;border-bottom:none;}
  .corner.tr{top:-1px;left:-1px;border-right:none;border-bottom:none;}
  .corner.bl{bottom:-1px;right:-1px;border-left:none;border-top:none;}
  .corner.br{bottom:-1px;left:-1px;border-right:none;border-top:none;}
  .vip-badge{
    position:absolute; top:22px; left:22px; display:flex; align-items:center; gap:6px;
    background:rgba(201,162,39,.12); border:1px solid var(--gold); color:var(--gold-bright);
    font-size:.72rem; font-weight:700; padding:5px 11px 5px 9px; letter-spacing:.03em;
  }
  .vip-badge svg{width:13px;height:13px;flex:none;}
  .code-hero{background:#0b0e18;border:1px solid var(--line);margin-bottom:26px;overflow:hidden;direction:ltr;text-align:left;}
  .code-hero .bar{display:flex;align-items:center;gap:6px;padding:9px 12px;border-bottom:1px solid var(--line);background:#0e1220;}
  .code-hero .dot{width:9px;height:9px;border-radius:50%;background:#3a4160;}
  .code-hero .dot:nth-child(1){background:#ef6a5f;}
  .code-hero .dot:nth-child(2){background:#e7bd53;}
  .code-hero .dot:nth-child(3){background:#5fce6b;}
  .code-hero .filename{margin-inline-start:8px;font-family:'Fira Code','JetBrains Mono',ui-monospace,monospace;font-size:.72rem;color:var(--text-muted);}
  .code-hero pre{margin:0;padding:18px 20px 22px;font-family:'Fira Code','JetBrains Mono',ui-monospace,monospace;font-size:.82rem;line-height:1.85;color:#c7ccdb;min-height:158px;}
  .code-hero .tag{color:#7aa2f7;}
  .code-hero .attr{color:var(--mono-accent);}
  .code-hero .str{color:var(--gold-bright);}
  .code-hero .caret{display:inline-block;width:7px;height:1.1em;background:var(--mono-accent);vertical-align:text-bottom;animation:blink 1s step-end infinite;}
  @keyframes blink{50%{opacity:0;}}
  .ad-cat{display:inline-block;font-size:.75rem;color:var(--text-muted);border:1px solid var(--line);padding:4px 10px;margin-bottom:14px;}
  .ad-title{font-size:clamp(1.5rem,3.4vw,2.05rem);font-weight:800;margin:0 0 16px;color:var(--text-primary);}
  .ad-price{display:inline-flex;align-items:baseline;gap:6px;font-size:1.35rem;font-weight:800;color:#0c0d12;background:linear-gradient(100deg,var(--gold-bright),var(--gold));padding:8px 18px;margin-bottom:18px;}
  .ad-meta{color:var(--text-muted);font-size:.92rem;margin-bottom:20px;}
  .ad-desc{color:#c9cee2;font-size:1rem;border-top:1px solid var(--line);padding-top:20px;margin-bottom:28px;}
  .ad-phone-box{position:relative;border:1px solid var(--gold);background:rgba(201,162,39,.06);padding:20px 22px;margin-bottom:22px;text-align:center;}
  .ad-phone-box::before{content:"";position:absolute;inset:-1px;border:1px solid var(--gold);opacity:.5;animation:pulse-ring 2.6s ease-out infinite;pointer-events:none;}
  @keyframes pulse-ring{0%{transform:scale(1);opacity:.5;} 75%{transform:scale(1.015);opacity:0;} 100%{transform:scale(1.015);opacity:0;}}
  .ad-phone-label{font-size:.85rem;color:var(--text-muted);margin-bottom:8px;}
  .ad-phone-link{display:inline-block;font-size:1.5rem;font-weight:800;letter-spacing:.03em;color:var(--gold-bright);text-decoration:none;}
  .ad-phone-link:hover{color:#fff;}
  .ad-cta{display:block;text-align:center;color:var(--text-primary);text-decoration:none;border:1px solid var(--line);padding:13px;font-size:.92rem;transition:border-color .2s ease,color .2s ease;}
  .ad-cta:hover{border-color:var(--gold);color:var(--gold-bright);}
  .ad-footer{text-align:center;color:var(--text-muted);font-size:.8rem;padding:26px 20px 40px;}
  .ad-footer a{color:var(--text-muted);}
  .ad-footer a:hover{color:var(--gold-bright);}
  @media (max-width:640px){.ad-card{padding:30px 20px 26px;} .vip-badge{top:16px;left:16px;}}
  @media (prefers-reduced-motion: reduce){
    .ad-card{animation:none;opacity:1;}
    .vip-strip .track{animation:none;}
    .ad-phone-box::before{animation:none;display:none;}
    .code-hero .caret{animation:none;}
  }
</style>
</head>
<body class="ad-page">

<div class="vip-strip" aria-hidden="true">
  <div class="track">
    <span>✦ آگهی ویژه VIP</span>
    <span>✦ کد نویسی اختصاصی، بدون قالب آماده</span>
    <span>✦ پشتیبانی مستقیم توسط طراح</span>
    <span>✦ آگهی ویژه VIP</span>
    <span>✦ کد نویسی اختصاصی، بدون قالب آماده</span>
    <span>✦ پشتیبانی مستقیم توسط طراح</span>
  </div>
</div>

<header class="ad-header">
  <a class="ad-logo" href="../index.html"><img src="../logo-icon-1024.png" alt="کار اوا" class="logo-img">کار اوا</a>
  <a class="ad-back" href="../index.html">← بازگشت به همه‌ی آگهی‌ها</a>
</header>

<main class="ad-main">
  <nav class="ad-breadcrumb" aria-label="مسیر صفحه">
    <a href="../index.html">کار اوا</a> ›
    <a href="../index.html?cat=${l.category}">${escapeHtml(catLabel)}</a> ›
    <span>${escapeHtml(l.title)}</span>
  </nav>

  <article class="ad-card">
    <span class="corner tl" aria-hidden="true"></span>
    <span class="corner tr" aria-hidden="true"></span>
    <span class="corner bl" aria-hidden="true"></span>
    <span class="corner br" aria-hidden="true"></span>

    <span class="vip-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.6 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.4-.4z"/></svg>
      VIP
    </span>

    <div class="code-hero" role="img" aria-label="پیش‌نمایش انیمیشن کدنویسی اختصاصی سایت">
      <div class="bar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="filename">site.html</span>
      </div>
      <pre id="codeTyping"></pre>
    </div>

    <span class="ad-cat">${escapeHtml(catLabel)}</span>
    <h1 class="ad-title">${escapeHtml(l.title)}</h1>
    <div class="ad-price">${fmtPrice(l.price)}</div>
    <div class="ad-meta"><span>📍 ${escapeHtml(l.city)}</span></div>
    <p class="ad-desc">${escapeHtml(l.desc || '')}</p>

    <div class="ad-phone-box">
      <div class="ad-phone-label">شماره تماس برای سفارش و همکاری</div>
      ${l.phone
        ? `<a class="ad-phone-link" href="tel:${l.phone}" dir="ltr">${l.phone}</a>`
        : `<div class="ad-phone-empty">شماره تماسی برای این کسب‌وکار ثبت نشده</div>`}
    </div>

    <a class="ad-cta" href="../index.html">مشاهده‌ی همه‌ی آگهی‌های ${escapeHtml(catLabel)}</a>
  </article>
</main>

<footer class="ad-footer">کار اوا — بازارچه معرفی کسب‌وکار، اصناف و صاحبان حرفه در سراسر ایران · <a href="../support.html">پشتیبانی</a></footer>

<script>
(function(){
  var el = document.getElementById('codeTyping');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lines = [
    '<span class="tag">&lt;section</span> <span class="attr">class</span>=<span class="str">"hero"</span><span class="tag">&gt;</span>',
    '&nbsp;&nbsp;<span class="tag">&lt;h1&gt;</span>طراحی سایت اختصاصی<span class="tag">&lt;/h1&gt;</span>',
    '&nbsp;&nbsp;<span class="tag">&lt;p&gt;</span>بدون قالب آماده، صفر تا صد کد<span class="tag">&lt;/p&gt;</span>',
    '<span class="tag">&lt;/section&gt;</span>'
  ];
  if(reduce){ el.innerHTML = lines.join('\\n'); return; }
  var i = 0;
  function typeLine(){
    if(i >= lines.length){
      setTimeout(function(){ el.innerHTML=''; i=0; typeLine(); }, 2200);
      return;
    }
    var target = lines[i];
    var plain = target.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    var chars = plain.split(''); var built=''; var j=0;
    function typeChar(){
      if(j < chars.length){
        built += chars[j];
        el.innerHTML = lines.slice(0,i).join('\\n') + (i>0?'\\n':'') + escapeHtmlJs(built) + '<span class="caret"></span>';
        j++; setTimeout(typeChar, 22);
      } else {
        el.innerHTML = lines.slice(0,i+1).join('\\n') + '<span class="caret"></span>';
        i++; setTimeout(typeLine, 380);
      }
    }
    typeChar();
  }
  function escapeHtmlJs(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  typeLine();
})();
</script>
</body>
</html>
`;
};

/* ---------- قالب VIP مرجانی/گرم (روشن، با انیمیشن نمایشی کدنویسی) ---------- */
const vipCoralPageTemplate = (l) => {
  const catLabel = CATEGORIES[l.category] || 'سایر مشاغل';
  const title = `${l.title} در ${l.city} | کار اوا`;
  const desc = truncate(l.desc || l.title, 155);
  const url = `${SITE_URL}/ad/${l.slug}.html`;
  const img = l.img ? IMG_BASE + l.img : `${SITE_URL}/logo-social.png`;

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="کار اوا">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="fa_IR">
<link rel="icon" href="../favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="stylesheet" href="../styles.css">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Service",
  "name": l.title,
  "description": l.desc || l.title,
  "areaServed": l.city,
  "category": catLabel,
  "url": url,
  "image": img,
  "provider": {
    "@type": "LocalBusiness",
    "name": l.title,
    "address": { "@type": "PostalAddress", "addressLocality": l.city, "addressCountry": "IR" },
    "telephone": l.phone ? ("+98" + String(l.phone).replace(/^0/, '')) : undefined
  },
  "offers": {
    "@type": "Offer",
    "price": l.price || 0,
    "priceCurrency": "IRR",
    "availability": "https://schema.org/InStock"
  }
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "کار اوا", "item": SITE_URL + "/" },
    { "@type": "ListItem", "position": 2, "name": catLabel, "item": SITE_URL + "/?cat=" + l.category },
    { "@type": "ListItem", "position": 3, "name": l.title, "item": url }
  ]
}, null, 2)}
</script>

<style>
  :root{
    --bg-warm:#fff8f4;
    --panel:#ffffff;
    --panel-2:#fff3ee;
    --line:#f3ddd2;
    --coral:#ff5a3c;
    --coral-deep:#e2431f;
    --coral-bright:#ff8562;
    --text-primary:#2b1b14;
    --text-muted:#a58d80;
    --code-bg:#211510;
    --code-bar:#2c1c15;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body.ad-page{
    margin:0;
    min-height:100vh;
    background:
      radial-gradient(1000px 460px at 88% -8%, rgba(255,90,60,.12), transparent 60%),
      radial-gradient(700px 420px at -8% 105%, rgba(255,133,98,.10), transparent 60%),
      var(--bg-warm);
    color:var(--text-primary);
    font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;
    line-height:1.7;
    overflow-x:hidden;
  }
  .vip-strip{
    background:linear-gradient(90deg,var(--coral-deep),var(--coral) 50%,var(--coral-deep));
    color:#fff5f0;
    font-size:.78rem;
    letter-spacing:.02em;
    padding:7px 0;
    overflow:hidden;
    white-space:nowrap;
    position:relative;
  }
  .vip-strip .track{
    display:inline-block;
    padding-inline-start:100%;
    animation:marquee 22s linear infinite;
  }
  .vip-strip .track span{margin-inline-end:3.2em;}
  @keyframes marquee{from{transform:translateX(0);} to{transform:translateX(-100%);}}
  .ad-header{
    display:flex; align-items:center; justify-content:space-between;
    max-width:920px; margin:0 auto; padding:22px 20px 8px;
  }
  .ad-logo{display:flex;align-items:center;gap:10px;color:var(--text-primary);text-decoration:none;font-weight:700;font-size:1.05rem;}
  .logo-img{width:30px;height:30px;border-radius:8px;}
  .ad-back{color:var(--text-muted);text-decoration:none;font-size:.85rem;transition:color .2s ease;}
  .ad-back:hover{color:var(--coral-deep);}
  .ad-breadcrumb{max-width:920px;margin:0 auto;padding:6px 20px 18px;font-size:.8rem;color:var(--text-muted);}
  .ad-breadcrumb a{color:var(--text-muted);text-decoration:none;}
  .ad-breadcrumb a:hover{color:var(--coral-deep);}
  .ad-breadcrumb span{color:var(--coral-deep);}
  .ad-main{padding:10px 20px 60px;}
  .ad-card{
    position:relative; max-width:760px; margin:0 auto;
    background:var(--panel);
    border:1px solid var(--line); padding:38px 34px 34px;
    box-shadow:0 24px 60px -30px rgba(226,67,31,.35), 0 2px 0 rgba(43,27,20,.03);
    opacity:0; animation:rise .7s cubic-bezier(.2,.7,.2,1) .1s forwards;
  }
  @keyframes rise{from{opacity:0; transform:translateY(18px);} to{opacity:1; transform:translateY(0);}}
  .corner{position:absolute;width:22px;height:22px;border:2px solid var(--coral);border-radius:8px;opacity:.9;}
  .corner.tl{top:14px;right:14px;border-left:none;border-bottom:none;}
  .corner.tr{top:14px;left:14px;border-right:none;border-bottom:none;}
  .corner.bl{bottom:14px;right:14px;border-left:none;border-top:none;}
  .corner.br{bottom:14px;left:14px;border-right:none;border-top:none;}
  .vip-badge{
    position:absolute; top:22px; left:52px; display:flex; align-items:center; gap:6px;
    background:linear-gradient(100deg,var(--coral-bright),var(--coral));
    color:#fff8f4;
    font-size:.72rem; font-weight:700; padding:5px 12px 5px 10px; letter-spacing:.03em;
    border-radius:999px;
    box-shadow:0 6px 16px -6px rgba(226,67,31,.55);
  }
  .vip-badge svg{width:13px;height:13px;flex:none;}
  .code-hero{background:var(--code-bg);border:1px solid var(--line);margin-bottom:26px;overflow:hidden;direction:ltr;text-align:left;border-radius:10px;}
  .code-hero .bar{display:flex;align-items:center;gap:6px;padding:9px 12px;border-bottom:1px solid #3a251c;background:var(--code-bar);}
  .code-hero .dot{width:9px;height:9px;border-radius:50%;background:#4a3226;}
  .code-hero .dot:nth-child(1){background:#ff6b57;}
  .code-hero .dot:nth-child(2){background:#ffb357;}
  .code-hero .dot:nth-child(3){background:#ffd9a0;}
  .code-hero .filename{margin-inline-start:8px;font-family:'Fira Code','JetBrains Mono',ui-monospace,monospace;font-size:.72rem;color:#c9a693;}
  .code-hero pre{margin:0;padding:18px 20px 22px;font-family:'Fira Code','JetBrains Mono',ui-monospace,monospace;font-size:.82rem;line-height:1.85;color:#f2e2d8;min-height:158px;}
  .code-hero .tag{color:#ff9166;}
  .code-hero .attr{color:#ffcf8a;}
  .code-hero .str{color:#ffe3b8;}
  .code-hero .caret{display:inline-block;width:7px;height:1.1em;background:var(--coral-bright);vertical-align:text-bottom;animation:blink 1s step-end infinite;}
  @keyframes blink{50%{opacity:0;}}
  .ad-cat{display:inline-block;font-size:.75rem;color:var(--text-muted);border:1px solid var(--line);padding:4px 10px;margin-bottom:14px;border-radius:999px;}
  .ad-title{font-size:clamp(1.5rem,3.4vw,2.05rem);font-weight:800;margin:0 0 16px;color:var(--text-primary);}
  .ad-price{display:inline-flex;align-items:baseline;gap:6px;font-size:1.35rem;font-weight:800;color:#fff8f4;background:linear-gradient(100deg,var(--coral-bright),var(--coral-deep));padding:8px 18px;margin-bottom:18px;border-radius:999px;}
  .ad-meta{color:var(--text-muted);font-size:.92rem;margin-bottom:20px;}
  .ad-desc{color:#4a382f;font-size:1rem;border-top:1px solid var(--line);padding-top:20px;margin-bottom:28px;}
  .ad-phone-box{position:relative;border:1px solid var(--coral);background:var(--panel-2);padding:20px 22px;margin-bottom:22px;text-align:center;border-radius:12px;}
  .ad-phone-box::before{content:"";position:absolute;inset:-1px;border:1px solid var(--coral);border-radius:13px;opacity:.5;animation:pulse-ring 2.6s ease-out infinite;pointer-events:none;}
  @keyframes pulse-ring{0%{transform:scale(1);opacity:.5;} 75%{transform:scale(1.015);opacity:0;} 100%{transform:scale(1.015);opacity:0;}}
  .ad-phone-label{font-size:.85rem;color:var(--text-muted);margin-bottom:8px;}
  .ad-phone-link{display:inline-block;font-size:1.5rem;font-weight:800;letter-spacing:.03em;color:var(--coral-deep);text-decoration:none;}
  .ad-phone-link:hover{color:var(--coral);}
  .ad-cta{display:block;text-align:center;color:var(--text-primary);text-decoration:none;border:1px solid var(--line);padding:13px;font-size:.92rem;border-radius:10px;transition:border-color .2s ease,color .2s ease,background .2s ease;}
  .ad-cta:hover{border-color:var(--coral);color:var(--coral-deep);background:var(--panel-2);}
  .ad-footer{text-align:center;color:var(--text-muted);font-size:.8rem;padding:26px 20px 40px;}
  .ad-footer a{color:var(--text-muted);}
  .ad-footer a:hover{color:var(--coral-deep);}
  @media (max-width:640px){.ad-card{padding:30px 20px 26px;} .vip-badge{top:16px;left:44px;}}
  @media (prefers-reduced-motion: reduce){
    .ad-card{animation:none;opacity:1;}
    .vip-strip .track{animation:none;}
    .ad-phone-box::before{animation:none;display:none;}
    .code-hero .caret{animation:none;}
  }
</style>
</head>
<body class="ad-page">

<div class="vip-strip" aria-hidden="true">
  <div class="track">
    <span>✦ آگهی ویژه VIP</span>
    <span>✦ کد نویسی اختصاصی، بدون قالب آماده</span>
    <span>✦ پشتیبانی مستقیم توسط طراح</span>
    <span>✦ آگهی ویژه VIP</span>
    <span>✦ کد نویسی اختصاصی، بدون قالب آماده</span>
    <span>✦ پشتیبانی مستقیم توسط طراح</span>
  </div>
</div>

<header class="ad-header">
  <a class="ad-logo" href="../index.html"><img src="../logo-icon-1024.png" alt="کار اوا" class="logo-img">کار اوا</a>
  <a class="ad-back" href="../index.html">← بازگشت به همه‌ی آگهی‌ها</a>
</header>

<main class="ad-main">
  <nav class="ad-breadcrumb" aria-label="مسیر صفحه">
    <a href="../index.html">کار اوا</a> ›
    <a href="../index.html?cat=${l.category}">${escapeHtml(catLabel)}</a> ›
    <span>${escapeHtml(l.title)}</span>
  </nav>

  <article class="ad-card">
    <span class="corner tl" aria-hidden="true"></span>
    <span class="corner tr" aria-hidden="true"></span>
    <span class="corner bl" aria-hidden="true"></span>
    <span class="corner br" aria-hidden="true"></span>

    <span class="vip-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.6 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.4-.4z"/></svg>
      VIP
    </span>

    <div class="code-hero" role="img" aria-label="پیش‌نمایش انیمیشن کدنویسی اختصاصی سایت">
      <div class="bar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="filename">site.html</span>
      </div>
      <pre id="codeTyping"></pre>
    </div>

    <span class="ad-cat">${escapeHtml(catLabel)}</span>
    <h1 class="ad-title">${escapeHtml(l.title)}</h1>
    <div class="ad-price">${fmtPrice(l.price)}</div>
    <div class="ad-meta"><span>📍 ${escapeHtml(l.city)}</span></div>
    <p class="ad-desc">${escapeHtml(l.desc || '')}</p>

    <div class="ad-phone-box">
      <div class="ad-phone-label">شماره تماس برای سفارش و همکاری</div>
      ${l.phone
        ? `<a class="ad-phone-link" href="tel:${l.phone}" dir="ltr">${l.phone}</a>`
        : `<div class="ad-phone-empty">شماره تماسی برای این کسب‌وکار ثبت نشده</div>`}
    </div>

    <a class="ad-cta" href="../index.html">مشاهده‌ی همه‌ی آگهی‌های ${escapeHtml(catLabel)}</a>
  </article>
</main>

<footer class="ad-footer">کار اوا — بازارچه معرفی کسب‌وکار، اصناف و صاحبان حرفه در سراسر ایران · <a href="../support.html">پشتیبانی</a></footer>

<script>
(function(){
  var el = document.getElementById('codeTyping');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lines = [
    '<span class="tag">&lt;section</span> <span class="attr">class</span>=<span class="str">"hero"</span><span class="tag">&gt;</span>',
    '&nbsp;&nbsp;<span class="tag">&lt;h1&gt;</span>طراحی سایت اختصاصی<span class="tag">&lt;/h1&gt;</span>',
    '&nbsp;&nbsp;<span class="tag">&lt;p&gt;</span>بدون قالب آماده، صفر تا صد کد<span class="tag">&lt;/p&gt;</span>',
    '<span class="tag">&lt;/section&gt;</span>'
  ];
  if(reduce){ el.innerHTML = lines.join('\\n'); return; }
  var i = 0;
  function typeLine(){
    if(i >= lines.length){
      setTimeout(function(){ el.innerHTML=''; i=0; typeLine(); }, 2200);
      return;
    }
    var target = lines[i];
    var plain = target.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    var chars = plain.split(''); var built=''; var j=0;
    function typeChar(){
      if(j < chars.length){
        built += chars[j];
        el.innerHTML = lines.slice(0,i).join('\\n') + (i>0?'\\n':'') + escapeHtmlJs(built) + '<span class="caret"></span>';
        j++; setTimeout(typeChar, 22);
      } else {
        el.innerHTML = lines.slice(0,i+1).join('\\n') + '<span class="caret"></span>';
        i++; setTimeout(typeLine, 380);
      }
    }
    typeChar();
  }
  function escapeHtmlJs(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  typeLine();
})();
</script>
</body>
</html>
`;
};

/* ---------- انتخاب قالب مناسب برای هر آگهی ----------
 * l.vip=false            → قالب عادی
 * l.vip=true, vipStyle="coral" → قالب VIP مرجانی/گرم (روشن)
 * l.vip=true, غیر از coral (یا خالی)  → قالب VIP طلایی (تیره) — پیش‌فرض
 */
const pageTemplate = (l) => {
  if (!l.vip) return standardPageTemplate(l);
  return l.vipStyle === 'coral' ? vipCoralPageTemplate(l) : vipGoldPageTemplate(l);
};

for (const l of listings) {
  const filePath = path.join(AD_DIR, `${l.slug}.html`);
  fs.writeFileSync(filePath, pageTemplate(l), 'utf8');
}
console.log(`${listings.length} صفحه‌ی آگهی در ad/ ساخته/به‌روزرسانی شد.`);

/* ---------- پاکسازی صفحات یتیم (orphan) ----------
 * اگه یه آگهی حذف بشه یا slugـش عوض بشه (مثلاً برای تصحیح غلط املایی)،
 * فایل HTML قدیمیش تو پوشه‌ی ad/ باقی می‌مونه و روی سایت زنده و قابل ایندکس
 * می‌مونه، حتی اگه دیگه تو listings.json نباشه. این بخش هر فایلی که به هیچ
 * آگهی فعلی مرتبط نیست رو پاک می‌کنه تا صفحه‌ی قدیمی/تستی روی سایت نمونه. */
const validSlugFiles = new Set(listings.map(l => `${l.slug}.html`));
const existingAdFiles = fs.readdirSync(AD_DIR).filter(f => f.endsWith('.html'));
let removedCount = 0;
for (const f of existingAdFiles) {
  if (!validSlugFiles.has(f)) {
    fs.unlinkSync(path.join(AD_DIR, f));
    console.log(`صفحه‌ی یتیم حذف شد: ad/${f}`);
    removedCount++;
  }
}
if (removedCount > 0) {
  console.log(`${removedCount} صفحه‌ی یتیم/قدیمی پاک شد.`);
}

/* ---------- sitemap.xml ---------- */
const staticUrls = [
  { loc: `${SITE_URL}/`, priority: '1.0' },
  { loc: `${SITE_URL}/support.html`, priority: '0.4' },
  { loc: `${SITE_URL}/post-ad.html`, priority: '0.6' },
  { loc: `${SITE_URL}/pro-ad.html`, priority: '0.6' }
];
const catUrls = Object.keys(CATEGORIES).map(c => ({ loc: `${SITE_URL}/?cat=${c}`, priority: '0.5' }));
const adUrls = listings.map(l => ({
  loc: `${SITE_URL}/ad/${l.slug}.html`,
  priority: '0.8',
  lastmod: new Date(l.createdAt || Date.now()).toISOString().slice(0, 10)
}));

const allUrls = [...staticUrls, ...catUrls, ...adUrls];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');
console.log('sitemap.xml ساخته شد با', allUrls.length, 'آدرس.');

/* ---------- robots.txt ---------- */
const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');
console.log('robots.txt ساخته شد.');
