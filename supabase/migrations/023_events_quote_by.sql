-- Who makes the quote: the restaurant (food, drinks and room) or the landlord (room hire only, she invoices herself).
alter table public.events add column if not exists quote_by text not null default 'restaurant';
