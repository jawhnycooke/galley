# Webhook delivery

Webhooks are how the system notifies your endpoint when events occur in your account. Delivery is at-least-once: your endpoint may be called more than once for the same event — so your handler must be idempotent.

Every webhook ships with a signature in the header. Your handler must verify it before trusting the payload: compute the expected signature over the raw request body using your signing secret, then compare it against the header.

Events are not guaranteed to arrive in the order they occurred. A handler that applies each event on its own terms is unaffected. A handler that writes an event's state onto a record is not: if a newer event lands first, the older one overwrites it. Compare the event timestamp against what you have already stored and discard the older event.

If your endpoint returns a non-2xx response, the webhook will be retried. Retries happen with exponential backoff for up to 24 hours, after which the webhook is dropped.
