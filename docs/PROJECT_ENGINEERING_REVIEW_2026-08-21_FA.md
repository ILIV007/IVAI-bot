# بازبینی مهندسی سراسری IVAI Bot — 2026-08-21

> **دامنه:** معماری Worker، منطق Telegram، AI و free-only policy، D1/KV، زمان‌بندی، broadcast، Secretary، re-engagement، Mini App، تست‌ها، CI و تنظیمات GitHub.
>
> **نتیجه:** نسخهٔ آمادهٔ انتشار **v3.3.9** است. دو نقص منطقی عملیاتی در صف broadcast و یک مسیر شکنندهٔ callback شناسایی و برطرف شدند. مسیر استاندارد درخواست همچنان حداکثر یک فراخوانی AI دارد و هیچ قابلیت پولی، Telegram Premium، Stars یا broadcast پولی اضافه نشده است.

## 1. جمع‌بندی وضعیت

| محور | وضعیت | نتیجهٔ بررسی |
|---|---|---|
| Runtime و deployment | سالم | `wrangler.jsonc` به‌صورت صریح `src/index.js` را entrypoint تولید معرفی می‌کند؛ KV، D1، AI binding، cron و observability مشخص هستند. |
| Webhook و idempotency | سالم | secret header به‌صورت دقیق بررسی می‌شود؛ update claim هنگام failure آزاد می‌گردد تا Telegram retry را سرکوب نکند. |
| AI و free-only policy | سالم | Workers AI، OpenRouter `:free`، Groq و Google AI Studio فقط از allowlist استفاده می‌کنند؛ fallback ترتیبی است، نه parallel race. |
| سهمیه و مصرف | سالم | budget محافظه‌کارانهٔ Workers AI، limit کاربر و ورودی/خروجی bounded حفظ شده‌اند؛ هیچ health-check پرمصرف دوره‌ای وجود ندارد. |
| عضویت اجباری | اصلاح و سالم با پیش‌نیاز عملیاتی | membership در متن، رسانه، callback، inline، guest و API Terminal بررسی می‌شود؛ fallback امن ID به username افزوده شد و user دارای status `member` مستقیم وارد می‌شود؛ bot باید administrator کانال `@ILIVIR3` باقی بماند. |
| Mini App و Admin | سالم | initData سمت سرور اعتبارسنجی می‌شود، API بدون نشست رد می‌شود، CSP و same-origin controls برقرارند؛ bootstrap Terminal در v3.3.8 قبلاً رفع شده است. |
| Secretary و re-engagement | سالم | claim/lease اتمی، retry محدود و ارسال ترتیبی دارند؛ چرخهٔ بازگشت پس از ۱۵ روز consent-controlled است. |
| Broadcast | **رفع شد** | snapshot مخاطب، ادامهٔ seeding در حالت `sending` و retry محدود برای خطاهای موقت اکنون برقرار است. |
| GitHub و supply chain | **ارتقا یافت** | CI مبتنی بر pnpm frozen-lockfile، dependency audit، Dependabot، automated security fixes و branch protection حرفه‌ای فعال است. |

## 2. یافته‌های تأییدشده و اصلاح‌شده

### 2.1 صف broadcast تنها نخستین ۲۵۰ مخاطب را پوشش می‌داد

پیش از اصلاح، seeding همواره از ابتدای فهرست کاربران فعال `LIMIT 250` را انتخاب می‌کرد و پس از اولین batch، campaign به وضعیت `sending` می‌رفت. در آن وضعیت seeding دیگر اجرا نمی‌شد؛ بنابراین campaignهای بزرگ عملاً به نخستین گروه محدود می‌شدند.

**اصلاح v3.3.9:**

- query دریافت‌کننده‌ها اکنون `NOT EXISTS` روی `broadcast_deliveries` دارد؛ هر اجرای cron فقط کاربران seedنشده را برمی‌دارد.
- وضعیت `sending` نیز برای seeding مجاز است تا delivery به تمامی مخاطبان snapshot ادامه یابد.
- معیار snapshot با `created_at <= confirmed_at` اضافه شد؛ کاربری که پس از تأیید campaign ساخته شود به campaign در حال اجرا اضافه نمی‌شود.
- retry برای خطاهای موقت تا سه delivery attempt محدود است؛ blocked/deactivated/chat-not-found terminal هستند.

### 2.2 feedback callback در برابر KV خراب یا replay مقاوم نبود

مسیر قدیمی callback می‌توانست `JSON.parse` را روی مقدار خراب KV اجرا کند و score نامعتبر را به downvote تبدیل کند. همچنین token به user/chat وابسته بررسی نمی‌شد و پس از استفاده هم حذف نمی‌شد.

**اصلاح v3.3.9:** parsing fail-safe، allowlist امتیاز `up/down`، تطبیق user و chat، و حذف token پس از ثبت بازخورد اضافه شد. دو شاخهٔ callback غیرقابل‌دسترسی و writer بدون استفاده نیز حذف شدند.

### 2.3 false-negative عضویت کانال در production

برای کاهش وابستگی غیرضروری به یک representation از chat، بررسی canonical ابتدا با ID عددی و تنها در صورت خطای API با username رسمی `@ILIVIR3` دوباره انجام می‌شود. پاسخ موفق Telegram با status `member`، `administrator`، `creator`/`owner` یا restricted-member قطعی است و user بدون پیام Join/Recheck از مسیر معمول بات عبور می‌کند. در v3.3.10 دکمهٔ Check membership نیز دیگر در failure همان پیام Join را دوباره edit نمی‌کند؛ prompt دست‌نخورده می‌ماند و Telegram alert علت عدم تأیید را نشان می‌دهد. اگر هر دو lookup خطا بدهند، طراحی همچنان fail-closed می‌ماند؛ در این حالت bot باید administrator کانال باشد و ID/username کانال باید دقیقاً به همان کانال اشاره کنند.

## 3. معماری و کنترل‌های منطقی

### 3.1 مرزهای درخواست

| جریان | کنترل اصلی | نتیجه |
|---|---|---|
| Telegram webhook | secret، dedupe، release-on-failure | retry صحیح و عدم پردازش تکراری |
| Text / Inline / Guest | عضویت، rate limit، یک pipeline AI با fallback ترتیبی | مصرف قابل‌پیش‌بینی و free-only |
| Media | کنترل اندازهٔ 8 MiB، timeout شبکه، budget Workers AI | جلوگیری از دریافت یا تحلیل پرهزینه |
| Terminal API | initData امضاشده، session TTL، membership، input bound | عدم دسترسی خارج Telegram یا بدون عضویت |
| Admin API | initData و role check | عدم افشای metrics یا draft به کاربر عادی |
| Cron | claim/lease و batch محدود | جلوگیری از ارسال دوباره و نرخ نامناسب |

### 3.2 تصمیم‌های مصرف و پایداری

Providerها به‌ترتیب و فقط هنگام failure مسیر قبلی فراخوانی می‌شوند؛ در نتیجه یک پاسخ موفق یک فراخوانی مدل دارد. Workers AI از budget روزانهٔ 8,000 Neuron با buffer محافظت می‌شود. مدل‌های dynamic OpenRouter تنها زمانی به picker وارد می‌شوند که metadata آن‌ها صفر بودن قیمت ورودی، خروجی، request و capabilityهای جانبی را تأیید کند.

Broadcast و یادآوری‌ها sequential و batch-bounded هستند. این الگو با محدودیت عملی Telegram سازگار است و از ارسال ناگهانی یا هم‌زمان جلوگیری می‌کند.

## 4. تست و کیفیت

| کنترل | نتیجه |
|---|---|
| `pnpm install --frozen-lockfile` | موفق؛ lockfile قابل‌تکرار است |
| `pnpm run validate` | **49/49 passed** |
| `pnpm audit --audit-level=high` | هیچ آسیب‌پذیری شناخته‌شده‌ای یافت نشد |
| `git diff --check` | موفق؛ بدون خطای whitespace |
| Integrity Git | `git fsck --no-dangling` موفق |
| Production Terminal prior check | recovery امن `RECONNECT` خارج Telegram و عدم Syntax Error bootstrap تأیید شد |

آزمون‌های افزوده‌شده در این review عبارت‌اند از pagination/snapshot/retry/terminal-failure برای broadcast و boundary تلاش سوم Secretary. این تست‌ها دقیقاً رفتارهایی را پوشش می‌دهند که پیش‌تر امکان failure silent داشتند.

## 5. حرفه‌ای‌سازی GitHub

- نسخهٔ pnpm در `package.json` pin شد تا توسعه و CI از ابزار سازگار با lockfile استفاده کنند.
- CI اکنون pnpm cache، `pnpm install --frozen-lockfile`، validation کامل و dependency audit high-severity را اجرا می‌کند.
- Dependabot برای `npm`/pnpm و GitHub Actions فعال است؛ Dependabot alerts و automated security fixes نیز فعال شدند.
- `main` به CI اجباری، یک approval code-owner، dismissal reviewهای stale، linear history و conversation resolution مجهز شد. owner برای عملیات اضطراری bypass دارد.
- پیاده‌سازی تاریخی v3.2 بدون حذف در `legacy/` منتقل شد؛ مسیر فعال production تنها `src/index.js` است.
- PR و issue templateهای موجود با workflow pnpm هماهنگ شدند و اطلاعات حساس در templateها ممنوع شده‌اند.

منابع رسمی automation در [REPOSITORY_AUTOMATION_SOURCES_2026-08-21.md](REPOSITORY_AUTOMATION_SOURCES_2026-08-21.md) ثبت شده‌اند.

## 6. سناریوهای پذیرش واقعی باقی‌مانده

این موارد به حساب Telegram و عضویت واقعی نیاز دارند و در sandbox قابل جعل معتبر نیستند:

1. با یک کاربر غیرعضو، `/start`، Inline و Terminal باید فقط Join/Recheck نشان دهند.
2. پس از join و زدن Check membership، همان کاربر باید بدون restart بتواند chat را شروع کند.
3. با کاربر عضو، Terminal را از دکمهٔ Web App بات باز کنید، یک پیام کوتاه بفرستید و دریافت پاسخ را تأیید کنید.
4. یک broadcast آزمایشی با بیش از 250 کاربر فعال تنها در محیط کنترل‌شده یا پس از snapshot واقعی اجرا شود؛ delivery باید به‌تدریج از نخستین 250 نفر عبور کند.
5. bot باید administrator کانال `@ILIVIR3` باشد؛ در غیر این صورت `getChatMember` ممکن است کاربران عادی را قابل‌اعتماد برنگرداند.

## نتیجهٔ نهایی

پروژه اکنون از لحاظ معماری **ماژولار، کم‌مصرف، free-only، تست‌پذیر و قابل‌نگهداری** است. نقص‌های منطقی مشاهده‌شده رفع و برای آن‌ها regression coverage اضافه شد. ریسک‌های باقی‌مانده عمدتاً به پیکربندی production و پذیرش واقعی Telegram مربوط‌اند، نه به یک باگ تأییدشده در کد.
