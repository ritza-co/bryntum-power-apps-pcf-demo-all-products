// Concatenate all the Bryntum CSS files needed by the all-products bundle into
// a single dist/bryntum.css. Uploaded to Dataverse as one web resource alongside
// dist/bryntum.js, so updating Bryntum is "re-upload two files" instead of also
// rebuilding the PCF.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NM   = path.join(ROOT, 'node_modules', '@bryntum');

// Per-package theme files (e.g. core-thin/svalbard-light.css) are all identical
// — we only need one. Swap "svalbard-light" for any other theme you want.
const THEME = 'svalbard-light';

const CSS_FILES = [
  // 1. FontAwesome (icon framework — load first so structural CSS can reference icon classes)
  path.join(NM, 'core-thin/fontawesome/css/fontawesome.css'),
  path.join(NM, 'core-thin/fontawesome/css/solid.css'),

  // 2. Bryntum structural CSS, in dependency order (lower layers first)
  path.join(NM, 'core-thin/core.css'),
  path.join(NM, 'grid-thin/grid.css'),
  path.join(NM, 'scheduler-thin/scheduler.css'),
  path.join(NM, 'schedulerpro-thin/schedulerpro.css'),
  path.join(NM, 'gantt-thin/gantt.css'),
  path.join(NM, 'calendar-thin/calendar.css'),
  path.join(NM, 'taskboard-thin/taskboard.css'),

  // 3. Theme (loaded last so it overrides structural CSS)
  path.join(NM, `core-thin/${THEME}.css`),
];

const FA_VERSION = '6.7.2';

const parts = CSS_FILES.map((file) => {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing CSS file: ${file}. Did you run 'npm install'?`);
  }
  let css = fs.readFileSync(file, 'utf8');

  // solid.css uses url(../webfonts/fa-solid-900.{woff2,ttf}) for the webfont.
  // That relative path won't resolve when the CSS is hosted as a single
  // Dataverse web resource. Rewrite to the FontAwesome CDN so the icons load
  // without us also having to host the font files. If your environment blocks
  // external CDNs, upload the .woff2/.ttf files as web resources and rewrite
  // these URLs to point at /WebResources/<prefix>_<font>.
  css = css.replace(
    /url\(["']?\.\.\/webfonts\/fa-(\w+)-(\w+)\.(woff2|ttf)["']?\)/g,
    `url(https://use.fontawesome.com/releases/v${FA_VERSION}/webfonts/fa-$1-$2.$3)`,
  );

  return `/* === ${path.relative(ROOT, file)} === */\n${css}`;
});

const combined = parts.join('\n\n');

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'bryntum.css');
fs.writeFileSync(outFile, combined);

console.log(
  `Wrote ${path.relative(ROOT, outFile)} (${(combined.length / 1024).toFixed(0)} KiB from ${CSS_FILES.length} files)`,
);
