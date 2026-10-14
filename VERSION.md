# Unreleased

**Baseline:** `0.1.0`  
**Recorded:** 2026-10-14

This entry summarizes the changes currently present in the working tree but not yet included in a pushed release. No new release version has been assigned.

## Highlights

- **Smart Bar:** Adds a shared quick-entry bar for agenda and spending workflows. It supports natural-language parsing, optional interpretation through OpenAI, Anthropic, xAI, or Venice using a supplied provider API key, browser-based voice transcription, and receipt image extraction.
- **Agenda scheduling:** Adds fixed-time and interval schedules, duration limits, per-occurrence completion and notification tracking, and improved monthly recurrence that preserves the original day where possible.
- **Encrypted data:** Adds an encryption vault and encrypted-payload support for agenda, spending, budget, income, and profile data, together with encryption-key APIs.
- **Households and shared finances:** Expands household and group membership flows, category permissions, budgets, income sources, spending records, and settlement handling.
- **Currencies and precision:** Adds USD, EUR, and BTC-aware balances and settlements, display conversion, and precision for eight-decimal BTC amounts.
- **Dashboard and notifications:** Updates agenda, spending, budgets, groups, settings, signup, the app header, upcoming notifications, and service-worker behavior to support the expanded workflows.

## Data and configuration

- Adds migrations for encryption fields, occurrence-based agenda scheduling, budget labels, expense categories, currency precision, settlement currency, and query indexes.
- Extends environment validation and `.env.example` for the Web Push `VAPID_SUBJECT` setting and VAPID keys.
- Updates dependency lock data for browser-side speech processing and receipt OCR.

Apply the new SQL migrations with `npm run db:migrate` when deploying these schema changes. Keep environment-specific secrets in an ignored local `.env` file; commit the source environment schema and the example template, not secret values.
