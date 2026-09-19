import { RecipientsGroup } from "./RecipientsGroup";
import { TemplatesGroup } from "./TemplatesGroup";

export function NotificationsTab() {
  return (
    <div className="space-y-8">
      <section id="group-recipients" aria-label="Team Recipients">
        <RecipientsGroup />
      </section>

      <section id="group-templates" aria-label="Notification Templates">
        <TemplatesGroup />
      </section>
    </div>
  );
}
