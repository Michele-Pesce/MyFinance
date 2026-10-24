# MyFinance

App web multi-utente per tracciare patrimonio (liquidità, ETF, crypto, crediti), entrate, spese e versamenti PAC. Ogni utente vede solo i propri dati: l'isolamento è imposto dal database (Row Level Security).

> **Non è consulenza finanziaria.** Strumento di tracciamento personale. La proiezione del PAC è un'ipotesi a rendimento costante, senza tasse, commissioni né inflazione. L'app non dà mai indicazioni di acquisto o vendita. Non chiede né salva credenziali di broker o banche: saldi e quote si inseriscono a mano, solo i prezzi di mercato sono automatici.

## Stato

| Milestone | Stato |
|---|---|
| **M1** base: auth, RLS, asset, movimenti, categorie, snapshot manuali, 3 viste, test di calcolo | fatto (vedi sotto cosa manca) |
| **M2** prezzi automatici (strumenti, job giornaliero, snapshot automatici) | fatto, vedi "Prezzi automatici" (EODHD/Alpha Vantage non ancora provati con una chiave reale) |
| **M3** apertura agli amici (onboarding, demo, inviti, export JSON, cancellazione account, PWA) | da fare |

Manca ancora in M1: gestione categorie dall'interfaccia (il DB le crea già alla registrazione), import CSV/JSON.

## Avvio in locale

Servono Node 24, pnpm e Docker Desktop acceso.

```bash
pnpm install
pnpm exec supabase start     # DB + Auth + Mailpit in locale; applica le migrazioni
pnpm exec supabase status    # copia URL e chiavi in .env.local (vedi .env.example)
pnpm dev                     # http://localhost:3000
```

- Le email di accesso (link magico) arrivano in Mailpit: http://127.0.0.1:54324
- La registrazione è **solo su invito**. Crea un codice in locale:
  `insert into invite_codes (code, max_uses) values ('DEV-LOCAL', 5);` (Studio: http://127.0.0.1:54323)
- Per aprire la registrazione: `update app_config set value = 'open' where key = 'signup_mode';`

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

## Scelte prese senza risposta di Michele (handoff §14)

Nome **MyFinance**, registrazione su codice invito (configurabile), repo privato, solo italiano, solo EUR (il modello dati ha già `currency`), mittente email predefinito del servizio.

## Decisioni da confermare

1. **Cosa conta come "ETF"** nel rendimento ETF e nella proiezione PAC: classi `etf` e `bond` (nel prototipo erano ETF azionario + obbligazionario). Le `stock` ne restano fuori.
2. **"Incassato"**: il credito si somma al valore *attuale* dell'asset di liquidità scelto dall'utente (nel prototipo era il valore manuale grezzo del primo "Contanti"). Coincide quando non ci sono PAC successivi.
3. **Colore e gruppo**: il colore è per asset; il campo "gruppo" unisce righe nella ciambella.
4. Le regole di calcolo della sezione 5 sono replicate senza altre modifiche.

## Backend vero (da decidere)

Il piano gratuito Supabase ha un limite di progetti attivi: se è esaurito, libera o metti in pausa un vecchio progetto, oppure usa un altro Postgres (Neon, ecc.) e sostituisci Auth. Le migrazioni sono SQL standard; solo `auth.users`, `auth.uid()` e il trigger di registrazione dipendono da Supabase.

## Sicurezza

RLS su ogni tabella utente; chiave di servizio solo lato server (`src/lib/supabase/admin.ts`); la FK composita `(asset_id, user_id)` impedisce di collegare un movimento all'asset di un altro utente; export CSV protetto da formula injection. Nessun tracker o analytics.
