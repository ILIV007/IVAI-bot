# برنامهٔ تست واقعی Telegram و IVAI Terminal

**نسخهٔ هدف:** v3.3.26
**هدف:** تأیید ارسال پیام، احراز هویت Mini App، مسیرهای start/menu، رنگ و ترتیب inline controls، quota رایگان و رفتار خطا در محیط واقعی Telegram.

## آزمون‌های خودکار انجام‌شده

در هر اجرای `pnpm run validate`، کنترل syntax و suite مبتنی بر Node هم‌زمان اجرا می‌شود. در نسخهٔ v3.3.26 تعداد **76 تست** شامل webhook، D1/KV، provider fallback، Terminal API، حریم خصوصی memory، start/menu، مدل picker، Secretary، re-engagement، Rich Message، lease اتمی broadcast و Telegram context با موفقیت اجرا شده‌اند.

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
| Inline colors | همهٔ modeها آبی، Terminal سبز، Pick model و فیلترهای مدل قرمز هستند | ترتیب و style payload در keyboard درست است |
| Free-only | model catalog و fallback | مدل پولی پذیرفته یا نمایش داده نمی‌شود |
| Rich Message | table کوچک، `/details`، footnote و math در Deep/Code | خروجی مدل escape می‌شود و در خطای Rich، fallback قابل‌مشاهده باقی می‌ماند |
| Broadcast concurrency | دو batch هم‌پوشان برای یک recipient | D1 فقط یک lease claim می‌دهد و ارسال تکراری رخ نمی‌دهد |
| Mini App auth | `initData` معتبر اما بیش از ۶۰ ثانیه future-dated | `401`؛ clock skew کوتاه و expiry عادی حفظ می‌شود |

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

در `/menu`، ابتدا Auto در یک ردیف آبی و سپس Fast، Deep و Code در یک ردیف آبی دیده می‌شوند. Terminal در private chat سبز است؛ Pick model قرمز است و Help/Settings/Language در ردیف پایانی قرار دارند. در picker مدل، دکمه‌های provider آبی و فیلترهای All/Fast/Deep/Code قرمز هستند. یک mode را انتخاب کنید، سپس `/debug` را بزنید تا mode ذخیره‌شده را ببینید. سپس `/model off` یا Auto را انتخاب کنید و بازگشت به auto را تأیید کنید.

### سناریوی E — memory و privacy

`/memory on` را بزنید، یک پیام در Terminal ارسال کنید، سپس به chat بات برگردید و `/memory clear` را بزنید. انتظار می‌رود پیام تأیید کند که حافظهٔ conversation و Terminal هر دو پاک شده‌اند. برای کنترل کامل، `/reset` نیز باید mode را Auto، model را null، memory را off و هر دو memory context را پاک کند.

### سناریوی F — fallback رایگان

در `/models` یک مدل رایگان انتخاب کنید، یک prompt کوتاه بفرستید و metadata پاسخ را بررسی کنید. اگر provider انتخاب‌شده موقتاً در دسترس نبود، پاسخ یا retry friendly دریافت می‌شود یا fallback ترتیبی رایگان استفاده می‌شود. هیچ payment، Telegram Stars یا provider پولی نباید نمایش داده شود.

## کنترل‌های بیرونیِ لازم

برخی صحت‌سنجی‌ها فقط از داخل حساب مالک بات قابل انجام‌اند و عمداً به CI یا endpoint عمومی سپرده نشده‌اند. در BotFather، URL اصلی Mini App/Menu Button باید `https://ivai-bot.ivai-bot.workers.dev/app` باشد، Inline Mode و Guest Mode باید فعال باشند، و webhook باید updateهای `guest_message` و `message_reaction` را در کنار updateهای پایه دریافت کند. برای ثبت feedback واکنشی، بات باید در گروه مربوطه administrator باشد. این موارد هیچ وابستگی به Premium یا پرداخت ندارند.

## ثبت نتیجه

برای هر failure فقط این اطلاعات غیرحساس را بفرستید: platform (`Android`، `iOS` یا `Desktop`)، مسیر launch (`/terminal`، `/start` button یا menu button)، status UI (`RECONNECT`/`TRY AGAIN`)، زمان تقریبی و متن خطا. Bot token، API key و `initData` هرگز نباید در گزارش قرار بگیرند.

## References

[1] [Telegram Mini Apps — validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)

[2] [Telegram Mini Apps — launch modes and menu buttons](https://core.telegram.org/bots/webapps)
