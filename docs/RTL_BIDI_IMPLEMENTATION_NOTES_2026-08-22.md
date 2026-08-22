# یادداشت پیاده‌سازی RTL و bidi — IVAI

**تاریخ:** ۲۲ اوت ۲۰۲۶

## یافته‌های معتبر

Telegram Rich Messages یک فیلد صریح `is_rtl` دارد و IVAI آن را در Rich final و draft برای فارسی و عربی فعال می‌کند. اما `sendMessage` و `editMessageText` عادی چنین فیلدی ندارند؛ بنابراین مسیر fallback HTML باید جهت پاراگراف را با کنترل‌های استاندارد Unicode حفظ کند.[1]

UAX #9 توضیح می‌دهد که وقتی متن راست‌به‌چپ با عبارت‌های لاتین، عدد، emoji یا علائم ترکیب می‌شود، جهت ضمنی می‌تواند مبهم شود. **RLM** (`U+200F`) یک mark صفرعرض راست‌به‌چپ و **LRI/PDI** (`U+2066`/`U+2069`) یک isolate چپ‌به‌راست هستند. Isolateها برای جلوگیری از اثر عبارت لاتین بر متن اطراف توصیه می‌شوند؛ IVAI پیش‌تر مدل/model/mode footer را با LRI/PDI ایزوله کرده است.[2]

## قرارداد اجرایی IVAI

| سطح | روش |
|---|---|
| Rich Draft و Rich Message فارسی/عربی | `is_rtl: true` حفظ می‌شود. |
| HTML fallback و پیام‌های عادی فارسی/عربی | یک RLM در ابتدای هر پاراگراف اضافه می‌شود تا پاراگرافی که با emoji یا واژهٔ لاتین آغاز می‌شود RTL بماند. |
| Footer مدل | LRI/PDI موجود حفظ می‌شود تا ترتیب `IVAI · Model · Mode` معکوس نشود. |
| Input مدل و محتوای کاربر | هیچ override خطرناک (`RLO`/`LRO`) اعمال نمی‌شود؛ فقط markهای صفرعرض کنترل‌شده در خروجی خود Bot قرار می‌گیرند. |
| Inline keyboard Start | Telegram width صریح برای دکمه‌ها ندارد؛ برچسب‌های هم‌طول‌تر و متوازن‌تر در یک row برای هم‌خوانی بصری استفاده می‌شوند. |

## منابع

[1] [Telegram Bot API — Rich Messages and formatting](https://core.telegram.org/bots/api#formatting-options)

[2] [Unicode Standard Annex #9 — Bidirectional Algorithm](https://www.unicode.org/reports/tr9/)
