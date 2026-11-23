# Weekmenu

A mobile-first Progressive Web App (fully in Dutch) for planning a week of vegetarian dinners for two: pick your meals on Sunday, get one consolidated shopping list sorted for your Dutch supermarket (Lidl, Albert Heijn or Jumbo), and cook step by step in a distraction-free cooking mode.

No account, no server, no paid APIs. Everything lives on your device in IndexedDB and works offline.

## Features

- **Discover** – 12 hand-picked recipes per week: 4 you've enjoyed before, 4 new ones that match your taste, and 4 for variety. The selection is deterministic per ISO week, stays stable all week, and lets you swap a single card. On Sunday (Europe/Amsterdam) it shows the coming week, with a toggle back to the current week.
- **Cooking nights** – choose 1–7 meals per week (default 4, 2 servings each), saved separately for each week. Lowering the number asks which meals to drop. Adding to a full week offers a swap or an extra night. Meals are never removed silently.
- **Dutch throughout** – Dutch UI, recipes, ingredient names, units (el, tl, tenen, snufje) and decimal commas.
- **Search** – by name, ingredient (Dutch, plus English aliases), cuisine or tag. Filter by cooking time, cuisine, favourites, cooked before, or new.
- **Recipe detail** – adjustable servings, scaled ingredients, full method, personal notes, favourite / "not for us", and source attribution.
- **Cooking mode** – large text, swipe or arrow-key navigation, step timers that keep running between steps, an ingredients overlay, and screen wake-lock.
- **Shopping list** – merged by canonical ingredient, units converted, scaled per meal. It shows what you *need* next to what to *buy* (typical Dutch pack sizes), grouped by aisle in the walking order of the selected store (Lidl, AH or Jumbo). Items that may be hard to find at that store are flagged with an alternative store ("mogelijk lastig bij Lidl, anders AH of Jumbo"). Pantry items are pre-marked "al in huis". You can also pick substitutions, add or edit items, and tick items off. Your ticks, edits and manual items survive changes to the menu.
- **Sharing** – a Delen button on the shopping list, the week menu and every recipe opens the phone's own share menu (WhatsApp, Messages, Mail, …) with a ready-made Dutch text, including links back to the recipes. It uses the browser's built-in share function: no accounts, no API, nothing is sent until you press send. Where there is no share menu (some desktop browsers), the text is copied instead.
- **History & backup** – favourites, dislikes, notes, cooking history, pantry and shopping progress persist. Export and restore everything as a JSON file.

## About the recipes

The app ships with **200 vegetarian recipes inspired by hellofresh.nl**, for personal use. They cover pasta, risotto and orzo, curries, Asian, Mexican and Middle Eastern dishes, soups, stamppot and other Dutch classics, ovenschotels, hartige taarten and salads:

- **Taken from the original:** the dish name and subtitle, the ingredients with their 2-person amounts, time and cuisine. These are facts and ideas.
- **Written in our own words:** every method step is our own wording. No instruction text was copied.
- **Not bundled:** HelloFresh's photos. Each recipe links to the original page instead ("Bekijk het origineel (met foto) op HelloFresh").
- **Adapted:** HelloFresh's own spice sachets and sauces were replaced with products from Dutch supermarkets. Non-vegetarian ingredients were swapped too: Worcestershire sauce contains anchovy, and Parmigiano and Grana Padano are made with animal rennet.

Each recipe is labelled with source type `inspired` and links to the recipe it is based on. Weekmenu is not affiliated with HelloFresh.

The recipe sources live in `recipes-src/` in the human-friendly import format and are compiled into `src/data/recipes.json` by the import script.

### Covers

Recipes show an illustrated top-down cover in their own two-colour `palette`. Its shape follows the kind of dish (soup, noodles, pasta, risotto/grains, curry with rice, stamppot, salad, bowl, pan, oven dish, pizza, tart, wrap, burger, or a plain plate), worked out from the recipe id and tags in `src/lib/dish.ts`. No photos are bundled, which keeps the app small and fully offline.

The app still supports an optional `image` per recipe (with url, alt, credit and license; local files go in `public/` and are checked by `npm run validate:recipes`), for adding your own photo of a dish later.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the test suite (Vitest) |
| `npm run typecheck` | TypeScript project check |
| `npm run validate:recipes` | Validate the recipe and ingredient catalogue |
| `npm run import:recipes -- <file> [--write]` | Convert and merge recipes from the import format |
| `npm run build` | Validate recipes, type-check and build to `dist/` |
| `npm run preview` | Serve the production build (with service worker) on port 4173 |

The PWA service worker is only active in production builds (`npm run build && npm run preview`). On a phone, open the deployed site and use "Add to Home Screen".

## Deployment (Cloudflare Pages)

The app is fully static.

1. Push the repository to GitHub/GitLab and create a Cloudflare Pages project from it.
2. Build command: `npm run build`. Build output directory: `dist`. Set the `NODE_VERSION` environment variable to `20` or newer.
3. `public/_redirects` sends every route to `index.html`, so deep links like `/recipe/lentil-bolognese` work.

Or deploy from your machine:

```bash
npm run build
npx wrangler pages deploy dist --project-name weekmenu
```

Any other static host works too (Netlify, GitHub Pages with an SPA fallback, nginx with `try_files $uri /index.html`).

## Adding recipes

See [docs/recipe-format.md](docs/recipe-format.md) for the full JSON schema, units, and source rules.

Ingredients can be written as plain Dutch lines, the way they appear on a recipe page:

```json
"ingredients": ["300 g bloemkool, in roosjes", "2 tenen knoflook", "1,5 el olijfolie", "½ rode peper", "naar smaak zout"]
```

To add a HelloFresh-inspired dish, add an entry to a file in `recipes-src/` with its title, the ingredients for 2 people and a `sourceUrl` linking to the original page. Write the method steps in your own words. Then run:

```bash
npm run import:recipes -- recipes-src/hellofresh-geinspireerd-2.json          # dry run: shows unknown ingredients, missing fields
npm run import:recipes -- recipes-src/hellofresh-geinspireerd-2.json --write  # merge into src/data/recipes.json
npm test && npm run build
```

Ingredients are matched to canonical IDs through names, plurals and aliases in `src/data/ingredients.json`. Add aliases or new ingredients there when the importer reports unknown names.

## Testing

`npm test` runs 133 tests covering:

- ISO week numbers, year rollover, and Sunday / midnight boundaries in Europe/Amsterdam (CET and CEST)
- Deterministic weekly selection, bucket composition, cold start, cuisine diversity, single-card replacement
- Recently eaten recipes held back, and favourites not dominating over a simulated 12 weeks
- Meal target changes (raise, lower with explicit removal, full-week handling) and concurrent adds
- Serving scaling, unit conversion (mass, volume, count via weight and density) and Dutch formatting
- Shopping list aggregation, packaging suggestions, per-store aisle order and availability hints, pantry and stock overrides, substitutions, persistence of checks, edits and manual items across regeneration, and plain-text export
- IndexedDB persistence, the v1 → v2 database upgrade, backup export/restore and migration, and invalid or future backup rejection
- Recipe and import validation with missing or incomplete data, plus the plain ingredient-line parser
- Sharing via the share menu, the copy fallback and a closed share menu, plus the texts for the week menu and a scaled recipe
- Every recipe using an illustrated cover (its own palette), with no bundled photos

## Architecture

```
src/
  types.ts            Domain model (Recipe, Ingredient, WeeklyMealPlan, ShoppingItem, …)
  data/               Static catalogue (JSON) + validated loader
  lib/                Pure logic – no React, no IndexedDB
    week.ts           ISO weeks in Europe/Amsterdam, Sunday planning rule
    selection.ts      Seeded weekly discovery + replacement
    plan.ts           Meal target / add / swap / remove rules
    units.ts          Conversion, scaling, formatting
    shopping.ts       Aggregation, packaging, overrides, store hints, text export
    share.ts          Share menu / copy fallback, week menu and recipe texts
    sections.ts       Supermarkets (Lidl, AH, Jumbo) and their aisle order
    search.ts         Recipe search & filters
    validation.ts     Catalogue validation
    importer.ts       Import-format conversion (used by scripts only)
  db/                 Dexie schema, repository functions, backup/migrations
  state/hooks.tsx     React context + live queries
  components/         UI primitives, cards, dialogs, layout
  screens/            Discover, Search, My Week, Shopping list, Recipe, Cooking mode, Settings
recipes-src/          Recipe sources (import format, plain Dutch ingredient lines)
scripts/              validate-recipes, import-recipes, make-icons
tests/                Vitest suites
```

**Persistence & migrations.** IndexedDB is versioned through Dexie (`src/db/db.ts`). Never edit a released `version(n)` block. Add `version(n+1)` with an `upgrade()` instead. Version 2 is an example: it converted the stored supermarket `'lidl-nl'` to `'lidl'` when multi-store support arrived. Backups carry a format version (now 2), and `migrateBackup()` in `src/db/backup.ts` upgrades older files step by step and rejects files from newer app versions.

**Consistency.** Every change to a weekly plan goes through `mutatePlan()`, an IndexedDB read-modify-write transaction, so quick successive taps can't overwrite each other.
