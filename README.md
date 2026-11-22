# North America at War

An interactive historical atlas of wars in North America, adapted from [Europe at War](https://github.com/matsakelarsson/europe-at-war). Explore the timeline, search the catalogue, filter by country, and open a conflict to follow its events on the map.

The atlas maps Indigenous homelands, political centres, tribute relationships, and conflict evidence. Soft shading shows the approximate reach of Aztec tribute networks, Maya polities, and Comanche activity. The **Atlantic colonies** and **Caribbean** controls zoom to dated colonial jurisdictions, settlements, and changes of rule. Start with **Explore North America in 1491** to see the early map.

The previous and next timeline controls include the years of mapped boundary changes. The Newberry Library layer shows colonial jurisdictions from 1629 and U.S. states and territories from September 1783 through 2000. The main international border series after 1783 uses historical-basemaps drafts. The last international border snapshot is 2010 and the timeline extends through 2026.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev        # http://127.0.0.1:8080/
npm run build      # validate and generate dist/
```

The application is a static site using vanilla JavaScript, SVG and a vendored TopoJSON client. The source project's timeline, map controls, search, country view, dark mode, and story layouts are retained. English is currently the only enabled language.

## Content and geometry

Conflict stories live in `content/wars/`, and graphic steps in `content/colonial-conflicts.yaml` and `content/settler-conflicts.yaml`. Historical map features live in `content/early-geography.yaml`, `content/colonial-geography.yaml`, and `content/historical-territories.yaml`. Geometry is committed in `site-data/`, so ordinary builds need no network access. [Content guide](CONTENT_GUIDE.md#early-north-america)

Run these commands to regenerate the later border drafts and geographical base.

```sh
npm run fetch-data  # download Natural Earth and historical-basemaps
npm run geo         # rebuild projected atoms
npm run draft       # fill missing keyframe assignments
npm run build
```

Drafting is automatic and requires historical review. Existing keyframe assignments are retained unless the draft tool is run with `--force`. The build validates references and coordinates; passing validation does not establish historical accuracy.

## Credits and licence

Adapted from [Europe at War](https://github.com/matsakelarsson/europe-at-war). Code and original content are GPL-3.0-or-later. Border drafts use [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0). The [Newberry boundaries](site-data/us-states.LICENSE.md) use CC BY-NC-SA 2.5. Geographic features use [Natural Earth](https://www.naturalearthdata.com/) (public domain). The vendored TopoJSON client is ISC licensed. [Code licence](LICENSE)
