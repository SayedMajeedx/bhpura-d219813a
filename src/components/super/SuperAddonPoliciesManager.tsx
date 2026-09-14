import * as React from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPlatformAddonPolicies,
  updatePlatformAddonPolicy,
} from "@/lib/addons/addons.functions";
import { getAllAddons, type AddonManifest } from "@/lib/addons/addon-registry";
import type { PlatformAddonPolicy } from "@/lib/addons/addon-types";
import { STORE_VERTICALS, VERTICAL_LABELS } from "@/lib/store-profile";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Puzzle, Shield, Edit2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SuperAddonPoliciesManager() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const manifests = React.useMemo(() => getAllAddons(), []);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["addons", "policies"],
    queryFn: async () => {
      return (await listPlatformAddonPolicies()) as PlatformAddonPolicy[];
    },
  });

  const [editingPolicy, setEditingPolicy] = useState<{
    addonId: string;
    availability: "public" | "beta" | "internal" | "deprecated";
    entitlementKey: string;
    defaultForActivities: string[];
  } | null>(null);

  const policyMap = React.useMemo(() => {
    const map = new Map<string, PlatformAddonPolicy>();
    for (const p of policies) {
      map.set(p.addon_id, p);
    }
    return map;
  }, [policies]);

  const updateMut = useMutation({
    mutationFn: async (input: {
      addonId: string;
      availability: "public" | "beta" | "internal" | "deprecated";
      entitlementKey: string | null;
      defaultForActivities: string[];
    }) => {
      return await updatePlatformAddonPolicy({
        data: {
          addonId: input.addonId,
          availability: input.availability,
          entitlementKey: input.entitlementKey || null,
          defaultForActivities: input.defaultForActivities,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addons", "policies"] });
      toast.success(isAr ? "تم تحديث سياسة الإضافة بنجاح" : "Add-on policy updated successfully");
      setEditingPolicy(null);
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "فشل تحديث السياسة" : "Failed to update policy"));
    },
  });

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs">
          {isAr ? "جاري تحميل سياسات الإضافات..." : "Loading add-on policies..."}
        </span>
      </div>
    );
  }

  const handleOpenEdit = (manifest: AddonManifest) => {
    const current = policyMap.get(manifest.id);
    setEditingPolicy({
      addonId: manifest.id,
      availability: current?.availability || "public",
      entitlementKey: current?.entitlement_key || "",
      defaultForActivities: current?.default_for_activities || [],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Puzzle className="size-4 text-primary" />
            <span>
              {isAr
                ? "سياسات إتاحة الإضافات السحابية (Platform Policies)"
                : "Platform Add-on Access & Entitlement Policies"}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "التحكم في وصول المتاجر لكل إضافة وتحديد الإتاحة (عامة، تجريبية، داخلية) وربطها بمفاتيح الخطط."
              : "Control add-on availability (public, beta, internal) and subscription entitlement locks."}
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs self-start sm:self-auto">
          {manifests.length} {isAr ? "إضافة مسجلة" : "registered"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {manifests.map((manifest) => {
          const policy = policyMap.get(manifest.id);
          const availability = policy?.availability || "public";
          const entitlement = policy?.entitlement_key || null;
          const defaultActivities = policy?.default_for_activities || [];

          return (
            <Card
              key={manifest.id}
              className="flex flex-col justify-between border-border bg-card p-4 rounded-2xl shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                      <Puzzle className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">
                        {isAr ? manifest.name.ar : manifest.name.en}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {manifest.id} • v{manifest.version}
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={
                      availability === "public"
                        ? "default"
                        : availability === "beta"
                          ? "secondary"
                          : availability === "internal"
                            ? "outline"
                            : "destructive"
                    }
                    className="text-xs h-5 py-0 capitalize"
                  >
                    {availability}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">
                  {isAr ? manifest.description.ar : manifest.description.en}
                </p>

                <div className="space-y-1.5 pt-1 text-xs border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Shield className="size-3" />
                      <span>{isAr ? "مفتاح الصلاحية:" : "Entitlement:"}</span>
                    </span>
                    <span className="font-mono font-medium text-foreground text-xs">
                      {entitlement || (isAr ? "مفتوح (مجاني)" : "Unlocked (Free)")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {isAr ? "افتراضي للأنشطة:" : "Defaults:"}
                    </span>
                    <span className="font-medium text-foreground text-xs truncate max-w-[140px]">
                      {defaultActivities.length > 0 ? defaultActivities.join(", ") : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEdit(manifest)}
                  className="w-full gap-1.5 text-xs h-9 rounded-xl border-border"
                >
                  <Edit2 className="size-3.5" />
                  <span>{isAr ? "تعديل السياسة" : "Edit Policy"}</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Policy Dialog */}
      {editingPolicy && (
        <Dialog
          open={Boolean(editingPolicy)}
          onOpenChange={(open) => !open && setEditingPolicy(null)}
        >
          <DialogContent className="max-w-md rounded-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <span>
                  {isAr ? "تعديل سياسة إتاحة الإضافة:" : "Edit Policy:"} {editingPolicy.addonId}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isAr
                  ? "تحديد مستوى الظهور والمفتاح المطلوب لتثبيت هذه الإضافة على مستوى النظام."
                  : "Set global availability tier and plan entitlement requirements."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isAr ? "مستوى الإتاحة (Availability)" : "Availability Tier"}
                </Label>
                <Select
                  value={editingPolicy.availability}
                  onValueChange={(val: any) =>
                    setEditingPolicy((prev) => (prev ? { ...prev, availability: val } : null))
                  }
                >
                  <SelectTrigger className="h-10 rounded-xl border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">
                      {isAr ? "public (متاحة لجميع المتاجر)" : "public (Available to all)"}
                    </SelectItem>
                    <SelectItem value="beta">
                      {isAr ? "beta (متاحة كنسخة تجريبية)" : "beta (Beta testing)"}
                    </SelectItem>
                    <SelectItem value="internal">
                      {isAr ? "internal (خاصة بالنظام فقط)" : "internal (Super-admin only)"}
                    </SelectItem>
                    <SelectItem value="deprecated">
                      {isAr ? "deprecated (مهملة وقيد الإيقاف)" : "deprecated (Pending sunset)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isAr ? "مفتاح الصلاحية (Entitlement Key)" : "Entitlement Key (Optional)"}
                </Label>
                <Input
                  value={editingPolicy.entitlementKey}
                  onChange={(e) =>
                    setEditingPolicy((prev) =>
                      prev ? { ...prev, entitlementKey: e.target.value } : null,
                    )
                  }
                  placeholder="e.g. addons.fit_passport (اتركه فارغاً إن كانت مجانية)"
                  className="h-10 rounded-xl border-border font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "عند تعيين مفتاح، لن يتمكن التاجر من التثبيت إلا إذا كانت خطته تتضمن هذا المفتاح."
                    : "If set, tenants must have this feature key in their plan version to install."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {isAr ? "الأنشطة الافتراضية (Default for Verticals)" : "Default for Verticals"}
                </Label>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {STORE_VERTICALS.map((vertical) => {
                    const isChecked = editingPolicy.defaultForActivities.includes(vertical);
                    return (
                      <label
                        key={vertical}
                        className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20 text-xs cursor-pointer hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editingPolicy.defaultForActivities, vertical]
                              : editingPolicy.defaultForActivities.filter((v) => v !== vertical);
                            setEditingPolicy((prev) =>
                              prev ? { ...prev, defaultForActivities: next } : null,
                            );
                          }}
                          className="rounded border-border text-primary focus:ring-primary size-3.5"
                        />
                        <span className="capitalize">
                          {isAr ? VERTICAL_LABELS[vertical].ar : vertical}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setEditingPolicy(null)}
                className="rounded-xl border-border"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={() => {
                  if (!editingPolicy) return;
                  updateMut.mutate({
                    addonId: editingPolicy.addonId,
                    availability: editingPolicy.availability,
                    entitlementKey: editingPolicy.entitlementKey.trim() || null,
                    defaultForActivities: editingPolicy.defaultForActivities,
                  });
                }}
                disabled={updateMut.isPending}
                className="rounded-xl"
              >
                {isAr ? "حفظ التغييرات" : "Save Policy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
