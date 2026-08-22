# راهنمای یادگیری با Telegram: ILIVIR3 و IVAI Bot

**ILIVIR3** یک channel عمومی برای کشف و پیگیری منابع توسعه، IT، فناوری، هوش مصنوعی، پروژه‌های متن‌باز، آموزش برنامه‌نویسی و سخت‌افزارهای maker است. **IVAI Bot** همراه رایگان این مسیر است: موضوع را از channel پیدا می‌کنید و با گفت‌وگو، تحلیل، تمرین و کدنویسی آن را به یادگیری عملی تبدیل می‌کنید.

> IVAI به history channel دسترسی مستقیم ندارد. برای دریافت کمک دقیق، متن کوتاه، عنوان، لینک یا توضیح موضوعی را که می‌خواهید بررسی شود، خودتان در chat ارسال کنید.

## مسیر هفت‌مرحله‌ای یادگیری

| مرحله | کار در channel | کار با IVAI Bot | نمونهٔ prompt |
|---|---|---|---|
| 1. کشف | یک پست، repository، ویدئو یا ابزار جالب پیدا کنید. | موضوع را در یک جمله مشخص کنید. | `I found a resource about Raspberry Pi. What should a beginner learn first?` |
| 2. فهم پایه | عنوان، خلاصه یا بخش بی‌خطری از محتوا را بردارید. | توضیح سطح مناسب خودتان را بخواهید. | `Explain this topic for a beginner, with no jargon first.` |
| 3. نقشهٔ راه | مشخص کنید هدفتان آشنایی، ساخت پروژه یا آمادگی شغلی است. | یک برنامهٔ کوتاه و واقع‌بینانه بخواهید. | `Make a 5-day study plan with 30 minutes per day.` |
| 4. تحلیل | ادعاها، مزیت‌ها و محدودیت‌های منبع را بررسی کنید. | مقایسه یا پرسش انتقادی بخواهید. | `Compare this tool with its common alternatives and state trade-offs.` |
| 5. تمرین | یک بخش کوچک و قابل‌ساخت انتخاب کنید. | تمرین یا mini-project بخواهید. | `Give me a 45-minute practical exercise and its acceptance criteria.` |
| 6. ساخت | کد، تنظیمات یا راه‌حل خود را آماده کنید. | از حالت Code برای debugging و review استفاده کنید. | `Review this JavaScript function, explain the bug, then show the smallest fix.` |
| 7. تثبیت | نکته‌های مهم و کار بعدی را ثبت کنید. | خلاصه و یادآور بسازید. | `Summarize what I learned in five bullets and create a reminder for tomorrow.` |

## انتخاب مناسب حالت بات

| نیاز یادگیری | حالت یا کنترل پیشنهادی | خروجی مورد انتظار |
|---|---|---|
| پاسخ کوتاه و سریع | `/fast` | تعریف، رفع ابهام و شروع مطالعه |
| تحلیل، مقایسه و برنامه‌ریزی | `/deep` | توضیح مرحله‌ای، trade-off و نقشهٔ راه |
| تمرین و پروژهٔ فنی | `/code` | نمونهٔ کد، debugging و معیار پذیرش |
| انتخاب خودکار مسیر رایگان | `/auto` | route رایگان متناسب با پرسش |
| انتخاب یک model رایگان | `/models` | اولویت دادن به یک route آزاد با fallback رایگان |
| شروع موضوع جدید | `/new` | reset شدن Session گفت‌وگوی فعلی بدون تغییر تنظیمات شخصی |
| ثبت برنامهٔ مطالعه | `/task in 1d | Review the learning notes` | یادآور سبک و رایگان |
| فضای تمرکز بیشتر | IVAI Terminal | گفت‌وگوی سبک در Mini App Telegram |

## نمونه‌های آماده برای موضوع‌های channel

| موضوع | prompt پیشنهادی |
|---|---|
| برنامه‌نویسی و freeCodeCamp | `I am studying JavaScript. Turn this lesson into one concept, one example, and one small practice task.` |
| پروژهٔ متن‌باز GitHub | `Explain this repository’s purpose, likely users, prerequisites, and the smallest safe way to try it locally.` |
| هوش مصنوعی | `Separate the factual claims, assumptions, benefits, risks, and questions I should verify about this AI tool.` |
| Raspberry Pi و سخت‌افزار | `Create a beginner-safe checklist for trying this Raspberry Pi idea, including required parts and common mistakes.` |
| ابزار جدید | `Compare this tool with two alternatives by cost, privacy, learning curve, and practical use case.` |

## استفادهٔ امن و مسئولانه

| اصل | اجرا |
|---|---|
| حریم خصوصی | API key، token، شماره، رمز، فایل خصوصی یا دادهٔ حساس را در chat قرار ندهید. |
| اعتبارسنجی | پاسخ AI را برای تصمیم‌های مهم با مستندات رسمی و منبع اصلی بررسی کنید. |
| کپی‌رایت | به‌جای بازنشر کامل محتوای دارای حق نشر، خلاصهٔ کوتاه یا توضیح موضوع را ارسال کنید. |
| منابع رایگان | IVAI فقط مسیرهای AI رایگان را استفاده می‌کند؛ اگر یک route موقتاً در دسترس نباشد، fallback رایگان ادامه می‌دهد. |
| تمرین کوچک | هر پست را به یک خروجی قابل‌بررسی تبدیل کنید: یک خلاصه، یک پرسش، یک exercise یا یک commit کوچک. |

## شروع سریع

1. به [@ILIVIR3](https://t.me/ILIVIR3) بپیوندید و یک موضوع موردعلاقه انتخاب کنید.
2. در [@IVAI_Llm_bot](https://t.me/IVAI_Llm_bot) دستور `/start` را اجرا کنید و language دلخواه را تعیین کنید.
3. زمینهٔ لازم را با یک جمله یا excerpt بی‌خطر وارد کنید.
4. از IVAI بخواهید ابتدا موضوع را برای سطح شما توضیح دهد، سپس یک تمرین کوچک بسازد.
5. اگر موضوع طولانی شد، با `/new` به بحث بعدی بروید و با `/task` زمان مرور را تنظیم کنید.

> بهترین نتیجه زمانی به‌دست می‌آید که پرسش مشخص باشد: «چه چیزی بسازم؟»، «کدام پیش‌نیاز را ندارم؟»، «این ادعا چه محدودیتی دارد؟» یا «چطور در 30 دقیقه تمرینش کنم؟» از «همه‌چیز را دربارهٔ این موضوع بگو» کاربردی‌تر هستند.
