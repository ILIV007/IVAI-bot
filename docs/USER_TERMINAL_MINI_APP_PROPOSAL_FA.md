# طرح Mini App عمومی IVAI Terminal

**وضعیت پیاده‌سازی:** در **v3.3.2** پیاده‌سازی و آزمون شده؛ فعال‌سازی Main Mini App و menu button در BotFather باقی مانده است.  
**هدف:** چت ترمینالی داخل Telegram برای همهٔ کاربران، بدون Telegram Premium، بدون سرویس جدید، بدون مدل پولی و با کمترین فشار ممکن.

> **تصمیم اجراشده:** Mini App روی همان Cloudflare Worker فعلی، با صفحهٔ سبک `/app` و API احراز هویت‌شدهٔ `/app/chat` ساخته شده است. هر ارسال در ترمینال دقیقاً همان policy فعلی IVAI را استفاده می‌کند: یک درخواست کاربر، یک مسیر AI رایگان با fallback ترتیبی در صورت failure، و بدون WebSocket، polling یا streaming در نسخهٔ اول.

## آیا امکان‌پذیر است؟

**بله.** Telegram به هر bot اجازه می‌دهد Main Mini App و menu-button Mini App داشته باشد؛ این قابلیت به Telegram Premium نیاز ندارد. Main Mini App در profile بات دکمهٔ Launch app می‌سازد و URL `t.me/<bot>?startapp` نیز همان app را باز می‌کند. Mini App می‌تواند رابط JavaScript کامل داشته باشد و `initData` امضاشدهٔ Telegram را برای احراز هویت به backend بفرستد. [1] [2]

برای هدف IVAI، Main Mini App و menu button مناسب‌اند. Attachment Menu انتخاب نمی‌شود، زیرا Telegram آن را برای major advertisers محدود کرده است. [1]

## گزینه‌های معماری

| گزینه | توضیح | فشار/هزینه | نتیجه |
|---|---|---|---|
| A — `sendData` به webhook | Mini App یک string service message به bot ارسال کند و پاسخ در چت عادی Telegram برسد. | کم، اما تجربهٔ ترمینال پیوسته ندارد. | رد شود؛ پیام‌ها داخل terminal نمی‌مانند. |
| B — API HTTP هم‌مکان با Worker | صفحهٔ `/app` و `POST /app/chat` روی Worker فعلی؛ پاسخ JSON در همان terminal render می‌شود. | کم؛ یک درخواست dynamic برای هر turn. | **انتخاب v1.** |
| C — WebSocket / Durable Object / token streaming | پاسخ token-by-token و presence بلادرنگ. | پیچیدگی، state و فشار بیشتر؛ نیاز غیرضروری برای هدف فعلی. | برای v1 رد شود؛ فقط بعد از سنجش استفاده بررسی شود. |
| D — Worker یا سایت خارجی مستقل | frontend جدا و API جدا. | deployment، origin، CORS و سطح attack اضافه. | رد شود؛ IVAI همین Worker و HTTPS را دارد. |

## معماری پیشنهادی

```mermaid
sequenceDiagram
    participant U as User in Telegram
    participant T as IVAI Terminal /app
    participant W as Same Cloudflare Worker
    participant S as HMAC + D1/KV guards
    participant A as Existing free AI pipeline

    U->>T: Open Main Mini App
    T->>W: GET /app
    W-->>T: Small HTML + CSS + vanilla JS
    Note over T: No polling, no AI, no D1/KV on shell load
    U->>T: Type and submit one prompt
    T->>W: POST /app/chat + x-telegram-init-data
    W->>S: Verify initData; derive user ID server-side
    S->>S: Shared per-user rate check; read settings
    S->>A: generateReply with existing free-only fallback
    A-->>W: One final response
    W-->>T: JSON { text, model, mode }
    T-->>U: Append sanitized terminal lines
```

### Route map

| Route | Method | نقش | حالت هزینه/فشار |
|---|---|---|---|
| `/app` | `GET` | shell ترمینال عمومی؛ از Telegram WebApp SDK، CSS و vanilla JS استفاده می‌کند. | یک درخواست برای هر open؛ بدون AI/D1/KV. |
| `/app/session` | `POST` | اختیاری؛ اعتبارسنجی initData و دریافت mode/model/language فعلی فقط یک بار در boot. | یک request و چند query کوچک. |
| `/app/chat` | `POST` | prompt را دریافت می‌کند، initData را validate می‌کند، rate guard را اجرا می‌کند و `generateReply` فعلی را صدا می‌زند. | یک request و **یک** مسیر AI رایگان در هر turn. |

بهتر است صفحه فقط در Telegram کار کند. اگر `window.Telegram.WebApp` یا `initData` معتبر موجود نبود، UI باید پیام کوتاه «Open IVAI from Telegram» بدهد و هیچ API call نکند.

## قرارداد API پیشنهادی

### `POST /app/chat`

**Request header:** `x-telegram-init-data: <Telegram.WebApp.initData>`

```json
{
  "text": "Explain the difference between KV and D1"
}
```

**Success response:**

```json
{
  "ok": true,
  "text": "…",
  "model": "@cf/zai-org/glm-4.7-flash",
  "mode": "fast",
  "remaining": 17
}
```

**Error response:**

```json
{
  "ok": false,
  "code": "RATE_LIMIT",
  "message": "This free route is busy right now. Please try again shortly."
}
```

کلیدهای مهم این قرارداد چنین‌اند: شناسهٔ کاربر، language، mode، selected model و memory باید فقط از identity و settings سمت server محاسبه شوند؛ browser نباید بتواند `userId` یا model provider را تزریق کند. متن ورودی حداکثر `APP.maxInputCharacters` می‌ماند و response فقط به‌صورت plain JSON بازگردانده می‌شود.

## احراز هویت و حریم خصوصی

| کنترل | طراحی لازم |
|---|---|
| هویت | منطق `verifyTelegramInitData` فعلی از `admin.js` باید به یک ماژول shared منتقل شود و برای همهٔ requestهای `/app/*` اجرا شود. `initDataUnsafe` هرگز مبنای authorization نیست. [1] |
| freshness | حداکثر سن `auth_date` فعلی یک ساعت است؛ برای UX عادی قابل استفاده است. API باید در صورت انقضا، از Telegram app بخواهد دوباره باز شود. |
| origin | `/app` و `/app/chat` روی یک origin `ivai-bot.workers.dev` باشند؛ هیچ iframe، script، font، analytics یا asset شخص ثالث اضافه نشود. Telegram در Bot API 10.2 حفاظت origin Mini App را سخت‌تر کرده است. [2] |
| XSS | همهٔ متن‌های user و AI با `textContent` در DOM درج شوند؛ از `innerHTML` برای transcript استفاده نشود. |
| memory | transcript فقط در memory مرورگر نگه‌داری شود و با بستن Mini App حذف گردد. فقط وقتی تنظیم memory فعلی کاربر روشن است، همان KV memory TTL-bounded موجود استفاده شود. |
| data minimization | v1 نباید transcript جدید، analytics، session token، cookie یا D1 history table بسازد. |
| rate limit | از همان scope `text` فعلی استفاده شود تا کاربر با بازکردن terminal سهمیهٔ جداگانه و قابل دور زدن نگیرد. |

## UI پیشنهادی: «IVAI Terminal»

رابط باید خفن اما **سبک** باشد، نه سنگین. ظاهر پیشنهادی: dark terminal با accent آبی/بنفش برند IVAI، header کوچک `IVAI // TERMINAL`, نشان وضعیت `FREE ROUTE READY`, transcript با prefixهای `you ›` و `ivai ›`, composer چسبیده به پایین با prompt marker `›_`, و meta کوتاه مدل/حالت بعد از هر پاسخ.

| بخش UI | طراحی کم‌مصرف |
|---|---|
| theme | از `Telegram.WebApp.themeParams` و CSS variable استفاده شود؛ dark/light خودکار. |
| animation | فقط cursor blink CSS و skeleton کوچک در زمان request؛ بدون canvas، WebGL یا loop JavaScript. |
| response render | plain text با `white-space: pre-wrap`؛ code fence به‌صورت سبک با monospace نمایش داده شود، نه markdown engine. |
| composer | textarea تک‌خط/چندخط با submit button؛ Enter ارسال و Shift+Enter خط جدید. هنگام request disabled می‌شود. |
| settings | v1 فقط یک link یا button به `/menu` bot دارد؛ model picker و language picker در app دوم اضافه شوند، نه در نخستین انتشار. |
| accessibility | contrast، focus-visible، `aria-live` برای پاسخ جدید و safe-area Telegram رعایت شود. |

## برآورد فشار و ظرفیت

طبق اسناد Cloudflare، Workers Free تا 100,000 درخواست در روز، 10 ms CPU برای هر HTTP invocation، 100,000 KV read/day، 1,000 KV write/day، 5,000,000 D1 rows read/day و 100,000 D1 rows written/day دارد. [3] [4] [5] [6]

| رفتار v1 | مصرف تقریبی | دلیل کم‌فشار بودن |
|---|---|---|
| بازکردن terminal | 1 Worker request | یک HTML کوچک و بدون تماس AI/D1/KV. |
| یک turn بدون memory | 1 Worker request، identity/rate/settings، یک AI call | هیچ polling یا per-character call ندارد. |
| یک turn با memory opt-in | مورد بالا + یک KV read و یک KV write bounded | KV فقط برای کاربرانی مصرف می‌شود که خودشان memory را روشن کرده‌اند. |
| نمایش thinking | 0 درخواست اضافی | صرفاً CSS/UI محلی است. |
| transcript گذشته | 0 backend request در v1 | فقط تا بازبودن viewport در memory مرورگر نگه‌داری می‌شود. |

**محدودیت واقعی v1، AI quota است نه terminal UI.** همان بودجهٔ محافظه‌کارانهٔ 8,000-Neuron IVAI و rate limit فعلی باید برای chat bot و terminal مشترک بماند. بنابراین Mini App نباید شمار AI call را افزایش دهد؛ فقط راه ورود UI را تغییر می‌دهد.

## مواردی که عمداً در v1 ساخته نمی‌شوند

| مورد | چرا ساخته نمی‌شود |
|---|---|
| WebSocket، SSE یا token streaming | برای terminal جذاب است، اما state/connection complexity می‌آورد و در مدل‌های free رفتار یکنواختی ندارد. |
| chat history دائمی جدید | KV write limit روزانهٔ 1,000 و تعهد privacy را بی‌دلیل تحت فشار می‌گذارد. |
| Durable Object، R2، database جدید یا backend دوم | هیچ‌کدام برای request/response terminal اولیه لازم نیستند. |
| attachment menu | برای botهای عادی محدود است. |
| upload media از terminal | voice/photo در chat اصلی اکنون مسیر امن‌تری دارند؛ media terminal به نسخهٔ دوم موکول می‌شود. |
| payment، Stars و Premium dependency | با قرارداد free-only IVAI ناسازگار است. |

## مراحل ساخت پیشنهادی

| مرحله | تغییرات | معیار پذیرش |
|---|---|---|
| 1. API امن | `webapp-auth.js` shared، `app-api.js` و routeهای `/app/session` و `/app/chat`؛ reuse `generateReply`, `allowUsage`, `getUserSettings`, `upsertUser`. | initData جعلی `401`؛ userId جعلی قابل ارسال نیست؛ chat و app سهمیهٔ مشترک دارند. |
| 2. terminal shell | `app-page.js` با HTML/CSS/JS بدون dependency و route `GET /app`. | در Telegram responsive، theme-aware، safe-area-aware و بدون request اضافی در idle. |
| 3. تست | unit auth، validation prompt، rate-limit مشترک، response sanitization، fallback AI mock، route methods و UI string test. | `npm run validate` کامل و smoke test `/app`. |
| 4. rollout | deploy، set Main Mini App و menu button در BotFather، و دکمهٔ `Open terminal` در `/start`. | UI فقط از Telegram باز می‌شود و root/chat bot فعلی regress نمی‌کند. |
| 5. اندازه‌گیری | مشاهدهٔ Cloudflare request/KV/D1/Workers AI و بازخورد واقعی کاربران برای ۷ روز. | اگر فشار و quota پایدار بود، settings یا history اختیاری v2 تصمیم‌گیری شود. |

## نتیجهٔ نهایی

این Mini App **کاملاً شدنی، رایگان و مناسب پروژه است**، به شرط آن‌که به‌عنوان یک terminal request/response کوچک ساخته شود، نه یک messenger realtime. معماری پیشنهادی هم به کاربر حس یک chat terminal خفن می‌دهد و هم قراردادهای اصلی IVAI را حفظ می‌کند: English-first، free-only، یک AI call، fallback ترتیبی، D1/KV موجود و مصرف بسیار پایین.

## References

[1] [Telegram Mini Apps](https://core.telegram.org/bots/webapps)

[2] [Telegram Bot API](https://core.telegram.org/bots/api)

[3] [Telegram Bot Features — Mini Apps](https://core.telegram.org/bots/features#mini-apps)

[4] [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

[5] [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

[6] [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

[7] [Cloudflare Workers KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
