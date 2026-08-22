# وضعیت پیکربندی production — IVAI v3.3.27

**تاریخ بررسی:** ۲۲ اوت ۲۰۲۶  
**دامنه:** Worker `ivai-bot`، Telegram Bot API، D1/KV و Mini App عمومی IVAI Terminal

این سند صرفاً نتیجهٔ بررسی‌های عملیاتی را ثبت می‌کند. هیچ token، API key، `initData` یا مقدار secret در آن نگهداری نشده است.

## وضعیت تأییدشده

| بخش | وضعیت | شواهد عملیاتی |
|---|---|---|
| Worker عمومی | تأیید شد | endpoint سلامت Worker آماده است و bundle production نسخهٔ `3.3.27` را پس از release نشان می‌دهد. |
| bindingهای داده | تأیید شد | `IVAI_KV`، `IVAI_DB` و `AI` در `wrangler.jsonc` متصل هستند. |
| D1 broadcast | تأیید شد | migration `0005_broadcast_claims.sql` اجرا شده؛ ستون‌های `claim_token` و `lease_until` و index مربوطه وجود دارند. |
| webhook Telegram | تأیید شد | URL production فعال است، صف pending برابر صفر است و max connections روی ۱۰ قرار دارد. |
| حفاظت webhook | تأیید شد | `TELEGRAM_WEBHOOK_SECRET` به‌عنوان Worker Secret وجود دارد و هم‌زمان با پیکربندی webhook rotation شده است؛ مقدار آن هرگز نمایش داده نمی‌شود. |
| updateهای webhook | تأیید شد | `message`، `edited_message`، `inline_query`، `chosen_inline_result`، `callback_query`، `business_message`، `guest_message` و `message_reaction` دریافت می‌شوند. |
| Inline Mode | تأیید شد | مشخصات Bot مقدار `supports_inline_queries: true` برمی‌گرداند. |
| Guest Mode | تأیید شد | مشخصات Bot مقدار `supports_guest_queries: true` برمی‌گرداند و webhook نیز `guest_message` را دریافت می‌کند. |
| Business connection | تأیید شد | مشخصات Bot مقدار `can_connect_to_business: true` و webhook نوع `business_message` را دریافت می‌کند. |
| Menu Button | تأیید شد | Menu Button پیش‌فرض از نوع `web_app` است و به `https://ivai-bot.ivai-bot.workers.dev/app` اشاره می‌کند. |
| Mini App API | تأیید شد | درخواست `/app/session` بدون `initData` معتبر با `401` رد می‌شود؛ CSP و security headerهای صفحهٔ `/app` نیز فعال‌اند. |

## تغییر عملیاتی انجام‌شده

پیکربندی پیشین webhook فقط updateهای پایه را دریافت می‌کرد و در نتیجه Guest Mode و reaction feedback، با وجود آمادگی کد، نمی‌توانستند در production event دریافت کنند. پیکربندی اکنون به فهرست محدود و پشتیبانی‌شدهٔ IVAI تغییر کرده است. این تغییر فقط دریافت event را گسترش می‌دهد؛ هیچ مسیر AI جدیدی به‌صورت خودکار اجرا نمی‌کند. Guest فقط در پاسخ به prompt واقعی کاربر می‌تواند یک فراخوانی AI رایگان داشته باشد و reaction feedback هیچ فراخوانی AI ندارد.

> برای دریافت `message_reaction`، Telegram همچنان نیاز دارد Bot در گروه موردنظر administrator باشد. برای استفاده از Guest Mode نیز باید در سطح BotFather فعال باقی مانده باشد. [1] [2]

## تنها مورد بیرونی باقی‌مانده

مشخصات فعلی Bot مقدار `has_main_web_app: false` گزارش می‌کند. این مورد با **Menu Button** فرق دارد: Menu Button IVAI Terminal هم‌اکنون فعال و قابل‌استفاده است، اما نمایش Main Mini App در profile Bot یک تنظیم BotFather است و از Bot API استاندارد قابل تغییر نیست.

مالک Bot باید یک‌بار در `@BotFather`، Bot `@IVAI_Llm_bot` را انتخاب کند و Main Mini App را روی URL زیر ثبت کند:

```text
https://ivai-bot.ivai-bot.workers.dev/app
```

این کار به Premium، Stars یا provider پولی نیاز ندارد. پس از ثبت، `getMe` باید `has_main_web_app: true` برگرداند. [3]

## سناریوی پذیرش نهایی

پس از تنظیم Main Mini App، از Telegram Mobile یا Desktop این چهار آزمون را انجام دهید:

| آزمون | انتظار |
|---|---|
| بازکردن IVAI از profile یا Menu Button | Terminal با وضعیت `SECURE` باز شود و یک prompt کوتاه پاسخ بگیرد. |
| استفاده inline | در هر chat عبارت `@IVAI_Llm_bot` و یک query کوتاه را وارد کنید؛ نتیجهٔ inline بدون مسیر پولی نمایش داده شود. |
| Guest Mode | در chat سازگار، یک Guest prompt واقعی ارسال کنید؛ Bot فقط همان prompt را پردازش کند. |
| feedback واکنشی در گروه | در گروهی که Bot administrator است، روی پاسخ IVAI واکنش 👍 یا 👎 ثبت کنید؛ هیچ پاسخ متنی یا AI call اضافه ایجاد نشود. |

در صورت failure، فقط platform، مسیر launch، زمان تقریبی، status نمایش‌داده‌شده و متن خطا را گزارش کنید. token، API key یا `initData` را در گزارش قرار ندهید.

## منابع

[1] [Telegram Bot API — Update and message_reaction](https://core.telegram.org/bots/api#update)

[2] [Telegram Bot API — setWebhook and allowed_updates](https://core.telegram.org/bots/api#setwebhook)

[3] [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
