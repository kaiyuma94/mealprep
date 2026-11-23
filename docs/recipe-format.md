# Recipe data format

Weekmenu keeps recipe data in two static JSON files that are bundled with the app:

| File | Contents |
| --- | --- |
| `src/data/ingredients.json` | Canonical ingredient catalogue (IDs, supermarket section, units, pack sizes) |
| `src/data/recipes.json` | The recipe catalogue, referencing ingredients by canonical ID |

Recipe ingestion is **separate from the frontend**: new recipes are converted and validated by CLI scripts (`scripts/`), and the app only ever loads the validated catalogue. At runtime the app validates again and skips any invalid recipe instead of crashing.

## Source rules

Every recipe carries a `source`:

| `type` | Use for | Required |
| --- | --- | --- |
| `inspired` | A known dish (e.g. from hellofresh.nl): name and ingredients taken from it, **method in your own words** | `name`, `url` of the original |
| `personal` | Your own recipes | `name` |
| `licensed` | Openly licensed or permitted third-party recipes, copied as-is | `name`, `license` (and `url`) |
| `original` | Recipes written for Weekmenu | `name` |

- Dish names, ingredient lists and amounts are facts and ideas, so they can be used as inspiration. Instruction text and photos are copyrighted: write the method yourself and never copy it verbatim.
- Don't bundle third-party photos. Link to the original via `source.url`. Images in `image` need `url`, `alt`, `credit` and `license`. Without one, the app draws an illustrated cover from `palette`.
- The bundled HelloFresh-inspired collection is for personal use only.

## Catalogue recipe (`src/data/recipes.json`)

```jsonc
{
  "format": "weekmenu-recipes",
  "schemaVersion": 1,
  "recipes": [
    {
      "id": "lentil-bolognese",            // kebab-case, unique, never reused
      "schemaVersion": 1,
      "title": "Rich lentil bolognese",
      "subtitle": "with spaghetti",          // optional
      "description": "…",
      "cuisine": "Italian",                  // used for diversity and filters
      "tags": ["comfort", "budget"],
      "prepMinutes": 10,
      "cookMinutes": 30,
      "difficulty": "easy",                  // easy | medium | hard
      "baseServings": 2,                     // amounts below are for this many people
      "palette": ["#8e3b26", "#e8c48f"],     // optional, illustrated cover colours
      "ingredients": [
        { "ingredientId": "onion", "amount": 1, "unit": "piece", "note": "finely chopped" },
        { "ingredientId": "salt", "amount": null, "unit": "pinch" }   // null = to taste
      ],
      "steps": [
        { "text": "Finely chop the onion…" },
        { "text": "Simmer the sauce…", "timerMinutes": 18 }
      ],
      "source": { "type": "inspired", "name": "HelloFresh", "url": "https://www.hellofresh.nl/recipes/…" },
      "image": { "url": "/recipe-images/x.jpg", "alt": "…", "credit": "…", "license": "CC BY 4.0" } // optional
    }
  ]
}
```

### Units

`g`, `kg`, `ml`, `l`, `tsp` (5 ml), `tbsp` (15 ml), and count units `piece`, `clove`, `bunch`, `pinch`, `can`, `pack`, `jar`.

Mass and volume convert within their dimension. Across dimensions the ingredient's physical properties are used:

- `gramsPerCount` converts `piece`/`clove` ↔ grams (e.g. 1 onion = 150 g)
- `densityGPerMl` converts volume ↔ mass (e.g. 1 tbsp cornflour = 8 g)

Anything that can't be converted is listed separately on the shopping list, never silently merged.

## Canonical ingredient (`src/data/ingredients.json`)

```jsonc
{
  "id": "tempeh",                    // canonical ID — never rename once published
  "name": "tempeh",                  // Dutch display name
  "plural": "…",                     // optional, for count units
  "section": "chilled",              // supermarket section (each store orders sections differently)
  "defaultUnit": "g",                // unit the shopping list totals in
  "aliases": ["tempehblokjes"],      // other names (Dutch & English) for imports and search
  "gramsPerCount": 150,              // optional
  "densityGPerMl": 1.03,             // optional
  "packages": [{ "amount": 200, "unit": "g", "label": "blok" }],  // typical Dutch pack sizes (indicative)
  "pantry": true,                    // optional, suggested pantry staple
  "limitedAt": ["lidl"],             // optional: stores where it may be hard to find (lidl | ah | jumbo)
  "substitutes": ["tofu"],           // optional, canonical IDs
  "note": "Let op het etiket…"       // optional shopping tip
}
```

Sections: `produce`, `herbs`, `bakery`, `chilled`, `dairy-eggs`, `pasta-rice-grains`, `canned-jarred`, `world-foods`, `oils-sauces`, `spices`, `baking`, `nuts-dried`, `frozen`, `other`. The walking order per store is defined in `src/lib/sections.ts`.

Pack sizes, aisle orders and `limitedAt` hints are editorial, not live data. The app labels them as indicative.

## Import format (for adding recipes)

The importer accepts a friendlier format and converts it to the catalogue format above. Ingredients can be **plain lines** as they appear on a recipe page, or objects. See [`example-import.json`](./example-import.json) and the `recipes-src/` folder.

```jsonc
{
  "format": "weekmenu-recipe-import",
  "source": { "type": "inspired", "name": "HelloFresh" },     // default for all recipes in the file
  "recipes": [
    {
      "title": "…", "subtitle": "met …", "cuisine": "Indiaas", "prepMinutes": 10, "cookMinutes": 20, "servings": 2,
      "sourceUrl": "https://www.hellofresh.nl/recipes/…",      // merged into source.url
      "ingredients": [
        "300 g bloemkool, in roosjes",        // amount, unit, name, ", note"
        "2 tenen knoflook",
        "1,5 el olijfolie",                   // decimal comma
        "½ rode peper",                       // no unit → the ingredient's own unit
        "5 g sambal (optioneel)",
        "naar smaak zout",                    // no amount
        { "ingredientId": "kikkererwten", "amount": 400, "unit": "g" }
      ],
      "steps": ["Plain strings are fine", { "text": "…or objects with timers", "timerMinutes": 10 }]
    }
  ]
}
```

Dutch unit names (`el`, `tl`, `stuk(s)`, `teen`/`tenen`, `bosje`, `snufje`, `blik`, `pak`, `zakje`, `rol`, `pot`, …) are understood. Unknown ingredient names are reported. Add them, or an alias, to `ingredients.json` and run the import again.

```bash
npm run import:recipes -- docs/example-import.json          # dry run
npm run import:recipes -- docs/example-import.json --write  # merge into the catalogue
npm run validate:recipes                                    # also runs on every build
```
