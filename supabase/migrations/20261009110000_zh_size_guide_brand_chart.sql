-- ZH Abayas: use the brand's own size chart instead of the default Gulf abaya template.
-- Sizes 50 to 60 in steps of one, three measurements in inches (length, width, sleeve),
-- and the brand's measuring diagram (public/size-guides/zh-abaya-diagram.png).
--
-- Only the store with slug 'zh', and only while its guide is still the untouched
-- default template (six sizes, no diagram), so a guide the store has edited is never
-- overwritten. Width is a measurement the unit toggle converts, but it is not asked
-- of the shopper in the size finder (length and sleeve are).

UPDATE public.size_guides g
SET
  name_ar = 'جدول المقاسات',
  name_en = 'Size Chart',
  base_unit = 'in',
  columns = '[
    {"key":"length","label_ar":"الطول","label_en":"Length","kind":"measurement","measurement_key":"length"},
    {"key":"width","label_ar":"العرض","label_en":"Width","kind":"measurement","measurement_key":null},
    {"key":"sleeve","label_ar":"طول الكم","label_en":"Sleeve","kind":"measurement","measurement_key":"sleeve"}
  ]'::jsonb,
  rows = '[
    {"label":"50","values":{"length":50,"width":21,"sleeve":28}},
    {"label":"51","values":{"length":51,"width":21.5,"sleeve":28}},
    {"label":"52","values":{"length":52,"width":22,"sleeve":29}},
    {"label":"53","values":{"length":53,"width":22.5,"sleeve":29}},
    {"label":"54","values":{"length":54,"width":23,"sleeve":30}},
    {"label":"55","values":{"length":55,"width":23.5,"sleeve":30}},
    {"label":"56","values":{"length":56,"width":24,"sleeve":31}},
    {"label":"57","values":{"length":57,"width":24.5,"sleeve":31}},
    {"label":"58","values":{"length":58,"width":25,"sleeve":32}},
    {"label":"59","values":{"length":59,"width":25.5,"sleeve":32}},
    {"label":"60","values":{"length":60,"width":26,"sleeve":33}}
  ]'::jsonb,
  how_to_measure = '[]'::jsonb,
  diagram_url = '/size-guides/zh-abaya-diagram.png'
FROM public.brands b
WHERE b.id = g.brand_id
  AND b.slug = 'zh'
  AND g.template_key = 'abaya_gulf'
  AND g.diagram_url IS NULL
  AND jsonb_array_length(g.rows) = 6;
