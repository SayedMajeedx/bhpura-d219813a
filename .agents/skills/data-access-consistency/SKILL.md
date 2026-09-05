---
name: data-access-consistency
description: "استخدمه عند تنظيف الاستعلامات وReact Query لضمان ثبات brand scope وquery keys وإبطال الكاش بأمان."
---

# Data Access Consistency

- لا تستخرج أو توحّد query قبل تحديد مصدر `brandId` وحدود صلاحية المستخدم.
- أبقِ brand scope صريحاً في كل بيانات مشتركة؛ لا تعتمد على slug أو id قادم من الواجهة وحده.
- query key يجب أن يميز brand والمرشحات التي تغيّر النتيجة.
- أي mutation يجب أن تبطل المفاتيح الدقيقة المتأثرة، لا كاشاً عاماً قد يسبب عرض بيانات قديمة أو مختلطة.
- استخدم `multi-tenant-security` إذا لمس العمل endpoint أو RPC أو استعلاماً يخدم أكثر من tenant.
