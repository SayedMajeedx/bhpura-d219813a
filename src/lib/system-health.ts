/**
 * What the health log keeps, and how the health page reads it.
 *
 * The scheduler runs four tasks every minute. Writing every run made the log 5,760 rows a day
 * that all say "nothing to do", and the page, which reads the latest rows, saw two hours of
 * them and nothing else. A quiet run is now written once every HEARTBEAT_MINUTES; a run that
 * did something, or went wrong, is always written.
 */

export type HealthStatus = "healthy" | "degraded" | "failed";

/** A quiet, healthy run is written this often, so a scheduler that stopped can be seen. */
export const HEARTBEAT_MINUTES = 15;

/** Tasks that run once a day; every other task runs every minute. */
export const DAILY_SERVICES: ReadonlySet<string> = new Set([
  "benefit_receipt_cleanup",
  "health_event_retention",
  "exchange_rates_refresh",
]);

/** The worker's two schedules, as `wrangler.json` lists them. */
export const EVERY_MINUTE_CRON = "* * * * *";
export const DAILY_CRON = "17 2 * * *";

/**
 * Which tasks a scheduled run does. Each schedule starts its own run, so at 02:17 UTC there are
 * two: the daily one does the daily tasks only, or the four that run every minute would run
 * twice at once that minute (they did). Any other schedule does the every-minute tasks.
 */
export function scheduledWork(cron: string): "daily" | "every-minute" {
  return cron === DAILY_CRON ? "daily" : "every-minute";
}

/**
 * The minute a scheduled run belongs to, as the claim is keyed. Cloudflare has started every run
 * twice, a few seconds apart in the same minute: both starts name the same minute.
 */
export function runMinute(scheduledTime: number): string {
  return new Date(Math.floor(scheduledTime / 60_000) * 60_000).toISOString();
}

export function isHeartbeatMinute(scheduledTime: number): boolean {
  return new Date(scheduledTime).getUTCMinutes() % HEARTBEAT_MINUTES === 0;
}

/** A run did something when any figure it reports is above zero (scanned, sent, deleted...). */
export function didWork(metrics: Record<string, unknown>): boolean {
  return Object.values(metrics).some((value) => typeof value === "number" && value > 0);
}

/** Whether a run is written to the health log. */
export function worthRecording(run: {
  status: HealthStatus;
  metrics: Record<string, unknown>;
  quietWhenIdle: boolean;
}): boolean {
  if (run.status !== "healthy") return true;
  if (!run.quietWhenIdle) return true;
  return didWork(run.metrics);
}

type Recorded = { service: string; status: HealthStatus | string; created_at: string };

/** The newest record of each service. `events` are newest first. */
export function latestPerService<T extends Recorded>(events: T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of events) {
    if (!latest.has(event.service)) latest.set(event.service, event);
  }
  return Array.from(latest.values());
}

/**
 * A service is silent when its newest record is older than it could be if the scheduler were
 * running: three heartbeats for a task that runs every minute, a day and two hours for a daily one.
 */
export function isSilent(event: Recorded, now: number): boolean {
  const allowedMinutes = DAILY_SERVICES.has(event.service) ? 26 * 60 : HEARTBEAT_MINUTES * 3;
  return now - new Date(event.created_at).getTime() > allowedMinutes * 60_000;
}
