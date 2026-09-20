import { MessageSquareText, Users } from "lucide-react";
import { GroupNavigator, type GroupDef } from "@/features/settings/GroupNavigator";
import { RecipientsGroup } from "./RecipientsGroup";
import { TemplatesGroup } from "./TemplatesGroup";

const GROUPS: GroupDef[] = [
  { id: "templates", icon: MessageSquareText, render: () => <TemplatesGroup /> },
  { id: "recipients", icon: Users, render: () => <RecipientsGroup /> },
];

export function NotificationsTab() {
  return <GroupNavigator tab="notifications" groups={GROUPS} />;
}
