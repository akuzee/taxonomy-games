# Decisions

Why the project is shaped the way it is. Each entry gives the decision, the reasoning,
and what it costs, so that a later change is an informed reversal rather than an accident.

---

## 1. Same skeleton as Map Games

Plain HTML/CSS/JS with no framework, no build step, and no dependencies. It uses the same
classic-script pattern (pure modules export for node and set a `window` global in the
browser), the same 1st/2nd/3rd-try colors and `[1, 0.7, 0.4, 0]` points, and the same
declarative game configs. This is a sibling project, and anyone who knows one should be at
home in the other.

## 2. A taxonomy is data; the engine knows nothing about the SOC

`data/taxonomies/<id>.json` carries everything specific to one system:

```
levels               [{key, name, plural, default}]   top → bottom
nodes                [id, level, parent, title, displayCode, definition]
terms                [text, nodeId, illustrative?]    outside names that resolve to one node
catchAll             regex for residual buckets ("…, All Other", "Miscellaneous …")
skipTermsByDefault   subtrees left out of prompt pools unless asked
example              {term, node} traced through every layer on the home page
```

Adding NAICS or O*NET means writing one build script that emits this shape. Nothing in
`js/` should need to change. If it does, that's a sign something SOC-specific leaked into
the engine.

**Costs:** codes are opaque display strings. A game about code *arithmetic* (what "23-2"
tells you) would need per-taxonomy code rules.

## 3. Games walk a *view*, not the raw tree

`Tax.view(tax, {scope, levels})` is the tree under one node, restricted to the chosen
layers. A skipped layer's children re-attach to the nearest kept ancestor. Each game
asks the view three questions: which layers are there, what are a node's children, and
what is its path. That one abstraction gives you "Legal only", "skip broad occupations",
and "majors only, file titles straight to their major group" with no special cases.
`view.resolve(id)` maps any raw node to its nearest in-view ancestor, which is how a term
pointing at a detailed occupation still works in a game that stops at major groups.

## 4. Major groups are the root; the BLS aggregations are optional

The SOC proper has four levels (major, minor, broad, detailed). BLS also publishes an
intermediate aggregation (13 groups) and a high-level aggregation (6 groups) above the
majors (SOC 2018 manual, tables 5–6). Both are in the data, and both default **off**.
The first prototype shipped with high-level on. The user tried it and found those groups
useless ("lets have the major groups be the root", 2026-10-02). Intermediate was always
off, because 8 of its 13 groups are 1:1 with a major group of the same name. Either can
be switched back on in the builder or in Explore. Aggregation nodes have no SOC code, so they
display their major-group range (`11–29`). Their ids are synthetic (`H1`, `I3`).

## 5. Steps that ask nothing are filled in

275 of the 459 broad occupations have exactly one detailed child, 249 of them with an
identical title. Asking "which child?" when there's one, or "name it" when it's the
parent's name again, is busywork. So:

- **File it** auto-advances through any node with one child (unscored, shown as "only one
  way down").
- **Write-in** fills in any node that is its parent's only child, plus catch-alls
  ("Engineers, All Other"), as free and in italics. Nobody recalls catch-alls by name, but
  they stay on the board, because seeing that a bucket exists is the lesson.

Because of auto-advance, group prompts exclude single-child nodes: asking for one would
mean offering a "stop here" choice the game never actually offers there.

## 6. Write-in matching is a bag of words that must rule out the alternatives

Official titles are long, and exact matching would turn the game into a typing test.
`js/match.js` accepts a guess when every guess word fits some title word (exactly, as an
abbreviation of 4+ letters, as an inflection from a short whitelist like
teach-er/teach-ing, or with one typo at 6+ letters), **and** the guess picks out one node
at that layer. Ties break on, in order: covering the title word-for-word ("secretaries and
administrative assistants" → the generic one, not Legal Secretaries), then fitting without
leaning on fuzziness ("accountant" → Accountants and Auditors, not Accounting Clerks).

Traps found by calibration (all in `tools/test.mjs`):

- **Stemming collides professions.** A real stemmer turns physician and physicist into the
  same stem. The inflection whitelist deliberately omits `-ian` and `-ist` for this reason.
- **"Except" clauses are negative.** "Dispatchers, Except Police, Fire, and Ambulance"
  must not match "ambulance". The clause is stripped before tokenizing.
- **Catch-alls steal generic guesses.** "Physicians, All Other" reduces to just
  "physician", so it would win every "physicians" guess. Free catch-alls are excluded
  from candidates.
- **Instant-accept must be literal.** Typing a full title accepts it without Enter. The
  first version compared singularized text, so "…Law Clerks" was accepted at "…Law Clerk"
  and the trailing "s" was left behind as a new, failing guess.

Leniency is deliberate. A single distinctive word ("paralegal", "transportation") is
accepted when it's unambiguous at that layer. The reveal shows the full official title,
which is the thing being learned.

## 7. Prompts are sampled by target, not by term

The Direct Match Title File is very lopsided: a military catch-all has 108 titles while
most occupations have about 6. Sampling terms uniformly would serve mostly military jargon.
`Tax.samplePrompts` draws distinct *target nodes* first, then one term for each, so a
round covers the taxonomy evenly.

## 8. "Illustrative" doesn't mean "common"

BLS flags about 2,400 titles as illustrative examples (printed with each definition). They
were picked to show an occupation's *scope*, not because they're frequent: "Legal Aide" is
illustrative and "Paralegal" isn't. They're still the best default pool, being curated and
mostly recognizable, but the builder labels them honestly. A frequency-weighted pool needs
outside data (BACKLOG.md).

## 9. The generated SOC file is committed

Unlike Map Games' 258 MB of packs, `soc-2018.json` is 564 KB and changes once a decade
(the next SOC revision is 2028). Committing it means a fresh clone plays immediately. The
raw spreadsheets in `tools/cache/` stay out of git.

## 10. Everything is alphabetical; the map is colored for telling neighbors apart

The Map and the Race share one board (`js/board.js`): major groups as tiles, minor groups
listed inside, and broad occupations behind a popover.

**Every view sorts alphabetically at every layer**, by the user's call (2026-10-02): names
are what you navigate by. `Tax.view()` sorts children by title, so every game and browser
inherits it. The data file stays in code order, and `view(…, {order: 'code'})` restores it.
Code order would have taught the desk-to-field progression of the codes, but the user
preferred findability. Codes are still displayed.

The board is alphabetical in **reading order**: tile *i* goes in column *i mod n*, so the
top row reads A, B, C… across. The first version flowed tiles down CSS columns like a
printed index. That is technically alphabetical, but the top row read "Architecture,
Computer, Food, Legal…", and the user saw it as unsorted. Arrow keys are plain
directions: ↑/↓ within a column, ←/→ to the nearest row in the next column.

Each major group gets its own hue, spaced by the golden angle across alphabetical order, so
tiles next to each other are always far apart on the color wheel. The user asked for
"lightly color-coded to help differentiation", so the colors encode identity rather than
meaning. Tints are `oklch(var(--tile-l) var(--tile-c) var(--h))` with lightness and chroma
as theme tokens, so a single `--h` per tile works in both themes.

## 11. Race scoring: three numbers, one score

The user wanted "as few steps as possible", "as quickly as possible", or a composite.
These reward different things, so a race records all three:

- **Moves vs par.** Par is the fewest keypresses the board allows, found by breadth-first
  search over `step()`, the same pure function the live key handler uses. Par is therefore
  never something the keys can't actually do. In a tree the route itself is fixed (up to
  the shared ancestor, then down), so moves over par measure layout knowledge: did you
  know which column and which row?
- **Wrong groups opened.** Opening a minor group that doesn't hold the target. This is the
  knowledge-of-contents signal, and it's penalized hardest.
- **Time,** starting on the first key, so reading the target is free.

Score = time + 1 s per move over par + 5 s per wrong group, golf-style, lower is better.
The constants are at the top of `js/race.js`. The race is keyboard-only (mouse clicks
are ignored) because a click would teleport and make "moves" meaningless.

**Trap:** a bare `header { … }` rule meant for the page header also styled every
`<header>` in the app (tile headers, popover headers, column headers), giving them a white
background and z-index 5, so tile headers painted *over* the popover. That rule is now
`body > header`.

## 12. NAICS and O*NET: what had to bend

- **Every word the user sees comes from the data file:** the tab label, hero copy, what a
  term is called ("BLS job title" / "NAICS index entry" / "O\*NET task statement"), which
  term pools the builder offers, and the Find placeholder. `tools/test.mjs` checks each
  file has them.
- **The Map's layers are the taxonomy's choice** (`boardLevels`). O\*NET tiles by its 9
  subcategories, with the 41 GWAs as rows and IWAs in the popover, because 41 GWA tiles
  holding 332 IWA rows would be a three-screen board. The subcategory layer is still off
  everywhere else.
- **GWAs are O\*NET's root**, the same call as SOC major groups (§4). The 4 categories and
  9 subcategories are optional layers.
- **Tasks with several DWAs are left out.** File it needs one right answer per term.
  14,363 of 18,838 tasks link to exactly one DWA, and they cover 2,051 of the 2,087 DWAs.
  Accepting any linked DWA would make `target` a set: an engine change, parked in BACKLOG.
- **Codes vary by taxonomy.** Typed codes are compared without punctuation. Trailing
  zeros may be dropped ("23" → 23-0000), and a range answers to either end ("31" → 31-33).
  NAICS writes exclusions mid-title ("Oilseed (except Soybean) Farming"), so
  parenthesized except-clauses are also stripped before matching.
- **Level names keep their acronyms mid-sentence** (`Tax.lower`): "a NAICS industry", not
  "a naics industry".


## 13. Term sets: one taxonomy, several kinds of things to file

The SOC now has four: BLS direct-match titles, the titles workers reported to O\*NET,
O\*NET's full job-title list, and O\*NET task statements. A term is
`[text, node, flag, set]`, and `termSets` names each set with how to talk about it ("an
O\*NET task statement filed under this detailed occupation"). The flag marks a curated
subset of its set. A pool kind is a set key, a key plus `*` for the flagged subset
(`reported*`), `leaves`, or `groups`. `illustrative` survives as an alias for `titles*`, so
old presets keep working.

- **The SOC's default pool is now "everyday job titles":** the reported titles O\*NET
  shows in My Next Move (2,084). This closes §8's open problem, since BLS "illustrative"
  never meant common.
- **Any title or task O\*NET lists under two occupations is dropped** (560 reported
  titles, 6,178 job titles, 374 tasks). A text that's already in an earlier set isn't
  repeated.

## 14. Products and education programs

- **Products come from Statistics Canada's NAPCS 2022.** The U.S. Census Bureau publishes
  the trilateral product codes only as a concordance, with no titles for the five upper
  levels. Statistics Canada publishes the full Canadian tree (158 groups → 515 classes →
  1,477 subclasses → 3,049 details), with definitions and 45,661 example products. The
  Open Licence requires the "Adapted from Statistics Canada…" credit on the home page.
- **The products map tiles by first code digit, a grouping of our own** (`family`, ids
  `F1`–`F8`). 158 group tiles would be a five-screen board. The eight names are ours, the
  layer is labeled "(map only)", it's off everywhere else, and the attribution says so.
- **CIP's "Moved from" rows are the retired codes.** "Moved from 45.1401 to 45.1103" sits on
  45.1401, and the live code is the "Moved to" row. Codes are filtered on that, then sorted,
  because moved codes appear out of order.
- **The education map is about four screens tall.** CIP has nothing above its 50 series, and
  inventing a layer the way products does would be a bigger fabrication. Left as is.
- **APQC's Process Classification Framework isn't in.** The download needs an APQC
  account, and the license only ships inside the download (some editions were
  co-developed with IBM under their own terms). Publishing on a public GitHub page needs
  that license read first.


## 15. Business processes (APQC PCF)

- **The license allows publishing, with conditions.** The cross-industry PCF 7.4 grants "a
  perpetual, worldwide, royalty-free license to use, copy, publish, modify, and create
  derivative works… provided that all copies… contain a copy of this notice." The notice
  sits in a text box, not a cell, so `build-apqc.mjs` reads it out of the workbook's
  drawing XML and refuses to build without it. It's stored verbatim in the data file
  (`notice`), shown on the home page with the tab, and reproduced in the README.
- **The source can't be downloaded by script** (APQC login). The user saved it to
  `tools/cache/`. The build documents that, and the generated JSON is committed like the rest.
- **Depth is uneven.** Branches end at process, activity, or task level. Nothing in the
  engine assumed uniform depth except "stop here".
- **"Stop here" is offered whenever any answer in the pool is a group**, not only when group
  names are in it. APQC's 3,910 benchmark metrics measure elements at every level (1,003
  sit on categories), so a metric's answer is often a group. The decision is made from the
  whole pool, so the option's absence never gives away that an answer is a leaf.
- **A term set can file onto groups** (`onGroups: true`); `tools/test.mjs` exempts only those
  from the every-term-is-a-leaf check.
- **Synonyms are alternatives, not replacements.** "it" meant "computer" for the SOC, which
  hid APQC's "Manage Information Technology (IT)". Now each guess word can fit as itself or
  through its synonym.
- **Typed codes keep their dots** (1.1.11 ≠ 1.11.1), and "9" still finds category 9.0.

---

## Operational notes

- **bls.gov blocks scripts.** Anything that doesn't look like a browser navigation gets a
  `403 Access Denied` HTML page with status 200 in some paths. A User-Agent alone isn't
  enough; the `Sec-Fetch-*` headers matter. `build-soc.mjs` sends a full browser header
  set and refuses to cache a response that isn't a zip (`PK` magic bytes).
- **SOC minor-group codes break the digit pattern.** 15-1200 and 51-5100 aren't `XX-X000`.
  Parent links come from row order in the BLS file, never from code arithmetic.
- **The Artifact build is a fragment plus data files.** The claude.ai host wraps pages in its
  own doctype/head/body, so `build-artifact.mjs` strips them and inlines only CSS and JS.
  The 12 MB of data is published alongside as separate files, fetched by relative path just
  as on GitHub Pages. The host can't read query strings, so deep links use `#<preset-id>`.
