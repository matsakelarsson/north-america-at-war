# North America at War

An interactive historical atlas of wars in North America, adapted from [Europe at War](https://github.com/matsakelarsson/europe-at-war). Explore the timeline, search the catalogue, filter by country, and open a conflict to follow its events on the map.

This is a **starter atlas**, with eight sourced conflict narratives and automatically drafted borders from 800 to 2010, displayed through 2026. It is not a comprehensive history of the continent. The historical-basemaps snapshots are sparse and unreviewed here; modern administrative regions approximate historical boundaries, and the dataset omits or simplifies many Indigenous nations and colonial claims. Blank areas do not imply uninhabited land. Check the original sources before relying on a particular boundary.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev        # http://127.0.0.1:8080/
npm run build      # validate and generate dist/
```

The application is a static site using vanilla JavaScript, SVG and a vendored TopoJSON client. The source project's timeline, map controls, search, country view, dark mode, and story layouts are retained. English is currently the only enabled language.

## Content and geometry

Conflict stories live in `content/wars/`, polity definitions in `content/polities.yaml`, and border snapshots in `content/borders/keyframes/`. `CONTENT_GUIDE.md` describes the inherited content format; its European examples are illustrative. Geometry is committed in `site-data/`, so ordinary builds need no network access. To regenerate it:

```sh
npm run fetch-data  # download Natural Earth and historical-basemaps
npm run geo         # rebuild projected atoms
npm run draft       # fill missing keyframe assignments
npm run build
```

Drafting is automatic and requires historical review. Existing keyframe assignments are retained unless the draft tool is run with `--force`. The build validates references and coordinates; passing validation does not establish historical accuracy.

## Credits and licence

Adapted from [Europe at War](https://github.com/matsakelarsson/europe-at-war). Code and content are GPL-3.0-or-later; see [LICENSE](LICENSE). Border drafts use André Ourednik and contributors' [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0). Regions and geographical features use [Natural Earth](https://www.naturalearthdata.com/) (public domain). The vendored TopoJSON client is ISC licensed.
