# Backlog

Deferred ideas, each with why it was deferred and what would unblock it.

---

## More taxonomies

Built: SOC 2018 (+ O*NET titles and tasks), NAICS 2022, O*NET work activities
(2026-10-11), NAPCS Canada 2022 products, and CIP 2020 programs (2026-10-11).
**Waiting on the user:** the APQC Process Classification Framework. They need to download
the cross-industry Excel with an APQC account, and its bundled license decides whether it
can go public (DECISIONS.md §14). The user wants
"taxonomies for understanding business activity on multiple levels": fold in alternates
for the same things, and find the dimensions not covered yet. Candidates, with fit for this
engine (a coded tree + outside terms that map to one leaf + a bulk download):

**Alternates for what's already here**
- *Occupations:* ISCO-08 (ILO, the international standard: 10 major → 43 sub-major → 130
  minor → 436 unit groups) and ESCO (EU, ~3,000 occupations under ISCO, multilingual,
  with an official crosswalk). O*NET-SOC's 1,016 occupations (the ".01" splits) as a 5th
  SOC layer. O*NET's "Job Titles" / "Sample of Reported Titles" files as the everyday
  title pool the SOC lacks (DECISIONS.md §8).
- *Industries:* ISIC Rev. 5 (UN) and NACE Rev. 2.1 (EU), both clean trees. SIC 1987 is
  retired but still on every SEC EDGAR filing. GICS is how investors see industries, but
  it's MSCI/S&P proprietary, so check the license before using it.
- *Work content:* O*NET's other content-model domains (Skills, Knowledge, Abilities,
  Work Context, Work Styles) are small trees from the same source and license. The ESCO
  skills pillar is big and hierarchical. Lightcast Open Skills: check its license.

**Answered questions (2026-10-11)**
- *O*NET skills, knowledge, abilities:* hierarchical but shallow, so a small taxonomy:
  - Abilities: 4 categories → 15 groups → 52 abilities.
  - Skills: 2 "Essential" groups → 10, plus 5 "Transferable" groups → 25. O*NET 31.0
    renamed "basic" and "cross-functional" skills to these.
  - Knowledge: 10 categories → 31 areas.

  All in Content Model Reference (already cached). No natural terms map to one leaf, so it
  would be write-in and explore only, unless occupation ratings were used.
- *Census 2018 occupation codes:* 570 four-digit codes, flat. The code list nests them
  under the SOC aggregations (6 high-level → 13 intermediate → 23 major groups, with 53
  split into Transportation / Material Moving). There's no minor or broad layer, and each
  code crosswalks to a SOC code. File: census.gov 2018-occupation-code-list-and-crosswalk.xlsx.

**Dimensions not covered yet**
- *Products (what a business sells):* NAPCS (NAICS's product twin, Census), HS/HTS tariff
  codes (USITC, public domain, great everyday terms: "live horses", "bicycles"), UNSPSC
  (procurement; free with registration).
- *Business processes (how a firm is organized inside):* APQC Process Classification
  Framework, with categories down to activities. This is the closest fit to "business activity on
  multiple levels", but redistribution terms need checking. SCOR (supply chain) is licensed.
- *Education and training (how people enter the occupations):* CIP 2020 (NCES, public
  domain, ~2,800 programs, with an official CIP↔SOC crosswalk).
- *Government activity and spending:* OMB budget functions, the federal Product Service
  Codes (what agencies buy), and COFOG (UN functions of government).
- *Demand (what households spend on):* COICOP 2018.
- *Nonprofits:* NTEE (activity codes for exempt organizations).
- *Innovation:* the Cooperative Patent Classification. Very large; would need a scope.
- *Money:* US GAAP / IFRS XBRL taxonomies, the concept tree behind every financial
  statement.

The connective tissue is crosswalks. Who (SOC) does what (DWAs) in which industry (NAICS),
making what (NAPCS/HS), trained how (CIP): see below.

### Crosswalk games
"Which industries employ the most X?" (SOC × NAICS via the OEWS industry-occupation
matrix), or "which DWAs does this occupation do?" (O*NET). These are graph questions, not
tree questions, so they need a new game mode. Park until two taxonomies exist on their own.

---

## Better prompts

### A "common job titles" pool
The illustrative flag doesn't mean common (DECISIONS.md §8). Two candidate signals:
- **OEWS employment** by detailed SOC: weight target sampling by how many people hold the
  job, so Cashiers comes up more than Prosthodontists. BLS national file, same 403 trap.
- **O*NET "Sample of Reported Job Titles"**: titles incumbents actually reported, about
  10 per occupation (CC BY). These are closer to everyday vocabulary than the Direct Match file.
*Unblock:* pick one. Employment weighting is a small change (a weight per target in
`samplePrompts`). Reported titles are a new term kind.

### Answer by code
A mode where the answer is the code ("Paralegals → 23-2011"), or the reverse (given
23-2011, name it). The data already supports it, and write-in already accepts typed codes.
*Deferred:* not asked for yet. Codes are shown as hints in both games today.

---

## Gameplay

### Race follow-ups (race and map built 2026-10-02; design in DECISIONS.md §10–11)
- **Show the par route after a race** (`board.route()` already returns the key sequence),
  so you can see where you lost moves.
- **Personal bests per trip** in localStorage, to make reruns a goal.
- Mouse play for phones would need a different "moves" definition (clicks).

### Route race: original proposal notes
The user's idea: get from one broad occupation to another in as few steps, or as little
time, as possible, or for a composite score. The first two layers (major + minor) are
always visible and lightly color-coded, and you move by keyboard. Design notes so far:
- In a tree the shortest route is fixed (up to the common ancestor, then down), so route
  *choice* only exists if movement has a spatial cost. That means a fixed board: majors as
  tiles in code order, minor groups visible inside, broad occupations hidden until opened.
  Arrow keys move between minor groups by position, so the start A matters.
- Track keypresses against par (BFS over the keyboard-move graph), "wrong opens" (minor
  groups peeked into that don't hold B), and time. Candidate composite: adjusted time,
  meaning time plus a penalty per extra move and a bigger one per wrong open, like golf strokes.
- Color by code band (11–29 / 31–39 / 41–43 / 45–49 / 51–53 / 55), so the color carries
  the desk→field ordering that the high-level groups encoded badly as names.
Open: what counts as a step, board order (codes vs size), whether B shows its code.

### Teach the rules that generate the structure
The SOC manual's classification principles (p. 9) predict much of the tree. From 33 to 53,
minor group -1000 is always "Supervisors of …". 31 has no supervisors, since 29 supervises
it. In 13–29 supervisors file with the workers they supervise. Resource-directing managers
go to 11. -9000 minor groups are "Other", and detailed codes ending in 9 are "All Other".
Apprentices file with their trade, helpers separately. Could be a short primer, or
teach-on-miss (name the principle a wrong File-it pick violated).

### Landmark occupations
Anchor each group with 2–3 famous members (Cashiers, Registered Nurses, Heavy Truck
Drivers) via OEWS employment. Same data as the common-titles pool above.

### Spaced repetition
The same "highest-value next step" as Map Games: remember per-node misses and bias File-it
sampling toward them. Wants per-viewer storage; localStorage is enough locally.

### Keyboard play in File it
Number keys to pick in the active column, ↑/↓ to move, Enter to choose. The columns are
already ordered lists, so it's mostly key handling. Deferred until the basic loop has had
real use.

### Open write-in
Today's write-in gates each layer behind the one above. An "open" variant would accept any
node at any layer and fill in its ancestors, like a Sporcle "name every occupation". The
matcher already searches all layers for the wrong-layer hint, so most of the logic exists.
*Deferred:* the user asked for top-down, and this is a different game.

### Save custom games
Map Games saves builder output to a library. Here the builder starts a game but doesn't
save it. Easy (localStorage), but not needed for a prototype.

### Employment-scaled treemap view
A treemap of the SOC sized by employment would be a literal *map*, giving each occupation
a stable spatial position you could learn. It could also host a click-the-block File-it
variant. Needs OEWS data (see above), and labels get unreadable below the minor-group
level, so it would need zooming.
