import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Customer = { id:string; name:string|null; phone:string|null; email:string|null };
type PushEvent = { id:string; title:string; body:string; status:string; customer_id:string|null; recipient_count:number; accepted_count:number; failed_count:number; created_at:string };

export function CustomerPushCenter({ brandId, isAr }: { brandId:string; isAr:boolean }) {
  const qc=useQueryClient();
  const [target,setTarget]=useState("all"); const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [sending,setSending]=useState(false);
  const customers=useQuery({ queryKey:["push-customers",brandId], queryFn:async()=>{
    const {data,error}=await (supabase as any).from("customers").select("id,name,phone,email").eq("brand_id",brandId).order("name").limit(1000);
    if(error) throw error; return (data??[]) as Customer[];
  }});
  const devices=useQuery({ queryKey:["customer-push-devices",brandId], queryFn:async()=>{
    const {data,error}=await (supabase as any).from("customer_push_devices").select("id,customer_id,enabled,marketing_enabled").eq("brand_id",brandId).eq("enabled",true);
    if(error) throw error; return data??[];
  }});
  const history=useQuery({ queryKey:["customer-push-events",brandId], queryFn:async()=>{
    const {data,error}=await (supabase as any).from("customer_push_events").select("id,title,body,status,customer_id,recipient_count,accepted_count,failed_count,created_at").eq("brand_id",brandId).eq("event_type","marketing").order("created_at",{ascending:false}).limit(30);
    if(error) throw error; return (data??[]) as PushEvent[];
  }});
  const installedCustomers=useMemo(()=>new Set((devices.data??[]).map((d:any)=>d.customer_id)),[devices.data]);
  const hasRecipients = target === "all" ? installedCustomers.size > 0 : installedCustomers.has(target);

  const send=async()=>{
    if(!hasRecipients) {
      return toast.error(
        isAr
          ? "لا يمكن الإرسال لعدم وجود عملاء لديهم التطبيق والإشعارات مفعلة"
          : "Cannot send notification because there are no active app subscribers",
      );
    }
    if(!title.trim()||!body.trim()) return toast.error(isAr?"أدخل عنوان ورسالة الإشعار":"Enter a title and message");
    if(target!=="all"&&!installedCustomers.has(target)) return toast.error(isAr?"هذا العميل لم يسجل جهازاً في التطبيق":"This customer has no registered app device");
    setSending(true);
    const {error}=await (supabase as any).rpc("create_customer_push_campaign",{p_brand_id:brandId,p_title:title.trim(),p_body:body.trim(),p_customer_id:target==="all"?null:target,p_target_url:"https://pura.boutq.store"});
    setSending(false);
    if(error) return toast.error(error.message);
    setTitle("");setBody("");setTarget("all");toast.success(isAr?"تمت جدولة الإشعار للإرسال":"Push notification queued");
    void qc.invalidateQueries({queryKey:["customer-push-events",brandId]});
  };
  return <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.75fr)]">
    <Card className="p-4 sm:p-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><BellRing className="h-5 w-5"/></span><div><h2 className="font-bold">{isAr?"إرسال إشعار للعملاء":"Send customer notification"}</h2><p className="text-xs text-muted-foreground">{isAr?`${installedCustomers.size} عميل لديهم التطبيق والإشعارات مفعلة`:`${installedCustomers.size} customers have active app notifications`}</p></div></div>
      <div className="mt-5 space-y-4">
        {installedCustomers.size === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-0.5">
              <p className="font-bold">
                {isAr
                  ? "لا يوجد عملاء مفعلون للإشعارات حتى الآن"
                  : "No active push subscribers currently registered"}
              </p>
              <p className="opacity-90 leading-relaxed">
                {isAr
                  ? "تم تعطيل زر الإرسال تلقائياً لتفادي الحملات الوهمية حتى يقوم العملاء بتثبيت تطبيق المتجر وتفعيل الإشعارات."
                  : "Sending is temporarily disabled to prevent zero-recipient broadcasts until customers install the app and enable notifications."}
              </p>
            </div>
          </div>
        )}
        <div className="space-y-2"><Label>{isAr?"المستلم":"Recipient"}</Label><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{isAr?"كل العملاء المشتركين في العروض":"All marketing subscribers"}</SelectItem>{(customers.data??[]).filter(c=>installedCustomers.has(c.id)).map(c=><SelectItem key={c.id} value={c.id}>{c.name||c.phone||c.email||c.id}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>{isAr?"عنوان الإشعار":"Notification title"}</Label><Input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)} placeholder={isAr?"وصل الجديد من Pura Line":"New at Pura Line"}/><p className="text-end text-[11px] text-muted-foreground">{title.length}/100</p></div>
        <div className="space-y-2"><Label>{isAr?"الرسالة":"Message"}</Label><textarea className="flex min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={body} maxLength={500} onChange={e=>setBody(e.target.value)} placeholder={isAr?"اكتب رسالة قصيرة وواضحة...":"Write a short, clear message..."}/><p className="text-end text-[11px] text-muted-foreground">{body.length}/500</p></div>
        <Button onClick={send} disabled={sending || !hasRecipients || !title.trim() || !body.trim()} className="w-full gap-2"><Send className="h-4 w-4"/>{sending?(isAr?"جاري الجدولة...":"Queueing..."):(isAr?"إرسال الإشعار":"Send notification")}</Button>
        <p className="text-xs text-muted-foreground">{isAr?"الإرسال الجماعي يصل فقط لمن فعّل «العروض والأخبار». تحديثات الطلبات تُرسل تلقائياً ولا تعتمد على هذا الخيار.":"Broadcasts reach only customers who enabled marketing. Order updates are automatic and independent."}</p>
      </div>
    </Card>
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between"><h2 className="font-bold">{isAr?"آخر الإرسالات":"Recent sends"}</h2><Button variant="ghost" size="icon" onClick={()=>history.refetch()}><RefreshCw className={`h-4 w-4 ${history.isFetching?"animate-spin":""}`}/></Button></div>
      <div className="mt-4 space-y-2">{!history.data?.length?<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{isAr?"لا توجد إشعارات مرسلة بعد":"No notifications sent yet"}</p>:history.data.map(row=><div key={row.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><p className="font-bold text-sm">{row.title}</p><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{row.status}</span></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.body}</p><p className="mt-2 text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString(isAr?"ar-BH-u-nu-latn":"en-GB")} · {isAr?"وصل":"accepted"} {row.accepted_count}/{row.recipient_count}</p></div>)}</div>
    </Card>
  </div>;
}
