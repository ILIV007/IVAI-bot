# عضویت اجباری کانال برای IVAI

**کانال موردنیاز:** [@ILIVIR3](https://t.me/ILIVIR3)  
**شناسهٔ قطعی کانال:** `-1003162460662`  
**نسخهٔ فعال‌سازی:** v3.3.7

## سیاست دسترسی

برای استفاده از IVAI، کاربر باید عضو کانال باشد. این بررسی قبل از مسیرهای text، voice/photo، inline، Guest AI، callbackهای کنترل و session/chat مربوط به IVAI Terminal انجام می‌شود. بررسی از طریق `getChatMember` با شناسهٔ عددی کانال انجام می‌شود؛ بنابراین تغییر نام کاربری کانال منطق کنترل دسترسی را تغییر نمی‌دهد.

کاربر غیرعضو فقط پیام واضح عضویت و دو دکمه دریافت می‌کند: **Join channel** برای بازکردن `@ILIVIR3` و **Check membership** برای بررسی مجدد. هیچ مدل AI، مسیر fallback، حافظه یا سهمیهٔ AI پیش از تأیید عضویت استفاده نمی‌شود.

## اقدام لازم مالک کانال

> قبل از فعال‌شدن enforcement در تولید، `@IVAI_Llm_bot` را به کانال `@ILIVIR3` اضافه و **Administrator** کنید. Telegram تضمین می‌کند اطلاعات اعضای دیگر از طریق `getChatMember` فقط وقتی قابل‌اتکا است که بات administrator همان chat باشد. [1]

بات برای خواندن وضعیت عضویت به مجوز ارسال پیام، حذف پیام یا invite کردن کاربر نیاز ندارد؛ administrator بودن برای بررسی قابل‌اعتماد کافی است. اگر بات admin نباشد، سیستم fail-closed عمل می‌کند: عضویت تأیید نمی‌شود و کاربر به‌جای دسترسی به AI، پیام بررسی موقتاً ناموفق دریافت می‌کند.

## جریان کاربر

| مرحله | رفتار مورد انتظار |
|---|---|
| کاربر غیرعضو `/start` می‌زند | پیام الزام عضویت و دکمه‌های Join / Check membership |
| کاربر روی Join می‌زند | کانال عمومی `@ILIVIR3` در Telegram باز می‌شود |
| کاربر عضو می‌شود و Check membership را می‌زند | status با `getChatMember` دوباره بررسی و onboarding باز می‌شود |
| کاربر Terminal را باز می‌کند ولی عضو نیست | status `JOIN REQUIRED`، دکمهٔ Join و Reconnect |
| عضو فعال پیام می‌فرستد | مسیرهای عادی IVAI با سیاست free-only ادامه دارد |
| کاربر بعداً از کانال خارج می‌شود | درخواست بعدی bot/Terminal مسدود و flow عضویت نمایش داده می‌شود |

## سناریوهای پذیرش

ابتدا بات را administrator کانال کنید. سپس با یک حساب آزمایشی غیرعضو، `/start` را بفرستید؛ نباید پاسخ AI، mode menu یا Terminal فعال دیده شود. روی **Join channel** بزنید، عضو شوید و سپس **Check membership** را بزنید. پیام تأیید و onboarding باید نمایش داده شود. سپس `/terminal` را در private chat باز کنید؛ بعد از session معتبر و عضویت تأییدشده، status باید `SECURE` شود و ارسال یک prompt کوتاه باید دقیقاً یک مسیر AI رایگان ایجاد کند.

در انتها از کانال خارج شوید و یک پیام دیگر به بات یا Terminal بفرستید. بات باید دوباره دسترسی را مسدود کند. برای گزارش failure فقط platform، زمان، status و مسیر launch را ثبت کنید؛ Bot Token، API key و `initData` نباید گزارش یا ذخیره شوند.

## References

[1] [Telegram Bot API — getChatMember](https://core.telegram.org/bots/api#getchatmember)

[2] [Telegram Bot API — ChatMember statuses](https://core.telegram.org/bots/api#chatmember)
