import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.$id.tsx", "utf8");
const header = readFileSync("src/components/orders/OrderUnifiedHeader.tsx", "utf8");

describe("existing order safe view mode", () => {
  it("locks every existing order until editing is explicitly enabled", () => {
    expect(detail).toContain("const isReadOnly = !isCreationMode && !editingUnlocked");
    expect(detail).toContain("<fieldset");
    expect(detail).toContain("disabled={isReadOnly}");
  });

  it("keeps closed-order editing restricted and explains the safe state", () => {
    expect(detail).toContain("!isCourier && (isAdmin || !isClosedOrder)");
    expect(detail).toContain("isCreationMode || !order || isReadOnly");
    expect(header).toContain('isAr ? "تعديل الطلب" : "Edit Order"');
    expect(header).toContain("safe view mode");
    expect(header).toContain("disabled={isReadOnly || !onOpenPaymentModal}");
    expect(header).toContain("disabled={isReadOnly || !onUpdateOrderStatus}");
    expect(header).toContain('isAr ? "إلغاء التعديل" : "Cancel Editing"');
    expect(header).toContain('className="flex sm:hidden"');
    expect(header).toContain('className="w-full min-h-11 font-bold rounded-xl"');
    expect(header).toContain("You have unsaved changes. Leave this order and discard them?");
    expect(detail).toContain("const cancelEditing = () =>");
    expect(detail).toContain("setEditingUnlocked(false)");
    expect(detail).toContain("if (isDirty && !isReadOnly && !saving)");
    expect(detail).not.toContain("isDirty && !hasSavedDraft && !isReadOnly");
  });
});
