# بازبینی مهندسی IVAI Terminal و سایت عمومی

**تاریخ بازبینی:** 2026-08-21  
**نسخهٔ اصلاح‌شده:** v3.3.8  
**دامنه:** مسیر عمومی `/app`، APIهای `/app/session` و `/app/chat`، احراز هویت Telegram Mini App، عضویت اجباری `@ILIVIR3`، تجربهٔ خطا و recovery، و کنترل‌های HTTP/Dependency.

## نتیجهٔ اجرایی

بازبینی کامل یک نقص **بحرانی و واقعی** را در نسخهٔ قبلی پیدا کرد: JavaScript تولیدشده برای صفحهٔ Terminal به‌دلیل escape نادرست یک regex قابل parse نبود. به همین علت، bootstrap کل رابط اجرا نمی‌شد و صفحه به‌صورت ظاهری در وضعیت `CONNECTING` باقی می‌ماند؛ نه بررسی session، نه نمایش Join/Reconnect و نه ارسال پیام شروع نمی‌شد. این مسئله در v3.3.8 اصلاح شد و اکنون یک آزمون regression، JavaScript نهایی رندرشده را پیش از انتشار compile می‌کند.

پس از رفع نقص، ساختار محصول از منظر مهندسی برای هدف خود—یک Mini App سبک، English-first، free-only و متکی بر Telegram—منسجم است. کنترل session در سرور انجام می‌شود، هویت مرورگر trust نمی‌شود، دسترسی غیرعضو fail-closed است و پیام کاربر با `textContent` رندر می‌شود؛ بنابراین مسیر عمومی Terminal کاربر یا model output را به HTML تزریق نمی‌کند. اعتبارسنجی واقعی با یک `initData` معتبر در تست‌های Worker پوشش دارد، اما تست نهایی native باید از داخل Telegram و با کاربر واقعی انجام شود، زیرا محیط مرورگر sandbox فاقد `initData` امضاشده است.

## وضعیت حوزه‌های بررسی‌شده

| حوزه | نتیجه | شواهد و کنترل‌های موجود |
|---|---|---|
| Bootstrap و رابط کاربری | **رفع شد** | خطای syntax تولیدی برطرف و compile-test برای inline bootstrap اضافه شد. حالت خارج از Telegram پس از bootstrap صحیح به `RECONNECT` می‌رود و composer را غیرفعال می‌کند. |
| طراحی بصری | **مطلوب** | سلسله‌مراتب روشن header/status/context/feed/composer، پالت navy/blue/jade یکپارچه، رعایت safe-area، layout واکنش‌گرا و `prefers-reduced-motion`. |
| احراز هویت | **مطلوب** | امضای `initData` با HMAC سمت سرور، مقایسهٔ constant-time و محدودیت زمانی یک‌ساعته. `initDataUnsafe` فقط برای خوشامدگویی ظاهری خوانده می‌شود و مبنای authorization نیست. |
| API عمومی | **مطلوب** | endpointهای `/app/session` و `/app/chat` فقط POST می‌پذیرند، پاسخ‌ها `no-store`/`nosniff`/`no-referrer` دارند و درخواست بدون session با `401` رد می‌شود. |
| عضویت اجباری | **مطلوب با پیش‌نیاز عملیاتی** | پیش از session و chat، عضویت با `getChatMember` بررسی می‌شود. کاربر غیرعضو `403 / CHANNEL_REQUIRED` می‌گیرد و UI Join/Reconnect می‌بیند. بات باید administrator کانال باشد. [1] |
| مصرف و پایداری | **مطلوب** | محدودیت 45 ثانیه‌ای fetch، quota مشترک متنی، یک مسیر AI رایگان در هر turn، memory جداگانه و TTL-bounded، و وضعیت‌های صریح برای خطا، rate limit و session منقضی. |
| HTTP security | **مطلوب** | CSP nonce-based، `connect-src 'self'`، `cache-control: no-store`، `referrer-policy: no-referrer`، `x-content-type-options: nosniff` و permissions policy محدودکننده روی `/app`. |
| وابستگی‌ها | **مطلوب** | بررسی `pnpm audit --audit-level=high` هیچ آسیب‌پذیری شناخته‌شده‌ای گزارش نکرد. |

## اصلاح اعمال‌شده در v3.3.8

> مشکل فقط در فایل source دیده نمی‌شد؛ syntax فایل `src/app-page.js` معتبر بود، اما خروجی نهایی template HTML نامعتبر تولید می‌کرد. به همین دلیل کنترل `node --check src/*.js` قادر به کشف آن نبود.

کد نمایش نام model در bootstrap از regex دارای escape حساس به یک `replace('@cf/', '')` معادل تبدیل شد. سپس آزمون `emits parseable Terminal bootstrap JavaScript after template rendering` اضافه شد. این آزمون صفحهٔ کامل رندرشده را می‌گیرد، آخرین inline script را استخراج می‌کند و compile شدن آن را الزامی می‌سازد. بنابراین شکست مشابه قبل از merge و Cloudflare Build متوقف خواهد شد.

## نتایج تست و کنترل کیفیت

| کنترل | نتیجه |
|---|---|
| JavaScript source syntax | موفق |
| آزمون‌های regression Worker | **41/41 passed** |
| Parse مستقل inline JavaScript رندرشده | موفق |
| Build dependency security | بدون آسیب‌پذیری شناخته‌شدهٔ high severity |
| `/app` production headers | CSP، no-store، no-referrer، nosniff و permissions policy تأیید شد |
| درخواست session بدون initData | `401 UNAUTHORIZED` |
| روش‌های غیرمجاز public API | `405 Method Not Allowed` |
| حالت sandbox بدون Telegram session | recovery message، وضعیت `RECONNECT` و composer غیرفعال تأیید شد |

## سناریوی پذیرش نهایی در Telegram

برای تکمیل کنترل عملیاتی، بات باید ابتدا administrator کانال `@ILIVIR3` شود. سپس Terminal را از دکمهٔ Web App داخل گفت‌وگوی خصوصی با `@IVAI_Llm_bot` باز کنید. کاربر عضو باید وضعیت `SECURE`، suggestionهای آغاز گفتگو و امکان ارسال یک prompt کوتاه را ببیند. کاربر غیرعضو باید فقط وضعیت `JOIN REQUIRED` و دکمه‌های Join/Reconnect را ببیند. پس از عضویت و لمس Reconnect، session باید بدون refresh دستی صفحه به وضعیت `SECURE` بازگردد.

در انتها یک درخواست کوتاه در حالت Auto ارسال کنید و بررسی کنید که پاسخ، نام مدل، سهمیهٔ باقی‌مانده و scroll گفتگو درست به‌روزرسانی شوند. این سناریو نه API جدیدی می‌سازد و نه مسیر پولی فعال می‌کند؛ همچنان دقیقاً یک مسیر AI رایگان در هر پیام مجاز خواهد بود.

## نتیجهٔ نهایی

نسخهٔ پیشین واقعاً یک باگ blocking در Mini App داشت و به همین دلیل تجربهٔ `Connecting` دائمی رخ می‌داد. علت آن دقیقاً مشخص، با کمترین تغییر ممکن اصلاح، و با آزمون تولیدی‌شکل محافظت شد. پس از انتشار v3.3.8، مانع مهندسیِ شناخته‌شده‌ای در سایت/Mini App باقی نمی‌ماند. تنها شرط بیرونی برای عملکرد واقعی membership gate، administrator بودن بات در کانال است؛ و تنها کنترل غیرقابل‌انجام در sandbox، باز کردن Mini App از session واقعی Telegram کاربر است.

## References

[1] [Telegram Bot API — getChatMember](https://core.telegram.org/bots/api#getchatmember)

## تأیید پس از انتشار v3.3.8

پس از موفقیت CI و Cloudflare Workers Build، نسخهٔ production دوباره بررسی شد. صفحهٔ `/app` اکنون bootstrap را اجرا می‌کند و در محیط خارج از Telegram به‌درستی پیام امن «Open IVAI Terminal from inside Telegram»، وضعیت `RECONNECT` و دکمهٔ Reconnect را نمایش می‌دهد؛ composer نیز غیرفعال است. این رفتار تأیید می‌کند که حالت `CONNECTING` دائمیِ ناشی از syntax error دیگر در production وجود ندارد.
