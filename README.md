# Fairway Club - redesign

Fullstendig redesign av tidligere Fairway Nine. Ny responsiv nettside, nytt banedesign på Canvas, ny profilvisning, leaderboard, scorekort, private lobbyer, timing-baserte slag, 3 banetemaer og 9 hull.

## Oppdatering av Render/GitHub
1. Pakk ut ZIP.
2. Erstatt innholdet i GitHub-repositoryet med filene i denne mappen (inkludert `server.js`, `public/index.html`, `package.json` og `render.yaml`).
3. Behold eksisterende `DATABASE_URL` og `JWT_SECRET` i Render. Ikke legg `.env` eller passord i GitHub.
4. Commit, og vent på ny Render-deploy.
5. Åpne nettsiden, logg inn og test lobbyen med to nettlesere.

## Miljøvariabler
- `DATABASE_URL`: Supabase Postgres connection URI (Session pooler anbefales).
- `JWT_SECRET`: tilfeldig, lang hemmelig streng.
- `DATABASE_SSL`: standard er sikker TLS-verifisering; `disable` bare for lokal database uten TLS.
- `DATABASE_CA_CERT`: valgfritt, korrekt CA-sertifikat i PEM-format hvis Supabase-pooleren ikke kan verifiseres med standard trust store. Ikke slå av sertifikatverifisering på produksjon.
- `PORT`: settes av Render.

## Spillkontroller
- Klikk på banen for å velge retning og starte kraftmåleren.
- Klikk igjen eller trykk mellomrom for å slå.
- Piltastene finjusterer retning før du låser.
- Ballen lander, ruller og påvirkes av vind/hindre. På greenen beregnes putter automatisk.

## Begrensninger
Dette er en omfattende prototype, ikke en eksakt kopi av Daily Holes. Fysikken kjøres i klienten og er ikke serverautoritativ. Spillet bør testes manuelt med flere samtidige spillere. Serveren validerer grunnleggende slag og score, men et produksjonsspill bør beregne slag på serveren, ha reconnect-støtte og persistent match-historikk.
