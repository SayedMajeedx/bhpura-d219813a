import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  invalidateMessageTemplates,
  messageTemplatesQueries,
  updateMessageTemplate,
} from "@/lib/data/message-templates";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { ordersQueries } from "@/lib/data/orders";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { customersQueries } from "@/lib/data/customers";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { buildCustomerCrmStats } from "@/lib/commerce-metrics";

import { getCurrentUser } from "@/lib/auth/session";
import {
  isMobileBrowser,
  CHANNEL,
  DEFAULT_EN,
  DEFAULT_AR,
} from "@/features/campaigns/lib/campaign-shared";
import {
  campaignCsv,
  campaignMessage,
  eligibilityOf,
  eligibleAmong,
  filterAudience,
  segmentCountsOf,
  selectedRecipients,
  whatsappChatUrl,
} from "@/features/campaigns/lib/campaign-audience";
import { saveCsvFile } from "@/features/campaigns/lib/save-csv-file";
import type {
  Customer,
  BulkStatus,
  CampaignSegment,
} from "@/features/campaigns/lib/campaign-shared";
import { confirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Everything the WhatsApp campaigns page holds: the message and its saved templates, the audience
 * and who is ticked, and the bulk sender (guided, or automatic with a pause between chats).
 */
export function useCampaignsPage(segment: CampaignSegment) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const brand = useBrand();
  const brandId = brand.id;

  const [selectedSegment, setSelectedSegment] = useState<CampaignSegment>(segment || "All");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  useEffect(() => {
    if (segment) {
      setSelectedSegment(segment);
    }
  }, [segment]);

  const [message, setMessage] = useState(isAr ? DEFAULT_AR : DEFAULT_EN);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMode, setSaveMode] = useState<"new" | "update">("new");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Bulk campaign states
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"guided" | "auto">("guided");
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkDelay, setBulkDelay] = useState(2500); // milliseconds
  const [bulkQueue, setBulkQueue] = useState<Customer[]>([]);
  const [bulkSent, setBulkSent] = useState<Record<string, BulkStatus>>({});
  const bulkWindowRef = useRef<Window | null>(null);

  const templatesQ = useQuery(messageTemplatesQueries.channel(brandId, CHANNEL));

  const customersQ = useQuery(customersQueries.audience(brandId));

  const ordersQ = useQuery(ordersQueries.customerMetrics(brandId));

  const customerCrmStats = useMemo(() => buildCustomerCrmStats(ordersQ.data ?? []), [ordersQ.data]);

  const businessQ = useQuery(businessSettingsQueries.detail(brandId));
  const businessName = businessQ.data?.business_name ?? "";

  const onSelectTemplate = (id: string) => {
    setSelectedId(id);
    const tpl = (templatesQ.data ?? []).find((t) => t.id === id);
    if (tpl) setMessage(tpl.body);
  };

  const openSave = (mode: "new" | "update") => {
    const current = (templatesQ.data ?? []).find((t) => t.id === selectedId);
    if (mode === "update" && !current) {
      toast.error(isAr ? "اختر قالبًا لتحديثه" : "Select a template to update");
      return;
    }
    setSaveMode(mode);
    setSaveName(mode === "update" && current ? current.name : "");
    setSaveOpen(true);
  };

  const saveTemplate = async () => {
    const name = saveName.trim();
    if (!name) return toast.error(isAr ? "أدخل اسم القالب" : "Enter a template name");
    if (!message.trim()) return toast.error(isAr ? "الرسالة فارغة" : "Message is empty");
    const user = await getCurrentUser();
    if (!user) return;

    try {
      if (saveMode === "update" && selectedId) {
        await updateMessageTemplate(brandId, selectedId, { name, body: message });
      } else {
        const id = await createMessageTemplate(brandId, {
          name,
          body: message,
          channel: CHANNEL,
          user_id: user.id,
        });
        setSelectedId(id);
      }
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    toast.success(isAr ? "تم الحفظ" : "Saved");
    setSaveOpen(false);
    void invalidateMessageTemplates(qc, brandId);
  };

  const deleteTemplate = async () => {
    const tpl = selectedId ? (templatesQ.data ?? []).find((t) => t.id === selectedId) : undefined;
    if (!tpl || !selectedId) return;
    const title = isAr ? `حذف قالب "${tpl.name}"؟` : `Delete template "${tpl.name}"?`;
    if (!(await confirmDialog({ title, destructive: true }))) return;
    try {
      await deleteMessageTemplate(brandId, selectedId);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    toast.success(isAr ? "تم الحذف" : "Deleted");
    setSelectedId("");
    void invalidateMessageTemplates(qc, brandId);
  };

  const insertPlaceholder = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage((m) => m + token);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const filtered = useMemo(
    () =>
      filterAudience(customersQ.data ?? [], customerCrmStats, {
        search,
        segment: selectedSegment,
      }),
    [customersQ.data, search, selectedSegment, customerCrmStats],
  );

  const segmentCounts = useMemo(
    () => segmentCountsOf(customersQ.data ?? [], customerCrmStats),
    [customersQ.data, customerCrmStats],
  );

  const eligibleSelectedCount = useMemo(
    () => selectedRecipients(filtered, selectedCustomerIds, customerCrmStats).length,
    [filtered, selectedCustomerIds, customerCrmStats],
  );

  // Pre-populate checkboxes on segment/filter change: only fully eligible contacts
  useEffect(() => {
    const validIds = eligibleAmong(filtered, customerCrmStats).map((c) => c.id);
    setSelectedCustomerIds(validIds);
  }, [filtered, customerCrmStats]);

  const toggleSelectAll = () => {
    const validFiltered = eligibleAmong(filtered, customerCrmStats);
    const allSelected =
      validFiltered.length > 0 && validFiltered.every((c) => selectedCustomerIds.includes(c.id));
    if (allSelected) {
      setSelectedCustomerIds((prev) =>
        prev.filter((id) => !validFiltered.some((c) => c.id === id)),
      );
    } else {
      setSelectedCustomerIds((prev) => {
        const next = [...prev];
        validFiltered.forEach((c) => {
          if (!next.includes(c.id)) next.push(c.id);
        });
        return next;
      });
    }
  };

  const toggleSelectCustomer = (c: Customer) => {
    const eligibility = eligibilityOf(c, customerCrmStats);
    if (!eligibility.eligible) {
      toast.error(
        isAr
          ? eligibility.reason_ar || "العميل غير مؤهل للتسويق"
          : eligibility.reason || "Customer not eligible for marketing",
      );
      return;
    }
    setSelectedCustomerIds((prev) =>
      prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
    );
  };

  const buildMessage = useCallback(
    (customerName: string) => campaignMessage(message, customerName, businessName),
    [businessName, message],
  );

  const buildWhatsAppUrl = useCallback(
    (customer: Customer) => whatsappChatUrl(customer, buildMessage(customer.name)),
    [buildMessage],
  );

  const send = (c: Customer) => {
    const eligibility = eligibilityOf(c, customerCrmStats);
    if (!eligibility.eligible) {
      toast.error(
        isAr
          ? eligibility.reason_ar || "العميل غير مؤهل للتسويق"
          : eligibility.reason || "Customer not eligible for marketing",
      );
      return;
    }
    const phone = c.phone!.replace(/[^\d]/g, "");
    // Encode string payloads explicitly with encodeURIComponent for robust formatting
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(c.name))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSent((s) => ({ ...s, [c.id]: true }));
  };

  // Launch bulk campaign wizard modal pre-population
  const launchBulkCampaign = () => {
    const list = selectedRecipients(filtered, selectedCustomerIds, customerCrmStats);
    if (list.length === 0) {
      toast.error(
        isAr
          ? "لا يوجد عملاء مؤهلون للتسويق ضمن التحديد الحالي"
          : "No eligible marketing recipients found in selection",
      );
      return;
    }
    setBulkQueue(list);
    const initialSent: Record<string, BulkStatus> = {};
    list.forEach((c) => {
      initialSent[c.id] = "queued";
    });
    setBulkSent(initialSent);
    setBulkIndex(0);
    setBulkActive(false);
    setBulkOpen(true);
  };

  const markBulkRecipientOpened = (customer: Customer, index: number) => {
    setBulkSent((prev) => ({ ...prev, [customer.id]: "sent" }));
    setSent((prev) => ({ ...prev, [customer.id]: true }));
    setBulkIndex(index + 1);
  };

  // The first WhatsApp URL must be opened synchronously from the user's tap.
  // Opening about:blank first leaves mobile browsers hidden before the delayed
  // redirect runs, which prevents the WhatsApp app handoff.
  const handleStartAutomated = () => {
    const idx = bulkIndex;
    const customer = bulkQueue[idx];
    if (!customer) return;

    const url = buildWhatsAppUrl(customer);
    if (!url) {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
      setBulkIndex(idx + 1);
      setBulkActive(true);
      return;
    }

    setBulkSent((prev) => ({ ...prev, [customer.id]: "sending" }));

    if (isMobileBrowser()) {
      // A direct URL from the tap (rather than a delayed about:blank redirect)
      // allows iOS and Android to hand off to the native WhatsApp app.
      markBulkRecipientOpened(customer, idx);
      setBulkActive(true);
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const win = window.open(url, "whatsapp_campaign_window");
    if (!win) {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
      toast.error(
        isAr ? "اسمح بالنوافذ المنبثقة لبدء الحملة" : "Allow popups to start the campaign",
      );
      return;
    }

    bulkWindowRef.current = win;
    markBulkRecipientOpened(customer, idx);
    setBulkActive(true);
  };

  // Export selected segments to a CSV format compatible with free Chrome/browser bulk-sender extensions
  const exportBulkCampaignCsv = () => {
    const list = selectedRecipients(filtered, selectedCustomerIds, customerCrmStats);
    if (list.length === 0) {
      toast.error(
        isAr
          ? "لا يوجد عملاء مؤهلون للتسويق ضمن التحديد الحالي"
          : "No eligible marketing recipients found in selection",
      );
      return;
    }

    saveCsvFile(`whatsapp_campaign_${brandId}.csv`, campaignCsv(list, buildMessage));
    toast.success(isAr ? "تم تصدير ملف CSV بنجاح!" : "Campaign CSV exported successfully!");
  };

  // Keep references updated for the asynchronous recursion timers
  const activeRef = useRef(bulkActive);
  const indexRef = useRef(bulkIndex);
  const queueRef = useRef(bulkQueue);
  const modeRef = useRef(bulkMode);
  const delayRef = useRef(bulkDelay);

  useEffect(() => {
    activeRef.current = bulkActive;
  }, [bulkActive]);
  useEffect(() => {
    indexRef.current = bulkIndex;
  }, [bulkIndex]);
  useEffect(() => {
    queueRef.current = bulkQueue;
  }, [bulkQueue]);
  useEffect(() => {
    modeRef.current = bulkMode;
  }, [bulkMode]);
  useEffect(() => {
    delayRef.current = bulkDelay;
  }, [bulkDelay]);

  // Throttling-resistant recursive campaign queue handler
  useEffect(() => {
    if (!bulkActive || bulkMode !== "auto") return;

    let timeoutId: any = null;

    const runNext = () => {
      if (!activeRef.current) return;

      // Browser background sleep resistance: delay if tab is hidden
      if (document.visibilityState === "hidden") {
        timeoutId = setTimeout(runNext, 1000);
        return;
      }

      const idx = indexRef.current;
      const q = queueRef.current;

      if (idx >= q.length) {
        setBulkActive(false);
        toast.success(
          isAr ? "تم إكمال الحملة التلقائية بنجاح!" : "Automated campaign completed successfully!",
        );
        return;
      }

      const customer = q[idx];
      const eligibility = eligibilityOf(customer, customerCrmStats);
      if (!eligibility.eligible) {
        setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
        const nextIdx = idx + 1;
        setBulkIndex(nextIdx);
        if (nextIdx < q.length) {
          timeoutId = setTimeout(runNext, delayRef.current);
        } else {
          setBulkActive(false);
          toast.success(
            isAr
              ? "تم إكمال الحملة التلقائية بنجاح!"
              : "Automated campaign completed successfully!",
          );
        }
        return;
      }

      setBulkSent((prev) => ({ ...prev, [customer.id]: "sending" }));

      const url = buildWhatsAppUrl(customer);
      if (url) {
        try {
          // Re-use dedicated workspace tab to bypass standard browser popup blocker policies
          if (bulkWindowRef.current && !bulkWindowRef.current.closed) {
            bulkWindowRef.current.location.href = url;
          } else if (!isMobileBrowser()) {
            bulkWindowRef.current = window.open(url, "whatsapp_campaign_window");
          } else {
            setBulkActive(false);
            setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
            toast.info(
              isAr ? "اضغط استئناف لفتح المحادثة التالية" : "Tap Resume to open the next chat",
            );
            return;
          }
        } catch (_err) {
          setBulkActive(false);
          setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
          toast.error(isAr ? "تعذر فتح واتساب" : "Could not open WhatsApp");
          return;
        }

        setBulkSent((prev) => ({ ...prev, [customer.id]: "sent" }));
        setSent((prev) => ({ ...prev, [customer.id]: true }));
      } else {
        setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
      }

      const nextIdx = idx + 1;
      setBulkIndex(nextIdx);

      if (nextIdx < q.length) {
        timeoutId = setTimeout(runNext, delayRef.current);
      } else {
        setBulkActive(false);
        toast.success(
          isAr ? "تم إكمال الحملة التلقائية بنجاح!" : "Automated campaign completed successfully!",
        );
      }
    };

    timeoutId = setTimeout(runNext, delayRef.current);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    // Intentionally omitted 'customerCrmStats': stats lookup is read on-demand per queued customer to avoid restarting the active campaign queue when stats refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkActive, bulkMode, buildWhatsAppUrl, isAr]);

  // Handle visibility change tab resumes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && bulkActive && bulkMode === "auto") {
        // Queue loop self-corrects and continues running instantly
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [bulkActive, bulkMode]);

  // Send next customer in step-by-step guided mode
  const sendGuidedNext = () => {
    const idx = bulkIndex;
    const q = bulkQueue;
    if (idx >= q.length) {
      toast.success(isAr ? "تم إرسال كافة الرسائل!" : "All messages processed!");
      return;
    }
    const customer = q[idx];
    const eligibility = eligibilityOf(customer, customerCrmStats);
    if (!eligibility.eligible) {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
      setBulkIndex((prev) => prev + 1);
      toast.error(
        isAr
          ? eligibility.reason_ar || "العميل غير مؤهل للتسويق"
          : eligibility.reason || "Customer not eligible for marketing",
      );
      return;
    }

    setBulkSent((prev) => ({ ...prev, [customer.id]: "sending" }));

    const url = buildWhatsAppUrl(customer);
    if (url) {
      if (isMobileBrowser()) {
        markBulkRecipientOpened(customer, idx);
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      try {
        if (bulkWindowRef.current && !bulkWindowRef.current.closed) {
          bulkWindowRef.current.location.href = url;
          try {
            bulkWindowRef.current.focus();
          } catch {
            // Browsers may refuse to focus another window; navigation already happened.
          }
        } else {
          const win = window.open(url, "whatsapp_campaign_window");
          if (!win) {
            setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
            toast.error(
              isAr ? "اسمح بالنوافذ المنبثقة أو حاول مجددًا" : "Allow popups or try again",
            );
            return;
          }
          bulkWindowRef.current = win;
        }
      } catch (_err) {
        setBulkSent((prev) => ({ ...prev, [customer.id]: "queued" }));
        toast.error(isAr ? "تعذر فتح واتساب" : "Could not open WhatsApp");
        return;
      }

      setBulkSent((prev) => ({ ...prev, [customer.id]: "sent" }));
      setSent((prev) => ({ ...prev, [customer.id]: true }));
    } else {
      setBulkSent((prev) => ({ ...prev, [customer.id]: "skipped" }));
    }

    setBulkIndex((prev) => prev + 1);
  };

  const templates = templatesQ.data ?? [];
  const placeholders: { label: string; token: string }[] = [
    { label: isAr ? "اسم العميل" : "Customer name", token: "{{customer_name}}" },
    { label: isAr ? "اسم النشاط" : "Business name", token: "{{business_name}}" },
  ];

  return {
    isAr,
    message,
    setMessage,
    selectedId,
    textareaRef,
    onSelectTemplate,
    openSave,
    deleteTemplate,
    insertPlaceholder,
    filtered,
    buildMessage,
    templates,
    placeholders,
    selectedCustomerIds,
    search,
    setSearch,
    sent,
    setSent,
    customerCrmStats,
    eligibleSelectedCount,
    toggleSelectAll,
    toggleSelectCustomer,
    send,
    launchBulkCampaign,
    exportBulkCampaignCsv,
    saveOpen,
    setSaveOpen,
    saveName,
    setSaveName,
    saveMode,
    saveTemplate,
    bulkOpen,
    setBulkOpen,
    bulkMode,
    setBulkMode,
    bulkActive,
    setBulkActive,
    bulkIndex,
    setBulkIndex,
    bulkDelay,
    setBulkDelay,
    bulkQueue,
    bulkSent,
    setBulkSent,
    handleStartAutomated,
    sendGuidedNext,
    brand,
    selectedSegment,
    setSelectedSegment,
    setBulkQueue,
    customersQ,
    segmentCounts,
  };
}

export type CampaignsPageState = ReturnType<typeof useCampaignsPage>;
