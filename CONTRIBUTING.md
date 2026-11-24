# Contributing

Thanks for helping improve the portal. This guide covers running, testing and proposing changes.

## Run and test

You need Node.js 20 or later. There are no dependencies to install.

```sh
npm start        # server on http://127.0.0.1:4173
npm test         # node:test suite
npm run lint     # trailing whitespace, tabs, final newlines
npm run bundle   # rebuild dist/portal.js after changing anything the browser loads
```

`npm test` fails if `dist/portal.js` is out of date, so run `npm run bundle` whenever you change `src/ui/` or `src/domain/`.

## Where changes go

- Business rules belong in `src/domain/` as pure functions with tests. Do not put rules in the UI or the HTTP layer.
- The server (`src/server/`) translates HTTP to domain calls and back. The UI (`src/ui/`) renders and wires.
- No runtime dependencies and no build step beyond `npm run bundle`. If a change seems to need a package, open an issue first.
- See [docs/architecture.md](docs/architecture.md) for how to add a request type, a workflow step or a different store.

## Branches and commits

- Branch from `main`: `fix/<short-topic>`, `feat/<short-topic>` or `docs/<short-topic>`.
- Write commit messages in the imperative, describing the change and why: « Add on-hold state to the workflow ».
- Keep commits focused; a refactor and a behaviour change are two commits.

## Pull request checklist

- [ ] `npm test` and `npm run lint` pass locally.
- [ ] New behaviour has tests, including the failure paths.
- [ ] `dist/portal.js` is rebuilt if browser code changed.
- [ ] `docs/` and `README.md` are updated if behaviour, configuration or the API changed.
- [ ] `CHANGELOG.md` has an entry under « Unreleased ».
- [ ] Schema changes bump `SCHEMA_VERSION` and include a migration.
