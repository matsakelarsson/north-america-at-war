// Visit only reader-facing fields. Route IDs, geometry, links, and sort dates
// stay in the source dataset.
export function localizeWar(war, translate) {
  const fields = (item, keys) => {
    for (const key of keys) if (item[key] != null) item[key] = translate(item[key]);
  };
  const values = (items) => {
    for (const key of Object.keys(items || {})) items[key] = translate(items[key]);
  };
  fields(war, ['name', 'summary']);
  values(war.notes);
  for (const source of war.sources || []) fields(source, ['title']);
  for (const side of war.sides) fields(side, ['name', 'moves', 'success']);
  for (const step of war.steps) {
    fields(step, ['title', 'date']);
    values(step.body);
    for (const pair of step.facts) values(pair);
    if (step.link) fields(step.link, ['text']);
    for (const marker of step.markers) fields(marker, ['name', 'date', 'text']);
    for (const item of [...step.arrows, ...step.areas]) fields(item, ['label']);
    values(step.sideNames);
    values(step.moveNames);
  }
  return war;
}

export function localizeCatalogue(war, translate) {
  war.name = translate(war.name);
  war.summary = translate(war.summary);
  for (const step of war.steps) {
    step.t = translate(step.t);
    step.d = translate(step.d);
  }
  for (const source of war.sources || []) source.title = translate(source.title);
  return war;
}

export function localizeMap(borders, labels, translate) {
  for (const polity of borders.polities) {
    polity.name = translate('polities', polity.name);
    for (const name of polity.names || []) name[1] = translate('polities', name[1]);
  }
  for (const row of borders.timeline) row.s = translate('borderSources', row.s);
  for (const label of labels.labels) label.t = translate('labels', label.t);
  for (const seat of labels.capitals || []) {
    seat.name = translate('capitals', seat.name);
    if (seat.role) seat.role = translate('capitalRoles', seat.role);
  }
}

export function translateText(dictionary, source) {
  return dictionary && Object.hasOwn(dictionary, source) ? dictionary[source] : source;
}
