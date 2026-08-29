# Observability and reliability

Boutq exposes two machine-readable health endpoints:

- `GET /api/health/live` confirms that the Worker can serve requests. It performs no dependency calls.
- `GET /api/health/ready` verifies the production database path with a three-second timeout. It returns HTTP `503` when the dependency is unavailable.

Neither endpoint returns credentials, tenant data, database URLs, or provider payloads. Responses are never cached and include `X-Request-ID` for support correlation.

Scheduled payment reconciliation, email retry, WhatsApp retry, and receipt cleanup run in isolated failure boundaries. Every run emits a structured Cloudflare log and persists a bounded operational result in `system_health_events` when the database is reachable. A failure in one task does not skip the remaining tasks.

## Recommended monitors

Configure an external uptime monitor against `/api/health/live` every minute and `/api/health/ready` every five minutes. Alert only after two consecutive failures to avoid noise from a transient network event.

Create Cloudflare log alerts for `request_failed`, task events ending in `_failed`, and repeated `health_event_persist_failed`. Use the returned request ID when investigating a customer report.

## Retention and incident response

The service-role-only function `prune_system_health_events(30)` keeps 30 days by default and rejects retention shorter than 7 or longer than 365 days. The existing daily maintenance schedule invokes it automatically. For an incident, preserve the relevant rows before pruning, identify the affected correlation ID, and follow the rollback and database recovery runbooks.
