-- Dates default to the day in India, not in UTC. Postgres `current_date` follows the database clock (UTC),
-- so between 00:00 and 05:30 IST an invoice was dated the previous day: it missed that day's day-end
-- closing report and carried the wrong GST invoice date. Same for a membership sold in those hours.
-- Already-issued invoices keep their dates (issued GST invoices are not re-dated).
alter table public.invoices alter column invoice_date set default ((now() at time zone 'Asia/Kolkata')::date);
alter table public.client_memberships alter column starts_at set default ((now() at time zone 'Asia/Kolkata')::date);
