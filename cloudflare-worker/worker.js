
const LISTINGS_PATH = 'data/listings.json';
const CATS = new Set(['construction','auto','beauty','tech','home','education','food','art','health','other']);

// حداقل زمانی که باید بین لود شدن فرم و ارسال آن بگذرد (میلی‌ثانیه).
// ربات‌های اسپم معمولاً فرم رو در کسری از ثانیه پر و ارسال می‌کنن.
const MIN_FILL_TIME_MS = 2500;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return json({ success:false, error:'Method not allowed' }, 405, corsHeaders);
    }

    let body;
    try { body = await request.json(); }
    catch(e){ return json({ success:false, error:'بدنه‌ی درخواست نامعتبره.' }, 400, corsHeaders); }

    // ---- از اینجا به بعد، هر خطای غیرمنتظره‌ای (حتی خطاهای شبکه‌ای موقت) رو
    // می‌گیریم و یه جواب درست JSON برمی‌گردونیم، تا Worker هیچ‌وقت بی‌جواب کرش نکنه ----
    try {

    // ---- هانی‌پات: اگه یه ربات این فیلد مخفی رو پر کرده باشه، ساکت رد کن ----
    if (body.website) {
      return json({ success:true, url: null }, 200, corsHeaders); // به ربات نشون میدیم موفق بوده تا دوباره تلاش نکنه
    }

    // ---- تله‌ی زمانی (ضد اسپم بدون وابستگی به سرویس خارجی) ----
    // اگه فرم خیلی سریع‌تر از حالت انسانی ارسال شده باشه، مشکوک به رباته.
    const loadedAt = Number(body.formLoadedAt);
    if (!Number.isFinite(loadedAt) || (Date.now() - loadedAt) < MIN_FILL_TIME_MS) {
      // ساکت رد می‌کنیم (نه با خطای واضح) تا ربات نفهمه دقیقاً چرا رد شده
      return json({ success:true, url: null }, 200, corsHeaders);
    }

    // ---- اعتبارسنجی فیلدهای اصلی ----
    const title = clean(body.title, 120);
    const city = clean(body.city, 60);
    const desc = clean(body.desc, 1200);
    const phone = clean(body.phone, 20);
    const category = CATS.has(body.category) ? body.category : 'other';
    let price = Number(String(body.price || '0').replace(/[^\d]/g,''));
    if (!Number.isFinite(price) || price < 0) price = 0;

    if (!title) return json({ success:false, error:'عنوان آگهی خالیه.' }, 400, corsHeaders);
    if (!city) return json({ success:false, error:'شهر خالیه.' }, 400, corsHeaders);
    if (phone && !/^0?9\d{9}$/.test(phone)) return json({ success:false, error:'شماره تماس معتبر نیست.' }, 400, corsHeaders);

    const gh = {
      owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH || 'main', token: env.GITHUB_TOKEN
    };

    try {
      // ---- آپلود عکس (اختیاری) ----
      let imgName = '';
      if (body.imageBase64 && body.imageExt) {
        const ext = String(body.imageExt).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5) || 'jpg';
        // محدودیت حجم: حداکثر ~2.5 مگابایت (بعد از base64)
        if (body.imageBase64.length > 3500000) {
          return json({ success:false, error:'حجم عکس خیلی زیاده (حداکثر ۲ مگابایت).' }, 400, corsHeaders);
        }
        imgName = 'ad-' + Date.now() + '-' + Math.random().toString(36).slice(2,7) + '.' + ext;
        await ghPut(gh, imgName, body.imageBase64, 'افزودن عکس آگهی عمومی: ' + title);
      }

      // ---- خوندن و به‌روزرسانی data/listings.json ----
      const current = await ghGet(gh, LISTINGS_PATH);
      if (!current) throw new Error('فایل دیتای سایت پیدا نشد.');
      const arr = JSON.parse(base64ToUtf8(current.content));

      const id = 's' + Date.now();
      const listing = {
        id, title, price, category, city,
        img: imgName, phone, desc,
        createdAt: Date.now()
      };
      arr.push(listing);

      const newContent = utf8ToBase64(JSON.stringify(arr, null, 2));
      await ghPut(gh, LISTINGS_PATH, newContent, 'آگهی عمومی جدید: ' + title, current.sha);

      const slug = slugify(title, city);
      const siteUrl = (env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
      return json({ success:true, url: siteUrl + '/ad/' + slug + '.html' }, 200, corsHeaders);

    } catch (e) {
      return json({ success:false, error: 'خطای سرور: ' + e.message }, 500, corsHeaders);
    }

    } catch (outerErr) {
      // آخرین خط دفاعی: هر خطای پیش‌بینی‌نشده‌ای هم اینجا گرفته میشه، Worker هیچ‌وقت بدون جواب نمی‌مونه
      return json({ success:false, error: 'خطای غیرمنتظره: ' + (outerErr && outerErr.message ? outerErr.message : String(outerErr)) }, 500, corsHeaders);
    }
  }
};

/* ---------------- کمکی‌ها ---------------- */
function json(obj, status, extraHeaders){
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type':'application/json', ...(extraHeaders||{}) }
  });
}
function clean(v, maxLen){
  return String(v||'').trim().slice(0, maxLen);
}
function utf8ToBase64(str){
  const bytes = new TextEncoder().encode(str);
  let bin=''; bytes.forEach(b=> bin+=String.fromCharCode(b));
  return btoa(bin);
}
function base64ToUtf8(b64){
  const bin = atob(b64.replace(/\n/g,''));
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function truncateBytes(str, maxBytes){
  let bytes = new TextEncoder().encode(str);
  if(bytes.length <= maxBytes) return str;
  bytes = bytes.slice(0, maxBytes);
  let out = new TextDecoder('utf-8', {fatal:false}).decode(bytes);
  out = out.replace(/\uFFFD+$/,'');
  return out.replace(/-+$/, '');
}
function slugify(title, city){
  let s = (title + ' ' + (city||'')).trim();
  s = s.replace(/[^\u0600-\u06FF0-9a-zA-Z\s-]/g, '');
  s = s.trim().replace(/\s+/g,'-').replace(/-+/g,'-');
  s = truncateBytes(s, 90);
  return s || 'agahi';
}
async function ghGet(gh, path){
  const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}?ref=${encodeURIComponent(gh.branch)}`, {
    headers: { 'Authorization': `Bearer ${gh.token}`, 'Accept':'application/vnd.github+json', 'User-Agent':'kareava-worker' }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('خطای خواندن از گیت‌هاب: ' + res.status);
  return res.json();
}
async function ghPut(gh, path, contentBase64, message, sha){
  const bodyObj = { message, content: contentBase64, branch: gh.branch };
  if (sha) bodyObj.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
    method:'PUT',
    headers: { 'Authorization': `Bearer ${gh.token}`, 'Accept':'application/vnd.github+json', 'Content-Type':'application/json', 'User-Agent':'kareava-worker' },
    body: JSON.stringify(bodyObj)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('خطای نوشتن در گیت‌هاب: ' + res.status + ' ' + t.slice(0,200));
  }
  return res.json();
}
