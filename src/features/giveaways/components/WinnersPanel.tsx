import { Check, Copy, ExternalLink, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { GiveawayWinner } from "@/lib/data/giveaways";
import type { GiveawayDetail } from "../hooks/use-giveaway-detail";
import { checksComplete, profileUrl } from "../lib/winners";

function WinnerCard({
  row,
  detail,
  active,
}: {
  row: GiveawayWinner;
  detail: GiveawayDetail;
  active: boolean;
}) {
  const { isAr, rules } = detail;
  const checks = { requireFollow: rules.requireFollow, requireLike: rules.requireLike };
  const disqualified = row.status === "disqualified";
  const complete = checksComplete(row, checks);
  const confirmed = row.status === "confirmed";

  return (
    <li
      className={`space-y-3 rounded-xl border p-3 ${
        disqualified ? "border-border bg-muted/50 opacity-70" : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="grid size-7 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
            dir="ltr"
          >
            {row.position}
          </span>
          <a
            href={profileUrl(row.username)}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline"
          >
            @{row.username}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          {confirmed && (
            <Badge className="bg-success text-success-foreground">
              {isAr ? "مؤكد" : "Confirmed"}
            </Badge>
          )}
          {disqualified && <Badge variant="destructive">{isAr ? "مستبعد" : "Disqualified"}</Badge>}
          {!active && !disqualified && (
            <Badge variant="secondary">{isAr ? "احتياطي" : "Backup"}</Badge>
          )}
        </div>
      </div>

      {row.comment_body && (
        <p className="line-clamp-3 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {row.comment_body}
        </p>
      )}

      {!disqualified && (rules.requireFollow || rules.requireLike) && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {isAr ? "افتح البروفايل وتحقق، ثم علّم:" : "Open the profile, check, then tick:"}
          </p>
          {rules.requireFollow && (
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={row.follow_checked}
                onCheckedChange={(checked) =>
                  detail.updateWinner(row.id, { follow_checked: checked === true })
                }
              />
              {isAr ? "يتابع الحساب" : "Follows the account"}
            </Label>
          )}
          {rules.requireLike && (
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={row.like_checked}
                onCheckedChange={(checked) =>
                  detail.updateWinner(row.id, { like_checked: checked === true })
                }
              />
              {isAr ? "وضع إعجاباً بالبوست" : "Liked the post"}
            </Label>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!disqualified && (
          <Button
            type="button"
            size="sm"
            variant={confirmed ? "secondary" : "default"}
            disabled={!complete || confirmed}
            onClick={() => detail.updateWinner(row.id, { status: "confirmed" })}
          >
            <Check className="size-4" />
            {isAr ? "تأكيد الفوز" : "Confirm win"}
          </Button>
        )}
        {disqualified ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => detail.updateWinner(row.id, { status: "pending" })}
          >
            {isAr ? "إعادته" : "Restore"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              detail.updateWinner(row.id, {
                status: "disqualified",
                follow_checked: false,
                like_checked: false,
              })
            }
          >
            <UserX className="size-4" />
            {isAr ? "استبعاد" : "Disqualify"}
          </Button>
        )}
      </div>
    </li>
  );
}

/** Winners and backups: check each one on their profile, disqualify, and the next backup steps up. */
export function WinnersPanel({ detail }: { detail: GiveawayDetail }) {
  const { isAr, resolved, giveaway } = detail;
  if (!detail.hasDraw || !giveaway) return null;

  const copyList = async () => {
    const lines = resolved.active.map((row) => `${row.position}. @${row.username}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(isAr ? "تم نسخ القائمة." : "List copied.");
    } catch {
      toast.error(isAr ? "تعذر النسخ." : "Could not copy.");
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground">{isAr ? "الفائزون" : "Winners"}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyList()}>
          <Copy className="size-4" />
          {isAr ? "نسخ القائمة" : "Copy list"}
        </Button>
      </div>

      {resolved.vacancies > 0 && (
        <p className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-foreground">
          {isAr
            ? `${resolved.vacancies} مكان فارغ ولا يوجد احتياطي. أعد السحب أو خفف الشروط.`
            : `${resolved.vacancies} place(s) are empty and no backup is left. Draw again or relax the rules.`}
        </p>
      )}

      <ul className="space-y-2">
        {resolved.active.map((row) => (
          <WinnerCard key={row.id} row={row} detail={detail} active />
        ))}
      </ul>

      {resolved.standby.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
            {isAr ? "الاحتياطيون" : "Backups"}
          </h3>
          <ul className="space-y-2">
            {resolved.standby.map((row) => (
              <WinnerCard key={row.id} row={row} detail={detail} active={false} />
            ))}
          </ul>
        </>
      )}

      {resolved.disqualified.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
            {isAr ? "المستبعدون" : "Disqualified"}
          </h3>
          <ul className="space-y-2">
            {resolved.disqualified.map((row) => (
              <WinnerCard key={row.id} row={row} detail={detail} active={false} />
            ))}
          </ul>
        </>
      )}

      {giveaway.draw_seed && (
        <p className="text-xs text-muted-foreground" dir="ltr">
          {isAr ? "بذرة السحب" : "Draw seed"}: {giveaway.draw_seed}
        </p>
      )}
    </section>
  );
}
