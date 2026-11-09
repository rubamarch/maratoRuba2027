-- Activitats afegides a mà o importades de Strava sense connexió (enganxar la taula o activities.csv).
-- Els ids negatius són activitats manuals; els positius, ids reals de Strava.
alter table public.activities add column if not exists rpe int check (rpe between 1 and 10);
alter table public.activities add column if not exists note text check (char_length(note) <= 500);
alter table public.activities add column if not exists source text;   -- null = Strava API · 'manual' · 'paste' · 'csv'
