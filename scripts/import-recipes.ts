/**
 * Imports recipes from a file in the "weekmenu-recipe-import" format
 * (see docs/recipe-format.md) into src/data/recipes.json.
 *
 *   npm run import:recipes -- path/to/file.json           # dry run, report only
 *   npm run import:recipes -- path/to/file.json --write   # merge into the catalog
 *
 * Recipes with an existing id are replaced; new ids are appended.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertImport } from '../src/lib/importer';
import { validateIngredientCatalog, validateRecipeCatalog } from '../src/lib/validation';
import type { Recipe } from '../src/types';

const [, , input, ...flags] = process.argv;
if (!input) {
  console.error('Usage: npm run import:recipes -- <file.json> [--write]');
  process.exit(2);
}
const root = resolve(import.meta.dirname, '..');
const catalogPath = resolve(root, 'src/data/recipes.json');
const { ingredients } = validateIngredientCatalog(JSON.parse(readFileSync(resolve(root, 'src/data/ingredients.json'), 'utf8')));
const result = convertImport(JSON.parse(readFileSync(resolve(process.cwd(), input), 'utf8')), ingredients);

for (const i of result.issues) console.log(`${i.severity === 'error' ? 'error' : 'warn '} ${i.recipeId} ${i.path}: ${i.message}`);
if (result.unknownIngredients.length) console.log(`\nUnknown ingredients: ${result.unknownIngredients.join(', ')}`);
console.log(`\n${result.recipes.length} recipe(s) ready to import.`);

if (!flags.includes('--write')) {
  console.log('Dry run — pass --write to update src/data/recipes.json.');
  process.exit(result.issues.some((i) => i.severity === 'error') ? 1 : 0);
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { format: string; schemaVersion: number; recipes: Recipe[] };
const byId = new Map(catalog.recipes.map((r) => [r.id, r]));
for (const r of result.recipes) byId.set(r.id, r);
const next = { ...catalog, recipes: [...byId.values()] };
const check = validateRecipeCatalog(next, ingredients);
if (check.issues.some((i) => i.severity === 'error')) {
  console.error('Merged catalog would be invalid; nothing written.');
  process.exit(1);
}
writeFileSync(catalogPath, JSON.stringify(next, null, 2) + '\n');
console.log(`Wrote ${next.recipes.length} recipes to src/data/recipes.json`);
