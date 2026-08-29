import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Terminal, Code2, ShieldCheck, Zap, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export function DeveloperDocumentation() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(id);
    toast.success(isAr ? "تم نسخ الكود" : "Code snippet copied");
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const curlListProducts = `curl -X GET "https://boutq.store/api/v1/products?limit=10" \\
  -H "Authorization: Bearer bq_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json"`;

  const nodeCreateOrder = `const response = await fetch("https://boutq.store/api/v1/orders", {
  method: "POST",
  headers: {
    "Authorization": "Bearer bq_live_YOUR_API_KEY",
    "Content-Type": "application/json",
    "Idempotency-Key": "order_uuid_12345678" // Safe retry
  },
  body: JSON.stringify({
    customer_name: "Ahmed Ali",
    customer_phone: "+97333000000",
    customer_email: "ahmed@example.com",
    address: "Manama, Bahrain",
    items: [
      { product_id: "prod_123", quantity: 2, price: 15.000 }
    ],
    total: 30.000
  })
});

const data = await response.json();
console.log("Created Order:", data);`;

  const hmacNodeVerification = `import crypto from 'crypto';

export function verifyBoutqWebhook(rawBody, signatureHeader, secret) {
  // 1. Extract timestamp and v1 signature
  const parts = signatureHeader.split(',');
  let timestamp, signature;
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = parseInt(v, 10);
    if (k === 'v1') signature = v;
  }

  // 2. Prevent replay attacks (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    throw new Error('Webhook timestamp expired');
  }

  // 3. Compute expected HMAC SHA-256
  const payload = \`\${timestamp}.\${rawBody}\`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // 4. Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}`;

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-5 rounded-xl border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">
            {isAr ? "دليل توثيق المطورين (Public REST API & Webhooks Guide)" : "Developer Documentation & SDK"}
          </h3>
          <Badge variant="outline" className="text-xs">
            v1.0.0
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "مرجع شامل ومفصل للربط البرمجي، المصادقة الآمنة، معالجة الـ Idempotency، والتحقق من تواقيع HMAC."
            : "Complete developer reference for REST v1 endpoints, Bearer authentication, idempotency, and HMAC verification."}
        </p>
      </div>

      {/* Code Examples & Quickstart Tabs */}
      <Tabs defaultValue="quickstart" className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-md">
          <TabsTrigger value="quickstart" className="text-xs">
            {isAr ? "البداية السريعة (cURL)" : "Quickstart (cURL)"}
          </TabsTrigger>
          <TabsTrigger value="sdk" className="text-xs">
            {isAr ? "إنشاء طلب (Node.js)" : "Create Order (Node.js)"}
          </TabsTrigger>
          <TabsTrigger value="hmac" className="text-xs">
            {isAr ? "التحقق من HMAC" : "Verify HMAC"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quickstart" className="space-y-3">
          <Card className="border-border bg-card">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  GET /api/v1/products
                </CardTitle>
                <CardDescription className="text-xs">
                  {isAr ? "استرجاع قائمة المنتجات مع الفلترة والتصفح" : "List catalog products with pagination & search"}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCode(curlListProducts, "curl_products")}
                className="h-8 gap-1 text-xs"
              >
                {copiedSnippet === "curl_products" ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {isAr ? "نسخ" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <pre className="p-3 bg-muted rounded-lg font-mono text-xs overflow-x-auto text-foreground border border-border">
                {curlListProducts}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sdk" className="space-y-3">
          <Card className="border-border bg-card">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  POST /api/v1/orders (Idempotent)
                </CardTitle>
                <CardDescription className="text-xs">
                  {isAr ? "إنشاء طلب جديد مع Idempotency-Key لمنع تكرار الخصم" : "Create order safely with idempotency guarantee"}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCode(nodeCreateOrder, "node_order")}
                className="h-8 gap-1 text-xs"
              >
                {copiedSnippet === "node_order" ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {isAr ? "نسخ" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <pre className="p-3 bg-muted rounded-lg font-mono text-xs overflow-x-auto text-foreground border border-border">
                {nodeCreateOrder}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hmac" className="space-y-3">
          <Card className="border-border bg-card">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  HMAC SHA-256 Webhook Verification
                </CardTitle>
                <CardDescription className="text-xs">
                  {isAr ? "التحقق من توقيع X-Boutq-Signature ومنع هجمات الإعادة" : "Verify X-Boutq-Signature and prevent replay attacks"}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCode(hmacNodeVerification, "hmac_node")}
                className="h-8 gap-1 text-xs"
              >
                {copiedSnippet === "hmac_node" ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {isAr ? "نسخ" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <pre className="p-3 bg-muted rounded-lg font-mono text-xs overflow-x-auto text-foreground border border-border">
                {hmacNodeVerification}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Endpoints Reference Table */}
      <div className="space-y-3 pt-2">
        <h4 className="text-sm font-bold text-foreground">
          {isAr ? "فهرس نقاط النهاية (Endpoints Reference)" : "Available Endpoints Reference"}
        </h4>
        <div className="border border-border rounded-lg overflow-x-auto bg-card">
          <table className="w-full text-xs text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground uppercase text-[11px] font-semibold">
              <tr>
                <th className="px-4 py-3">{isAr ? "الطريقة" : "Method"}</th>
                <th className="px-4 py-3">{isAr ? "المسار" : "Endpoint"}</th>
                <th className="px-4 py-3">{isAr ? "الصلاحية المطلوبة" : "Required Scope"}</th>
                <th className="px-4 py-3">{isAr ? "الوصف" : "Description"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              <tr>
                <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">GET</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/products</td>
                <td className="px-4 py-2.5 text-muted-foreground">products:read</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "قائمة المنتجات والمتغيرات" : "List catalog products"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">POST</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/products</td>
                <td className="px-4 py-2.5 text-muted-foreground">products:write</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "إنشاء منتج جديد" : "Create new product"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">GET</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/inventory</td>
                <td className="px-4 py-2.5 text-muted-foreground">inventory:read</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "أرصدة وكميات المخزون" : "Stock quantities per SKU"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">POST</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/inventory/adjust</td>
                <td className="px-4 py-2.5 text-muted-foreground">inventory:write</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "تعديل كمية المخزون (زيادة/نقصان)" : "Adjust variant stock delta"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">GET</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/orders</td>
                <td className="px-4 py-2.5 text-muted-foreground">orders:read</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "قائمة الطلبات مع الفلاتر" : "List customer orders"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">POST</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/orders</td>
                <td className="px-4 py-2.5 text-muted-foreground">orders:write</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "إنشاء طلب جديد" : "Create customer order"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-amber-600 dark:text-amber-400 font-bold">PUT</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/orders/:id/status</td>
                <td className="px-4 py-2.5 text-muted-foreground">orders:write</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "تحديث حالة الطلب والشحن" : "Update order status"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">GET</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/returns</td>
                <td className="px-4 py-2.5 text-muted-foreground">returns:read</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "تذاكر الإرجاع والاستبدال" : "List return tickets"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">GET</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/loyalty/balance/:id</td>
                <td className="px-4 py-2.5 text-muted-foreground">loyalty:read</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "رصيد نقاط ولاء العميل" : "Customer loyalty balance"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">POST</td>
                <td className="px-4 py-2.5 font-medium text-foreground">/api/v1/loyalty/adjust</td>
                <td className="px-4 py-2.5 text-muted-foreground">loyalty:write</td>
                <td className="px-4 py-2.5 font-sans text-muted-foreground">
                  {isAr ? "منح أو خصم نقاط ولاء" : "Award or deduct loyalty points"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
