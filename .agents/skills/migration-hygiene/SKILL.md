---
name: migration-hygiene
description: "استخدمه عند مراجعة أو تغيير migrations في Boutq OS لمنع تعارض الإصدارات وانجراف سجل قاعدة البيانات."
---

# Migration Hygiene

- لا تعدّل أو تعيد تسمية migration مطبقة؛ أضف migration جديدة تصحيحية عند الحاجة.
- تأكد من تفرد timestamp لكل migration قبل التطبيق.
- شغّل `npm run db:migrations:check` بعد أي تغيير تحت `supabase/migrations`.
- قارن السجل المحلي والبعيد قبل النشر؛ أي صف محلي بلا remote أو remote بلا محلي هو drift يجب توثيقه وحله.
- لا تخلط تنظيفاً غير متعلق بالـschema مع migration جديدة.
