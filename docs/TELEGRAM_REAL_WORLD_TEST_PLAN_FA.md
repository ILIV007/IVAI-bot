# برنامهٔ تست واقعی Telegram و IVAI Terminal

**نسخهٔ هدف:** v3.3.6  
**هدف:** تأیید ارسال پیام، احراز هویت Mini App، مسیرهای start/menu، رنگ و ترتیب inline controls، quota رایگان و رفتار خطا در محیط واقعی Telegram.

## آزمون‌های خودکار انجام‌شده

در هر اجرای `npm run validate`، کنترل syntax و suite مبتنی بر Node هم‌زمان اجرا می‌شود. در نسخهٔ v3.3.6 تعداد **38 تست** شامل webhook، D1/KV، provider fallback، Terminal API، حریم خصوصی memory، start/menu، مدل picker، Secretary، re-engagement و Telegram context با موفقیت اجرا شده‌اند.

| حوزه | سناریوی خودکار | نتیجهٔ مورد انتظار |
|---|---|---|
| Webhook | درخواست بدون secret رد می‌شود و secret دقیق پذیرفته می‌شود | `401` برای درخواست غیرمجاز |
| Failure webhook | خطای موقت ارسال Telegram، claim dedupe را آزاد می‌کند | پاسخ `500` retryable بدون suppress دائمی update |
| Mini App API | session/chat بدون `initData` معتبر رد می‌شوند | `401` |
| Terminal chat | `initData` امضاشده + prompt معتبر | دقیقاً یک مسیر AI رایگان اجرا می‌شود |
| Terminal error | prompt خالی یا timeout client | مدل اجرا نمی‌شود یا UI recoverable state نشان می‌دهد |
| Memory | `/memory clear` و `/reset` | حافظهٔ چت و Terminal با هم حذف می‌شوند |
| `/start` | پیام onboarding و launch button خصوصی | Web App button و callback کنترل‌ها وجود دارد |
| `/menu` | dashboard کنترل جدا | متن controls و mode buttons نمایش داده می‌شوند |
| Inline colors | Auto/Deep آبی، Fast/model/terminal سبز، reset/cancel قرمز | ترتیب و style payload در keyboard درست است |
| Free-only | model catalog و fallback | مدل پولی پذیرفته یا نمایش داده نمی‌شود |

## پیش‌نیاز تست واقعی

Test واقعی باید از **Telegram mobile یا Telegram Desktop** و داخل private chat با `@IVAI_Llm_bot` انجام شود؛ مرورگر عادی `initData` امضاشده ندارد و عمداً نمی‌تواند chat API را باز کند. Telegram صراحتاً توصیه می‌کند `Telegram.WebApp.initData` برای اعتبارسنجی به backend ارسال شود و دادهٔ `initDataUnsafe` نباید مبنای access باشد. [1]

در BotFather مطمئن شوید URL زیر برای Main Mini App و Menu Button در صورت فعال‌سازی profile shortcut ثبت شده است:

```text
https://ivai-bot.ivai-bot.workers.dev/app
```

## سناریوهای پذیرش واقعی

### سناریوی A — ورود و onboarding

در private chat، `/start` را بفرستید. پیام باید معرفی IVAI و مسیر شروع سریع را نشان دهد. دکمهٔ سبز **Open IVAI Terminal** و دکمه‌های **Open controls** و **Getting started** باید دیده شوند. سپس `/menu` را بفرستید. این بار متن باید **IVAI controls** باشد، نه متن خوش‌آمدگویی؛ سه mode و کنترل‌های مدل، زبان، راهنما و تنظیمات باید در ترتیب درست نمایش داده شوند.

### سناریوی B — اتصال و ارسال پیام Terminal

از private chat، دکمهٔ **Open IVAI Terminal** را باز کنید. status ابتدا **CONNECTING** و سپس **SECURE** خواهد شد. صفحه باید عنوان workspace، chips مربوط به mode/model/memory، پیام خوش‌آمدگویی و suggestion chips را نشان دهد. یک prompt کوتاه مانند `Explain what KV is in two sentences.` بفرستید. پیام user باید بلافاصله bubble شود، حالت pending قابل‌دیدن باشد و پاسخ IVAI در همان transcript ظاهر شود.

| کنترل | نتیجهٔ قابل قبول |
|---|---|
| ارسال | دکمهٔ Send در زمان request موقتاً غیرفعال و پس از پاسخ فعال می‌شود |
| پاسخ | یک پاسخ IVAI در transcript ظاهر می‌شود |
| quota | chip مسیر رایگان مقدار remaining را بعد از پاسخ نشان می‌دهد |
| mode | chip mode با mode واقعی پاسخ همگام می‌شود |
| امنیت | در محیط Telegram status برابر `SECURE` می‌شود |

### سناریوی C — recovery و خطا

Terminal را از مرورگر عادی باز کنید یا URL را خارج از Telegram باز کنید. انتظار می‌رود chat فعال نشود، به‌جای Connecting دائمی، پیام مشخصِ لزوم بازکردن از Telegram و دکمهٔ **Reconnect** نشان داده شود. این حالت یک کنترل امنیتی است، نه خطای provider.

اگر در Telegram status `RECONNECT` یا `TRY AGAIN` دیده شد، روی reconnect بزنید و سپس Terminal را ببندید و از دکمهٔ بات مجدداً باز کنید. اگر مشکل ادامه داشت، زمان تست، platform Telegram، status نمایش‌داده‌شده و متن خطا را ثبت کنید؛ اما `initData` را ارسال نکنید چون دادهٔ امضاشدهٔ session است.

### سناریوی D — mode، model و رنگ‌ها

در `/menu`، ترتیب باید این باشد: ردیف modeها، ردیف model/language، سپس Terminal در private chat، سپس help/settings. Auto و Deep به‌عنوان مسیرهای اصلی آبی، Fast و Pick model و Terminal سبز، و Reset یا Cancel قرمز هستند. یک mode را انتخاب کنید، سپس `/debug` را بزنید تا mode ذخیره‌شده را ببینید. سپس `/model off` یا Auto را انتخاب کنید و بازگشت به auto را تأیید کنید.

### سناریوی E — memory و privacy

`/memory on` را بزنید، یک پیام در Terminal ارسال کنید، سپس به chat بات برگردید و `/memory clear` را بزنید. انتظار می‌رود پیام تأیید کند که حافظهٔ conversation و Terminal هر دو پاک شده‌اند. برای کنترل کامل، `/reset` نیز باید mode را Auto، model را null، memory را off و هر دو memory context را پاک کند.

### سناریوی F — fallback رایگان

در `/models` یک مدل رایگان انتخاب کنید، یک prompt کوتاه بفرستید و metadata پاسخ را بررسی کنید. اگر provider انتخاب‌شده موقتاً در دسترس نبود، پاسخ یا retry friendly دریافت می‌شود یا fallback ترتیبی رایگان استفاده می‌شود. هیچ payment، Telegram Stars یا provider پولی نباید نمایش داده شود.

## ثبت نتیجه

برای هر failure فقط این اطلاعات غیرحساس را بفرستید: platform (`Android`، `iOS` یا `Desktop`)، مسیر launch (`/terminal`، `/start` button یا menu button)، status UI (`RECONNECT`/`TRY AGAIN`)، زمان تقریبی و متن خطا. Bot token، API key و `initData` هرگز نباید در گزارش قرار بگیرند.

## References

[1] [Telegram Mini Apps — validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)

[2] [Telegram Mini Apps — launch modes and menu buttons](https://core.telegram.org/bots/webapps)
