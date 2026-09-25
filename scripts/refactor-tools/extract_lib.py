import sys
import re

import os
ROUTE = os.environ.get("ROUTE", "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx")
FUNC = os.environ.get("FUNC", "function OrderDetail() {")
RET_AFTER = os.environ.get("RET_AFTER", "const handleDirectOrderStatusChange")
ANCHOR = os.environ.get("ANCHOR", 'import { ProductSearchDialog } from "@/features/orders/components/ProductSearchDialog";')
C = os.environ.get("COMP_DIR", "src/features/orders/components/")
s = open(ROUTE, encoding="utf-8").read()
L = s.split("\n")
end_imports = next(i for i, l in enumerate(L) if l.startswith(("type ", "export const Route", "function ", "const ")))
IMPORTS = "\n".join(L[:end_imports]).rstrip()

EXTRA_IMPORTS = '''import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";'''

if os.environ.get("EXTRA_IMPORTS_FILE"):
    EXTRA_IMPORTS = open(os.environ["EXTRA_IMPORTS_FILE"], encoding="utf-8").read().rstrip()

B = "Dispatch<SetStateAction<boolean>>"
Q = lambda n: f'OrderDetailData["{n}"]'
BR = lambda n: f'ReturnType<typeof useBenefitReview>["{n}"]'
TYPES = {
    # data
    **{n: Q(n) for n in ["addressesQ", "branchesQ", "couriersQ", "customersQ", "settingsQ", "productsQ",
                          "variantsQ", "customQ", "bomItemsQ", "packagingMaterialsQ", "receiptViewQ", "orderQ"]},
    "customerPassportQ": "ReturnType<typeof useCustomerFitPassport>",
    **{n: BR(n) for n in ["approveBenefitPayment", "approvingBenefit", "rejectBenefitPayment", "rejectReason",
                           "rejectReasonOpen", "rejectingBenefit", "setRejectReason", "setRejectReasonOpen"]},
    # page state
    "id": "string",
    "isAdmin": "boolean",
    "isCreationMode": "boolean",
    "isReadOnly": "boolean",
    "items": "OrderItem[]",
    "setItems": "Dispatch<SetStateAction<OrderItem[]>>",
    "order": "Order",
    "setOrder": "Dispatch<SetStateAction<Order | null>>",
    "lang": 'ReturnType<typeof useI18n>["lang"]',
    "t": "ReturnType<typeof useT>",
    "currency": "string",
    "storeProfile": 'ReturnType<typeof useAdminStoreProfile>["profile"]',
    "vocabulary": 'ReturnType<typeof useVocabulary>["vocabulary"]',
    "addonDefaults": "ReturnType<typeof variantAxisDefaultsFrom>",
    "customerPickerOpen": "boolean",
    "setCustomerPickerOpen": B,
    "customerSearchQuery": "string",
    "setCustomerSearchQuery": "Dispatch<SetStateAction<string>>",
    "filteredCustomers": 'NonNullable<OrderDetailData["customersQ"]["data"]>',
    "assignCourier": "(courierId: string) => Promise<unknown>",
    "setNewCustomerOpen": B,
    "setWaModalOpen": B,
    "setProductSearchOpen": B,
    "scannerOpen": "boolean",
    "setScannerOpen": B,
    "cameraStreamPromise": "Promise<MediaStream> | null",
    "handleScanned": "(code: string) => void",
    "openBarcodeScanner": "() => void",
    "addItem": "() => void",
    "updateItem": "(idx: number, patch: Partial<OrderItem>) => void",
    "pickVariant": "(idx: number, variantId: string) => void",
    "toggleCustom": "(idx: number, c: { name: string; price_delta: number }) => void",
    "editingItemSheetIdx": "number | null",
    "setEditingItemSheetIdx": "Dispatch<SetStateAction<number | null>>",
    "editingItems": "Record<number, boolean>",
    "mobileTab": '"items" | "customer" | "activity"',
    "appliedPromo": "{ code: string; id: string; amount: number } | null",
    "applyAdminPromo": "() => Promise<unknown>",
    "removeAdminPromo": "() => void",
    "checkingPromo": "boolean",
    "promoInput": "string",
    "setPromoInput": "Dispatch<SetStateAction<string>>",
    "discountMode": '"fixed" | "percent"',
    "setDiscountMode": 'Dispatch<SetStateAction<"fixed" | "percent">>',
    "discountPercentInput": "string",
    "setDiscountPercentInput": "Dispatch<SetStateAction<string>>",
    "lastNonZeroTaxRate": "number",
    "setLastNonZeroTaxRate": "Dispatch<SetStateAction<number>>",
    "isEditingFees": "boolean",
    "setIsEditingFees": B,
    "setManagePaymentOpen": B,
    "paymentBadge": "PaymentBadge",
    "totals": "ReturnType<typeof orderTotals>",
    "setMobileTab": 'Dispatch<SetStateAction<"items" | "customer" | "activity">>',
    "activeSection": "string",
    "scrollToSection": "(id: string) => void",
    "isDirty": "boolean",
    "saving": "boolean",
    "save": "() => Promise<unknown>",
    "hasSavedDraft": "boolean",
    "invoicePreviewOpen": "boolean",
    "setInvoicePreviewOpen": B,
    "brand": "ReturnType<typeof useBrand>",
    "slug": "string",
    "printReceipt": "() => void",
    "copyLink": "() => Promise<void>",
    "handlePrintA4": "() => Promise<void>",
    "editingUnlocked": "boolean",
    "setEditingUnlocked": B,
    "canUnlockEditing": "boolean",
    "cancelEditing": "() => void",
    "isCourier": "boolean",
    "isClosedOrder": "boolean",
    "serverOrder": "Order",
    "router": "ReturnType<typeof useRouter>",
    "qc": "ReturnType<typeof useQueryClient>",
    "brandId": "string",
    "initialSnapshotRef": "React.MutableRefObject<{ order: Order; items: OrderItem[] } | null>",
    "setSaving": B,
    "setHasSavedDraft": B,
    "managePaymentOpen": "boolean",
    "setAppliedPromo": "Dispatch<SetStateAction<{ code: string; id: string; amount: number } | null>>",
    "setCheckingPromo": B,
    "promoContextRef": "React.MutableRefObject<string | null>",
    # item loop locals
    "it": "OrderItem",
    "idx": "number",
    "variant": "any",
    "product": "any",
    "isAr": "boolean",
    "imageUrl": "string | null",
    "sku": "string | undefined",
    "mainStock": "number",
    "incStock": "number",
    "getMediaUrl": "(obj: any) => string | null",
}

if os.environ.get("TYPES_JSON"):
    import json as _json
    TYPES.update(_json.load(open(os.environ["TYPES_JSON"], encoding="utf-8")))


def scope_names():
    A = s.index(FUNC)
    ret = s.index("\n  return (\n", s.index(RET_AFTER))
    pre = s[A:ret]
    decl = set()
    for m in re.finditer(r"^  const (\w+)\s*[=:]", pre, re.M):
        decl.add(m.group(1))
    for m in re.finditer(r"^  const \[(\w+),\s*(\w+)\]", pre, re.M):
        decl.update(m.groups())
    for m in re.finditer(r"^  const \[(\w+)\]", pre, re.M):
        decl.add(m.group(1))
    for m in re.finditer(r"^  const \{([^}]*)\}\s*=", pre, re.M | re.S):
        for part in m.group(1).split(","):
            part = part.strip()
            if part:
                decl.add(part.split(":")[-1].strip())
    return decl


def used(text, names):
    # Skip matches inside strings/paths such as ["orders", id] or "/orders/".
    return [n for n in sorted(names) if re.search(r"(?<![\w.\"'/-])" + re.escape(n) + r"\b(?![\"'/-])", text)]


def reindent(text, n):
    pad = " " * n
    return "\n".join(l[n:] if l.startswith(pad) else l for l in text.rstrip("\n").split("\n"))


def write_component(name, doc, names, prelude, jsx):
    missing = [n for n in names if n not in TYPES]
    assert not missing, (name, missing)
    props = ",\n".join("  " + n for n in names)
    types = "\n".join(f"  {n}: {TYPES[n]};" for n in names)
    open(C + name + ".tsx", "w", encoding="utf-8", newline="").write(
        IMPORTS + "\n" + EXTRA_IMPORTS + "\n\n"
        + f"/** {doc} */\nexport function {name}({{\n{props},\n}}: {{\n{types}\n}}) {{\n"
        + prelude + "  return (\n" + jsx + "\n  );\n}\n"
    )


def usage(name, names, indent, extra=""):
    pad = " " * indent
    attrs = "".join(f"\n{pad}  {n}={{{n}}}" for n in names)
    return f"{pad}<{name}{extra}{attrs}\n{pad}/>\n"




def extract(start_marker, end_marker, name, doc, indent, route_indent):
    """Move the JSX from start_marker to the line-anchored end_marker into a component."""
    global s
    i = s.index(start_marker)
    j = s.index("\n" + end_marker, i) + 1 + len(end_marker)
    jsx = s[i:j]
    names = used(jsx, scope_names())
    write_component(name, doc, names, "", reindent(jsx, indent))
    s = s[:i] + usage(name, names, route_indent) + s[j:]
    print(name, names)


if __name__ == "__main__":
    import json
    specs = json.load(open(sys.argv[1], encoding="utf-8"))
    for spec in specs:
        extract(**spec)
    anchor = ANCHOR
    assert s.count(anchor) == 1
    s = s.replace(anchor, anchor + "".join(
        f'\nimport {{ {spec["name"]} }} from "@/features/orders/components/{spec["name"]}";' for spec in specs))
    open(ROUTE, "w", encoding="utf-8", newline="").write(s)
    print("ok")
