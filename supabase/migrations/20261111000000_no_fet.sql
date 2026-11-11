-- Marca explícita "no l'he fet" (la creu) a cada sessió.
alter table public.logs add column if not exists skipped boolean not null default false;
