/**
 * The questions a service asks the customer (its custom fields: a theme, the
 * number of guests…), asked in the booking's details step. The answers go
 * with the booking as notes, so the store reads them on the booking, its
 * order and the WhatsApp message. File fields are not asked here.
 */

type ServiceWithQuestions = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  custom_fields?: unknown;
};

export type BookingQuestion = {
  /** `${serviceId}:${fieldKey}`: unique across the chosen services. */
  id: string;
  serviceName: string;
  label: string;
  type: "text" | "number" | "select";
  options: string[];
  required: boolean;
};

export function bookingQuestions(
  chosen: readonly ServiceWithQuestions[],
  isAr: boolean,
): BookingQuestion[] {
  const questions: BookingQuestion[] = [];
  for (const service of chosen) {
    if (!Array.isArray(service.custom_fields)) continue;
    const serviceName =
      (isAr ? service.name_ar || service.name_en : service.name_en || service.name_ar) ||
      service.name;
    for (const raw of service.custom_fields) {
      if (!raw || typeof raw !== "object") continue;
      const field = raw as Record<string, unknown>;
      const type = field.type;
      if (type !== "text" && type !== "number" && type !== "select") continue;
      const key = typeof field.key === "string" ? field.key : "";
      const labelAr = typeof field.label_ar === "string" ? field.label_ar : "";
      const labelEn = typeof field.label_en === "string" ? field.label_en : "";
      const label = (isAr ? labelAr || labelEn : labelEn || labelAr).trim();
      if (!key || !label) continue;
      questions.push({
        id: `${service.id}:${key}`,
        serviceName,
        label,
        type,
        options: Array.isArray(field.options)
          ? field.options.filter((option): option is string => typeof option === "string")
          : [],
        required: field.required === true,
      });
    }
  }
  return questions;
}

/** The first required question still unanswered, or null. */
export function unansweredQuestion(
  questions: readonly BookingQuestion[],
  answers: Readonly<Record<string, string>>,
): BookingQuestion | null {
  return questions.find((q) => q.required && !(answers[q.id] ?? "").trim()) ?? null;
}

/** The answered questions as "label: answer" lines, under each service's name when there are several. */
export function answersText(
  questions: readonly BookingQuestion[],
  answers: Readonly<Record<string, string>>,
): string {
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim());
  const services = new Set(answered.map((q) => q.serviceName));
  return answered
    .map((q) => {
      const line = `${q.label}: ${answers[q.id].trim()}`;
      return services.size > 1 ? `${q.serviceName} · ${line}` : line;
    })
    .join("\n");
}

/** The booking's notes: the customer's own, then the answers. */
export function notesWithAnswers(
  notes: string,
  questions: readonly BookingQuestion[],
  answers: Readonly<Record<string, string>>,
): string {
  return [notes.trim(), answersText(questions, answers)].filter(Boolean).join("\n\n");
}
