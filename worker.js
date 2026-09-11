export default {
  async fetch(request, env, ctx) {
    // هدرهای CORS که به همه‌ی پاسخ‌ها اضافه می‌شن
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // برای امنیت بیشتر می‌تونی به جای * دامنه‌ی خودت رو بذاری: 'https://kareava.ir'
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // مرورگر قبل از POST یه درخواست OPTIONS (preflight) می‌فرسته؛
    // باید بهش مستقیم جواب بدیم وگرنه درخواست اصلی هیچ‌وقت اجرا نمی‌شه.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // شماره گیرنده - از ورودی درخواست بگیر
    const { phone } = await request.json().catch(() => ({}));

    if (!phone) {
      return new Response(JSON.stringify({ error: 'شماره تلفن ارسال نشده' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // تولید کد تصادفی ۶ رقمی
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const payload = {
      from: '5000xxx', // شماره خط اختصاصی‌ت
      to: [phone],
      text: `به کاروا خوش آمدید. کد تایید شما: ${otpCode}`,
      udh: ''
    };

    try {
      const response = await fetch(
        'https://console.melipayamak.com/api/send/advanced/c89a197408b24a7eaa7570ef6772160c',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();

      // اینجا باید otpCode رو جایی (KV, DB) ذخیره کنی تا بعداً verify کنی
      // await env.OTP_KV.put(phone, otpCode, { expirationTtl: 120 });

      return new Response(JSON.stringify({ ...result, sentCode: otpCode }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};
