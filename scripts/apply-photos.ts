/**
 * Attaches the photos listed in recipes-src/photos.json to src/data/recipes.json.
 * Expects the files public/recipe-images/<recipe-id>.jpg and <recipe-id>-sm.jpg.
 *
 *   npm run photos:apply
 *
 * photos.json format per recipe: "<unsplash file id>|<unsplash photo id>|<photographer>"
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Recipe } from '../src/types';

const root = resolve(import.meta.dirname, '..');
const catalogPath = resolve(root, 'src/data/recipes.json');
const photos = JSON.parse(readFileSync(resolve(root, 'recipes-src/photos.json'), 'utf8')) as Record<string, string>;
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { recipes: Recipe[] };

let applied = 0;
const missing: string[] = [];
for (const r of catalog.recipes) {
  const entry = photos[r.id];
  const large = `public/recipe-images/${r.id}.jpg`;
  const small = `public/recipe-images/${r.id}-sm.jpg`;
  if (!entry || !existsSync(resolve(root, large))) {
    missing.push(r.id);
    delete r.image;
    continue;
  }
  const [, photoId, by] = entry.split('|');
  r.image = {
    url: `/recipe-images/${r.id}.jpg`,
    thumbUrl: existsSync(resolve(root, small)) ? `/recipe-images/${r.id}-sm.jpg` : undefined,
    alt: `Sfeerfoto bij ${r.title}`,
    credit: by,
    creditUrl: `https://unsplash.com/photos/${photoId}`,
    license: 'Unsplash License',
    illustrative: true,
  };
  applied++;
}
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Photos applied to ${applied} recipes.${missing.length ? ` Without photo: ${missing.join(', ')}` : ''}`);
