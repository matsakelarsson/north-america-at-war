# Content guide

How to add and edit wars, borders and polities. Everything lives in `content/`
as YAML or JSON. Run `npm run build` after editing: it validates everything
and tells you what is wrong and where. `node tools/build.mjs --check` validates
without writing `dist/`.

## Schema version

The file formats in this guide are **schema v1**, frozen on 2026-11-18 after
the Denmark–Norway and Poland pilot. Adding an optional field is fine.
Renaming or removing a field, or changing what one means, needs a migration
script in `tools/migrate/` that updates every file, and a note here.

## Principles

- **Neutral and plain.** Describe what happened and who did it. Avoid national
  framing ("our", "heroic", "treacherous") unless quoting. Migrated Sweden at
  War stories are told from Sweden's side and say so in their notes; new wars
  should give every side its due.
- **Sourced.** Every war lists its sources. Prefer sources a reader can open
  (Wikipedia, Britannica, academic or museum sites). When sources disagree on a
  number or date, say so in the text ("about", "some estimates") rather than
  picking one silently.
- **Dates and calendars.** Write dates as the sources usually give them, and
  add a note to the war when calendars differ (Old Style/New Style, or the
  Swedish calendar of 1700–1712).
- **Ongoing wars.** Set `end: ongoing`, and start the last step's body with
  "Last updated <date>." Update the date whenever the step is revised.
- **Borders are approximate.** Do not add precision the atoms cannot show.
  If a border matters to a story and no atom line follows it, add a split.

## Content tiers

| Tier | What it has |
| --- | --- |
| A | Full story, 5–20 steps (the world wars and a few long wars have more) |
| B | Short story, 1–3 steps |
| C | Catalogue entry only: dates, sides, one-paragraph `summary`, sources. Steps may be omitted or have no body. |

Write tier C entries for a region's wars first, then upgrade the important ones.
A tier C entry needs `summary` and `sources`; it may have no steps, and is then
shown as a card in the war list instead of a link.

## Wars: `content/wars/<startyear>-<id>.yaml`

One file per war. A war shared by several countries is one file; tag each step
with the `countries` it involves so country views only show relevant steps.

```yaml
id: scanian-war              # used in links: #/war/scanian-war
name: Scanian War
start: "1674"                # YYYY, YYYY-MM or YYYY-MM-DD (quote it)
end: "1679"                  # or ongoing
tier: A
summary: One paragraph for the catalogue and search.
countries: [se, dk, no, de]  # optional; derived from the sides' polities if left out
sides:
  - id: se                   # referenced by markers, arrows, areas
    name: Sweden
    polities: [sweden]       # polity ids; shown in full colour, others are muted
    ink: blue                # optional; default is the first polity's ink
    moves: Swedish and allied moves     # legend text for this side's arrows
    success: Swedish success            # legend text for this side's markers
notes:
  - Calendar or other caveats, shown under the story.
sources:
  - title: Scanian War (Wikipedia)
    url: https://en.wikipedia.org/wiki/Scanian_War
steps:
  - title: Lund, the bloodiest battle
    date: 1676–1677          # shown as written
    when: "1676"             # sort date for country views; default: first year in `date`
    borders: "1676-12-04"    # border state to show; default: `date`
    countries: [se, dk]      # optional, for country views
    view:                    # optional; default fits markers, arrows and areas
      center: [13.4, 55.8]   # lon, lat
      size: [420, 360]       # width, height in km
    body:
      - First paragraph.
      - Second paragraph.
    facts:
      - [Battle of Lund, "4 December 1676, Swedish victory"]   # label, value
    link: { href: https://…, text: Read more }   # optional
    markers:
      - kind: battle         # battle naval siege held taken event treaty toll air capital
        side: se             # whose success it was (or none)
        name: Battle of Lund
        date: 4 December 1676
        text: Popup text.
        lonlat: [13.19, 55.70]
        lp: r                # label position: r (right, default), l, t or b
    arrows:
      - side: se
        label: Charles XI
        phase: 1                                             # optional relative playback order
        via: [[13.8, 56.6], [13.5, 56.1], [13.2, 55.75]]   # smooth curve through points
        # or bezier: [p0, c1, c2, p1, c1, c2, p2, …]         # 1 + 3n points
        label_at: [13.9, 56.2]                              # optional label position
    areas:
      - style: occupied      # occupied gained pledged lost outline contested front
        side: dk             # colour and hatch come from the side's ink
        label: Occupied by Denmark–Norway                   # legend text
        atoms: [SE-M]        # atom ids (an id includes all its splits; "DK-83!" means without them)
      - style: occupied      # a zone that does not follow atoms
        side: de
        polygon: [[14.1, 52.1], [15.0, 52.4], [14.6, 51.6]]   # [lon, lat] ring; or polygons: [ring, …]
      - style: front         # a front line, drawn in the side's ink
        side: pl
        label: Front, 13 August 1920
        line: [[20.1, 53.2], [21.0, 52.4], [21.6, 51.8]]      # or lines: [line, …]
```

Shared wars: a war told from several sides is one file. When adding steps to a
file migrated from Sweden at War, set `countries` on the new steps and leave
`se` out unless the step is about Sweden, so the Sweden view keeps its 67 steps.
Per-step `side_names` and `move_names` (maps from side id to text) override the
legend wording for one step.

Use arrow `phase` to show a sequence supported by historical sources. Give
each leg of a continuing route a later phase, and give overlapping movements
the same phase. A phase can cover a broad period when exact dates are unclear.
If a step uses phases, assign every arrow a positive integer and use
consecutive numbers starting at 1. Add the references to the war’s sources.

Text containing a colon followed by a space (`: `) must be quoted, or YAML reads
it as a mapping and the page would show "[object Object]". Use double quotes and
keep typographic quotes (“ ”) inside. The build rejects unquoted cases in names,
summaries, notes, step titles, dates, body paragraphs, facts and marker text.

### Per-war checklist

- [ ] `id`, `name`, `start`, `end`, `tier`, `summary`, at least one source
- [ ] Sides list every combatant polity that appears on the map
- [ ] Each step has a `borders` date that shows the map as it was then
- [ ] Border changes from the peace are in `content/borders/events/`, not only in the text
- [ ] Markers and arrows checked on the map at desktop and phone widths
- [ ] `npm run build` passes with no new warnings

## Polities: `content/polities.yaml`

A polity is anything that owns land on the map.

```yaml
- id: russia
  name: Russia                         # current name
  names: [["1547", Grand Duchy of Moscow], ["1721", Tsardom of Russia]]   # earlier names: [until, name]
  color: "#d3dccd"                     # light pastel; dark mode is derived
  ink: green                           # strong colour for arrows, hatching, markers
  countries: [ru]                      # modern countries it belongs to (for country views)
  aliases: [Russian Empire, RUS]       # historical-basemaps names / Natural Earth codes
  label: [37.6, 55.8]                  # optional preferred label position(s)
```

- Inks: blue red purple orange green teal brown magenta gold slate navy olive none.
- Topic files in `content/polities/*.yaml` (same format) are read together with
  `polities.yaml`; ids and aliases must be unique across all of them.
- `content/polities.auto.yaml` is generated by `npm run draft` for
  historical-basemaps names without a curated polity. To curate one, move it to
  `polities.yaml` and fix it. A curated polity that takes over all of an auto
  polity's aliases replaces it everywhere.
- One continuous state is one polity with dated `names`, not several. To merge
  polities, add the aliases to the one you keep, then run
  `node tools/rename-polity.mjs <old> <kept>`.

## Borders

The owner of an atom on a date is the most recent assignment on or before that
date, from two sources merged by date:

1. **Keyframes**, `content/borders/keyframes/<year>.json`, drafted from
   historical-basemaps snapshots (and Natural Earth for today). They are drafts:
   correct them with `node tools/set-owner.mjs <years> <polity> <atoms…>`.
2. **Events**, `content/borders/events/*.yaml`: dated changes, usually treaties.

```yaml
- date: "1658-02-26"
  note: Treaty of Roskilde.
  owners:
    sweden: [SE-M, SE-K, SE-N, DK-84~bornholm]
    "-": [XX-1]          # "-" means: fall back to the drafted keyframes
```

- `content/borders/curated.yaml` lists date ranges in which keyframes are
  ignored for some atoms, so that hand-made borders are not overridden by
  drafts. Inside a curated range **every** change must be an event; nothing
  else will move the border. Curated so far:

  | Range | Atoms | Events in |
  | --- | --- | --- |
  | 1240–1815 | Sweden at War's map (Nordic, Baltic, Polish and Russian lands; in Germany only Swedish Pomerania, Bremen-Verden and Schleswig-Holstein) | `sweden-at-war.yaml` |
  | 1240–today | Germany, Austria, the Czech lands, Switzerland, Liechtenstein, South Tyrol and Trentino (from 1815 also Swedish Pomerania and Bremen-Verden) | `german-lands.yaml` |
  | 1815–today | Sweden, Norway, Denmark | `denmark.yaml` |
  | 800–today | Iceland, the Faroes, Greenland, Svalbard, Jan Mayen | `denmark.yaml` |
  | 1815–1945 | Schleswig-Holstein | `denmark.yaml` |
  | 1772–today | Poland, Lithuania, Latvia, Estonia, Belarus, Kaliningrad, right-bank Ukraine | `poland-lithuania.yaml` |
  | 800–today | Outer Hebrides, Orkney, Shetland, the Isle of Man | `british-isles.yaml` |
  | 800–today | Great Britain, Ireland, Jersey, Sark | `british-isles.yaml` |
  | 1066–today | France, Belgium, the Netherlands, Luxembourg | `france-low-countries.yaml` (also `central-europe.yaml` for Alsace-Lorraine, `italy.yaml` for Savoy and Nice 1860, `ww2.yaml` for 1940–1945) |
  | 800–today | Spain, Portugal, Andorra | `iberia.yaml` (Roussillon is in `france-low-countries.yaml`) |
  | 800–today | Italy (without Trentino and South Tyrol), San Marino, Malta, Monaco | `italy.yaml` |
  | 1236–today | European Russia and left-bank and southern Ukraine | `rus-and-russia.yaml`, `russia.yaml`, `ww2-east.yaml` |
  | 1801–today | Georgia, Armenia, Azerbaijan, the northern Caucasus, Kars–Ardahan–Artvin | `caucasus.yaml` |
  | 1809–today | Finland and Åland | `finland.yaml` |
  | 1812–today | Bessarabia and Transnistria (Moldova, Budjak, Khotyn) | `bessarabia.yaml` |
  | 800–1812 | Moldavia east of the Prut, the Budjak, Transnistria, Khotyn and Northern Bukovina | `balkans.yaml` (with `bessarabia.yaml` and `rus-and-russia.yaml`) |
  | 800–today | Hungary, Slovakia, Romania, the former Yugoslavia, Albania, Greece, Bulgaria, Cyprus, Turkey (without Kars, Ardahan, Artvin and Iğdır before 1801) and Carpathian Ruthenia | `balkans.yaml`, `anatolia.yaml` (Anatolia, and Turkey from 1922), `ww2.yaml` (1941–1945) |
  | 800–1801 | Kars, Ardahan, Artvin and Iğdır | `anatolia.yaml` |
  | 800–today | Syria, Lebanon, Israel, Palestine, Jordan, Egypt | `levant.yaml` |

  Other event files (`central-europe.yaml`, and `rus-and-russia.yaml` before
  1236) correct drafts outside any curated range; there, the next keyframe can
  still override an event. `central-europe.yaml` is a first pass made for the
  Russia wave's maps (historical-basemaps has no snapshot between 1815 and
  1880) and now only holds Austria-Hungary's Austrian half (Istria, Trieste,
  Gorizia, Bohemia, Galicia) and Alsace-Lorraine. Wave 5 rewrote `balkans.yaml`
  and replaced `turkey.yaml` with `anatolia.yaml`. `italy.yaml` still lists Venetian Istria and
  Dalmatia in 1797 and 1805 and Italian Libya from 1912 (`libya-it`, also fixed in
  the 1914 and 1938 keyframes by `tools/migrate/libya-keyframes.mjs`), and `iberia.yaml` ends with three North African
  events (1031, 1069, 1147) that correct the drafts until the next keyframe. `german-lands.yaml` also
  opens with a few events before 1240 (907, 948, 962, 976, 983) that correct
  the drafts until the next keyframe, and `france-low-countries.yaml` does the
  same before 1066 (Verdun 843, Brittany 851, the kingdoms of Burgundy 879/888,
  Ribemont 880, Lotharingia in the Empire 962, Burgundy in the Empire 1033).
- **What the base map shows.** The base map follows the borders states
  recognised at the time, by treaty or in practice. Military occupation,
  breakaway regions and front lines are drawn as areas in a war's steps,
  not on the base map. Exceptions, where an occupation lasted long enough to
  be the map of the time: the German and Romanian occupation of the Soviet
  Union in 1941–1944 (at six dates in `ww2-east.yaml`, as the Reichskommissariats
  and the military zone), the Finnish reconquest of 1941–1944, and, in
  `ww2.yaml`, the German annexations of Eupen-Malmedy, Alsace-Moselle and
  Luxembourg, the partition of Yugoslavia in 1941–1945 (the Independent State
  of Croatia, the annexations, German-occupied Serbia and Italian-occupied
  Montenegro, each region returning to Yugoslavia when it was liberated) and the
  Bulgarian annexation in Greece. Occupied France, the Low Countries, Denmark,
  Norway, Greece, Albania after 1943, Italy after the armistice and Hungary
  in 1944 are areas. Abkhazia,
  South Ossetia, Transnistria, Karabakh, Crimea after 2014 and the occupied
  parts of Ukraine stay with the state they are recognised as part of.
  Germany's 1938–1939 annexations, the Protectorate of Bohemia and Moravia,
  the Napoleonic satellites and annexations, and the Allied occupation zones
  of 1945–1949 are on the base map.
- **The Holy Roman Empire.** Until 1500 the Empire is one polity (`hre`), with
  Bohemia, Habsburg Austria (from 1282) and the Swiss Confederacy (from 1291)
  separate. From the Diet of Augsburg (1500-07-02) the larger territorial
  states are shown; the many small states (ecclesiastical states, imperial
  cities, counts) stay grouped as `hre` until 1803–1806. Habsburg Hungary,
  Bohemia and the Austrian lands are one polity (`habsburg`) from 1526.
  The Low Countries follow the same rule until they pass to Burgundy
  (1384–1443); Liège, Lorraine and Habsburg Upper Alsace are shown from 1500.
- **France** is one kingdom: the great fiefs (Normandy, Aquitaine, Champagne…)
  are not shown, except the lands of the English crown (Normandy 1066–1144, the
  Angevin lands 1154–1204/24, Gascony to 1453, the Brétigny lands 1360–1372,
  Lancastrian France 1419–1450, Calais 1347–1558), Brittany (to 1532), Flanders
  (to 1384), Toulouse (to 1229/1271) and the Valois Burgundian state
  (1363–1477). Imperial and foreign lands are separate until they joined France.
- **Iberia.** Córdoba (emirate, caliphate 929, taifa 1031); Asturias/León,
  Castile (joined with León 1037–1065, 1072–1157 and from 1230), Pamplona/Navarre,
  the Catalan counties (Frankish to 988) and Aragon (Crown of Aragon from 1137),
  Portugal (1128); the taifas after 1031, the Almoravids (1086–1147), the
  Almohads (1147–1228), Ibn Mardanish's and Ibn Hud's Murcia, Niebla and Nasrid
  Granada (1238–1492). A province changes hands with its main town. Castile and
  Aragon become `spain` on 1516-01-23; Portugal stays Portugal in 1580–1640.
  Gibraltar is too small to be an atom (use a marker or a polygon area).
- **Italy.** Carolingian to 888, the Kingdom of Italy to 962, then `hre` until
  Frederick II's death (1250-12-13), except Venice, the Papal States and, from
  1100, Genoa and Pisa; in the south Benevento, Salerno, Capua, Naples, Gaeta,
  Byzantium, the emirates of Sicily and Bari, then the Normans (Apulia 1042/1059,
  the County of Sicily 1061–91, the Kingdom of Sicily 1130). After 1250 the
  regional states are shown, with the cities not yet under a bigger neighbour
  grouped as `italian-communes`. After 1282 island Sicily and peninsular Naples
  are separate (the Two Sicilies from 1816). Naples, Sicily, Sardinia and Milan
  keep their own polities under Aragonese, Spanish or Austrian rule.
- **The Balkans and Hungary.** Bulgaria, Byzantium, the Franks and the Avars
  in 800; Great Moravia (833) and the Magyars (895–907); Samuel's Bulgaria and
  Basil II's conquest (1018). Croatia is its own kingdom in union with Hungary
  (1102–1527); the Second Bulgarian Empire (1185), Nemanjić Serbia, Bosnia
  (1180), Zeta and the Albanian principalities (1355) follow. The Latin states
  of 1204 are separate (Latin Empire, Thessalonica, Achaea, Athens, the
  Archipelago, Epirus). Ottoman vassals (Wallachia, Moldavia, Transylvania,
  Ragusa, Serbia from 1817, Bulgaria 1878–1908, Eastern Rumelia, the Cretan
  State) are shown as their own states. After Mohács (1526) the line between
  Habsburg Royal Hungary, Zápolya's kingdom (later Transylvania) and Ottoman
  Hungary moves with each fortress that fell; the Great Turkish War changes the
  map at Karlowitz (1699), the Balkan Wars at the treaties of 1913, and
  Kosovo is shown from its declaration of independence (2008-02-17). The
  Second World War is in the war files, except the Vienna Awards and the
  Treaty of Craiova. Fiume (Rijeka) is too small to be an atom; use a marker.
- **Anatolia and the Levant.** The Abbasid frontier (thughur) and the
  Byzantine reconquest (934–1045); Rum, the Danishmendids and the crusader
  states after 1081; the Ilkhanate (1243) and the Turkish beyliks
  (`anatolian-beyliks` groups the smaller emirates); the Eretnids, Karamanids,
  Kara Koyunlu and Aq Qoyunlu; the Ottomans, who stay on the base map until
  the sultanate is abolished (1922-11-01), after which all of Turkey is
  `turkey` (Hatay from 1939). The Allied, Greek, Italian and French zones of
  1918–1923 are war-step areas. In the Levant: the Tulunids, Ikhshidids,
  Hamdanids, Fatimids, the crusader states, the Zengids, Ayyubids and Mamluks;
  Ottoman from 1516–1517; Muhammad Ali's Egypt from 1805 (with Syria
  1833–1840); the mandates of 1920; the territories Israel occupied in 1967
  are war-step areas, and Palestine is shown from the 1988 declaration.
- **The British Isles.** The Anglo-Saxon kingdoms and the Danelaw until England
  (927/954; Mercian client kingdoms are shown as Mercia); Wales until 1283, with
  the Marcher lordships under the English crown from 1070/1093; Pictland, Dál
  Riata and Strathclyde becoming Alba/Scotland; Viking Dublin; the Lordship of
  Ireland and the Irish lordships (Gaelicised Anglo-Norman lordships such as
  Desmond count as Irish) until the Tudor conquest (1556–1603); the
  Commonwealth union 1653/54–1660; Great Britain 1707; the United Kingdom 1801;
  the Irish Free State 1922.
- **Checking borders.** After a build, `node tools/owners-at.mjs <date>
  [polities…] [--atoms <regex>]` lists who owns what on a date, and
  `node tools/owner-history.mjs <regex> [from] [to]` lists every change to the
  matching atoms with its source. To look at an area, open
  `/?box=<x,y,w,h>#/year/<year>` (map km; `node tools/box.mjs <lon> <lat> <width-km>`
  prints the box).
- **Polities in the drafts.** historical-basemaps lumps some unions together
  (the Polish–Lithuanian union, Denmark–Norway around 1000). The site keeps the
  Crown of Poland and the Grand Duchy of Lithuania apart until 1795, and uses
  `denmark-norway` only for the union of 1523–1814 (and the Kalmar years).
  Correct drafts that say otherwise.
- **Flip-flops.** The build warns when an atom goes A → B → A within 60 years
  and a draft keyframe is involved, which usually means the draft disagrees
  with a curated event. Fix the keyframe or the event. If the change is real
  (the Duchy of Warsaw, 1807–1815), record it in `content/borders/reviewed.yaml`.
- **Atoms.** Ids are ISO 3166-2 codes where Natural Earth has them (`SE-M`,
  `PL-MA`), otherwise its adm1 codes. `content/borders/atoms.json` lists them
  all with names and coordinates. A split atom is `<parent>~<name>`, such as
  `DK-84~bornholm`. Splits named after a year are the land a state held then:
  `~fi1938` (Finnish Karelia and Petsamo, in `RU-LEN`, `RU-KR`, `RU-MUR`),
  `~ee1938` and `~lv1938` (Petseri, Narva-taga, Abrene), `~ro1938` (Budjak,
  with `~ro1938~1856` for the part Moldavia held 1856–1878), `~pl1930`,
  `~de1930`, `~sax1783`-style `~sax`, `~pr1815` (Saxon until 1815, Prussian
  from 1815), `~sud` (the Sudetenland), `~us1945` (the American zone in
  Baden-Württemberg) and so on. The German splits are historical regions:
  `DE-BY~bav` Old Bavaria, `DE-BY~bav~opf` Upper Palatinate, `DE-SN~olaus` Upper
  Lusatia, `DE-NW~lb` the left bank of the Rhine, `DE-NW~mark`, `DE-HE~hk`
  Hesse-Kassel, `DE-BW~baden~vorder` the Breisgau, and so on (see atoms.json).
  In the west: `FR-62~calais` the Pale of Calais, `FR-59~flandre` Walloon and
  maritime Flanders (Lille, Douai, Dunkirk; the rest of `FR-59` is Hainaut and
  the Cambrésis), `FR-57~metz`, `FR-64~bearn`, `NL-ZE~vlaanderen` Zeelandic
  Flanders and `BE-WLG~eupen` Eupen-Malmedy. In the south: `ES-HU~jaca` Upper
  Aragon, `ES-L~pallars` Urgell and Pallars, `ES-NA~tudela` the Ribera of
  Navarre, `ES-PM~menorca`, `ES-BA~olivenza`, the Neapolitan parts of Lazio
  (`IT-LT~gaeta`, `IT-FR~sora`, `IT-RI~cittaducale`), `IT-AL~casale` Montferrat
  and `IT-PV~pavese` (Pavia; the rest of `IT-PV` is the Lomellina and the
  Oltrepò, Sardinian from 1713). On the Adriatic (`95-adriatic.geojson`):
  `HR-08~cres` (Cres and Lošinj) and `HR-19~lastovo`, Italian 1918–1947;
  `HR-08~krk` (Krk and Rab), `HR-13~it1941`, `HR-15~it1941`, `HR-17~it1941`
  and `HR-19~korcula`, the Italian annexations of 1941; `HR-14~baranja`, north
  of the Drava. In the east (`90-east.geojson`):
  `GR-H~euboea`, `GR-G~achaea` (Achaea and Elis), `GR-L~dodecanese`,
  `GR-A~thrace` (Western Thrace), `TR-34~asia` (the Asian side of Istanbul),
  `TR-17~gelibolu` (the Gallipoli peninsula), `RS-16~sandzak` and
  `RS-18~sandzak` (the Serbian Sandžak), and `~hu1938` for the four parts of
  southern Slovakia Hungary held in 1938–1945. `HU-BA~habHun`, `HU-SO~ottH` and
  `HU-VE~ottH` (from Sweden at War's map) follow the Habsburg–Ottoman line in
  Transdanubia.
- **Splits.** `content/borders/splits/*.geojson`, applied in file-name order:
  polygons in lon/lat with `{id: "<atom>~<name>", from: "<atom>", name}`. The
  part of the atom inside the polygon becomes the new atom (it may cut an atom
  made by an earlier split). To cut along a historical-basemaps border, use
  `node tools/split-from-hb.mjs <file> <year> "<NAME>" <suffix> "<name>" <atoms…>`.
  For a hand-drawn line, pass a GeoJSON file of polygons (each with a `NAME`)
  instead of the year; the tool folds slivers the same way. The 1783
  snapshot is unreliable in western Germany (its Prussia, Baden and a second
  "Bavaria" are later shapes); check a snapshot's polygon sizes first.
  Run `npm run geo` and `npm run draft` after adding splits (needs
  `npm run fetch-data` once); the draft gives a split atom its own owner only
  where it differs from its parent's.

## Labels: `content/labels.yaml`

Geographic labels give readers physical and regional landmarks. The renderer places polity names automatically.

```yaml
labels:
  - text: Scania
    lonlat: [13.6, 55.9]
    class: lbl-reg          # lbl-reg or lbl-sea, plus lbl-dim (fainter) or lbl-small
    min_zoom: 1.6           # only when zoomed in this far (1 ≈ the Sweden at War map scale)
    from: "1658"            # optional date range
    until: "1720"
```

## Capitals and geographic references

`content/capitals.yaml` records the polity, period name, longitude and latitude,
and source for each seat. Optional `from` and `until` use the map’s date
precision. The start is inclusive and the end exclusive. A record applies only
while the polity holds mapped territory on the story or explorer date. For a
city-state too small to have a border atom, supply `point_only: true` and an
explicit founding date. Use the same coordinates for a shared city or a rename.

Give a temporary or concurrent seat a descriptive `role`. Use `Itinerant court`, `No permanent capital`, or `Territorial grouping`
for a sourced period without a single seat. Omit the name and coordinates
for those periods. For a documented city with a disputed location, keep its
name and source, omit the coordinates, and use `Unlocated seat`.
Each build emits `dist/data/capital-coverage.json`, with one entry per mapped
owner and period. It identifies unresolved periods and seats outside the map.
The browser loads only the compiled in-frame records and dated changes.

Physical references live in `content/labels.yaml`. Set `min_zoom` to the first
scale where the feature helps orientation. For a river, set `river` to its
name in the topology and provide a nearby coordinate. The build places its
label at the nearest vertex of the named river.

## Translations

English is the source language for historical data. The interface catalogs live
in `site/locales/`. To add a language, register its BCP 47 tag, native display
name, text direction and catalog in `site/locales/index.js`. Copy the English
message keys and keep placeholders such as `{year}` intact. For plural messages,
provide every category returned by `Intl.PluralRules` for that locale and use
`{count}` for the formatted number. Templates with named links accept those
placeholders in any order. Catalog messages are plain text.

Historical translations live in `content/locales/<tag>/`. The optional
`map.yaml` maps English source text to translated text under `polities`
(including dated names), `labels`, `capitals`, `capitalRoles` and
`borderSources`. Each optional `wars/<war-id>.yaml` maps source text to its
translation within one war. This covers the name, summary, notes, source titles,
side names and legend text, step titles, display dates, prose, facts, link
labels, markers, arrows and areas. The build uses the same translations in both
the catalogue and the story. Keep YAML keys identical to the parsed source text
and quote strings that YAML would otherwise interpret. An edited English key
must be updated or removed in its translations.

For example, in `content/locales/sv/wars/first-bremen-war.yaml`:

```yaml
First Bremen War: Första bremiska kriget
'Bremen, and a new king': Bremen och en ny kung
```

Omitted historical translations fall back to the English source. ISO display
dates and country names are formatted by the browser. Translate prose dates
and date ranges as ordinary strings. URLs, route IDs, chronological keys and
map geometry come from the source data. Run `npm run build` to validate the
catalogs and compile the translation files.

Some French historical entries were generated locally with
[Argos Translate](https://github.com/argosopentech/argos-translate) and its
English-to-French model. Review the French entries against the English sources
when correcting names, dates or wording.
