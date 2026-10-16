# Finanzas

A mobile-first **PWA for personal expenses** that talks to **your own Google Sheet**. Two things it is built to do well:

1. **Log a small expense in 3 seconds**: amount, concept, done. The category is picked for you from your own habits dictionary.
2. **"X-ray" a big receipt**: take a photo of a 170 € shopping ticket and Gemini itemises it line by line, so you see exactly where each euro went (e.g. 110 € groceries, 35 € home decor, 25 € gifts), and you save it split by category or as a single row with the full breakdown inside.

Plus a permanent **"how much do I have left this month"** header, offline support, and `.xlsx` import/export.

> **Live app:** https://imsothe.github.io/Finanzas/ (the UI only; it holds no data. You connect it to *your* Google Sheet.)
> The UI is in Spanish. Built with AI-assisted development (Claude); behaviour is pinned by the automated tests listed below.

```
┌───────────────┐  fetch   ┌──────────────────────┐   read/write    ┌───────────────┐
│  PWA (phone)  │ ───────► │ Google Apps Script   │ ──────────────► │ Google Sheets │
│  app/         │ ◄─────── │ backend/Code.gs      │ ◄────────────── │ (your data)   │
└──────┬────────┘   JSON   └──────────────────────┘                 └───────────────┘
       │ receipt photo (compressed JPEG, sent directly)
       ▼
  Gemini API (gemini-2.5-flash)
```

Everything runs on Google's servers and GitHub Pages, so **your computer does not need to be on**: it works anywhere your phone has data.

## Features

| | |
|---|---|
| **3-second entry** | Amount + concept + Save. Typing `caf`, `figu`, `moto`… suggests and **auto-selects the category** (shown as *auto ✨*, tap to change). Changing a category teaches the dictionary, and it is saved to your sheet. |
| **Quick chips** | One-tap buttons for your most repeated expenses (with the last amount as a hint). |
| **Receipt X-ray** | Photo → per-article list with a suggested category each, a grouped summary with percentages, tap any line to recategorise. Strict-JSON request to Gemini with a response schema whose categories are your real ones. |
| **Two ways to save a receipt** | **Split**: one sheet row per category (the last one absorbs rounding so the rows add up *exactly* to the ticket total) with the items of that category in `Detalle_Items`. **Single row**: the full total with the whole breakdown stored inside. |
| **Mismatch guard** | If the items don't add up to the ticket total, an explicit *adjustment* line is added and you are warned. |
| **History search** | Searches concept, category, store **and the articles inside receipts** ("cheese", "figurine"). Tapping a receipt expense opens the full itemised ticket. |
| **How much is left** | Same maths as the spreadsheet it came from: `income (salary + extras) − fixed costs − active subscriptions − day-to-day expenses + refunds`, with a battery bar and traffic light (green ≥ 20 %, yellow < 20 %, red ≤ 0). |
| **Summary** | Month totals and a bar per category (against a budget if you set one). |
| **Offline-first** | Entries are applied locally and queued; they are sent when the network returns, **exactly once** (retries are idempotent by ID). The app also opens with no connection. |
| **Excel** | Import your own `.xlsx` (finds the *Fecha / Categoría / Importe* columns, never duplicates on re-import) and export one (first five columns match a typical expenses sheet). |
| **Config link** | Copy a one-tap setup link from Settings and open it on another phone, so you never type the long token by hand. |

## Quick start (about 10 minutes)

You need a Google account. Nothing here costs money (Gemini has a free tier).

### 1. Create the backend (Google Sheets + Apps Script)
1. Create a new Google Sheet ([sheets.new](https://sheets.new)).
2. **Extensions → Apps Script**. Delete the default code and paste the contents of [`backend/Code.gs`](backend/Code.gs). Save.
3. Reload the sheet. A **💰 Finanzas App** menu appears. Run **1. Configurar (crear pestañas y token)** and accept the permissions (Google warns *"unverified app"* the first time because it is your own script: *Advanced → Go to…*).
4. A dialog shows your **TOKEN**. Copy it.
5. **Deploy → New deployment → Web app**. *Execute as:* **Me** · *Who has access:* **Anyone**. Copy the `/exec` URL.

> The URL is public but **every operation requires the token**. After editing `Code.gs` you must redeploy (*Manage deployments → Edit → New version*).

### 2. Connect the app
1. Open https://imsothe.github.io/Finanzas/ on your phone (or host the `app/` folder yourself, see below).
2. **Ajustes (Settings)** → paste the `/exec` URL and the token → *Probar* (Test).
3. Optional, for the receipt scanner: paste a **Gemini API key** ([Google AI Studio](https://aistudio.google.com/apikey)). Default model: `gemini-2.5-flash`.
4. **Install it**: Android/Chrome → ⋮ → *Install app*. iPhone/Safari → Share → *Add to Home Screen*.
5. For a second phone: **Ajustes → 🔗 Enlace para configurar otro móvil**, send the link to yourself and open it there.

### 3. Start from your own Excel (optional)
`tools/build_seed.py` reads your spreadsheet and creates a personalised `Code.gs` that seeds your categories, salary, fixed costs, subscriptions and a habits dictionary taken from your history:
```bash
pip install openpyxl
python tools/build_seed.py "path/to/your_finance_sheet.xlsx"   # -> seed/seed.json  (git-ignored)
python tools/build_gs.py                                       # -> dist/Code.gs    (git-ignored, paste this one)
```
Or just use **Ajustes → Importar .xlsx** to bring your history in.

## Managing it day to day

You manage everything **from the Google Sheet itself**; the app picks changes up on its next sync (every 30 s while open, when you return to it, or via *Ajustes → Sincronizar*).

| I want to… | Do this |
|---|---|
| **Add / rename a category** | Sheet tab `Config` → row `categorias` → edit the JSON list. Keep the exact text if existing expenses use it (renamed categories show as *Sin categoría* until you recategorise). |
| **Set my salary / change it** | `Config` → `sueldo`: a series `[{"desde":"2026-10","importe":1500}]`. A value **applies from that month onward** until a later one; before the first month it is 0. Raise in May? Add `{"desde":"2027-05","importe":1650}`. |
| **Fixed monthly costs** (rent, insurance…) | `Config` → `fijos`: `{"🏠 Housing":[{"desde":"2026-01","importe":600}]}` (same "from this month on" logic). |
| **Subscriptions** | `Config` → `suscripciones`: `[{"nombre":"Streaming","importe":9.99,"activa":true}]`. They are summed into the category whose name contains "Suscripci…". Set `"activa":false` to stop counting one. |
| **Budget per category** | In `categorias`: `{"nombre":"🍻 Leisure","presupuesto":150}` → the summary bar shows % of budget and turns red when exceeded. |
| **Extra income types** | `Config` → `tiposExtra`. Extra income is logged from the main form's **＋ Extra** switch. |
| **Fix or delete an expense** | In the app: History → tap it → *Change category* / *Delete*. Or edit/delete the row in the `Gastos` tab (rows typed by hand get an ID automatically). |
| **Edit what the app learned** | Settings → *Diccionario de costumbres* (✕ deletes an entry), or the `Diccionario` tab. Origins: `historial` (from your spreadsheet), `app` (learned from you, weighs most), `semilla` (generic starter words). |
| **Back up / leave** | Settings → *Exportar .xlsx*. Google Sheets also keeps **version history** (File → Version history). |
| **Lost your phone** | Menu **💰 Finanzas App → Regenerar el token**, then re-link your devices. |
| **Update the app** | Nothing to do: the web app updates on its own (network-first service worker). The backend only changes if *you* redeploy `Code.gs`. |
| **Self-host the web app** | Serve the `app/` folder from any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). HTTPS is required for the camera and installation. |

### Sheet layout

| Tab | Columns / content |
|---|---|
| `Gastos` | Fecha · Categoría · Importe · Tipo (`Gasto` / `Devolución 🔄`) · Detalle · Comercio · **Detalle_Items** (JSON breakdown) · TicketID · Origen · ID · Creado |
| `Extras` | Fecha · Tipo de extra · Importe · Detalle · ID · Creado |
| `Config` | `categorias`, `sueldo`, `fijos`, `suscripciones`, `tiposExtra` (JSON); `ahorro` is reserved for future use |
| `Diccionario` | word → category · times used · origin |

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Token incorrecto" | Token pasted wrong or regenerated. Menu *Mostrar el token*. |
| *Probar* says it cannot connect | Deployment is not "Anyone", or you edited `Code.gs` without redeploying a new version. |
| Receipt scan: "API key not valid" | Wrong/expired Gemini key, or the key lacks access to the model. |
| Receipt scan: rate limit | Gemini free tier quota; wait a minute. |
| Numbers differ from my spreadsheet | Check `Config` (`sueldo`, `fijos`, `suscripciones`) and that categories match exactly. |

## Security & privacy

- The token is the only secret protecting your sheet through the public web-app URL. **Don't share the setup link or the token.** If leaked, regenerate it.
- The **token and the Gemini key are stored only in your browser**. The photo goes **directly to Google (Gemini)**, compressed; it never touches any server of mine. Restrict your key in AI Studio if you can.
- Receipt text is treated as **data, not instructions** (the prompt says so), and everything coming from the sheet or the AI is **HTML-escaped** before rendering (tested with hostile payloads).
- The config link only accepts Google Apps Script hosts and always asks for confirmation, so a crafted link cannot silently redirect your data.
- Single-user design: one sheet, no accounts or permissions.
- This repository contains **no personal data**: your categories, salary and dictionary live in your own sheet.

## What is tested, and what is not

**Tested automatically** (`npm test`, 37 tests): the Apps Script backend run unmodified against an in-memory sheet (auth, idempotent adds, validation, update/delete, dictionary, config) and the pure core (monthly maths, autocomplete, dictionary precedence, receipt normalisation and exact split sums, search inside receipts, Excel import ids). **Also driven end to end in a browser** emulating a phone against a local server running the real `Code.gs`: 3-second entry, learning, both receipt save modes, offline queue replay without duplicates, offline start, Excel import/export, Gemini error handling and the config link.

**Not verified in the real world yet:**
- Deployment on a real Google Apps Script (permissions, cross-origin behaviour of `script.google.com`).
- **Gemini on real receipt photos**: reading accuracy depends on the photo. Only the request format was confirmed (Google's API accepted the call and rejected a fake key); the response was simulated.
- Installation and camera behaviour on real iPhone/Android devices.
- Performance with many thousands of rows.

## Development

```bash
npm test        # backend (simulated sheet) + core logic
npm run dev     # http://127.0.0.1:8777 with a simulated sheet and a simulated Gemini (token printed in the console)
```
`app/core.js` has no DOM code: all business logic lives there and is what the tests exercise. `app/app.js` is the UI and sync layer. No build step.

## Credits & licence

MIT, see [LICENSE](LICENSE). Bundles [SheetJS](https://sheetjs.com) (Apache-2.0) in `app/vendor/`. Receipt reading uses Google's Gemini API under your own key and Google's terms. Spanish guide: [README.es.md](README.es.md).
