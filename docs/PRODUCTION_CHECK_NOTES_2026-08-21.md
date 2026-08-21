# یادداشت چکاب production — 2026-08-21

## IVAI Terminal خارج از Telegram

در production v3.3.10، مسیر `GET /app` با `200 OK` پاسخ داد. رابط navy/blue/jade به‌صورت کامل render شد و bootstrap inline بدون Syntax Error اجرا شد. چون مرورگر sandbox دارای Telegram Mini App `initData` نیست، رفتار امن زیر مشاهده شد:

| کنترل | نتیجه |
|---|---|
| وضعیت رابط | `RECONNECT` |
| پیام راهنما | Open IVAI Terminal from inside Telegram to start a secure session. |
| دکمهٔ recovery | قابل‌مشاهده |
| composer input | غیرفعال |
| Send | غیرفعال |
| inline bootstrap | یک script حاضر و اجرایی |

این رفتار صحیح است: خارج از Telegram هیچ session جعلی ساخته و هیچ درخواست AI ارسال نمی‌شود. آزمون end-to-end عضویت و chat فقط باید از Web App button واقعی داخل Telegram انجام شود.
