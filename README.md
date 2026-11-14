# Daily Golf Multiplayer (Render + Supabase)

Nettleserspill med tre 2D-baner, kontoer og lobbykoder for opptil åtte spillere. Node.js, Socket.IO og PostgreSQL. Dette er en prototype, ikke et ferdig konkurransesikkert golfspill. Ballposisjoner beregnes i nettleseren og kan manipuleres. Spillstatistikk lagres ikke permanent ennå. Lobbyer lagres i serverminnet og forsvinner når gratisserveren sover eller starter på nytt.

## 1. Opprett gratis Supabase-database
1. Gå til https://supabase.com/dashboard og opprett prosjekt.
2. Åpne **Connect** i prosjektet og finn **Session pooler** PostgreSQL connection string. Bruk Session pooler fordi Render kan mangle IPv6-støtte som direkte Supabase-tilkobling krever.
3. Sett inn databasepassordet i tilkoblingsstrengen. Dersom passordet inneholder spesialtegn må de URL-kodes.
4. Tabellen `golf_users` opprettes automatisk ved oppstart. Du trenger ikke bruke Supabase Auth, appen bruker egen innlogging med bcrypt-passordhash.

## 2. Last opp til GitHub
1. Lag et nytt privat GitHub-repository.
2. Last opp **innholdet i denne mappen** til repoet (inkludert `render.yaml`, `package.json`, `public/` og `server.js`).
3. Ikke last opp `.env` eller databasepassord.

## 3. Opprett gratis Render-server
1. Åpne https://dashboard.render.com/ og velg **New > Blueprint**. Koble til GitHub-repoet.
2. Render leser `render.yaml` og oppretter en gratis web service.
3. Oppgi `DATABASE_URL` fra Supabase når Render spør. `JWT_SECRET` genereres automatisk av Render.
4. Vent til deploy viser **Live**, og åpne `https://<ditt-navn>.onrender.com`.
5. Lag en bruker, opprett lobby, del kode med en venn og test i to nettlesere.

## Lokal kjøring
Node.js 20+ og PostgreSQL kreves. Sett `DATABASE_URL` og `JWT_SECRET` i miljøvariabler, og sett `DATABASE_SSL=disable` hvis lokal Postgres ikke bruker TLS. Kjør `npm install` og `npm start`, åpne http://localhost:3000.

## Viktige begrensninger
- Render Free går i dvale ved inaktivitet. Lobbyer slettes ved restart.
- Supabase gratisprosjekter kan pauses ved inaktivitet og har kvoter som kan endres.
- Brukerkontoer lagres i Postgres og overlever normalt serverrestart. Passord lagres som bcrypt-hasher.
- Posisjoner/fysikk er foreløpig klientstyrt. Dette må flyttes til serveren før konkurranser eller globale topplister.
- Ingen e-postverifisering, passordreset eller permanent runde-historikk ennå.
- For ekte produksjon bør det legges til kontosikkerhet, personvernerklæring, datalagringsrutiner og bedre misbruksvern.
