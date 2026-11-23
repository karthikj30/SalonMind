// Renders the app's own scissors mark (src/app/icon.svg) into every icon size the PWA, Android and desktop apps need.
// Usage: npm run icons   (re-run after changing the logo)
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1e38"/><stop offset="1" stop-color="#94402e"/></linearGradient></defs>`;
const SCISSORS = `<g fill="none" stroke="#e8cf8f" stroke-width="3.2" stroke-linecap="round"><circle cx="22" cy="42" r="6"/><circle cx="42" cy="42" r="6"/><path d="M26.5 37.5 44 16M37.5 37.5 20 16"/></g>`;
// rounded tile (favicon look)
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}<rect width="64" height="64" rx="16" fill="url(#g)"/>${SCISSORS}</svg>`;
// full-bleed square with the mark inside the 80% safe zone (Android adaptive / maskable icons crop the corners)
const bleed = (scale = 0.62) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}<rect width="64" height="64" fill="url(#g)"/><g transform="translate(32 32) scale(${scale}) translate(-32 -31)">${SCISSORS}</g></svg>`;
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}<circle cx="32" cy="32" r="32" fill="url(#g)"/><g transform="translate(32 32) scale(.8) translate(-32 -31)">${SCISSORS}</g></svg>`;
// transparent mark only (splash screen sits on the plum background)
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(32 32) scale(1.1) translate(-32 -31)">${SCISSORS}</g></svg>`;

async function out(svg, size, file) {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png().toFile(file);
}

const jobs = [
  [tile, 192, "public/icons/icon-192.png"], [tile, 512, "public/icons/icon-512.png"],
  [bleed(), 512, "public/icons/maskable-512.png"], [bleed(0.8), 180, "public/icons/apple-touch-icon.png"],
  [tile, 1024, "apps/desktop/build/icon.png"],
  [mark, 288, "apps/android/app/src/main/res/drawable/splash.png"],
];
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, px] of Object.entries(dens)) {
  jobs.push([bleed(0.8), px, `apps/android/app/src/main/res/mipmap-${d}/ic_launcher.png`]);
  jobs.push([round, px, `apps/android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`]);
}
await Promise.all(jobs.map(([svg, size, file]) => out(svg, size, file)));
console.log(`${jobs.length} icons written`);
