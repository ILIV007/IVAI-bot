# آمادگی افتتاح عمومی IVAI

**تاریخ بررسی:** ۲۲ اوت ۲۰۲۶  
**نسخهٔ release candidate:** `v3.3.31`  
**تصمیم فنی:** آماده برای افتتاح عمومی، با دو بررسی انسانیِ غیرمسدودکننده.

## Gateهای فنی

| Gate | نتیجه | شواهد |
|---|---|---|
| Worker production | موفق | Health endpoint پاسخ `IVAI Worker is ready` داد. |
| Regression suite | موفق | ۷۹ از ۷۹ تست موفق است. |
| CI GitHub | موفق | آخرین run روی `main` سبز است. |
| Dependency audit | موفق | `pnpm audit --prod` آسیب‌پذیری شناخته‌شده نشان نداد. |
| Telegram webhook | موفق | URL روی Worker است، `pending_update_count` برابر صفر است و secret validation در Worker فعال است. |
| Updateهای لازم | موفق | `message`، `edited_message`، `inline_query`، `chosen_inline_result`، `callback_query`، `message_reaction`، `business_message` و `guest_message` فعال هستند. |
| Mini App surface | موفق | `/app` با CSP nonce، `no-store`، `nosniff` و `no-referrer` پاسخ می‌دهد؛ API بدون initData معتبر با ۴۰۱ رد می‌شود. |
| D1 و queueها | موفق | در بررسی فقط‌خواندنی، ۳ کاربر ثبت شده و delivery/task/re-engagement معوقی وجود ندارد. |
| حافظه و فارسی | موفق | Session فعال با Memory Off، فارسی کوتاه، RTL fallback و Terminal با regression پوشش دارند. |

## Command menu عمومی

فهرست commandهای Bot در Telegram در روز بررسی همگام شد. هدف آن نمایش تنها قابلیت‌های مفید کاربر عادی و حذف فرمان‌های admin از autocomplete عمومی است؛ handlerهای admin همچنان server-side role check دارند.

| گروه | فرمان‌ها |
|---|---|
| شروع و navigation | `/start`، `/new`، `/menu`، `/help`، `/terminal` |
| پاسخ‌دهی | `/auto`، `/fast`، `/deep`، `/code`، `/guard`، `/details` |
| مدل و Session | `/models`، `/model`، `/memory`، `/lang` |
| سازمان‌دهی | `/task`، `/tasks`، `/notify` |
| کنترل کاربر | `/debug`، `/reset` |

## موارد انسانیِ غیرمسدودکننده

> این موارد مانع افتتاح Bot نیستند؛ دکمهٔ Menu Button فعلی از نوع `web_app` است و Terminal را به `https://ivai-bot.ivai-bot.workers.dev/app` باز می‌کند.

| مورد | وضعیت | اقدام مالک |
|---|---|---|
| Main Mini App در BotFather | اختیاری؛ `has_main_web_app` فعلاً false است. | در BotFather همان URL Terminal را به Main Mini App ثبت کنید، اگر می‌خواهید در تمام سطوح Telegram entry point اختصاصی داشته باشید. |
| تست ظاهری کلاینت | نیازمند مشاهدهٔ انسانی | در Android یا iOS، `/start` فارسی، `/menu` فارسی، مدل‌انتخاب‌گر، Terminal و Inline Mode را یک‌بار بازبینی کنید. |

## rollback و پاسخ به incident

اگر issue جدی پس از افتتاح مشاهده شد، ابتدا `getWebhookInfo` را برای pending update و آخرین error بررسی کنید. releaseهای Worker از GitHub قابل‌ردیابی هستند؛ revert یک commit و push به `main` مسیر rollback است. هیچ token یا secret نباید در issue، پیام کاربر یا commit ثبت شود.
