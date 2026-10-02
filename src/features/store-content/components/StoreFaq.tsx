import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { storeContentQueries } from "@/lib/data/store-content";
import { faqText, groupFaqs } from "@/lib/store-content";

/** The store's questions, grouped under their headings. Nothing when there are none. */
export function StoreFaq({ brandId, isAr }: { brandId: string; isAr: boolean }) {
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
      {groups.map((group) => (
        <div key={group.key} className="space-y-1">
          {group.title && (
            <h3 className="text-sm font-semibold text-muted-foreground">{group.title}</h3>
          )}
          <Accordion type="multiple" className="rounded-2xl border border-border bg-card px-4">
            {group.items.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger>{faqText(item, "question", isAr)}</AccordionTrigger>
                <AccordionContent className="whitespace-pre-line text-muted-foreground">
                  {faqText(item, "answer", isAr)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </section>
  );
}
