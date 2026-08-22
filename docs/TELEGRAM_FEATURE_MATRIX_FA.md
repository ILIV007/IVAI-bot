# ماتریس قابلیت‌های Telegram در IVAI v3.3

**هدف:** استفاده از قابلیت‌های تازه‌ای که برای یک AI assistant واقعاً مفید هستند، بدون Stars، media پولی، Premium اجباری یا فراخوانی AI پنهان.

| قابلیت Telegram | وضعیت در IVAI | ارزش برای کاربر | شرط یا محدودیت |
|---|---|---|---|
| Rich Messages و Rich Draft | **پیاده‌سازی شد** | در چت خصوصی، پاسخ AI ابتدا با draft زنده و سپس با Rich Message نهایی نمایش داده می‌شود. | اگر API یا client آن را نپذیرد، همان درخواست به پیام معمولی با typing animation بازمی‌گردد. |
| Rich Thinking block | **پیاده‌سازی شد** | هنگام تولید پاسخ، وضعیت فکرکردن native Telegram دیده می‌شود. | فقط برای draft خصوصی؛ fallback انیمیشن نقطه‌ای قبلی فعال است. |
| دکمه‌های رنگی | **پیاده‌سازی شده** | دکمه‌های primary/success/danger برای حالت‌ها، مدل و taskها معنا را سریع‌تر منتقل می‌کنند. | کلاینت‌های قدیمی دکمهٔ استاندارد نمایش می‌دهند. |
| Guest AI Bot | **فعال در production** | کاربر می‌تواند IVAI را در چتی که بات عضو آن نیست منشن کند و همان‌جا پاسخ بگیرد. | Bot مشخصهٔ `supports_guest_queries: true` و webhook شامل `guest_message` است. فقط prompt واقعی کاربر می‌تواند یک AI call رایگان داشته باشد. |
| Reactions به‌عنوان feedback | **فعال در production** | واکنش 👍 یا 👎 کاربر در گروه، feedback سبک ثبت می‌کند و هیچ مدل AI اجرا نمی‌شود. | webhook شامل `message_reaction` است؛ IVAI فقط باید در هر گروه هدف administrator باشد. |
| Thread / Topic context | **پیاده‌سازی شد** | typing، پیام موقت، پاسخ نهایی، media و پاسخ بلند در همان topic باقی می‌مانند. | وابسته به وجود `message_thread_id` در chat یا private forum است. |
| Business / Chat Automation context | **پیاده‌سازی شد** | پاسخ‌ها با `business_connection_id` و topic مناسب به همان اتصال برمی‌گردند. | کاربر باید اتصال Chat Automation را در Telegram فعال کند؛ هیچ دسترسی بدون opt-in داده نمی‌شود. |
| Inline Mode | **فعال در production** | استفاده از IVAI از هر chat با query inline. | مشخصهٔ Bot مقدار `supports_inline_queries: true` برمی‌گرداند. |
| Secretary reminders | **قبلاً پیاده‌سازی شده** | task و reminder رایگان با delivery batch. | reminder حدوداً در پنجرهٔ ۱۰ دقیقه‌ای ارسال می‌شود. |
| Bot-to-Bot | **سازگار، اما غیرفعال از نظر محصول** | برای جریان‌های automation آینده کاربرد دارد. | نیازمند فعال‌سازی جداگانه در BotFather است؛ برای جلوگیری از loop و مصرف ناخواسته به‌صورت پیش‌فرض فعال نیست. |
| Communities | **سازگار با message routing** | IVAI می‌تواند در chatهای community به‌عنوان یک بات پاسخ دهد. | قابلیت community-specific مستقلی هنوز ارزش کاربری کافی ندارد. |
| Poll media / Live photos | **پشتیبانی ورودی پایه** | image pipeline می‌تواند photoهای استاندارد را تحلیل کند. | تولید poll/media اختصاصی بدون نیاز کاربر یا free asset انجام نمی‌شود. |
| Stars، paid broadcast، paid media، gifts | **عمداً استفاده نمی‌شود** | با سیاست کاملاً رایگان IVAI ناسازگار است. | حذف‌شده از design. |
| Custom emoji وابسته به Premium | **استفاده نمی‌شود** | صرفاً تزئینی است و به eligibility/Premium گره می‌خورد. | حذف‌شده از design. |

## وضعیت production و پیش‌نیازهای باقی‌مانده

webhook production اکنون با secret هماهنگ و فقط برای updateهای پشتیبانی‌شده تنظیم شده است:

```text
message, edited_message, inline_query, chosen_inline_result,
callback_query, business_message, guest_message, message_reaction
```

Inline Mode و Guest Mode از مشخصات خود Bot تأیید شده‌اند. برای Reaction، IVAI را فقط در گروه‌هایی که feedback لازم است administrator کنید. برای Chat Automation، خود کاربر در Telegram به مسیر **Settings → Chat Automation** می‌رود و محدودهٔ chatهای مجاز را تعیین می‌کند.

تنها تنظیم سطح BotFather که هنوز خارج از Bot API باقی می‌ماند، ثبت **Main Mini App** با URL `https://ivai-bot.ivai-bot.workers.dev/app` است. Menu Button پیش‌فرض IVAI Terminal هم‌اکنون فعال است، اما Main Mini App profile باید یک‌بار توسط مالک Bot در BotFather ثبت شود.

> هیچ‌یک از این قابلیت‌ها به Telegram Premium، Stars یا مسیر پولی نیاز ندارند؛ AI فقط هنگام prompt واقعی Guest/Business اجرا می‌شود.

## منابع رسمی

1. [Telegram Bot API changelog](https://core.telegram.org/bots/api-changelog)
2. [Telegram Bot API](https://core.telegram.org/bots/api)
3. [Telegram: Guest AI Bots, Bot-to-Bot Chats and Chat Automation](https://telegram.org/blog/ai-bot-revolution-11-new-features)
