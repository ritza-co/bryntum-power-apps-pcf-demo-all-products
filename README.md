# Demo showing all Bryntum components in a single Power Apps component framework React component

Demo of one PCF component that uses all 6 Bryntum products. Total PCF bundle size ≈ 10 KiB. This is achieved by hosting [Bryntum thin packages](https://bryntum.com/products/gantt/docs/guide/Gantt/integration/javascript/multiple-products) as two Dataverse web resources — one JS bundle (`bryntum.js`, 4.16 MiB) and one CSS bundle (`bryntum.css`, 744 KiB) — both built from the npm packages in `bryntum-shared/node_modules/`. No manual download from [customerzone](https://customerzone.bryntum.com/) needed.

### Why a single all-products PCF can't bundle Bryntum inline

It is **5.45 MiB** (all bryntum products), including PCF code, which is over the 5 MB default upload size limit.

For reference, individual product builds in production mode:
- Gantt alone (umbrella `@bryntum/gantt`): 3.87 MiB
- Gantt alone (thin): 3.71 MiB

So you need to move Bryntum library code out of the PCF, or split into multiple PCFs (one Bryntum component per PCF). Here are 2 options:

### Option 1 (recommended): Bryntum as a Dataverse web resource, PCFs reference using `window.bryntum`

We built and verified this end-to-end — all 6 Bryntum products render on the same Power Apps app page from a single PCF:

![](./app.png)

There are two folders in this GitHub repo:

1. **`bryntum-shared`** — a standalone build project that produces two files from the `@bryntum/*-thin` npm packages: `dist/bryntum.js` (webpack-bundled JS) and `dist/bryntum.css` (concatenated CSS via a small Node script). Both are uploaded to Dataverse as web resources.
2. **`bryntum-power-apps-component`** — the PCF component itself. Its own bundle stays at ~10 KiB because Bryntum's JS and CSS are loaded at runtime from the Dataverse web resources.

### Bryntum version 6 to 7 changes

The PCF in `bryntum-power-apps-component` is adapted from [this blog post](https://bryntum.com/blog/how-to-build-a-react-gantt-chart-in-microsoft-power-apps-using-bryntum-power-apps-component-framework-and-dataverse/), which uses Bryntum v6. These example repos use Bryntum v7.3, which changes a few things relative to the blog:

- **Theme**: blog uses `gantt.stockholm.css` (the v6 single-file theme format). This repo uses `svalbard-light.min.css` — Bryntum's [default theme in v7](https://bryntum.com/products/gantt/docs/guide/Gantt/quick-start/javascript#stylesheets). Both repos in this guide load Svalbard Light; swap for any other v7 theme by replacing `svalbard-light.min.css` with `stockholm-light.min.css`, `material3-light.min.css`, etc.
- **CSS split into multiple files**: v6 ships one combined `gantt.stockholm.css` per theme that bundles structural styles + theme + FontAwesome together. v7 splits them apart — you need the structural CSS, the theme, and FontAwesome separately, in that order. In this demo all 10 are concatenated into a single `bryntum.css` by `scripts/build-css.js` so they ship as one Dataverse web resource (see Step 1).
- **FontAwesome no longer auto-bundled**: v6 included icon webfonts inside its theme CSS. v7 requires `fontawesome.css` + `solid.css` to be imported separately. In this demo `scripts/build-css.js` concatenates both into `bryntum.css` and rewrites the `@font-face src` to the FontAwesome CDN (because relative `../webfonts/` paths don't resolve when CSS is hosted as a Dataverse web resource).
- **Thin packages**: blog uses the umbrella `@bryntum/gantt` package. This repo uses `@bryntum/*-thin` packages so multiple Bryntum products can coexist on one page without the "bundle loaded multiple times" error (see Option 2 caveat below).

### Architecture

```
Dataverse environment (single solution)
├─ Web resource: /WebResources/test_bryntum.js   ← 4.16 MiB
│  └─ exposes window.bryntum.{core, engine, grid, scheduler, schedulerpro, gantt, calendar, taskboard}
├─ Web resource: /WebResources/test_bryntum.css  ← 744 KiB
│  └─ FontAwesome + all 7 Bryntum thin product CSS + svalbard-light theme
│
└─ PCF code components
   └─ All-products demo PCF — bundle.js + tiny layout CSS, ~10 KiB total
```

All PCFs in the environment fetch the same two web resources → browser caches them once → a second PCF on the same page sees the global / stylesheet already present and skips loading. Multiple Bryntum products on the same page work because there's only one Bryntum module graph in memory.

### Steps to run the demo

#### Step 1 — Build the shared bundles (`bryntum-shared`)

You'll install the Bryntum thin packages, then run the build that produces both `dist/bryntum.js` and `dist/bryntum.css` from the contents of `node_modules/@bryntum/`.

The `bryntum-shared` folder contains:

- `package.json` — all 8 Bryntum thin packages as dependencies (`@bryntum/core-thin`, `engine-thin`, `grid-thin`, `scheduler-thin`, `schedulerpro-thin`, `gantt-thin`, `calendar-thin`, `taskboard-thin`)
- `src/all.js` — imports each thin package + its English locale, assigns to `window.bryntum`
- `webpack.config.js` — bundles `src/all.js` into `dist/bryntum.js`
- `scripts/build-css.js` — reads the per-product `*.css` + FontAwesome + theme files out of `node_modules/@bryntum/`, concatenates them in the correct load order (FontAwesome → structural → theme), rewrites the FontAwesome webfont `@font-face src` URLs to the FA CDN, writes `dist/bryntum.css`
- `npm run build` — runs both: `build:js` (webpack) then `build:css` (node script)

Install and build:

```bash
cd bryntum-shared
npm install
npm run build
```

You'll get:

- `dist/bryntum.js` — ~4.16 MiB
- `dist/bryntum.css` — ~744 KiB

Both under the 5 MB Dataverse webresource cap.

**Key things `src/all.js` does**:

```js
// 1. Import the thin packages.
import * as core from '@bryntum/core-thin';
// ...other 7 thin packages

// 2. Register English locales — thin packages don't auto-load any locale,
// without these Bryntum renders `L{Name}` placeholders and throws
// "this.L(...) is not a function" during render.
import '@bryntum/core-thin/locales/core.locale.En.js';
// ...other 6 locales

// 3. MERGE into window.bryntum (don't overwrite). The locale imports above
// register themselves on window.bryntum.locales via Bryntum's LocaleHelper.
// A naive `window.bryntum = {...}` would wipe the locales registry.
window.bryntum = Object.assign(window.bryntum || {}, {
  core, engine, grid, scheduler, schedulerpro, gantt, calendar, taskboard,
});
```

**Key thing `webpack.config.js` does** — declares the locale files as side-effectful so webpack production mode doesn't tree-shake them:

```js
module: {
  rules: [{ test: /\.locale\.[A-Za-z]+\.js$/, sideEffects: true }],
},
```

The locale files are UMD-wrapped and have no ESM exports. Without this rule, webpack 5 silently drops the import and you'll see `L{Name}` placeholders in the rendered UI.

**Key thing `scripts/build-css.js` does** — concatenates these files in this order:

1. `node_modules/@bryntum/core-thin/fontawesome/css/fontawesome.css`
2. `node_modules/@bryntum/core-thin/fontawesome/css/solid.css` (with `@font-face src` URLs rewritten to point at the FontAwesome CDN, since relative `../webfonts/` paths don't resolve from a Dataverse-hosted CSS file)
3. Structural per-product CSS in dependency order — `core.css`, `grid.css`, `scheduler.css`, `schedulerpro.css`, `gantt.css`, `calendar.css`, `taskboard.css`
4. `svalbard-light.css` (theme, loaded last so it overrides structural)

To change theme, edit the `THEME` constant at the top of `scripts/build-css.js`.

---

#### Step 2 — Upload `bryntum.js` and `bryntum.css` to Dataverse

Both files go into the **same solution** so they're versioned together (one export/import covers both when promoting between environments).

1. Go to <https://make.powerapps.com> → select your environment in the top-right nav
2. In the left nav → click on **Solutions**
3. Click **+ New solution**, display name: Bryntum, name Bryntum, create new publisher called bryntum, with prefix `test`

Then upload both web resources into that solution.

**2a. Upload `bryntum.js`**

4. In the **Objects** page that opens, click the down arrow to the right of the **+ New** button at top left → click **More** → **Web resource**
5. Upload `bryntum-shared/dist/bryntum.js`. Fill in:
   - **File type**: `JavaScript`
   - **Name**: `bryntum.js` (becomes prefixed → `test_bryntum.js`)
   - **Display name**: `Bryntum library` (anything readable)
6. **Save**

**2b. Upload `bryntum.css`**

7. Click **+ New** → **More** → **Web resource** again
8. Upload `bryntum-shared/dist/bryntum.css`. Fill in:
   - **File type**: `Style Sheet (CSS)`
   - **Name**: `bryntum.css` (becomes prefixed → `test_bryntum.css`)
   - **Display name**: `Bryntum stylesheet`
9. **Save**

**2c. Publish**

10. Back at the solution view: click **Publish all customizations** at the top left (needed because saving alone doesn't expose the URLs)

Verify both are reachable in your browser:

```
https://<your-env>.crm4.dynamics.com/WebResources/test_bryntum.js
https://<your-env>.crm4.dynamics.com/WebResources/test_bryntum.css
```

The JS one should show minified JavaScript; the CSS one should show concatenated CSS starting with the FontAwesome banner.

> These URLs are hardcoded in `bryntum-power-apps-component/Bryntum/AllProducts.tsx`. At the top are the constants `BRYNTUM_SCRIPT_URL = '/WebResources/test_bryntum.js'` and `BRYNTUM_CSS_URL = '/WebResources/test_bryntum.css'`. If your publisher prefix isn't `test`, update both lines.


#### Step 3 — Build and push the PCF (`bryntum-power-apps-component`)

```bash
cd bryntum-power-apps-component
npm install
pac pcf push --publisher-prefix test
```

This pushes a PCF whose `bundle.js` is ~9 KiB plus a tiny `AllProducts.css` (the demo's own layout/loader styles, < 1 KiB). The PCF doesn't ship any Bryntum CSS — that all lives in `test_bryntum.css` on Dataverse, fetched at runtime by `AllProducts.tsx` via `loadBryntumCss()`.

The manifest only registers the demo's own layout CSS:

```xml
<resources>
  <code path="index.ts" order="1"/>
  <platform-library name="React" version="16.8.6" />
  <!--
    Only the layout/loader CSS for this PCF is bundled here.
    Bryntum's own CSS is hosted on Dataverse as bryntum.css (single web
    resource, ~744 KiB) and injected at runtime by AllProducts.tsx →
    loadBryntumCss(). That means updating Bryntum is "re-upload bryntum.js
    + bryntum.css on Dataverse", with no PCF rebuild needed.
  -->
  <css path="css/AllProducts.css" order="1" />
</resources>
```

> **FontAwesome webfont:** by default the `bryntum.css` build references `https://use.fontawesome.com/...` for the icon webfont (the `@font-face src` URLs get rewritten to the CDN by `scripts/build-css.js`). If your environment blocks external CDN access, host the two webfont files (`fa-solid-900.woff2` + `.ttf`, ~150 KiB combined) as Dataverse web resources and update the URL pattern in `scripts/build-css.js` to point at those instead.

---

#### Step 4 — Add the PCF to the Power Apps app

Follow the steps from the [blog post](https://bryntum.com/blog/how-to-build-a-react-gantt-chart-in-microsoft-power-apps-using-bryntum-power-apps-component-framework-and-dataverse/) (the section "Adding the Bryntum Gantt React component to the Power Apps app"):

1. Open your model-driven app → **Edit**
2. Add a custom page (or open an existing one)
3. **+ Insert** → **Get more components** → **Code** tab → import `Bryntum` (the component this PCF registers)
4. Drop it on the canvas → resize to fill the page
5. **Save** → **Back** → **Publish** → **Play**, then hard-refresh the page (Cmd/Ctrl+Shift+R)

On first load you'll see "Loading Bryntum…" briefly, then all 6 products render with inline sample data.

![](./app.png)

### Notes

`bryntum-power-apps-component/Bryntum/AllProducts.tsx` loads Bryntum from the web resource.
The PCF's working pattern is: fetch the bundle as text, execute it in the current realm via `new Function(...)` with `window`/`self`/`globalThis` explicitly bound. Falls back to inline `<script textContent=...>` if `new Function` is blocked by CSP. The full implementation is in `AllProducts.tsx`.

> **What's a "realm"?** A JavaScript realm is the isolated world that owns its own `window`, `document`, and built-ins (`Array`, `Promise`, etc.). Every iframe is its own realm; the main page is another. If you assign `window.bryntum = ...` in iframe A, code running in iframe B sees `window.bryntum` as `undefined` — different `window` objects.
>
> Power Apps embeds custom pages inside nested iframes, so a `<script src="...">` injected naively by a PCF can sometimes execute in a sibling realm rather than the one the React tree observes. That's why we use `new Function(...)` with `window` explicitly bound — it forces the assignment into the same realm as the calling code.
>
> You can see this in Chrome DevTools: at the top-left of the Console there's a frame/realm picker (defaults to **top**). Click it to switch between frames and re-run `window.bryntum` — sometimes the global is set in one realm but not another.

**Render containers from the first render, not behind a loader.** Power Apps needs to lay them out before Bryntum mounts. If you conditionally render the containers only when `ready=true`, Bryntum reads `height=0` and renders empty shells on first load.

**Why no React wrapper (`@bryntum/*-react-thin`)?** Because the wrappers internally `import { ... } from '@bryntum/gantt-thin'` etc., so using them re-bundles Bryntum into the PCF — defeating the whole point of hosting Bryntum on Dataverse. To use the wrappers in this architecture, you'd need webpack `externals` config in the PCF to map `@bryntum/*-thin` to `window.bryntum.*`. Possible, but more setup. Mounting vanilla classes via `appendTo: ref.current` in `useEffect` is ~5 lines per product.

| Metric | Value |
|---|---|
| Shared `bryntum.js` web resource | 4.16 MiB (under 5 MB cap, no admin changes needed) |
| Shared `bryntum.css` web resource | 744 KiB |
| Per-PCF `bundle.js` | ~9 KiB |
| Per-PCF `AllProducts.css` | < 1 KiB (demo layout/loader styles only) |
| Products renderable simultaneously on same page | All 6 (Gantt + SchedulerPro + Scheduler + Calendar + TaskBoard + Grid) |
| External CDN dependencies | FontAwesome webfont (can be hosted on Dataverse if external CDN is blocked) |
| Updating Bryntum | re-upload `bryntum.js` and `bryntum.css` in the solution → publish → all PCFs get the new version |

### Updating Bryntum

Because the PCF carries no Bryntum code or CSS, most upgrades are just two file replacements on Dataverse:

```bash
cd bryntum-shared
npm install @bryntum/core-thin@latest @bryntum/engine-thin@latest \
            @bryntum/grid-thin@latest @bryntum/scheduler-thin@latest \
            @bryntum/schedulerpro-thin@latest @bryntum/gantt-thin@latest \
            @bryntum/calendar-thin@latest @bryntum/taskboard-thin@latest
npm run build
```

Then in the maker portal:

1. Open the solution containing `test_bryntum.js` and `test_bryntum.css`
2. Open `bryntum.js` web resource → **Replace file** with the rebuilt `bryntum-shared/dist/bryntum.js` → **Save**
3. Open `bryntum.css` web resource → **Replace file** with the rebuilt `bryntum-shared/dist/bryntum.css` → **Save**
4. **Publish all customizations**

All PCFs in the environment immediately use the new Bryntum version on next page load (browser cache aside — users may need a hard-reload).

Only rebuild and re-push `bryntum-power-apps-component` if the Bryntum upgrade requires API changes in `AllProducts.tsx` (renamed configs, removed methods, etc. — check the Bryntum changelog).

### Option 2: One PCF per product, multiple PCFs on the same page

If you want Gantt and Calendar (or any combination of products) on the same Power Apps page, build them as **separate PCFs** — one PCF per product — and add multiple PCFs to the same page.

For each PCF, install only the **thin packages** that PCF actually uses. Thin packages are required — per the [Bryntum docs on combining multiple products](https://bryntum.com/products/gantt/docs/guide/Gantt/integration/javascript/multiple-products):

> It is not possible to import several regular (non-thin) Bryntum npm packages like `@bryntum/grid` and `@bryntum/calendar` in one application. Doing this will lead to a runtime console error: **"The Bryntum Gantt bundle was loaded multiple times by the application."**

So for example:

- Gantt PCF: installs `@bryntum/core-thin`, `@bryntum/engine-thin`, `@bryntum/grid-thin`, `@bryntum/scheduler-thin`, `@bryntum/schedulerpro-thin`, `@bryntum/gantt-thin`. Bundle comes in around 3.7 MiB — under 5 MB.
- Calendar PCF: installs `@bryntum/core-thin`, `@bryntum/engine-thin`, `@bryntum/grid-thin`, `@bryntum/scheduler-thin`, `@bryntum/calendar-thin`. Bundle around 3 MiB — under 5 MB.
- Etc. for any other product.

Each PCF is self-contained, deploys independently with `pac pcf push`, and stays under the 5 MB cap because thin packages only include the layers their product depends on (for example, no unused Calendar/TaskBoard code dragged in by an umbrella package).

You add the Gantt PCF, the Calendar PCF, etc. as separate components on the same custom page in Power Apps — they render side-by-side.

**You don't need Option 1's Dataverse web resources for this case** — Bryntum's JS and CSS stay bundled inside each PCF, no extra infrastructure to manage. Option 1 is only necessary when you want *all six products* in *one* PCF (which exceeds 5 MB).

- **Pro:** simplest architecture. No shared-bundle build step, no script injection, no realm/timing gotchas. Each PCF is independent.
- **Con:** code duplication across PCFs — every PCF carries its own copy of Core + Engine + Grid (small base layers). For a user opening a page with 3 PCFs, that's ~1 MiB of duplicated download, browser-cached per webresource URL.

### Recommendation

Pick based on what you need on a single page:

- **Need 4+ products simultaneously on one page, or want one place to update Bryntum** → Option 1 (Dataverse web resources).
- **Need 1–3 products per page, want the simplest setup** → Option 2 (one PCF per product).

The "private app with no external access" constraint is met by both. The one external dependency is `use.fontawesome.com` for the icon webfont (Option 1's `scripts/build-css.js` rewrites the `solid.css` `@font-face src` to that CDN; Option 2's per-PCF CSS imports do the same) — if that's also blocked, upload the two FontAwesome webfont files (~150 KiB combined) as Dataverse web resources and update the URL rewrite in `scripts/build-css.js` to point at those instead.
