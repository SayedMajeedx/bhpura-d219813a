/**
 * Winners and backups after staff check them by hand. Instagram's API cannot say
 * who follows the account or liked the post, so each drawn person is checked on
 * their profile; one who fails is disqualified and the next backup takes the
 * place.
 */

export type WinnerStatus = "pending" | "confirmed" | "disqualified";

/** The fields the rules read; the database's rows carry more and keep them. */
export type WinnerRow = {
  id: string;
  position: number;
  kind: string;
  username: string;
  /** "pending", "confirmed" or "disqualified". */
  status: string;
  follow_checked: boolean;
  like_checked: boolean;
};

export type WinnerChecks = { requireFollow: boolean; requireLike: boolean };

export type ResolvedWinners<R extends WinnerRow = WinnerRow> = {
  /** Who holds a winning place now: winners still in, plus backups promoted to fill gaps. */
  active: R[];
  /** Backups still waiting. */
  standby: R[];
  disqualified: R[];
  /** Winning places no backup is left to fill. */
  vacancies: number;
};

/** The winners to announce, given how many places the giveaway has. */
export function resolveWinners<R extends WinnerRow>(rows: R[], places: number): ResolvedWinners<R> {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  const disqualified = ordered.filter((row) => row.status === "disqualified");
  const live = ordered.filter((row) => row.status !== "disqualified");
  const active = live.slice(0, Math.max(0, places));
  const standby = live.slice(Math.max(0, places));
  return {
    active,
    standby,
    disqualified,
    vacancies: Math.max(0, places - active.length),
  };
}

/** Whether every check the giveaway requires has been ticked for this person. */
export function checksComplete(row: WinnerRow, checks: WinnerChecks): boolean {
  if (checks.requireFollow && !row.follow_checked) return false;
  if (checks.requireLike && !row.like_checked) return false;
  return true;
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}
