# Marató Ruba 2027 🏃

Web (PWA instalable) para gestionar el plan de 25 semanas de la **Marató Vies Verdes 2027** (Girona, 25/04/2027).
Interfaz en catalán, plan **adaptativo**, sincronización con **Strava**, notificaciones push, calendario `.ics` y enlace público de solo lectura.

- **Web:** `https://rubamarch.github.io/maratoRuba2027/` (GitHub Pages)
- **Datos, login y backend:** Supabase (plan gratuito)

## Qué hace

| Pantalla | Contenido |
|---|---|
| **Avui** | Cuenta atrás, línea de progreso por fases, sesiones de hoy, mañana, estadísticas y últimos ajustes |
| **Setmana** | Los 7 días con cada sesión: detalle con ritmos, datos de Strava (km, tiempo, ritmo, FC, mapa y parciales), registro manual (km, minutos, esfuerzo, nota), mover a otro día, pádel del sábado y **+ Afegir activitat** en cualquier día (también en descanso) |
| **Pla** | Las 5 fases y 25 semanas con el volumen ya adaptado |
| **Progrés** | Predicción de maratón (Riegel), tests, gráfica de km (hechos, plan adaptado y plan original), historial de ajustes y carreras de Strava |
| **Ritmes** | Zonas de ritmo, reglas de adaptación y guía (pádel, hombro, seguridad) |
| **Ajustos** | Login, fecha de la carrera, ritmo objetivo, adaptación on/off, Strava, notificaciones, calendario, compartir e instalar |

### Importar de Strava sin conectar la API
El botón naranja **Importar de Strava** (Avui, Setmana, Progrés y Ajustos) funciona incluso en modo demo:
pega la tabla de *Mis actividades* de strava.com o sube el `activities.csv` de la exportación gratuita de Strava.
Las carreras marcan la sesión del día, el pádel y el gimnasio marcan su sesión si la hay y el resto entra como día extra.
No se duplica nada. Cuando Strava esté conectado (API gratuita, sin suscripción), el mismo botón sincroniza.

### Copia de seguridad
**Ajustos → Les teves dades**: descarga una copia `.json` y restáurala en otro navegador o tras configurar Supabase.
En modo demo los datos viven solo en el navegador, así que conviene hacer copias.

### Plan adaptativo (automático)

El motor (`supabase/functions/_shared/adapt.js`) recalcula el plan cada vez que cambian los datos. Es el mismo código para la web, el calendario y las notificaciones.

- **Más volumen con poco esfuerzo** → sube +5 % por semana, como máximo +10 % sobre el plan. La larga nunca pasa de 32 km.
- **Menos volumen o sesiones clave saltadas** → baja un 5 o un 10 %. Si una semana queda casi sin hacer, la siguiente repite el volumen de la anterior.
- **Esfuerzo medio ≥ 8/10** → la semana siguiente baja un 10 % por fatiga.
- **Día saltado**: la larga, la calidad o el test se recolocan solos en un hueco libre de la misma semana (nunca el día antes de la larga). Si no hay hueco, la larga sustituye un rodaje suave. Los rodajes suaves saltados se pierden.
- **Día extra** (carrera fuera del plan): suma a los km de la semana. Si tienes calidad en los 2 días siguientes, esa sesión se suaviza.
- **Afinamiento (semanas 23–25)**: nunca se le añade volumen. Los ritmos solo cambian con tests.
- Los movimientos que haces tú mandan sobre los automáticos. La adaptación se puede desactivar en Ajustos.

## Estructura

```
web/                      PWA (HTML + CSS + JS módulos, sin build)
  js/app.js               pantallas e interacción
  js/store.js             datos: Supabase o modo demo (localStorage)
  js/config.js            claves PÚBLICAS (URL, anon key, Strava client id, VAPID pública)
  sw.js                   offline + push
supabase/
  migrations/             tablas + seguridad RLS (lectura pública, escritura solo propietario)
  functions/_shared/      plan.js · pace.js · adapt.js (compartidos con la web) + helpers
  functions/strava-connect  conectar / sincronizar / desconectar Strava
  functions/strava-webhook  recibe las actividades nuevas de Strava al momento
  functions/calendar        calendario .ics público
  functions/push-cron       avisos 21:00 (mañana) y 8:00 (hoy)
  cron.sql                programación horaria del aviso
scripts/build.sh          monta _site/ (copia los ficheros compartidos dentro de la web)
scripts/dev.sh            servidor local en http://localhost:8080
```

Sin configurar nada, la web funciona en **modo demo**: guarda los datos en el navegador.

## Configuración paso a paso

> Las claves **secretas** (Strava client secret, VAPID privada, service role) van **solo** en los secrets de Supabase, nunca en el repositorio.

### 1. GitHub Pages
Repo → **Settings → Pages → Source: GitHub Actions**. Cada push a `main` publica la web.

### 2. Supabase: base de datos
1. Crea un proyecto en [supabase.com](https://supabase.com) (región Europa).
2. **SQL Editor** → pega y ejecuta `supabase/migrations/20261102000000_init.sql` y después `supabase/migrations/20261109000000_activitats_manuals.sql`.
3. **Authentication → Users → Add user**: crea tu usuario con email y contraseña (marca *Auto confirm*).
4. **Authentication → Providers → Email**: desactiva *Allow new users to sign up* (así nadie más puede registrarse).
5. Hazte propietario. En el SQL Editor:
   ```sql
   insert into public.owners (user_id)
   select id from auth.users where email = 'TU_EMAIL';
   ```
6. **Project Settings → API**: copia la *Project URL* y la clave *anon public* en `web/js/config.js`.

### 3. Supabase: funciones
Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):
```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy
```
(O añade en GitHub los secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` y `SUPABASE_DB_PASSWORD`, y el workflow *Desplega Supabase* lo hará solo.)

### 4. Strava
1. En [strava.com/settings/api](https://www.strava.com/settings/api), pon **Authorization Callback Domain** = `rubamarch.github.io`.
2. Pon el *Client ID* en `web/js/config.js` (`STRAVA_CLIENT_ID`).
3. Secrets de las funciones (Supabase → Edge Functions → Secrets, o con la CLI):
   ```bash
   supabase secrets set STRAVA_CLIENT_ID=xxxx STRAVA_CLIENT_SECRET=xxxx STRAVA_VERIFY_TOKEN=una-frase-inventada SITE_URL=https://rubamarch.github.io/maratoRuba2027/
   ```
4. En la web: **Ajustos → Connectar amb Strava**. Importa las carreras desde 2 semanas antes del inicio del plan.
5. Webhook para que las carreras lleguen al momento (una sola vez):
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=TU_CLIENT_ID -F client_secret=TU_CLIENT_SECRET \
     -F callback_url=https://TU_PROJECT_REF.supabase.co/functions/v1/strava-webhook \
     -F verify_token=una-frase-inventada
   ```

### 5. Notificaciones push (Android)
1. Genera las claves VAPID:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Pon la **pública** en `web/js/config.js` (`VAPID_PUBLIC_KEY`) y en los secrets:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email CRON_SECRET=otra-frase-larga
   ```
3. Supabase → **Database → Extensions**: activa `pg_cron` y `pg_net`. Edita `supabase/cron.sql` (project ref y `CRON_SECRET`) y ejecútalo en el SQL Editor.
4. En el móvil: abre la web en Chrome → ⋮ → *Añadir a pantalla de inicio* → abre la app → **Ajustos → Activar notificacions** → *Provar*.

### 6. Calendario
**Ajustos → Calendari → Afegir a Google Calendar**, o pega la URL `https://TU_PROJECT_REF.supabase.co/functions/v1/calendar` en *Otros calendarios → Desde URL*. Las sesiones incluyen los ajustes automáticos. Google lo refresca cada pocas horas.

## Desarrollo local
```bash
./scripts/dev.sh
```

## Notas
- Si cambias la fecha de la carrera, el plan se recalcula hacia atrás desde el nuevo domingo. Los textos que mencionan fechas reales (la Mitja de Barcelona del 14 de febrero, Navidad) no se mueven.
- Es un plan orientativo. Si notas un dolor que te cambia la forma de correr, para y consulta a un profesional.
