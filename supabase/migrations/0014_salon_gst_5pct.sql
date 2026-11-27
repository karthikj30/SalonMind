-- GST on salon services ("beauty and physical well-being services") is 5% without input tax credit,
-- mandatory from 22 Sep 2025 (56th GST Council meeting; CBIC notification 15/2025-Central Tax (Rate)).
-- New salons start at 5%; salons still on the old 18% default move to 5%. Invoices already issued keep
-- the rate they were issued with. Product (retail) rates are set per product and are not touched.
alter table public.tenants alter column settings set default '{
  "surge_cap_pct": 25, "flash_discount_cap_pct": 20,
  "reorder_buffer_days": 3, "nudge_threshold": 0.3, "deposit_threshold": 0.55,
  "deposit_pct": 25, "retention_grace_days": 7, "gst_rate": 5,
  "default_language": "en", "loyalty_points_per_100": 1, "loyalty_max_redeem_pct": 50,
  "referral_bonus_points": 200
}'::jsonb;

update public.tenants
   set settings = jsonb_set(settings, '{gst_rate}', '5'::jsonb)
 where settings ? 'gst_rate' and (settings->>'gst_rate')::numeric = 18;
