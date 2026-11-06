-- Pura's size guide becomes the drawing of an abaya laid flat (the owner's decision of 2026-11-06).
-- Its chart said "bust circumference" over numbers that were half of one, so a shopper with a
-- 38 inch bust was told she was larger than the largest size. Its rows and columns stay in the row:
-- the guide's template decides that no chart is shown, and setting it back brings the chart back.
-- Another store's guide is not touched. The steps equal FLAT_DIAGRAM_STEPS in
-- src/addons/size-guides/lib/flat-diagram.ts (tests/size-guide-flat-diagram.test.tsx).

UPDATE public.size_guides AS guide
SET template_key = 'abaya_flat_diagram',
    name_ar = 'طريقة أخذ المقاسات',
    name_en = 'How to measure',
    how_to_measure = $json$[{"title_ar":"الطول","title_en":"Full length","body_ar":"من أعلى الكتف عند الرقبة نزولاً حتى نهاية القطعة.","body_en":"From the top of the shoulder by the neck down to the hem."},{"title_ar":"عرض الصدر","title_en":"Chest width","body_ar":"عند مستوى الإبط، من طرف إلى طرف.","body_en":"At the armpits, from edge to edge."},{"title_ar":"طول الكم","title_en":"Sleeve length","body_ar":"من أعلى الكتف عند الرقبة حتى نهاية الكم.","body_en":"From the top of the shoulder by the neck to the end of the sleeve."},{"title_ar":"ارتفاع الإبط","title_en":"Armpit height","body_ar":"من أعلى الكتف نزولاً حتى الإبط.","body_en":"From the top of the shoulder down to the armpit."},{"title_ar":"عرض الوسط","title_en":"Waist width","body_ar":"عند الوسط، من طرف إلى طرف.","body_en":"At the waist, from edge to edge."},{"title_ar":"عرض الأسفل","title_en":"Hem width","body_ar":"عند نهاية القطعة من الأسفل، من طرف إلى طرف.","body_en":"Along the hem, from edge to edge."},{"title_ar":"فتحة الكم","title_en":"Sleeve opening","body_ar":"عرض طرف الكم من حافة إلى حافة.","body_en":"Across the end of the sleeve, from edge to edge."}]$json$::jsonb,
    notes_ar = 'رقم المقاس الجاهز هو طول القطعة بالإنش: مقاس 54 يعني أن طولها 54 إنش.',
    notes_en = 'A ready size is the piece''s length in inches: size 54 is 54 inches long.',
    recommender_enabled = false
FROM public.brands AS brand
WHERE brand.id = guide.brand_id
  AND brand.slug = 'pura'
  AND guide.template_key = 'abaya_gulf';
