# Contributing to Europe at War

Thank you for helping. The map covers 1,200 years of disputed history, so the
main rule is simple: **bring a source.**

## Reporting an error

- **Wrong border, date, name or fact:** open a
  [correction](https://github.com/matsakelarsson/europe-at-war/issues/new?template=correction.yml).
  Include a link to the spot on the map (the address bar holds the year or the
  war step), what is wrong, what it should be, and a source a reader can open.
- **Something on the site is broken:** open a
  [bug report](https://github.com/matsakelarsson/europe-at-war/issues/new?template=bug.yml).
- **A missing war, a question or an idea:** start a
  [discussion](https://github.com/matsakelarsson/europe-at-war/discussions).

Border corrections are judged against [What the map shows](README.md#what-the-map-shows).
An issue asking for a disputed territory to be shown against those rules will
be closed with a link to them. To argue for changing a rule itself, start a
discussion.

## Changing the content yourself

Wars are YAML files in `content/wars/`, and border changes are in
`content/borders/`. [CONTENT_GUIDE.md](CONTENT_GUIDE.md) describes the formats,
the tone and the sourcing rules, and has a checklist for each war.

1. Install Node 20 or newer, then run `npm install`.
2. Make your change, then run `npm run build`. It must finish without errors,
   and should not add new warnings. `npm run dev` shows the result at
   http://127.0.0.1:8080/.
3. Keep a pull request to one war, one region's borders or one fix, and say
   which sources you used.

Write in your own words. Don't copy text from books, websites or Wikipedia;
summarise and cite them instead.

## Conduct

Argue with sources, not nationality. Comments that attack people, use slurs,
or campaign for a side in a current conflict are hidden, and accounts that keep
doing it are blocked from the repository. Threads that turn into a shouting
match are locked.

## Security

If you find a way to make the site run code or show content it shouldn't,
please [report it privately](https://github.com/matsakelarsson/europe-at-war/security/advisories/new)
instead of opening an issue.

## Licence

Europe at War is licensed under the GNU GPL v3.0 or later. By submitting a
contribution you agree that it is licensed under the same terms.
