# Connections Helper by bzsbcode

A helper for the NYT Connections puzzle at [nyt.bzsb.eu](https://nyt.bzsb.eu). It shows the 16 words of today's board and, for each one, every meaning it has: every part of speech, every sense, the slangy and figurative ones too, because that's where the groups hide.

It never shows the solution. The NYT response is cut down to the 16 words, the puzzle number and the date the moment it arrives; the categories, titles and group membership are never cached, logged or sent to the browser.

An unofficial helper, not affiliated with or endorsed by The New York Times.

## How it works

- **Astro** builds a static site (`output: "static"`) styled with **Tailwind CSS v4**. The design system lives in `src/styles/global.css`, ported from the bzsbcode portfolio. All copy is in `src/ui.ts`.
- A hand-written **Cloudflare Worker** (`src/worker/index.ts`) serves the built site through the `ASSETS` binding and handles three routes:
  - `GET /`: fills the static page with today's board using `HTMLRewriter` (`src/worker/home-page.ts`), so the words are in the HTML without JavaScript.
  - `GET /api/today`: `{ puzzle: { number, date, words }, stale }`.
  - `GET /api/define?word=…`: every sense of one word, merged from the [Free Dictionary API](https://dictionaryapi.dev) and [Wiktionary](https://en.wiktionary.org), near-duplicates folded together and each sense labelled with its sources.
- **Workers KV** (binding `CACHE`) caches the puzzle (`puzzle:YYYY-MM-DD`, 36 hours, plus `puzzle:last` as a fallback) and each word's definitions (`def:<word>`, 30 days, or 1 hour if a dictionary failed). Upstream failures are remembered too, so the NYT and the dictionaries are never hammered.
- "Today" is the date in Budapest. If the NYT has no puzzle for it yet, the previous day's is used; if the NYT is down, the last saved puzzle is shown with a note.

## Run it locally

Requires Node.js 22 or later. Every command works the same in PowerShell, cmd and bash.

```sh
npm install
npm test          # unit tests (Vitest)
npm run preview   # build, then run the site and the worker with wrangler dev
```

`npm run preview` serves the full site, worker included, at http://localhost:8787, with a local KV store under `.wrangler/` (no Cloudflare account needed). `npm run dev` runs Astro alone: handy for styling, but without the worker the page shows its "couldn't be loaded" state.

`npm run build` runs `astro check` and `astro build`; it must finish with no errors and no warnings.

## KV and deploying

The `CACHE` namespace is declared in `wrangler.jsonc` without an id. On the first `npm run deploy`, wrangler creates the namespace in your Cloudflare account and binds it; nothing needs to be created by hand, and nothing is written back to the config.

```sh
npx wrangler login
npm run deploy    # astro check, astro build, wrangler deploy
```

Then add `nyt.bzsb.eu` as a custom domain for the `connections-helper` Worker (Workers & Pages → connections-helper → Settings → Domains & Routes).

The site sends `noindex` for now; `public/robots.txt` keeps crawlers out of `/api/`.

## Data sources and their limits

- **NYT** `https://www.nytimes.com/svc/connections/v2/YYYY-MM-DD.json` is undocumented and may change or disappear. If its shape changes (for example, image cards instead of words), the parser refuses it and the page shows its error state instead of guessing.
- **Free Dictionary API** is a free, volunteer-run service and is sometimes down.
- **Wiktionary** (CC BY-SA 4.0) rate-limits by IP and User-Agent. Its REST output drops usage labels such as "slang" or "informal", so those senses appear but without their label.

## Tests

`npm test` covers the date logic, puzzle parsing (including a check that no grouping data survives), the worker's caching and fallbacks, and definition parsing, merging and de-duplication. Fixtures are in `test/fixtures` (see its README for where each came from).
