# منابع automation مخزن — 2026-08-21

این یادداشت منابع رسمی استفاده‌شده برای همگام‌سازی CI و Dependabot با pnpm را ثبت می‌کند.

| موضوع | یافتهٔ اعمال‌شده | منبع |
|---|---|---|
| Dependabot | GitHub Dependabot از ecosystem وابستگی پشتیبانی می‌کند و برای پروژهٔ pnpm از `package-ecosystem: npm` در root استفاده شد. | [GitHub Docs — Dependabot supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories) |
| CI با pnpm | pnpm توصیه می‌کند نسخهٔ package manager در `packageManager` یا `devEngines.packageManager` ثبت شود و CI از lockfile سازگار استفاده کند. | [pnpm — Continuous Integration](https://pnpm.io/continuous-integration) |
| lockfile در CI | `pnpm-lock.yaml` باید commit شود و install در CI با `--frozen-lockfile` اجرا گردد تا dependency tree قطعی و قابل‌تکرار بماند. | [actions/setup-node — Working with lockfiles](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md) |

این منابع صرفاً برای پیکربندی automation مخزن استفاده شده‌اند؛ هیچ credential، secret یا دادهٔ کاربر از آن‌ها دریافت یا ثبت نشده است.
