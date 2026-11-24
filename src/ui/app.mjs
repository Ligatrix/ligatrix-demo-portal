// The browser app: hash routing, four views and the glue to the store.
// All business rules come from ../domain; this file only renders and wires.

import { h, clear } from './dom.mjs';
import { barChart } from './chart.mjs';
import { connectStore } from './stores.mjs';
import { STATES, STATE_LABELS, ACTIONS, availableActions } from '../domain/workflow.mjs';
import { REQUEST_TYPES, TYPE_LABELS, DEPARTMENTS, PRIORITIES, validateRequestInput } from '../domain/validation.mjs';
import { filterRequests, activityFor, SORTS } from '../domain/query.mjs';
import { summarize } from '../domain/metrics.mjs';
import { handoverFilename } from '../domain/export.mjs';
import { formatCents, formatDuration, formatTimestamp } from '../domain/format.mjs';
import { DEMO_PEOPLE } from '../domain/seed.mjs';
import { isDomainError } from '../domain/errors.mjs';

const VERBS = {
  created: 'Submitted',
  start_review: 'Started review',
  approve: 'Approved',
  reject: 'Rejected',
  complete: 'Marked done',
  close: 'Closed',
};

const SORT_LABELS = { newest: 'Newest first', oldest: 'Oldest first', amount: 'Largest amount', priority: 'Highest priority' };

const TYPE_HINTS = {
  purchase: 'Spend that needs sign-off',
  supplier_onboarding: 'Add or extend a supplier',
  access: 'Access to an internal system',
};

const ui = {
  main: document.getElementById('main'),
  actorSelect: document.getElementById('actor-select'),
  exportButton: document.getElementById('export-button'),
  resetButton: document.getElementById('reset-button'),
  storeLabel: document.getElementById('store-label'),
  toast: document.getElementById('toast'),
  tabs: [...document.querySelectorAll('.tabs a')],
};

const app = {
  store: null,
  data: { requests: [], log: [] },
  filters: { q: '', state: '', type: '', sort: 'newest' },
  actor: readSavedActor(),
};

// ---------------------------------------------------------------- helpers

function readSavedActor() {
  try {
    const saved = window.localStorage.getItem('portal.actor');
    if (DEMO_PEOPLE.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable (private windows, file:// in some browsers).
  }
  return DEMO_PEOPLE[0];
}

function saveActor(actor) {
  try {
    window.localStorage.setItem('portal.actor', actor);
  } catch {
    // Not fatal: the choice simply is not remembered.
  }
}

let toastTimer;
function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), 3200);
}

function parseRoute() {
  const [view = 'dashboard', id = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  const known = ['dashboard', 'requests', 'new', 'activity'];
  return { view: known.includes(view) ? view : 'dashboard', id: id ? decodeURIComponent(id) : null };
}

function badge(state) {
  return h('span', { class: `badge badge-${state}` }, STATE_LABELS[state] ?? state);
}

function requestById(id) {
  return app.data.requests.find((request) => request.id === id) ?? null;
}

function pageHead(title, subtitle, ...extra) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', { tabindex: -1 }, title), subtitle ? h('p', null, subtitle) : null), ...extra);
}

function errorMessage(error) {
  if (isDomainError(error)) return error.message;
  return 'Something went wrong. Please try again.';
}

async function refresh() {
  app.data = await app.store.load();
}

// ---------------------------------------------------------------- dashboard

function renderDashboard(main) {
  const now = new Date().toISOString();
  const summary = summarize(app.data.requests, { now });
  const decided = app.data.requests.filter((request) => request.decision).length;
  const approvals = app.data.requests.filter((request) => request.decision?.outcome === 'approved').length;

  const kpi = (label, value, note) =>
    h('div', { class: 'card kpi' }, h('p', { class: 'kpi-label' }, label), h('p', { class: 'kpi-value' }, value), h('p', { class: 'kpi-note' }, note));

  const chartData = STATES.map((state) => ({ label: STATE_LABELS[state], value: summary.byState[state] }));

  const aging = summary.agingOpen.map(requestById).filter(Boolean);
  const attention = aging.length
    ? h('ul', { class: 'request-list' }, aging.slice(0, 5).map((request) => h('li', null, requestLink(request))))
    : h('p', { class: 'empty' }, 'Nothing open for more than three days.');

  const recent = activityFor(app.data.log, { limit: 6 });

  main.append(
    pageHead('Dashboard', `${summary.total} requests in the portal, ${summary.open} open.`),
    h(
      'div',
      { class: 'grid-kpi' },
      kpi('Open requests', String(summary.open), `${summary.byState.new} new, ${summary.byState.in_review} in review`),
      kpi('Average time to approval', formatDuration(summary.averageTimeToApprovalMs ?? Number.NaN), `from submission, across ${approvals} approvals`),
      kpi('Approval rate', summary.approvalRate === null ? 'n/a' : `${Math.round(summary.approvalRate * 100)}%`, `of ${decided} decided requests`),
      kpi('Approved spend', formatCents(summary.approvedSpendCents), 'purchases approved to date'),
    ),
    h(
      'div',
      { class: 'grid-dash' },
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'chart-title' },
        h('div', { class: 'card-head' }, h('h2', { id: 'chart-title' }, 'Requests by state'), h('p', null, 'All requests, current state')),
        h('div', { class: 'card-body' }, barChart(chartData, { title: 'Requests by state' })),
      ),
      h(
        'div',
        { class: 'stack' },
        h(
          'section',
          { class: 'card', 'aria-labelledby': 'attention-title' },
          h('div', { class: 'card-head' }, h('h2', { id: 'attention-title' }, 'Needs attention'), h('p', null, 'Open for more than 3 days')),
          attention,
        ),
        h(
          'section',
          { class: 'card', 'aria-labelledby': 'recent-title' },
          h('div', { class: 'card-head' }, h('h2', { id: 'recent-title' }, 'Recent activity'), h('a', { href: '#/activity' }, 'View all')),
          h('div', { class: 'card-body' }, timeline(recent, { showRequest: true })),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- requests

function requestLink(request, selectedId) {
  const meta = [
    h('span', { class: 'id' }, request.id),
    h('span', null, TYPE_LABELS[request.type]),
    h('span', null, request.requester),
    request.amountCents !== null ? h('span', null, formatCents(request.amountCents)) : null,
    request.priority === 'high' ? h('span', { class: 'priority-high' }, 'High priority') : null,
  ];
  return h(
    'a',
    { class: 'request-link', href: `#/requests/${encodeURIComponent(request.id)}`, 'aria-current': request.id === selectedId ? 'true' : null },
    h('span', { class: 'request-title' }, request.title),
    badge(request.state),
    h('span', { class: 'request-meta' }, meta),
  );
}

function selectField(id, label, value, options, onChange) {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h('select', { id, onchange: (event) => onChange(event.target.value) }, options.map(([optionValue, text]) =>
      h('option', { value: optionValue, selected: optionValue === value ? true : null }, text),
    )),
  );
}

function renderRequestsShell(main) {
  const setFilter = (key) => (value) => {
    app.filters[key] = value;
    updateRequestList();
  };
  const search = h('input', {
    id: 'filter-q',
    type: 'search',
    placeholder: 'Title, id, person, supplier or system',
    value: app.filters.q,
    autocomplete: 'off',
    oninput: (event) => setFilter('q')(event.target.value),
  });
  main.append(
    pageHead('Requests', 'Search, filter and act on every request.', h('a', { class: 'button', href: '#/new' }, 'New request')),
    h(
      'div',
      { class: 'toolbar', role: 'search' },
      h('div', { class: 'field' }, h('label', { for: 'filter-q' }, 'Search'), search),
      selectField('filter-state', 'State', app.filters.state, [['', 'All states'], ...STATES.map((s) => [s, STATE_LABELS[s]])], setFilter('state')),
      selectField('filter-type', 'Type', app.filters.type, [['', 'All types'], ...REQUEST_TYPES.map((t) => [t, TYPE_LABELS[t]])], setFilter('type')),
      selectField('filter-sort', 'Sort', app.filters.sort, SORTS.map((s) => [s, SORT_LABELS[s]]), setFilter('sort')),
    ),
    h('p', { class: 'result-count', id: 'result-count', 'aria-live': 'polite' }),
    h(
      'div',
      { class: 'split' },
      h('section', { class: 'card', 'aria-label': 'Request list' }, h('div', { id: 'request-list' })),
      h('section', { class: 'card', id: 'request-detail', 'aria-label': 'Request detail' }),
    ),
  );
}

function updateRequestList() {
  const container = document.getElementById('request-list');
  if (!container) return;
  const { id } = parseRoute();
  const results = filterRequests(app.data.requests, app.filters);
  document.getElementById('result-count').textContent =
    `${results.length} of ${app.data.requests.length} requests`;
  clear(container).append(
    results.length
      ? h('ul', { class: 'request-list' }, results.map((request) => h('li', null, requestLink(request, id))))
      : h('p', { class: 'empty' }, 'No requests match these filters.'),
  );
}

function fact(label, value) {
  return value === null || value === undefined || value === '' ? null : h('div', null, h('dt', null, label), h('dd', null, value));
}

function updateDetail() {
  const container = document.getElementById('request-detail');
  if (!container) return;
  clear(container);
  const { id } = parseRoute();
  const request = id ? requestById(id) : null;
  if (!request) {
    container.append(h('p', { class: 'empty' }, id ? `Request ${id} was not found.` : 'Select a request to see its details and act on it.'));
    return;
  }

  const decision = request.decision
    ? h(
      'div',
      { class: `decision decision-${request.decision.outcome}` },
      h('p', null, h('strong', null, `${request.decision.outcome === 'approved' ? 'Approved' : 'Rejected'} by ${request.decision.approver}`), ` · ${formatTimestamp(request.decision.at)}`),
      request.decision.comment ? h('p', null, request.decision.comment) : null,
    )
    : null;

  const parts = [
    h(
      'div',
      { class: 'detail-head' },
      h('div', { class: 'row' }, h('span', { class: 'id' }, request.id), badge(request.state)),
      h('h2', { id: 'detail-title', tabindex: -1 }, request.title),
    ),
    h(
      'dl',
      { class: 'facts' },
      fact('Type', TYPE_LABELS[request.type]),
      fact('Requester', request.requester),
      fact('Department', request.department),
      fact('Priority', request.priority[0].toUpperCase() + request.priority.slice(1)),
      fact('Amount', request.amountCents !== null ? formatCents(request.amountCents) : null),
      fact('Supplier', request.vendor),
      fact('System', request.system),
      fact('Needed by', request.neededBy),
      fact('Submitted', formatTimestamp(request.createdAt)),
    ),
    request.description ? h('div', { class: 'section' }, h('h3', null, 'Description'), h('p', { class: 'description' }, request.description)) : null,
    decision ? h('div', { class: 'section' }, h('h3', null, 'Decision'), decision) : null,
    actionsPanel(request),
    h('div', { class: 'section' }, h('h3', null, 'Activity'), timeline(activityFor(app.data.log, { requestId: request.id }))),
  ];
  container.append(...parts.filter(Boolean));
}

function actionsPanel(request) {
  const actions = availableActions(request.state);
  if (actions.length === 0) {
    return h('div', { class: 'section' }, h('p', { class: 'kpi-note' }, 'This request is done. No further actions.'));
  }
  const deciding = actions.includes('approve');
  const ownRequest = app.actor.toLowerCase() === request.requester.toLowerCase();
  const error = h('p', { class: 'form-error', id: 'action-error', role: 'alert' });
  const comment = h('textarea', { id: 'action-comment', maxlength: 1000, rows: 3, 'aria-describedby': 'action-comment-hint action-error' });

  const run = async (action, button) => {
    error.textContent = '';
    button.disabled = true;
    try {
      const result = await app.store.act(request.id, action, { actor: app.actor, comment: comment.value });
      await refresh();
      toast(`${request.id}: ${VERBS[action].toLowerCase()} by ${result.entry.actor}.`);
      updateRequestList();
      updateDetail();
      document.getElementById('detail-title')?.focus();
    } catch (failure) {
      error.textContent = errorMessage(failure);
      button.disabled = false;
      if (failure?.details?.fields?.comment) comment.focus();
    }
  };

  const buttons = actions.map((action) => {
    const kind = action === 'reject' ? 'button button-danger' : action === 'approve' ? 'button' : 'button button-secondary';
    const button = h('button', { type: 'button', class: kind }, ACTIONS[action].label);
    button.addEventListener('click', () => run(action, button));
    return button;
  });

  const hint = deciding
    ? ownRequest
      ? `You are acting as ${app.actor}, who raised this request. Switch "Acting as" to decide on it.`
      : `Deciding as ${app.actor}. A comment is required to reject.`
    : `Acting as ${app.actor}.`;

  return h(
    'div',
    { class: 'section' },
    h('h3', null, 'Next step'),
    h(
      'div',
      { class: 'actions-panel' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'action-comment' }, 'Comment ', h('span', { class: 'optional' }, deciding ? '(required to reject)' : '(optional)')),
        comment,
        h('p', { class: 'hint', id: 'action-comment-hint' }, hint),
      ),
      h('div', { class: 'actions-row' }, buttons),
      error,
    ),
  );
}

function timeline(entries, { showRequest = false } = {}) {
  if (entries.length === 0) return h('p', { class: 'kpi-note' }, 'No activity yet.');
  return h(
    'ol',
    { class: 'timeline' },
    entries.map((entry) =>
      h(
        'li',
        null,
        h(
          'div',
          null,
          h('p', null,
            h('strong', null, entry.actor), ' ', VERBS[entry.action]?.toLowerCase() ?? entry.action,
            showRequest ? [' ', h('a', { href: `#/requests/${encodeURIComponent(entry.requestId)}` }, entry.requestId)] : null),
          h('p', { class: 'when' }, formatTimestamp(entry.at)),
          entry.comment ? h('p', { class: 'comment' }, entry.comment) : null,
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- new request

function renderNewRequest(main) {
  const today = new Date().toISOString().slice(0, 10);
  const errorNodes = {};

  const field = (name, label, control, { hint, optional, span } = {}) => {
    const hintId = hint ? `hint-${name}` : null;
    errorNodes[name] = h('p', { class: 'error', id: `error-${name}` });
    control.setAttribute('aria-describedby', [hintId, `error-${name}`].filter(Boolean).join(' '));
    return h(
      'div',
      { class: `field${span ? ' span-2' : ''}`, 'data-field': name },
      h('label', { for: control.id }, label, optional ? h('span', { class: 'optional' }, ' (optional)') : null),
      control,
      hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
      errorNodes[name],
    );
  };

  const typeOptions = h(
    'fieldset',
    { class: 'field span-2', 'aria-describedby': 'error-type' },
    h('legend', null, 'Request type'),
    h('div', { class: 'type-options' }, REQUEST_TYPES.map((type) =>
      h('label', { class: 'type-option' },
        h('input', { type: 'radio', name: 'type', value: type, checked: type === 'purchase' }),
        h('span', null, h('strong', null, TYPE_LABELS[type]), h('small', null, TYPE_HINTS[type]))),
    )),
    (errorNodes.type = h('p', { class: 'error', id: 'error-type' })),
  );

  const form = h(
    'form',
    { class: 'card form-card', novalidate: true },
    h(
      'div',
      { class: 'form-grid' },
      typeOptions,
      field('title', 'Title', h('input', { id: 'f-title', name: 'title', maxlength: 120, autocomplete: 'off' }), {
        span: true,
        hint: 'One line a reviewer can scan, for example "Label printers for packing stations".',
      }),
      field('requester', 'Requester', h('input', { id: 'f-requester', name: 'requester', value: app.actor, autocomplete: 'off' })),
      field('department', 'Department', h('select', { id: 'f-department', name: 'department' },
        h('option', { value: '' }, 'Choose…'), DEPARTMENTS.map((d) => h('option', { value: d }, d)))),
      field('amount', 'Amount (USD)', h('input', { id: 'f-amount', name: 'amount', inputmode: 'decimal', placeholder: '1,250.00' })),
      field('vendor', 'Supplier', h('input', { id: 'f-vendor', name: 'vendor', autocomplete: 'off' })),
      field('system', 'System', h('input', { id: 'f-system', name: 'system', placeholder: 'Warehouse management system' })),
      field('priority', 'Priority', h('select', { id: 'f-priority', name: 'priority' },
        PRIORITIES.map((p) => h('option', { value: p, selected: p === 'normal' ? true : null }, p[0].toUpperCase() + p.slice(1))))),
      field('neededBy', 'Needed by', h('input', { id: 'f-neededBy', name: 'neededBy', type: 'date', min: today }), { optional: true }),
      field('description', 'Description', h('textarea', { id: 'f-description', name: 'description', maxlength: 2000, rows: 4 }), {
        span: true,
        optional: true,
        hint: 'Context the approver needs: quotes, reasons, deadlines.',
      }),
    ),
    h('p', { class: 'form-error form-error-inset', role: 'alert', id: 'form-error' }),
    h('div', { class: 'form-foot' }, h('a', { class: 'button button-secondary', href: '#/requests' }, 'Cancel'), h('button', { class: 'button', type: 'submit' }, 'Submit request')),
  );

  const formError = form.querySelector('#form-error');

  const visibleFields = (type) => ({
    amount: type === 'purchase',
    vendor: type === 'purchase' || type === 'supplier_onboarding',
    system: type === 'access',
  });

  const syncType = () => {
    const type = new FormData(form).get('type');
    for (const [name, visible] of Object.entries(visibleFields(type))) {
      form.querySelector(`[data-field="${name}"]`).hidden = !visible;
    }
  };

  const showErrors = (errors) => {
    for (const [name, node] of Object.entries(errorNodes)) {
      node.textContent = errors[name] ?? '';
      const control = form.querySelector(`[name="${name}"]`);
      if (control && name !== 'type') control.setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
    }
    const names = Object.keys(errors);
    formError.textContent = names.length ? `Please correct ${names.length} field${names.length > 1 ? 's' : ''} below.` : '';
    const first = names.map((name) => form.querySelector(`[name="${name}"]`)).find(Boolean);
    first?.focus();
  };

  form.addEventListener('change', (event) => {
    if (event.target.name === 'type') syncType();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form).entries());
    const check = validateRequestInput(input, { today });
    if (!check.ok) return showErrors(check.errors);
    showErrors({});
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const { request } = await app.store.create(input);
      await refresh();
      toast(`${request.id} submitted.`);
      window.location.hash = `#/requests/${encodeURIComponent(request.id)}`;
    } catch (failure) {
      submit.disabled = false;
      if (failure?.details?.fields) showErrors(failure.details.fields);
      else formError.textContent = errorMessage(failure);
    }
  });

  main.append(pageHead('New request', 'Submit a purchase, supplier or access request for review.'), form);
  syncType();
}

// ---------------------------------------------------------------- activity

function renderActivity(main) {
  const entries = activityFor(app.data.log);
  const titles = new Map(app.data.requests.map((request) => [request.id, request.title]));
  main.append(
    pageHead('Activity', `Every change, newest first. ${entries.length} entries.`),
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          null,
          h('caption', { class: 'sr-only' }, 'Activity log'),
          h('thead', null, h('tr', null, ['When', 'Who', 'Request', 'What', 'Comment'].map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null, entries.map((entry) =>
            h(
              'tr',
              null,
              h('td', { class: 'nowrap' }, formatTimestamp(entry.at)),
              h('td', null, entry.actor),
              h('td', null, h('a', { href: `#/requests/${encodeURIComponent(entry.requestId)}`, class: 'id' }, entry.requestId), h('br'), titles.get(entry.requestId) ?? ''),
              h('td', { class: 'nowrap' }, VERBS[entry.action] ?? entry.action, entry.to ? [' ', h('br'), badge(entry.to)] : null),
              h('td', null, entry.comment),
            ),
          )),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- routing

let currentView = null;
let hasRendered = false;

function render() {
  const { view } = parseRoute();
  for (const tab of ui.tabs) tab.setAttribute('aria-current', tab.dataset.route === view ? 'page' : 'false');
  const viewChanged = view !== currentView;

  if (view === 'requests' && !viewChanged) {
    updateRequestList();
    updateDetail();
    document.getElementById('detail-title')?.focus();
    return;
  }

  currentView = view;
  clear(ui.main);
  if (view === 'dashboard') renderDashboard(ui.main);
  else if (view === 'new') renderNewRequest(ui.main);
  else if (view === 'activity') renderActivity(ui.main);
  else {
    renderRequestsShell(ui.main);
    updateRequestList();
    updateDetail();
  }
  // Move focus to the new heading when the person navigates, not on first load.
  if (viewChanged && hasRendered) ui.main.querySelector('h1')?.focus();
  hasRendered = true;
}

function rerender() {
  currentView = null;
  render();
}

async function exportHandover() {
  ui.exportButton.disabled = true;
  try {
    const bundle = await app.store.exportBundle();
    const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: handoverFilename(bundle.exportedAt) });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Handover export ready: ${bundle.requests.length} requests, ${bundle.log.length} log entries.`);
  } catch (failure) {
    toast(`Export failed: ${errorMessage(failure)}`);
  } finally {
    ui.exportButton.disabled = false;
  }
}

async function resetData() {
  if (!window.confirm('Reset the demo data? Every change made here is replaced by the original demo requests.')) return;
  await app.store.reset();
  await refresh();
  rerender();
  toast('Demo data restored.');
}

async function start() {
  for (const person of DEMO_PEOPLE) {
    ui.actorSelect.append(h('option', { value: person, selected: person === app.actor ? true : null }, person));
  }
  ui.actorSelect.addEventListener('change', () => {
    app.actor = ui.actorSelect.value;
    saveActor(app.actor);
    if (currentView === 'requests') updateDetail();
  });
  ui.exportButton.addEventListener('click', exportHandover);
  ui.resetButton.addEventListener('click', resetData);
  window.addEventListener('hashchange', render);

  try {
    app.store = await connectStore();
    ui.storeLabel.textContent = app.store.description;
    await refresh();
    render();
  } catch (failure) {
    clear(ui.main).append(h('p', { class: 'loading' }, `The portal could not load: ${errorMessage(failure)}`));
  }
}

start();
