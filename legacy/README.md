# Legacy implementation archive

`TeleLLMBot.v3.2.reference.js` نسخهٔ یک‌فایلی v3.2 IVAI است که برای حفظ منطق و الگوهای تاریخی پروژه نگهداری می‌شود. این فایل **entrypoint production نیست** و نباید برای استقرار، توسعهٔ قابلیت‌های جدید یا نگهداری provider policy و secretها استفاده شود.

> Worker فعال از `src/index.js` طبق `wrangler.jsonc` اجرا می‌شود. معماری v3.3+ مسئولیت‌های routing، امنیت، AI، storage، broadcast، Secretary، re-engagement و Mini App را در ماژول‌های جداگانه نگهداری می‌کند.

هر اصلاح جدید باید در معماری ماژولار انجام، با `pnpm run validate` بررسی و در صورت تغییر رفتار کاربر، با آزمون regression همراه شود.
