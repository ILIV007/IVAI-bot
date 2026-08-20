# Security Policy

## Supported version

| Version | Supported |
|---|---:|
| 3.3.x | Yes |
| Earlier versions | No |

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a suspected vulnerability, exposed credential, webhook bypass, authorization problem, data leak, or denial-of-service vector. Use the repository owner’s private GitHub contact channel instead. Include a concise description, reproducible steps, affected file or endpoint where known, expected and actual behavior, and any suggested mitigation.

The maintainer will acknowledge a valid report, assess impact, rotate or revoke exposed credentials where appropriate, and coordinate a fix before public disclosure. Do not include production user data, Telegram bot tokens, provider API keys, D1 data exports, or webhook-secret values in the report.

## Security boundaries

IVAI validates the Telegram webhook secret, deduplicates updates, limits user activity, keeps credentials in Cloudflare Worker Secrets, validates Telegram Mini App `initData` on the server, and uses only allowlisted free provider models. These controls reduce risk but do not remove the need for regular dependency, secret, deployment, and access reviews.

> A credential that has appeared outside the Worker Secrets manager should be treated as exposed and rotated in its provider dashboard before the affected deployment continues.
