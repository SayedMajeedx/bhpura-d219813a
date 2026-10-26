import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { storeContentQueries } from "@/lib/data/store-content";
import { faqText, groupFaqs, type FaqItem } from "@/lib/store-content";
import { countOf } from "@/lib/arabic-count";

function Questions({ items, isAr }: { items: readonly FaqItem[]; isAr: boolean }) {
  return (
    <Accordion type="multiple" className="px-1">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} className="last:border-b-0">
          <AccordionTrigger>{faqText(item, "question", isAr)}</AccordionTrigger>
          <AccordionContent className="whitespace-pre-line text-muted-foreground">
            {faqText(item, "answer", isAr)}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/**
 * The store's questions, grouped under their headings. Nothing when there are none. `folded`
 * (the booking page) shows one row per group, each opening onto its questions, so a long list
 * does not push the booking form's button a screen and a half away.
 */
export function StoreFaq({
  brandId,
  isAr,
  folded = false,
}: {
  brandId: string;
  isAr: boolean;
  folded?: boolean;
}) {
  const items = useQuery(storeContentQueries.publicFaq(brandId)).data;
  const groups = groupFaqs(items ?? [], isAr).filter((group) =>
    group.items.some((item) => faqText(item, "answer", isAr)),
  );
  if (groups.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="store-faq-title">
      <h2 id="store-faq-title" className="font-display text-xl font-semibold text-foreground">
        {isAr ? "الأسئلة الشائعة" : "Frequently asked questions"}
      </h2>
      {folded ? (
        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border border-border bg-card px-4"
        >
          {groups.map((group) => (
            <AccordionItem key={group.key} value={group.key || "questions"}>
              <AccordionTrigger className="text-base font-semibold">
                <span className="flex min-w-0 items-baseline gap-2">
                  {group.title || (isAr ? "أسئلة" : "Questions")}
                  <span className="text-xs font-normal text-muted-foreground">
                    {countOf(group.items.length, "question", isAr ? "ar" : "en")}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Questions items={group.items} isAr={isAr} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="space-y-1">
            {group.title && (
              <h3 className="text-sm font-semibold text-muted-foreground">{group.title}</h3>
            )}
            <div className="rounded-2xl border border-border bg-card px-4">
              <Questions items={group.items} isAr={isAr} />
            </div>
          </div>
        ))
      )}
    </section>
  );
}
