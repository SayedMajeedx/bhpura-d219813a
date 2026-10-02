import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import {
  giveawaysQueries,
  GiveawayApiError,
  invalidateGiveaways,
  pullComments,
  saveDraw,
  saveGiveawayRules,
  updateWinner,
  type WinnerPatch,
} from "@/lib/data/giveaways";
import { buildEntries, parseRules, type GiveawayRules } from "../lib/entry-rules";
import { drawWinners, newSeed } from "../lib/draw";
import { resolveWinners } from "../lib/winners";
import { giveawayErrorMessage } from "../lib/messages";

export type PullState = {
  running: boolean;
  fetched: number;
  /** Instagram asked to slow down; the pull stopped and can be continued. */
  paused: boolean;
  error: string | null;
};

const IDLE: PullState = { running: false, fetched: 0, paused: false, error: null };

/**
 * One giveaway: its comments (pulled in batches until Instagram has no more),
 * the rules being edited, the entries those rules leave, and the draw with its
 * winners. Every read and write goes through the giveaways data layer.
 */
export function useGiveawayDetail(giveawayId: string) {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const giveawayQuery = useQuery(giveawaysQueries.detail(brand.id, giveawayId));
  const commentsQuery = useQuery(giveawaysQueries.comments(brand.id, giveawayId));
  const winnersQuery = useQuery(giveawaysQueries.winners(brand.id, giveawayId));
  const connection = useQuery(giveawaysQueries.connection(brand.id)).data;
  const giveaway = giveawayQuery.data ?? null;

  const [draftRules, setDraftRules] = useState<GiveawayRules | null>(null);
  const rules = useMemo(
    () => draftRules ?? parseRules(giveaway?.rules),
    [draftRules, giveaway?.rules],
  );
  const patchRules = useCallback(
    (patch: Partial<GiveawayRules>) => setDraftRules({ ...rules, ...patch }),
    [rules],
  );

  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);
  const result = useMemo(
    () => buildEntries(comments, rules, connection?.instagram_username ?? undefined),
    [comments, rules, connection?.instagram_username],
  );

  const winnerRows = useMemo(() => winnersQuery.data ?? [], [winnersQuery.data]);
  const resolved = useMemo(() => resolveWinners(winnerRows, rules.winners), [winnerRows, rules]);

  // ── Pulling the comments ────────────────────────────────────────────────
  const [pull, setPull] = useState<PullState>(IDLE);
  const stopRef = useRef(false);
  useEffect(() => {
    stopRef.current = false;
    return () => {
      stopRef.current = true;
    };
  }, [giveawayId]);

  const startPull = useCallback(
    async (restart: boolean) => {
      stopRef.current = false;
      setPull({
        running: true,
        fetched: restart ? 0 : comments.length,
        paused: false,
        error: null,
      });
      let first = restart;
      try {
        for (;;) {
          const step = await pullComments(brand.id, giveawayId, first);
          first = false;
          if (stopRef.current) return;
          setPull((p) => ({ ...p, fetched: step.fetched }));
          if (step.done) break;
          if (step.rate_limited) {
            setPull((p) => ({ ...p, running: false, paused: true }));
            await invalidateGiveaways(qc, brand.id);
            return;
          }
        }
        setPull(IDLE);
        await invalidateGiveaways(qc, brand.id);
      } catch (error) {
        if (stopRef.current) return;
        const code = error instanceof GiveawayApiError ? error.code : "server_error";
        setPull({
          running: false,
          fetched: 0,
          paused: false,
          error: giveawayErrorMessage(code, isAr),
        });
        await invalidateGiveaways(qc, brand.id);
      }
    },
    [brand.id, giveawayId, comments.length, isAr, qc],
  );

  const stopPull = useCallback(() => {
    stopRef.current = true;
    setPull((p) => ({ ...p, running: false }));
    void invalidateGiveaways(qc, brand.id);
  }, [brand.id, qc]);

  // ── The draw ────────────────────────────────────────────────────────────
  const drawMutation = useMutation({
    mutationFn: async () => {
      const seed = newSeed();
      const picks = drawWinners(result.entries, seed, rules.winners, rules.backups);
      await saveDraw(brand.id, giveawayId, seed, rules, picks);
      return picks.length;
    },
    onSuccess: async (count) => {
      setDraftRules(null);
      await invalidateGiveaways(qc, brand.id);
      if (count < rules.winners) {
        toast.warning(
          isAr
            ? "عدد المشاركين المؤهلين أقل من عدد الفائزين المطلوب."
            : "There are fewer eligible entrants than winners.",
        );
      }
    },
    onError: () => toast.error(isAr ? "تعذر حفظ نتيجة السحب." : "Could not save the draw."),
  });

  const winnerMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WinnerPatch }) =>
      updateWinner(brand.id, id, patch),
    onSuccess: () => invalidateGiveaways(qc, brand.id),
    onError: () => toast.error(isAr ? "تعذر حفظ التغيير." : "Could not save the change."),
  });

  const saveRulesMutation = useMutation({
    mutationFn: () => saveGiveawayRules(brand.id, giveawayId, rules),
    onSuccess: async () => {
      setDraftRules(null);
      await invalidateGiveaways(qc, brand.id);
      toast.success(isAr ? "تم حفظ الشروط." : "Rules saved.");
    },
    onError: () => toast.error(isAr ? "تعذر حفظ الشروط." : "Could not save the rules."),
  });

  const hasDraw = giveaway?.status === "drawn" && winnerRows.length > 0;

  return {
    brand,
    isAr,
    giveaway,
    loading: giveawayQuery.isLoading || commentsQuery.isLoading,
    notFound: !giveawayQuery.isLoading && !giveaway,
    connection,
    rules,
    patchRules,
    rulesChanged: draftRules !== null,
    saveRules: () => saveRulesMutation.mutate(),
    savingRules: saveRulesMutation.isPending,
    comments,
    result,
    pull,
    startPull,
    stopPull,
    draw: () => drawMutation.mutate(),
    drawing: drawMutation.isPending,
    hasDraw,
    winnerRows,
    resolved,
    updateWinner: (id: string, patch: WinnerPatch) => winnerMutation.mutate({ id, patch }),
  };
}

export type GiveawayDetail = ReturnType<typeof useGiveawayDetail>;
