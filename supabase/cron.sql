-- Executa-ho UNA vegada a l'editor SQL de Supabase (Database → Extensions: activa pg_cron i pg_net abans).
-- Substitueix <PROJECT_REF> i <CRON_SECRET> (el mateix valor que el secret CRON_SECRET de les funcions).
select cron.schedule(
  'marato-push-recordatoris',
  '0 * * * *',   -- cada hora; la funció només envia a les 8:00 i les 21:00 (hora de Madrid)
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/push-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
