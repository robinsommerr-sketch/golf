# Fairway Club v9.4 · Swing, Social & Languages

Full oppdatering for din eksisterende Render/GitHub/Supabase-installasjon, med forbedret køllemekanikk, sosialt system og **engelsk som standardspråk**.

## Nytt i denne utgaven

- **🇬🇧 English / 🇳🇴 Norsk** i toppmenyen, synlig både på mobil og PC. Engelsk er standard for nye besøkende. Valget lagres i nettleseren og kan byttes uten ny innlasting. Grensesnittet inkluderer golf, konto, venneliste, rapportering og moderering. Brukergenererte meldinger blir ikke automatisk oversatt.
- **10 golfkøller** med forskjellige carry-/totaldistanser. Estimert slaglengde og kraftmarkør beregnes fra samme modell som ballbanen.
- **Nøyaktigere slagkontroll:** Lås sikte, start måleren, slå med samme knapp. Mer stabil flyging/landing/rulling og synlige putter.
- Profilside og profiltekst, venneliste og venneforespørsler.
- Lobbychat og privat chat mellom venner, samt rapportering av både brukere og meldinger.
- Serverside-filter for upassende språk i meldinger, brukernavn og profiltekst. Eksisterende kontoer med problematiske navn kan logge inn og endre navn.
- Ban med synlig begrunnelse, varighet og oppheving, admintilgang, rapportkø, modereringsbevis, lagrede chatlogger, oversikt over mistenkelige spillhendelser og logg over adminhandlinger.
- Automatisk sletting av vanlige chatmeldinger etter 90 dager, avsluttede rapporter etter 180 dager, og sikkerhets-/adminlogger etter 365 dager.

## Språkvalg (v9.4)

- **Engelsk (🇬🇧) er standard** for alle som ikke tidligere har valgt språk. Nettleserens systemspråk overstyrer ikke dette.
- **Kun engelsk og norsk (🇳🇴)** er tilgjengelig. Flaggvelgeren står oppe i høyre del av toppmenyen, både på PC og mobil.
- Språkvalget lagres i nettleserens `localStorage` som `fc_lang`; brukeren kan bytte når som helst uten å laste siden på nytt.
- Spillets menyer, scorekort, profiler, venneliste, chatteknapper, rapporterings- og adminskjermer har engelske/norske grensesnitt-tekster.
- Chatmeldinger og profilinnhold skrevet av brukere blir ikke automatisk oversatt. Dato- og klokkeslettformat for sosiale funksjoner følger valgt språk ved ny visning.
- Rettet søkeknapper som fremdeles viste norsk tekst når engelsk var valgt.

## Oppdatering på GitHub/Render

**Dette er ikke bare en frontend-oppdatering.** Last opp disse filene og erstatt eksisterende filer med samme navn:

```text
server.js
social-server.js                (ny)
moderation-filter.js           (ny)
package.json
render.yaml                       (valgfri, behold eksisterende hvis Render allerede virker)
public/index.html
public/styles.css
public/app.js
public/engine.js
public/social.js                (ny)
public/i18n.js                  (ny)
```

La dine eksisterende Render-verdier for `DATABASE_URL`, `JWT_SECRET` og sikker SSL-konfigurasjon være uendret. Render kjører normalt `npm install` og `node server.js`, og skal kunne bruke samme Supabase-database med eksisterende brukere. Koden oppretter nye tabeller og kolonner i databasen ved oppstart. Gjør en backup før første deploy.

**Ikke erstatt din fungerende `DATABASE_URL` eller sett `rejectUnauthorized: false` for produksjon.** Dersom tilkoblingen krever egen CA, bruk `DATABASE_CA_CERT` med korrekt CA-sertifikat og sikker TLS-verifisering.

## Gi deg selv eierrollen

Viktig: Det er med vilje ingen automatisk superadmin. Etter at du har registrert/logget inn med kontoen som skal være eier, finn kontoens numeriske ID i Supabase SQL Editor:

```sql
SELECT id, username FROM public.golf_users ORDER BY id;
```

Opprett deretter miljøvariabelen **`OWNER_USER_ID`** i Render med akkurat din numeriske bruker-ID. Deploy på nytt. Eierrollen er bundet til denne serverkonfigurasjonen. **Kun eieren** kan gi eller fjerne adminrettigheter. Andre spillere kan ikke gi seg selv adminrettigheter fra klienten. Ikke sett `OWNER_USER_ID` til en ukjent bruker.

## Personvern og moderering

Privatmeldinger er kun tilgjengelige for samtalepartene i spillergrensesnittet, men **administratorer kan se rå private meldinger** ved moderering, og slike innsyn loggføres. Private meldinger er ikke ende-til-ende-kryptert. Informer alle brukere tydelig før du tilbyr tjenesten offentlig. Vurder personvernerklæring, lovlig behandlingsgrunnlag, dataminimering, innsyn/sletting og rutiner for klage på ban. Ordfilter er en enkel startliste og kan gi både falske positiver og overse varianter. Sikkerhetshendelser er indikasjoner som skal vurderes av admin, ikke automatisk bevis på juks.

## Spillkontroller

1. Velg kølle og sikt med musen eller justeringsknappene.
2. Trykk **Swing / Slå** for å låse retningen.
3. Trykk igjen for å starte kraftmåleren.
4. Se forventet distanse og stopp måleren på ønsket styrke ved å trykke samme knapp.
5. Ballen flyr, lander og ruller. Etter landing kan du velge ny kølle.

## Testing

- `node --check server.js`, `node --check public/app.js`, `node --check public/social.js`, `node --check public/i18n.js`.
- `node --test tests/engine.test.mjs tests/social.test.mjs`: golfmotor, 27 hull, 10 køller, ordfilter.
- Språkvalg testet i Chromium for engelsk og norsk, også på mobilskjerm og for dynamiske tekstendringer.

**Hvis du allerede har v9.3:** Det holder å oppdatere `public/index.html`, `public/i18n.js` og `public/social.js` for denne språkoppdateringen. Fra v8 eller eldre må du bruke alle filene i ZIP-pakken.

**Ikke testet** som full live flerspillersesjon mot din Render-server og Supabase. Serveren trenger videre belastnings-/sikkerhetstesting før større offentlig lansering.
