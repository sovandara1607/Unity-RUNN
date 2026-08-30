# Telegram delivery

Unity Runn Club can mirror runner notifications to a private Telegram chat. Email remains the fallback channel.

## Configure the bot

1. Create a bot with `@BotFather` and keep its token secret.
2. Set these API environment variables:

   ```text
   TELEGRAM_BOT_TOKEN=123456:replace-with-real-token
   TELEGRAM_BOT_USERNAME=unity_runn_bot
   TELEGRAM_WEBHOOK_SECRET=replace-with-a-long-random-value
   ```

3. Point Telegram at the public API webhook. The API must be reachable over HTTPS.

   ```sh
   curl --request POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     --data-urlencode "url=https://api.example.com/api/v1/integrations/telegram/webhook" \
     --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```

The secret is sent by Telegram in `X-Telegram-Bot-Api-Secret-Token` and checked before any update is parsed.

## Runner flow

Profile → Delivery automations creates a ten-minute, one-use deep link. The runner taps **Start** in the private bot chat. The API stores the chat ID against the authenticated account and never exposes it to the browser.

New registration confirmations and verified payments include a ticket QR. Event reminders, event changes, and cancellations are sent as concise text updates. Disconnecting Telegram does not affect email delivery.

Connected runners can independently pause ticket/payment messages, race reminders, or event-change messages from Profile. They can also send a rate-limited test signal to verify delivery without creating a registration.

Telegram delivery uses a separate database-backed outbox. Temporary provider failures are retried with increasing delays up to `NOTIFICATION_MAX_ATTEMPTS`; email delivery is processed independently. Profile shows the runner's eight most recent sent, sending, or failed Telegram signals without exposing provider error details.

Administrators can open **Race Control → Automations** to see the 30-day delivery rate, connected-runner reach, trigger volume, recent delivery state, and credential-safe failure categories. A failed delivery can be manually returned to the queue; the action is recorded in the audit log.

## Scheduled event transmissions

After running migration `00030_create_event_automations.sql`, administrators can open an event in Race Control and select **Transmissions**. A transmission can be kept as a draft or scheduled for a future local date and time. Its audience is intentionally fixed to confirmed runners for that event. Drafts and scheduled items can be revised, failed jobs can be prepared for retry, and every send displays a final audience/channel preview before confirmation. Cancelling keeps the record in the timeline and audit log.

At the scheduled time, the API leases the job and creates one deduplicated notification per runner. Each notification is delivered by email and, when connected and enabled, Telegram. Partial fan-out and process restarts are safe: completed runner entries are not created twice, stale jobs are reclaimed after five minutes, and failed jobs retry using the configured `NOTIFICATION_MAX_ATTEMPTS` limit.

Keep the API process running for scheduled sends. The scheduler checks for due work every 15 seconds; no separate cron service is required.
