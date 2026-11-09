// Configuració pública de la web. Aquests valors NO són secrets (la seguretat la fa RLS a Supabase).
// Si SUPABASE_URL és buit, la web funciona en "mode demo" i desa les dades en aquest navegador.
export const CONFIG = {
  SUPABASE_URL: 'https://ptiuuwyimhjprpwvmdtf.supabase.co',          // https://<PROJECT_REF>.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0aXV1d3lpbWhqcHJwd3ZtZHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMjM1MjYsImV4cCI6MjEwOTc5OTUyNn0.YAVvp8BohYLaGecRJqUwezZvNow2EwDpp6kAKn3K-Mo',     // Project Settings → API → anon public
  VAPID_PUBLIC_KEY: 'BEBgCAfjmfr3K7CZ6qZVDzddR1nLQDx4oPa90Rg7lU7iLWQl6N5Nf3zoFE7G0bZ7e36O25glCmrzf2_g7x9UiJM'       // clau pública VAPID (npx web-push generate-vapid-keys)
};
