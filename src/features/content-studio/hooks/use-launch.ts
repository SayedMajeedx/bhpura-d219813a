import { useMemo, useState } from "react";
import type { SceneData } from "@/features/content-studio/engine/scene";
import { deadlineParts, defaultDeadline, launchTime } from "@/features/content-studio/lib/moments";

/**
 * Coming Soon's choices: the launch day (or none yet), an hour if the
 * merchant gives one, and whether the piece's name stays a secret (it does
 * until they say otherwise: a teaser holds it back).
 */
export function useLaunch({ active, isAr }: { active: boolean; isAr: boolean }) {
  const lang = isAr ? "ar" : "en";
  const [launchDay, setLaunchDay] = useState(() => defaultDeadline(new Date()));
  const [launchDated, setLaunchDated] = useState(true);
  const [launchHour, setLaunchHour] = useState("");
  const [launchSecret, setLaunchSecret] = useState(true);

  const launch = useMemo<SceneData["launch"]>(() => {
    if (!active) return null;
    const when = launchDated ? deadlineParts(launchDay, lang) : null;
    return { when, time: when ? launchTime(launchHour, lang) : null, secret: launchSecret };
  }, [active, launchDated, launchDay, launchHour, launchSecret, lang]);

  return {
    launchDay,
    setLaunchDay,
    launchDated,
    setLaunchDated,
    launchHour,
    setLaunchHour,
    launchSecret,
    setLaunchSecret,
    launch,
  };
}
