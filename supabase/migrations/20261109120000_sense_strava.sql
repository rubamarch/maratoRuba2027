-- La connexió amb Strava s'ha cancel·lat: les activitats s'entren a mà.
drop function if exists public.strava_status();
drop table if exists public.strava_tokens;
