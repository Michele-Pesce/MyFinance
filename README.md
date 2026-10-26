# MyFinance

App web multi-utente per tracciare patrimonio (liquidità, ETF, crypto, crediti), entrate, spese e versamenti PAC. Ogni utente vede solo i propri dati: l'isolamento è imposto dal database (Row Level Security).

> **Non è consulenza finanziaria.** Strumento di tracciamento personale. La proiezione del PAC è un'ipotesi a rendimento costante, senza tasse, commissioni né inflazione. L'app non dà mai indicazioni di acquisto o vendita. Non chiede né salva credenziali di broker o banche: saldi e quote si inseriscono a mano, solo i prezzi di mercato sono automatici.

## Stato

| Milestone | Stato |
|---|---|
| **M1** base: auth, RLS, asset, movimenti, categorie, snapshot manuali, 3 viste, test di calcolo | fatto |
| **M2** prezzi automatici (strumenti, job giornaliero, snapshot automatici) | fatto, vedi "Prezzi automatici" (EODHD/Alpha Vantage non ancora provati con una chiave reale) |
| **M3** apertura agli amici (onboarding, demo, inviti, export JSON, cancellazione account, PWA) | fatto nel codice; manca il deploy (vedi sotto) |

## Avvio in locale

Servono Node 24, pnpm e Docker Desktop acceso.

```bash
pnpm install
pnpm exec supabase start     # DB + Auth + Mailpit in locale; applica le migrazioni
pnpm exec supabase status    # copia URL e chiavi in .env.local (vedi .env.example)
pnpm dev                     # http://localhost:3000
```

- Il login non invia email. Mailpit (http://127.0.0.1:54324) resta disponibile per eventuali email di Supabase.
- La registrazione è **solo su invito**. Crea un codice in locale:
  `insert into invite_codes (code, max_uses) values ('DEV-LOCAL', 5);` (Studio: http://127.0.0.1:54323)
- Per aprire la registrazione: `update app_config set value = 'open' where key = 'signup_mode';`

## Accesso

Un account per ogni email, con **email e password scelta dall'utente** (8-72 caratteri). Nessuna email di verifica: niente link da aprire, quindi funziona anche nell'app installata su iPhone, e non ci sono limiti di invio email. La **registrazione richiede il codice invito** (controllato da un trigger del database), gli accessi successivi no. Tentativi limitati: 8 accessi per email e 30 per IP ogni 10 minuti.

**Password dimenticata:** non c'è il reset via email (servirebbe un SMTP personalizzato). Si reimposta dalla dashboard Supabase, Authentication, Users. Per il cloud la configurazione è `[remotes.production]` in `supabase/config.toml` (conferma email spenta, password minima 8) e si applica con `pnpm exec supabase config push`; alla domanda sullo storage rispondi "No".

## Inviti

La registrazione è su codice. Per crearne uno (serve il file `.env.local` con la chiave di servizio, quindi solo sul tuo PC):

```bash
pnpm invite 3 14     # codice valido per 3 persone, scade tra 14 giorni (entrambi opzionali)
```

Per aprire o chiudere la registrazione: `update app_config set value = 'open' where key = 'signup_mode';` (`'invite'` per richiedere il codice).

## Funzioni per gli utenti (M3)

- **Onboarding** al primo accesso (saltabile): nome, primo asset. Le categorie di spesa sono già pronte.
- **Impostazioni**: categorie modificabili (rinominare aggiorna anche i movimenti), export JSON completo e CSV, import CSV con anteprima e mappa colonne, ripristino da JSON (solo su account vuoto, per non duplicare), cancellazione account con conferma scritta (elimina profilo e tutte le righe collegate).
- **Passare il portafoglio con i CSV**: Impostazioni esporta due file, "Asset (CSV)" e "Movimenti (CSV)", e li rilegge con lo stesso identico formato (riconosciuto dall'intestazione, nessuna mappa colonne da fare). Ordine: prima gli asset, poi i movimenti (che si agganciano agli asset per nome). Un asset con lo stesso nome già presente viene saltato, quindi reimportare non duplica. I collegamenti ai prezzi automatici non viaggiano nel CSV. Per una copia completa usa il JSON.
- **FIRE** (`/fire`): numero FIRE = spese annuali ÷ tasso di prelievo, progresso, anni e mese stimati per arrivarci con i versamenti attuali, Coast FIRE (con età attuale e di pensionamento), grafico e tabella di sensibilità (rendimento × prelievo). Parte dai tuoi dati (capitale investito, media spese ultimi 12 mesi, PAC mensili) e ogni ipotesi è modificabile. Tutto in euro di oggi: il rendimento va inserito **al netto dell'inflazione**. Le ipotesi (tassi, età) restano solo nel tuo browser. Non è consulenza e non indica cosa comprare o vendere.
- **Demo** `/demo`: dashboard in sola lettura con dati inventati, senza account. **Come funziona** `/come-funziona`: due schermate.
- **PWA**: installabile (manifest e icone). Il service worker non mette nulla in cache: i dati finanziari arrivano sempre dal server.

## Deploy (Vercel + Supabase cloud)

1. Crea il progetto Supabase (vedi "Backend vero") e applica le migrazioni: `pnpm exec supabase link --project-ref <ref>` poi `pnpm exec supabase db push`.
2. In Supabase, Authentication, URL Configuration: imposta Site URL e aggiungi `https://<tuo-dominio>/auth/callback` ai Redirect URLs.
3. Importa il repo su Vercel e imposta le variabili di `.env.example` (chiavi di produzione, **non** quelle locali; usa chiavi di test per le preview). Imposta `SITE_URL` e un `CRON_SECRET` lungo.
4. `vercel.json` schedula il job prezzi una volta al giorno (il piano Hobby ammette un cron al giorno).
5. Crea il primo codice invito con `pnpm invite` puntando `.env.local` al progetto cloud.
6. Prima di invitare gli amici: leggi i termini d'uso dei provider di prezzi (sezione sopra).

**Backup:** ogni utente può scaricare il proprio JSON da Impostazioni. Per un backup del database intero usa quelli di Supabase (giornalieri sul piano a pagamento) o `supabase db dump`.

## Test

```bash
pnpm test        # unità: calcoli (sezione 5 del handoff), formati, CSV, prezzi vecchi
pnpm test:db     # RLS: l'utente B non vede né modifica i dati di A (serve supabase start)
pnpm typecheck && pnpm lint && pnpm build
```

## Prezzi automatici (M2)

Un job giornaliero (`GET /api/cron/prices`, protetto da `CRON_SECRET`, schedulato in `vercel.json` alle 16:45 UTC, dopo la chiusura di Xetra) aggiorna i prezzi degli strumenti collegati ad almeno un asset, poi salva lo snapshot automatico di ogni utente (`source = 'auto'`; uno snapshot manuale dello stesso giorno non viene sovrascritto). È idempotente: `upsert` su `(instrument_id, date)`.

| Dato | Provider | Limite gratuito | Note |
|---|---|---|---|
| Crypto | CoinGecko (Demo) | 100/min, 10.000/mese | una chiamata per tutte le monete; **attribuzione obbligatoria** (footer); la chiave è opzionale, senza si usa l'endpoint pubblico |
| ETF e azioni | EODHD, primario | 20 chiamate/giorno, solo fine giornata | ricerca per ISIN, ticker o nome (costa 1 chiamata); simboli tipo `VWCE.XETRA` |
| ETF e azioni | Alpha Vantage, riserva | 25 chiamate/giorno | usato se EODHD fallisce o ha finito il budget; simboli `.DEX` (Xetra), `.LON` (Londra) |
| Cambio | BCE `eurofxref-daily.xml` | nessuna chiave | solo per strumenti non in EUR; i prezzi in pence (GBX) sono gestiti |

Come funziona il budget: le chiamate crescono con gli strumenti **distinti** (non con gli utenti). Il job conta le chiamate per provider e giorno (`provider_calls`) e, se gli strumenti sono più del budget, aggiorna a rotazione i più vecchi. Nel weekend aggiorna solo le crypto. Un prezzo che non si aggiorna non rompe la pagina: resta l'ultimo valore con l'avviso oltre 3 giorni lavorativi.

Collegare un asset: Portafoglio, Modifica, "Prezzo automatico", cerca e collega. I risultati sono firmati dal server (`INSTRUMENT_SIGNING_SECRET`) così nessun utente può inventare strumenti e consumare il budget condiviso.

**Termini d'uso, da verificare prima di invitare gli amici.** I piani gratuiti di prezzi azionari sono pensati per uso personale; i termini EODHD per l'uso non professionale vietano di mostrare i dati ad altri, e i termini Alpha Vantage non sono stati letti. Scrivi al supporto del provider o passa a un piano a pagamento. Non è stato verificato che i ticker UCITS reali siano coperti dai piani gratuiti: serve una prova con una chiave vera.

Prova a mano in locale: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/prices`

## Struttura

- `supabase/migrations/` schema, RLS, trigger di registrazione (controllo invito, profilo, categorie predefinite).
- `src/lib/calc/` funzioni **pure** di calcolo (valore asset, patrimonio, tasso di risparmio, proiezione, "Incassato"). Nessun I/O.
- `src/app/actions.ts` server actions: autenticazione, validazione zod, scrittura con il client dell'utente (RLS attiva).
- `src/messages/it.ts` tutte le stringhe dell'interfaccia (i18n pronta per l'inglese).
- `src/lib/prices/` provider (CoinGecko, EODHD, Alpha Vantage), cambio BCE, orchestratore del job (`run.ts`, testato con provider finti).
- `src/app/instruments.ts` ricerca e collegamento strumenti (firmati).
- `src/proxy.ts` rinfresca la sessione e rimanda al login.

## Scelte prese senza risposta del committente (handoff §14)

Nome **MyFinance**, registrazione su codice invito (configurabile), repo privato, solo italiano, solo EUR (il modello dati ha già `currency`), mittente email predefinito del servizio.

## Decisioni da confermare

1. **Cosa conta come "ETF"** nel rendimento ETF e nella proiezione PAC: classi `etf` e `bond` (nel prototipo erano ETF azionario + obbligazionario). Le `stock` ne restano fuori.
2. **"Incassato"**: il credito si somma al valore *attuale* dell'asset di liquidità scelto dall'utente (nel prototipo era il valore manuale grezzo del primo "Contanti"). Coincide quando non ci sono PAC successivi.
3. **Colore e gruppo**: il colore è per asset; il campo "gruppo" unisce righe nella ciambella.
4. Le regole di calcolo della sezione 5 sono replicate senza altre modifiche.

## Backend vero (da decidere)

Il piano gratuito Supabase ha un limite di progetti attivi: se è esaurito, libera o metti in pausa un vecchio progetto, oppure usa un altro Postgres (Neon, ecc.) e sostituisci Auth. Le migrazioni sono SQL standard; solo `auth.users`, `auth.uid()` e il trigger di registrazione dipendono da Supabase.

## Sicurezza

Audit prima del rilascio (checklist vibe-security + revisione manuale). Corretti nel codice:
- funzioni `SECURITY DEFINER` interne non chiamabili da `anon`/`authenticated` (test automatico);
- rate limit su login (per IP e per indirizzo), ricerca strumenti, collegamento, import e ripristino, su tabella DB riservata al server (`rate_limits`, funzione `hit_rate_limit`); il limiter fallisce "aperto" se il DB non risponde, i limiti dei provider restano;
- header di sicurezza (anti-framing, nosniff, HSTS, referrer, permissions) e CSP parziale; il link di accesso usa `SITE_URL` e non gli header della richiesta;
- il budget condiviso dei provider è protetto da quote per utente.

Limiti noti e accettati: la CSP non ha `script-src` stretto (servono nonce per richiesta); con un codice invito sbagliato un indirizzo sconosciuto si distingue da uno noto (app su invito, con rate limit); il rate limit usa l'IP inoltrato dall'hosting, quindi dietro un proxy diverso da Vercel va verificato.

Il resto:

RLS su ogni tabella utente; chiave di servizio solo lato server (`src/lib/supabase/admin.ts`); la FK composita `(asset_id, user_id)` impedisce di collegare un movimento all'asset di un altro utente; export CSV protetto da formula injection. Nessun tracker o analytics.
