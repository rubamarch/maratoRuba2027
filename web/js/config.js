// Configuració pública de la web. Aquests valors NO són secrets (la seguretat la fa RLS a Supabase).
// Si SUPABASE_URL és buit, la web funciona en "mode demo" i desa les dades en aquest navegador.
export const CONFIG = {
  SUPABASE_URL: '',          // https://<PROJECT_REF>.supabase.co
  SUPABASE_ANON_KEY: '',     // Project Settings → API → anon public
  STRAVA_CLIENT_ID: '',      // strava.com/settings/api → Client ID
  VAPID_PUBLIC_KEY: ''       // clau pública VAPID (npx web-push generate-vapid-keys)
};
