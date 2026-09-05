# Webhook delivery

Webhooks are how the system notifies your endpoint when events occur in your account. Delivery is at-least-once: your endpoint may be called more than once for the same event — so your handler must be idempotent.

Every webhook ships with a signature in the header. Your handler must verify it before trusting the payload: compute the expected signature over the raw request body using your signing secret, then compare it against the header.

If your endpoint returns a non-2xx response, the webhook will be retried. Retries happen with exponential backoff for up to 24 hours, after which the webhook is dropped.
