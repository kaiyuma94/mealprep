/**
 * Validates src/data/ingredients.json and src/data/recipes.json.
 * Usage: npm run validate:recipes  (exit code 1 on errors)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateIngredientCatalog, validateRecipeCatalog } from '../src/lib/validation';

const root = resolve(import.meta.dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

const ing = validateIngredientCatalog(read('src/data/ingredients.json'));
const rec = validateRecipeCatalog(read('src/data/recipes.json'), ing.ingredients);
const issues = [...ing.issues, ...rec.issues];

// Local images must exist in public/.
for (const r of rec.recipes) {
  for (const url of [r.image?.url, r.image?.thumbUrl]) {
    if (url?.startsWith('/') && !existsSync(resolve(root, 'public', url.slice(1)))) {
      issues.push({ recipeId: r.id, path: 'image', message: `missing image file public${url}`, severity: 'error' });
    }
  }
}

// Ingredients that no recipe uses are fine, but worth knowing about.
const used = new Set(rec.recipes.flatMap((r) => r.ingredients.map((i) => i.ingredientId)));
const unused = ing.ingredients.filter((i) => !used.has(i.id)).map((i) => i.id);

for (const i of issues) {
  const tag = i.severity === 'error' ? '\x1b[31merror\x1b[0m' : '\x1b[33mwarn \x1b[0m';
  console.log(`${tag} ${i.recipeId} ${i.path}: ${i.message}`);
}
const errors = issues.filter((i) => i.severity === 'error').length;
console.log(`\n${rec.recipes.length} valid recipes, ${ing.ingredients.length} ingredients, ${errors} error(s), ${issues.length - errors} warning(s).`);
if (unused.length) console.log(`Unused ingredients: ${unused.join(', ')}`);
if (errors) process.exit(1);
