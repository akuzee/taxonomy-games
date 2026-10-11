# Taxonomy Games

Learning games for classification systems, in the spirit of [Map Games](../map%20games):
instead of clicking a region on a map, you file things into the right drawer of a
hierarchy. Six classifications so far, switchable by tab on the home page:

| Tab | Classification | Layers (default on) | Terms to file |
|---|---|---|---|
| Occupations | SOC 2018 (BLS) | 23 major → 98 minor → 459 broad → 867 detailed | 58,325: BLS job titles, O\*NET reported titles, O\*NET job titles, O\*NET task statements |
| Industries | NAICS 2022 (Census) | 20 sectors → 96 subsectors → 308 industry groups → 689 industries → 1,012 national industries | 20,373 index entries ("Coffee shops, on premise brewing") |
| Products | NAPCS Canada 2022 (Statistics Canada) | 158 groups → 515 classes → 1,477 subclasses → 3,049 detailed products | 45,664 example products ("Live dairy cows") |
| Business processes | APQC PCF 7.4, cross-industry | 13 categories → 72 process groups → 350 processes → 1,297 activities → 189 tasks | process names, and 3,910 APQC benchmark metrics |
| Work activities | O\*NET 31.0 | 41 GWAs → 332 IWAs → 2,087 DWAs | 13,414 task statements |
| Education programs | CIP 2020 (NCES) | 50 series → 464 program groups → 2,173 programs | program names + 1,039 NCES examples ("Arc Welding") |

Live at **<https://akuzee.github.io/taxonomy-games/>**.

The engine is taxonomy-agnostic: each classification is one data file, and every game and
browser works on all of them.

## Run

```sh
node tools/serve.mjs        # → http://localhost:8029
```

Node 18+, no dependencies, nothing to download first: the generated data (~4 MB) is committed.

## The games, and two ways to browse

**Write-in.** Name every node, one layer at a time, from the top down. Round 1 asks for the
6 high-level groups; once you've named them or revealed them, round 2 asks for the major
groups, each blank sitting under its parent with its code. Matching is forgiving. Word
order, plurals, abbreviations ("admin support"), one typo, and codes ("23-2011") all count.
A guess that fits more than one blank ("healthcare") is rejected with a "be more specific"
hint. Naming something at the wrong layer tells you which layer it belongs to. The `?`
on a blank gives a hint (the BLS definition, or example occupations inside it); a hinted
answer scores yellow.

**File it.** You get a term, such as "Gift Wrapper", and pick its branch at every layer
down to the detailed occupation, using columns that open left to right. Scoring follows
Map Games: 1st try green, 2nd yellow, 3rd orange. After 3 misses the answer is revealed,
and you click it to go on. A wrong pick shows what that branch actually holds, so misses
still teach. When group names are in the pool, every column also offers **stop here**,
so you have to judge the *layer* as well as the branch. The result card shows the full
path with codes, the BLS definition, and other job titles filed in the same place.

**Explore.** No game: click through the tree. Each click opens that group's children in
the next column. The card at the end shows the code, the BLS definition, what the group
holds at each layer below, and, for an occupation, every job title BLS files there. The
path chips on the card jump back up. Deep link: `#explore`.

Everything is listed **alphabetically**: tiles, columns, write-in sections, popovers.
Codes are still shown, but they don't set the order.

**Map.** The SOC as a fixed board. All 23 major groups are tiles, alphabetical in reading
order (left to right, then down), each with
its own light hue (golden-angle spacing, so neighbors never look alike), and every minor
group is listed inside its tile. Click a minor group, or arrow to it and press Enter, to see
its broad occupations. Open one of those to see its detailed occupations. **Find** searches
every title and all 6,520 BLS job titles, then dims everything except the groups holding a
match ("barista" lights up one row in Food Preparation). Deep link: `#map`.

**Race.** Start on one broad occupation and get to another across the map, keyboard only.
Arrow keys move in their direction (↑/↓ within a column of tiles, ←/→ to the nearest row
in the next column), Enter opens a minor group and then picks, and Esc closes. Each race tracks three numbers:
- **moves** against **par**, the fewest keypresses the board allows (computed breadth-first
  over the same key rules you play with)
- **wrong groups opened**
- **time**, which starts on your first key

The score folds them together golf-style: time + 1 s per move over par + 5 s per wrong
group. Lower is better. "Rerun the ones over par" replays the same trips.

Both games share the end screen (score, time, what to review), and File it can retry
just the terms you missed.

## Layers, and what's optional

Each classification has layers that default off:
- **SOC:** BLS's high-level (6) and intermediate (13) aggregations above the major groups
  (SOC 2018 manual, tables 5–6).
- **O\*NET:** the 4 categories (Information Input, Mental Processes, Work Output,
  Interacting With Others) and 9 subcategories above the GWAs. The Map still uses the 9
  subcategories as its tiles, so all 41 GWAs fit on one screen.

The SOC in full:

| Layer | Count | Example |
|---|---:|---|
| High-level group | 6 | 11–29 Management, Business, Science, and Arts |
| Intermediate group | 13 | 21–27 Education, Legal, Community Service, Arts, and Media |
| Major group | 23 | 23-0000 Legal Occupations |
| Minor group | 98 | 23-2000 Legal Support Workers |
| Broad occupation | 459 | 23-2010 Paralegals and Legal Assistants |
| Detailed occupation | 867 | 23-2011 Paralegals and Legal Assistants |

The top two layers are BLS's official aggregations (SOC 2018 manual, tables 5–6). Both
are off by default, so the 23 major groups are the root. They have no SOC codes, so when
switched on (builder, or "Show every layer" in Explore) they show their major-group ranges.

## Project layout

```
index.html              app shell: home, builder, both game views, end panel
css/styles.css          theme tokens (light + dark) and all styling
js/taxonomy.js          tree index, views (scope + chosen layers), prompt pools. Pure, node-testable
js/match.js             write-in answer matching. Pure, node-testable
js/writein.js           the write-in game
js/placeit.js           the file-it game (Miller columns)
js/explore.js           click-through browser (same columns, no scoring)
js/board.js             the map board: tiles, popovers, keyboard model, par (route finder)
js/map.js               the Map view: board + find
js/race.js              the Race game on the board
js/app.js               routing, home page, builder, shared end panel
data/index.json         catalog of taxonomies
data/presets.json       starter game library (hand-written configs)
data/taxonomies/        one normalized JSON per taxonomy (generated, committed)
tools/build-soc.mjs     BLS spreadsheets → data/taxonomies/soc-2018.json
tools/xlsx.mjs          zero-dependency .xlsx reader (shells out to unzip)
tools/test.mjs          invariants + the matcher's calibration set, on real data
tools/serve.mjs         zero-dependency static server
tools/build-artifact.mjs  single-file build for a claude.ai Artifact (dist/)
```

## Game configs

A game is a few lines of JSON. Presets, the builder, and deep links all use this shape:

```json
{ "id": "soc-legal", "mode": "writein", "title": "Legal, all the way down",
  "scope": "23-0000", "levels": ["minor", "broad", "detailed"] }

{ "id": "file-titles", "mode": "place", "title": "Where does this job go?",
  "pool": ["illustrative", "groups"], "count": 15 }
```

`pool` kinds are `illustrative` (BLS's 2,400 example titles), `titles` (all 6,520 direct-match
titles), `leaves` (the occupation names themselves), and `groups` (group names, which also
turns on "stop here"). `skip` lists subtrees that contribute no prompts. It defaults to the
taxonomy's `skipTermsByDefault`, which for the SOC is military, whose 558 titles are mostly
jargon.

Deep link any preset: `?play=<id>` locally, or `#<id>` (the Artifact build can't read query
strings).

## Tests

```sh
node tools/test.mjs    # level counts, view re-parenting, prompt pools, 58 matcher cases
```

UI checks are headless Chrome screenshots; see [CLAUDE.md](CLAUDE.md).

## Data

Each build script downloads its sources once (cached in `tools/cache/`, gitignored) and
emits `data/taxonomies/<id>.json`:

| Script | Sources | License |
|---|---|---|
| `build-soc.mjs` | BLS 2018 SOC definitions + Direct Match Title File, <https://www.bls.gov/soc/2018/> | public domain |
| `build-naics.mjs` | Census 2022 NAICS codes, descriptions, index file, <https://www.census.gov/naics/> | public domain |
| `build-onet.mjs` | O\*NET 31.0 Content Model Reference + Tasks to DWAs, <https://www.onetcenter.org/database.html> | CC BY 4.0, attributed on the home page |
| `build-napcs.mjs` | Statistics Canada NAPCS Canada 2022 v1.0 structure + elements CSVs | Statistics Canada Open Licence, attributed on the home page |
| `build-cip.mjs` | NCES CIP 2020 CSV, <https://nces.ed.gov/ipeds/cipcode/> | public domain |
| `build-apqc.mjs` | APQC PCF Cross-Industry Excel 7.4, <https://www.apqc.org/pcf> (needs a free APQC account; save as `tools/cache/apqc_pcf_cross_industry_7.4.xlsx`) | APQC's notice, below |

`build-soc.mjs` also reads three O\*NET files (Sample of Reported Titles, Job Titles, Task
Statements) for the SOC's extra term sets.

O\*NET tasks that link to more than one DWA (4,475 of 18,838) are left out, so every task
has one right answer. That's the "modified" in the attribution line.

## Documentation

- **[DECISIONS.md](DECISIONS.md)**: why it's built this way, and the traps already paid for.
- **[CLAUDE.md](CLAUDE.md)**: orientation for picking the codebase up cold.
- **[BACKLOG.md](BACKLOG.md)**: deferred ideas (NAICS, O*NET work activities, …) with reasons.

## APQC notice

The business-process data (`data/taxonomies/apqc-pcf.json`) is derived from APQC's Process
Classification Framework, and the license requires this notice in every copy and
derivative work:

> ©2024 APQC. ALL RIGHTS RESERVED. This Process Classification Framework® (“PCF”) is the copyrighted intellectual property of APQC. APQC encourages the wide distribution, discussion, and use of the PCF for classifying and defining organizational processes. Accordingly, APQC hereby grants you a perpetual, worldwide, royalty-free license to use, copy, publish, modify, and create derivative works of the PCF, provided that all copies of the PCF and any derivative works contain a copy of this notice.

