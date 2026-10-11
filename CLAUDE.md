# Working on Taxonomy Games

Orientation for an AI agent (or a human) picking this up cold. Read
[DECISIONS.md](DECISIONS.md) before changing architecture.

## Get it running

```sh
node tools/serve.mjs         # → http://localhost:8029
```

A server is required because data loads via `fetch`. The SOC data is committed, so there's
nothing to download.

## Where things live

| Path | What |
|---|---|
| `js/taxonomy.js` | Tree index, `view()` (scope + layers), prompt pools. Pure, node-testable |
| `js/match.js` | Write-in matching. Pure, node-testable, calibrated in `tools/test.mjs` |
| `js/writein.js` | Write-in game: rounds per layer, free nodes, hints |
| `js/placeit.js` | File-it game: Miller columns, auto-advance, stop-here, result card |
| `js/explore.js` | Explore: the File-it columns with no scoring, plus an info card |
| `js/board.js` | The map board: alphabetical tiles, popovers, `step()` key model, `route()` for par |
| `js/map.js` | Map view: board + find |
| `js/race.js` | Race: pairs, move/wrong-open/time tracking, golf-style score. `Race.current()` is a test hook |
| `js/app.js` | Routing, home (ladder + presets), builder, shared end panel |
| `data/taxonomies/*.json` | One normalized file per taxonomy (format in DECISIONS.md §2) |
| `tools/build-{soc,naics,napcs,onet,cip}.mjs` | One build script per taxonomy. `tools/download.mjs` has the shared fetch/cache/write helpers, `tools/csv.mjs` and `tools/xlsx.mjs` the readers |

## Conventions

- **No dependencies in the app or tools.** `tools/xlsx.mjs` exists so build scripts don't
  need a spreadsheet library.
- **Nothing SOC-specific in `js/`.** Taxonomy quirks go in the data file (`catchAll`,
  `skipTermsByDefault`, `example`). User-facing copy in `placeit.js` says "BLS job title",
  which will need a per-taxonomy `termNoun` when a second taxonomy lands.
- **Comments explain why, not what.** Sparse, matching the surrounding density.
- **Theme via tokens.** Never hardcode a color. Add it to all three theme blocks in
  `css/styles.css`, or derive it with `color-mix` in the derived block.
- **Node ids, never titles,** identify things. Titles repeat across layers.

## Before you commit

```sh
node --check js/*.js
node tools/test.mjs          # if you touched match.js, add the case that motivated it
```

Then look at it. Any preset deep-links (`?play=file-titles`, `?play=soc-legal`), so a
headless-Chrome screenshot shows any game state. Driving the UI (typing guesses, clicking
columns) works with puppeteer-core. On this machine it's installed in `~/Projects/part games/node_modules`;
plain `chrome --headless --screenshot` also works since there's no WebGL loop here.

## Shipping

```sh
git push                         # GitHub Pages serves the repo root: https://akuzee.github.io/taxonomy-games/
node tools/build-artifact.mjs    # claude.ai Artifact: a page fragment + the data files it prints
```

## Adding a taxonomy

1. Write `tools/build-<id>.mjs` emitting the format in DECISIONS.md §2 (copy build-naics,
   the cleanest one). That includes the UI fields: `label`, `tagline`, `blurb`, `termNoun`(`Plural`),
   `termExamples`, `pools`, `defaultPool`, `boardLevels`, `findPlaceholder`, `example`.
2. Add `{id, name, label, file}` to `data/index.json`, and presets with `"taxonomy": "<id>"`.
3. Add expected level counts to `EXPECT` in `tools/test.mjs` and a few matcher cases.
   The test also checks that every UI field exists.
4. Look at the Map: `boardLevels` decides tiles / rows / popover, and the board should fit a
   laptop screen.

## Current state

Five taxonomies (SOC with O*NET term sets, NAICS, NAPCS products, O*NET work activities,
CIP programs) across Write-in, File it, Race, Explore, and the Map, plus the builder, 32
presets, both themes, and a phone layout. Live on GitHub Pages; pushing to `main` deploys. Next
steps are in [BACKLOG.md](BACKLOG.md), including the list of further classifications
worth adding.
