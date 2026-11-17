-- Data fins a la qual el dolor anotat es dona per superat ("Ja estic bé").
alter table public.settings add column if not exists pain_clear date;
