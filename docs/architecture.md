# Architecture

The portal is three layers, each a handful of small files, with the rules in the middle and nothing clever at the edges.

```
            browser                                     server (optional)
┌───────────────────────────────┐          ┌────────────────────────────────┐
│ src/ui/app.mjs   views, routes │          │ server.mjs        config, start │
│ src/ui/chart.mjs SVG bar chart │          │ src/server/app.mjs  HTTP + API  │
│ src/ui/dom.mjs   DOM helpers   │          │ src/server/file-store.mjs JSON  │
│ src/ui/stores.mjs              │──HTTP───▶│                                 │
│   HttpStore │ MemoryStore      │          │                                 │
└──────────────┬────────────────┘          └───────────────┬────────────────┘
               │ imports                                   │ imports
               ▼                                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ src/domain/   pure functions, no I/O, the same files in both places        │
│   workflow.mjs    states, actions, transition()                            │
│   validation.mjs  intake rules, parseAmountToCents(), isIsoDate()          │
│   store-core.mjs  createRequest(), applyAction(), id allocation            │
│   metrics.mjs     counts by state, time to approval, approval rate         │
│   query.mjs       filter, search, sort, activity per request               │
│   export.mjs      handover bundle, validateStore()                         │
│   seed.mjs        demo timeline replayed through store-core                │
│   format.mjs      money, durations, timestamps                             │
│   errors.mjs      DomainError with stable codes                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Modules

**`src/domain/`** holds every business rule. Each function takes values and returns values; none reads a clock, a file or the DOM. The current time is always passed in (`now`, `at`, `exportedAt`), which keeps the functions deterministic and the tests exact.

- `workflow.mjs` defines the states and an `ACTIONS` table (`from`, `to`, `label`). `transition(request, action, { actor, comment, at })` checks the move against the table, applies the guards (a rejection needs a comment; the requester cannot approve or reject their own request) and returns the new request plus an activity entry.
- `validation.mjs` normalises intake input (trims, collapses whitespace, parses money into integer cents) and returns either `{ ok: true, value }` or `{ ok: false, errors }`, with one message per field written for the person filling in the form.
- `store-core.mjs` defines the store, `{ schemaVersion, requests, log }`, and the only two ways to change it: `createRequest` and `applyAction`. Both return a new store and never mutate the old one.
- `metrics.mjs`, `query.mjs` and `export.mjs` read the store: dashboard figures, list filtering, and the handover bundle with its integrity check.

**`src/server/`** is the HTTP layer. `app.mjs` maps routes to domain calls and domain error codes to status codes (`validation_failed` 400, `forbidden` 403, `not_found` 404, `invalid_transition` 409). It serves only `index.html`, `favicon.svg`, `src/domain/`, `src/ui/` and `dist/`, with a strict Content Security Policy. `file-store.mjs` keeps the store in memory, writes it atomically after each change, and queues writes so concurrent requests apply in order.

**`src/ui/`** is the browser app. `stores.mjs` offers one interface (`load`, `create`, `act`, `exportBundle`, `reset`) with two implementations: `HttpStore` for the server and `MemoryStore`, which runs the domain functions in the page. `connectStore()` picks the server when `/api/health` answers and memory otherwise.

## Data flow

Approving a request, end to end:

1. The person presses **Approve** in the detail panel. `app.mjs` calls `store.act(id, 'approve', { actor, comment })`.
2. With the server: `HttpStore` posts to `/api/requests/:id/actions`. `app.mjs` (server) runs `FileStore.update(store => applyAction(store, id, 'approve', { actor, comment, now }))`.
3. `applyAction` finds the request, calls `transition`, appends the activity entry with the next `EVT-` id, and returns the new store.
4. `FileStore` writes the new store to a temp file, renames it over `data/store.json`, then swaps it in memory. If any step throws, neither the file nor memory changes.
5. The response carries the updated request and the entry. The UI reloads the store and re-renders the list and detail; the dashboard recomputes from the same data the next time it is shown.

In local mode, step 2 to 4 happen inside `MemoryStore` with the same `applyAction`.

## Why no framework

The portal has four views, one form and one chart. A framework would bring a build step, a dependency tree to audit and keep current, and a layer between the reader and the code that runs, for little gain at this size. Plain ES modules keep the whole app readable in an afternoon and runnable from a file.

The trade-offs are explicit: views re-render their region on change rather than diffing, and DOM code is written by hand through `h()` in `dom.mjs`, which only ever sets text through text nodes (no `innerHTML`, so no markup injection). If the app grows past roughly a dozen views or needs fine-grained live updates, moving the `src/ui/` layer to a framework is contained: the domain and the server stay as they are.

## How to extend

**Add a request type** (for example `travel`):

1. In `validation.mjs`, add it to `REQUEST_TYPES`, `TYPE_LABELS`, and add its field rules to `validateRequestInput`.
2. In `app.mjs`, add a `TYPE_HINTS` entry and, if it has its own fields, a `field(...)` in the form and an entry in `visibleFields`.
3. Add tests in `test/validation.test.mjs`. Run `npm run bundle` and `npm test`.

**Add a workflow step** (for example `on_hold`):

1. Add the state to `STATES`, `STATE_LABELS` and, if work is still expected, `OPEN_STATES`.
2. Add actions to `ACTIONS` (`hold: { from: 'in_review', to: 'on_hold' }`, `resume: { from: 'on_hold', to: 'in_review' }`) and any guard to `transition`.
3. Add a badge colour in `styles.css` (`.badge-on_hold`) and a verb in `VERBS` in `app.mjs`. The chart, filters, action buttons and export schema pick up the new state from the tables.

**Change the storage** (for example to a database): implement the `FileStore` surface (`open`, `get`, `update(change)`) over the database, wrapping `update` in a transaction. Nothing in `src/domain/` or `src/ui/` changes.

**Change the schema**: bump `SCHEMA_VERSION` in `store-core.mjs`, add a migration that turns version N into N+1 before `validateStore` runs in `FileStore.open`, and say so in `CHANGELOG.md`. Exported bundles carry their version, so a receiving system can tell which shape it has.

## The file:// bundle

Browsers refuse ES module imports from `file://`. `src/ui/boot.js` loads `src/ui/app.mjs` as a module when served over http, and `dist/portal.js` when opened from disk. `scripts/bundle.mjs` writes that file from the same modules, wrapping each in a function scope and turning named imports into lookups, so there is no name clash and no new behaviour. It accepts only named imports and named exports and fails loudly on anything else. `test/browser-modules.test.mjs` fails when the checked-in bundle differs from a fresh build.
