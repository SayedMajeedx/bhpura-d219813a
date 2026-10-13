import React from "react";
import { Users, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageCount, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CustomersCommandHeaderProps {
  lang: "en" | "ar";
  customerCount: number;
  onCreateNew: () => void;
  renderImporters?: React.ReactNode;
}

export const CustomersCommandHeader: React.FC<CustomersCommandHeaderProps> = ({
  lang,
  customerCount,
  onCreateNew,
  renderImporters,
}) => {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Users}
      headingProps={undefined}
      title={<>{isAr ? "العملاء وسجل المبيعات" : "Customers & CRM Database"}</>}
      badges={
        <>
          <AdminPageCount>
            {customerCount} {isAr ? "عميل" : "customers"}
          </AdminPageCount>
        </>
      }
      description={
        <>
          {isAr
            ? "إدارة قاعدة بيانات العملاء، تصنيفات الشرائح، وسجل الطلبات والمشتريات"
            : "Manage customer profiles, CRM segments, delivery addresses, and purchase history."}
        </>
      }
      actions={
        <>
          <Button
            onClick={onCreateNew}
            className="h-9 gap-1.5 px-3 text-xs font-bold shadow-2xs sm:px-3.5"
          >
            <Plus className="h-4 w-4" />
            {isAr ? "عميل جديد" : "New Customer"}
          </Button>

          {renderImporters && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-border-strong text-foreground hover:bg-muted"
                  aria-label={isAr ? "خيارات الاستيراد والهجرة" : "Import & Migration Options"}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={isAr ? "start" : "end"}
                className="w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border-strong p-1.5 shadow-xl [&_button]:h-auto [&_button]:min-h-9 [&_button]:w-full [&_button]:min-w-0 [&_button]:justify-start [&_button]:whitespace-normal [&_button]:text-start"
              >
                {renderImporters}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    />
  );
};
