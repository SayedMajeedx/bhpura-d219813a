-- Split the legacy flat Fit Passport into product-specific profiles.
-- Existing values belong to the abaya profile; dress measurements start empty.
update public.customer_fit_passports
set measurements = jsonb_build_object(
  'abaya', jsonb_strip_nulls(
    jsonb_build_object(
      'length', coalesce(measurements -> 'height', measurements -> 'abaya_length'),
      'bust', measurements -> 'bust',
      'sleeve', measurements -> 'sleeve',
      'shoulder', measurements -> 'shoulder',
      'waist', measurements -> 'waist',
      'hips', measurements -> 'hips',
      'arm_width', measurements -> 'arm_width'
    )
  ),
  'dress', '{}'::jsonb
)
where jsonb_typeof(measurements) = 'object'
  and not (measurements ? 'abaya')
  and not (measurements ? 'dress');

comment on column public.customer_fit_passports.measurements is
  'Versioned JSON object with independent abaya and dress measurement profiles.';
