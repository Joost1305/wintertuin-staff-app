-- Quotes and confirmations under the Uniforme Voorwaarden Horeca (UVH):
-- client type (business or private), price lines with a VAT rate each, the kind of agreement for the cancellation
-- schedule, how long the quote is valid, corkage, written deviations from the UVH, and when the UVH were sent and received.
alter table public.events
  add column if not exists client_type text,
  add column if not exists agreement_kind text,
  add column if not exists price_lines jsonb not null default '[]'::jsonb,
  add column if not exists quote_valid_until date,
  add column if not exists corkage text,
  add column if not exists deviations text,
  add column if not exists uvh_sent_at date,
  add column if not exists uvh_received_at date;
do $$ begin
  alter table public.events add constraint events_client_type_chk check (client_type is null or client_type in ('business','private'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_agreement_kind_chk check (agreement_kind is null or agreement_kind in ('menu','no_menu','group'));
exception when duplicate_object then null; end $$;
