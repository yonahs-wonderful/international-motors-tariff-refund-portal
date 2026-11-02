import { account, importerProfile, filers, documentTypes, STATUS, seedState } from './data.js';
import {
  clone, money, totals, formatRequestNumber, findByInternalReference, searchRequests,
  validateEntry, validateImporter, validateEntries, validateInterest, validateAttachments, validateAttachment, validateRequest, parseUsd,
} from './domain.js';

const STORAGE_KEY = 'im-tariff-refund-portal-v1';
const DRAFT_KEY = `${STORAGE_KEY}-unsaved`;
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatDate = value => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '—';
const formatDateTime = value => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(value)) : '—';

const STEPS = [
  { key: 'importer', label: 'Importer of record' },
  { key: 'entries', label: 'Entries' },
  { key: 'interest', label: 'Interest' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'review', label: 'Review' },
];

let flash = null;
let keepFlash = false;
let errors = [];
let pending = { entry: {}, attachment: { type: documentTypes[0] } };
let ui = { query: '', focus: null };

const params = new URLSearchParams(location.search);
if (params.get('reset') === '1') {
  try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
  params.delete('reset');
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + (location.hash || '#signin'));
  flash = { type: 'success', text: 'Demo data has been reset. Sign in to continue.' };
}

let state = loadState();
let draft = loadDraft();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.requests) && Number.isInteger(saved.nextSequence)) return saved;
  } catch { /* fall back to seed */ }
  return seedState();
}
function commit(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); state = next; return true; }
  catch { flash = { type: 'error', text: 'This browser could not save the change. Check that site storage is enabled.' }; return false; }
}
function emptyDraft() {
  return { id: null, internalReference: '', programme: 'IEEPA', iorName: '', iorNumber: '', filer: '', contactName: '', contactEmail: '', entries: [], interestUsd: '', interestConfirmed: false, attachments: [] };
}
function loadDraft() {
  try { const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); if (saved && Array.isArray(saved.entries)) return saved; } catch { /* none */ }
  return null;
}
function saveDraft() {
  try { draft ? sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) : sessionStorage.removeItem(DRAFT_KEY); } catch { /* best effort */ }
}

function route() {
  const hash = location.hash.replace(/^#/, '') || 'dashboard';
  const [page, arg] = hash.split('/');
  return { page, arg: arg ? decodeURIComponent(arg) : '' };
}
function go(hash) {
  if (location.hash === `#${hash}`) render();
  else location.hash = hash;
}

// ---------- shell ----------
function render() {
  let { page, arg } = route();
  if (!state.session && page !== 'signin') { page = 'signin'; history.replaceState(null, '', '#signin'); }
  if (state.session && page === 'signin') { page = 'dashboard'; history.replaceState(null, '', '#dashboard'); }
  if (page === 'new' && !draft) { draft = emptyDraft(); saveDraft(); }

  let content;
  let crumbs = [];
  if (page === 'signin') content = renderSignIn();
  else if (page === 'new') { const step = STEPS.find(s => s.key === arg) ? arg : 'importer'; crumbs = [['New IEEPA refund request']]; content = renderWizard(step); }
  else if (page === 'request') { crumbs = [[arg || 'Refund request']]; content = renderRequest(arg); }
  else { page = 'dashboard'; content = renderDashboard(); }

  const signedIn = Boolean(state.session);
  app.innerHTML = `
    <div class="demo-banner" role="note"><strong>Demo simulation — not affiliated with U.S. Customs and Border Protection.</strong> <span>Fictional data for an International Motors demonstration. Nothing is filed with any government agency.</span></div>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#dashboard" aria-label="Trade Refund Filing Portal (Demo) home">
          <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="4" fill="#ffffff" stroke="#9bb4d3" stroke-width="2"/><path d="M8 26h24l-3 6H11z" fill="#1a4480"/><rect x="12" y="15" width="7" height="9" fill="#2e6276"/><rect x="21" y="11" width="7" height="13" fill="#5d87b6"/><path d="M8 34h24" stroke="#1a4480" stroke-width="2"/></svg>
          <span class="brand-text"><span class="brand-title">Trade Refund Filing Portal (Demo)</span><span class="brand-subtitle">Importer duty refund requests</span></span>
        </a>
        ${signedIn ? `<div class="header-user"><span>Signed in as <strong>${h(state.session.userId)}</strong> · ${h(account.organization)}</span><button type="button" class="link-button" data-action="preferences">Preferences</button><button type="button" class="link-button" data-action="help">Help</button><button type="button" class="link-button" data-action="sign-out">Sign out</button></div>` : `<div class="header-user"><button type="button" class="link-button" data-action="help">Help</button><button type="button" class="link-button" data-action="preferences">Preferences</button></div>`}
      </div>
      ${signedIn ? `<nav class="primary-nav" aria-label="Primary"><div class="header-inner"><a href="#dashboard" ${page === 'dashboard' || page === 'request' ? 'aria-current="page"' : ''}>Refund requests</a>${page === 'new' ? '<span class="nav-current" aria-current="page">Request in progress</span>' : ''}</div></nav>` : ''}
    </header>
    <main id="main" tabindex="-1">
      ${signedIn && crumbs.length ? `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#dashboard">Refund requests</a>${crumbs.map(([label]) => `<span aria-hidden="true">›</span><span>${h(label)}</span>`).join('')}</nav>` : ''}
      ${flash ? `<div class="alert alert-${flash.type}" role="${flash.type === 'error' ? 'alert' : 'status'}"><div>${h(flash.text)}</div><button type="button" class="alert-dismiss" data-action="dismiss-flash" aria-label="Dismiss message">×</button></div>` : ''}
      ${content}
    </main>
    <footer class="site-footer"><div class="header-inner"><span>Demo simulation — not affiliated with U.S. Customs and Border Protection or any government agency. Records are saved in this browser only.</span><span><button type="button" class="link-button" data-action="preferences">Preferences / Reset demo data</button></span></div></footer>`;

  document.title = `${page === 'signin' ? 'Sign in' : page === 'new' ? 'New IEEPA refund request' : page === 'request' ? arg : 'Refund requests'} — Trade Refund Filing Portal (Demo)`;
  const target = ui.focus ? document.getElementById(ui.focus) : null;
  ui.focus = null;
  (target || document.querySelector('main h1'))?.focus({ preventScroll: Boolean(target) });
}

const errorFor = field => errors.find(e => e.field === field);
function field({ id, label, value = '', hint = '', type = 'text', required = true, attrs = '', sync = true, width = '', compact = false }) {
  const err = errorFor(id);
  const describedBy = [hint ? `${id}-hint` : '', err ? `${id}-error` : ''].filter(Boolean).join(' ');
  return `<div class="form-group ${err ? 'has-error' : ''} ${width}">
    <label for="${id}">${h(label)}${required ? '' : ' <span class="optional">(optional)</span>'}</label>
    ${hint ? `<div class="hint" id="${id}-hint">${h(hint)}</div>` : ''}
    ${err ? `<div class="field-error ${compact ? 'visually-hidden' : ''}" id="${id}-error">${h(err.message)}</div>` : ''}
    <input id="${id}" name="${id}" type="${type}" value="${h(value)}" ${sync ? `data-field="${id}"` : ''} ${required ? 'aria-required="true"' : ''} ${err ? 'aria-invalid="true"' : ''} ${describedBy ? `aria-describedby="${describedBy}"` : ''} autocomplete="off" spellcheck="false" ${attrs}>
  </div>`;
}
function errorSummary() {
  if (!errors.length) return '';
  return `<div class="error-summary" role="alert" aria-labelledby="error-summary-title"><h2 id="error-summary-title" tabindex="-1">There is a problem</h2><ul>${errors.map(e => `<li><a href="#${h(e.field)}" data-action="focus-field" data-field-id="${h(e.field)}">${h(e.message)}</a></li>`).join('')}</ul></div>`;
}
const statusTag = status => `<span class="status-tag status-${status === STATUS.ready ? 'ready' : status === STATUS.approved ? 'approved' : 'submitted'}">${h(status)}</span>`;

// ---------- sign in ----------
function renderSignIn() {
  return `<section class="signin-card" aria-labelledby="signin-title">
    <h1 id="signin-title" tabindex="-1">Sign in</h1>
    <p>Sign in to prepare and track importer duty refund requests.</p>
    <form id="signin-form" novalidate>
      ${field({ id: 'userId', label: 'User ID', value: account.userId, sync: false })}
      ${field({ id: 'password', label: 'Password', type: 'password', required: false, sync: false, hint: 'Demo account: any password is accepted.' })}
      <button type="submit" class="button button-primary">Sign in</button>
    </form>
    <p class="fine-print">This demonstration has no real accounts. Use the prefilled demo user.</p>
  </section>`;
}

// ---------- dashboard ----------
function renderDashboard() {
  const results = searchRequests(state.requests, ui.query).slice().sort((a, b) => b.id.localeCompare(a.id));
  const q = ui.query.trim();
  const unsaved = draft && (draft.entries.length || draft.internalReference || draft.iorName);
  return `<div class="page-head"><h1 tabindex="-1">Refund requests</h1><button type="button" class="button button-primary" data-action="new-request">New IEEPA refund request</button></div>
    ${unsaved ? `<div class="alert alert-info" role="status"><div>You have an unsaved refund request${draft.internalReference ? ` (${h(draft.internalReference)})` : ''} with ${draft.entries.length} ${draft.entries.length === 1 ? 'entry' : 'entries'}.</div><div class="inline-actions"><a class="button button-secondary" href="#new/importer">Resume unsaved request</a><button type="button" class="button button-secondary" data-action="discard-draft">Discard unsaved request</button></div></div>` : ''}
    <form id="search-form" class="search-panel" role="search" novalidate>
      <div class="form-group search-group">
        <label for="searchQuery">Request reference</label>
        <div class="hint" id="searchQuery-hint">Search by request number (RFD-…) or internal reference.</div>
        <div class="search-row"><input id="searchQuery" name="searchQuery" type="search" value="${h(ui.query)}" aria-describedby="searchQuery-hint" autocomplete="off" spellcheck="false"><button type="submit" class="button button-primary">Search</button><button type="button" class="button button-secondary" data-action="clear-search">Clear search</button></div>
      </div>
    </form>
    <p class="result-count" role="status" aria-live="polite">${q ? (results.length ? `${results.length} refund ${results.length === 1 ? 'request matches' : 'requests match'} “${h(q)}”.` : `No refund requests match “${h(q)}”.`) : `Showing all ${results.length} refund requests.`}</p>
    ${results.length ? `<div class="table-wrap"><table class="data-table" aria-label="Refund requests">
      <thead><tr><th scope="col">Request number</th><th scope="col">Internal reference</th><th scope="col">Importer of record</th><th scope="col">Filer</th><th scope="col" class="num">Entries</th><th scope="col" class="num">Refund total</th><th scope="col">Status</th><th scope="col">Last updated</th></tr></thead>
      <tbody>${results.map(r => { const t = totals(r); return `<tr><td class="nowrap mono"><a href="#request/${encodeURIComponent(r.id)}" aria-label="Open refund request ${h(r.id)}">${h(r.id)}</a></td><td class="nowrap mono">${h(r.internalReference)}</td><td>${h(r.iorName)}</td><td>${h(r.filer)}</td><td class="num">${t.count}</td><td class="num">${money(t.refundUsd)}</td><td class="nowrap">${statusTag(r.status)}</td><td class="nowrap">${formatDate(r.updatedAt)}</td></tr>`; }).join('')}</tbody>
    </table></div>` : ''}`;
}

// ---------- wizard ----------
function stepper(current) {
  const index = STEPS.findIndex(s => s.key === current);
  return `<nav class="stepper" aria-label="Request steps"><ol>${STEPS.map((s, i) => `<li class="${i < index ? 'done' : i === index ? 'current' : ''}">${i < index ? `<a href="#new/${s.key}"><span class="step-num" aria-hidden="true">✓</span>Step ${i + 1}: ${h(s.label)}</a>` : `<span ${i === index ? 'aria-current="step"' : ''}><span class="step-num" aria-hidden="true">${i + 1}</span>Step ${i + 1}: ${h(s.label)}</span>`}</li>`).join('')}</ol></nav>`;
}
function wizardNav(step, nextLabel) {
  const index = STEPS.findIndex(s => s.key === step);
  return `<div class="wizard-actions">
    ${index > 0 ? `<button type="button" class="button button-secondary" data-action="back" data-step="${STEPS[index - 1].key}">Back</button>` : '<span></span>'}
    <div class="inline-actions"><button type="button" class="button button-link" data-action="cancel-request">Cancel request</button>${nextLabel}</div>
  </div>`;
}
function totalsBar() {
  const t = totals(draft);
  return `<div class="totals-bar" aria-label="Running totals"><span>Entries: <strong id="running-count">${t.count}</strong></span><span>IEEPA duty total: <strong id="running-duty">${money(t.dutyUsd)}</strong></span></div>`;
}
function renderWizard(step) {
  const index = STEPS.findIndex(s => s.key === step);
  const body = { importer: stepImporter, entries: stepEntries, interest: stepInterest, attachments: stepAttachments, review: stepReview }[step]();
  return `<div class="page-head"><h1 tabindex="-1">New IEEPA refund request</h1><span class="page-meta">Step ${index + 1} of ${STEPS.length}: ${h(STEPS[index].label)}</span></div>${stepper(step)}${errorSummary()}<section class="panel" aria-labelledby="step-title">${body}</section>`;
}

function stepImporter() {
  return `<h2 id="step-title">Step 1: Importer of record</h2>
    <form id="importer-form" novalidate>
      <div class="form-grid">
        ${field({ id: 'internalReference', label: 'Internal reference', value: draft.internalReference, hint: 'Your company’s case reference, e.g. CASE-O2C-TARIFF-0098. Used to find this request later.' })}
        <div class="form-group"><span class="label">Refund programme</span><div class="readonly-value">IEEPA duties — refund requested per import entry</div></div>
        ${field({ id: 'iorName', label: 'Importer of record name', value: draft.iorName })}
        ${field({ id: 'iorNumber', label: 'Importer of record number', value: draft.iorNumber, hint: 'Format NN-NNNNNNN-XX, e.g. 36-4410987-00.' })}
        <div class="form-group ${errorFor('filer') ? 'has-error' : ''}">
          <label for="filer">Filer (customs broker)</label>
          <div class="hint" id="filer-hint">The broker who filed these entries and will transmit the request.</div>
          ${errorFor('filer') ? `<div class="field-error" id="filer-error">${h(errorFor('filer').message)}</div>` : ''}
          <select id="filer" name="filer" data-field="filer" aria-required="true" aria-describedby="filer-hint${errorFor('filer') ? ' filer-error' : ''}" ${errorFor('filer') ? 'aria-invalid="true"' : ''}><option value="">Select filer</option>${filers.map(f => `<option value="${h(f.name)}" ${draft.filer === f.name ? 'selected' : ''}>${h(f.name)} (filer code ${h(f.code)})</option>`).join('')}</select>
        </div>
        ${field({ id: 'contactName', label: 'Contact name', value: draft.contactName })}
        ${field({ id: 'contactEmail', label: 'Contact email', value: draft.contactEmail, type: 'email', required: false })}
      </div>
      <div class="profile-fill"><button type="button" class="button button-secondary" data-action="fill-profile">Use account importer profile</button><span class="hint">Fills the importer name, number and contact from the signed-in account (${h(importerProfile.iorName)}).</span></div>
      ${wizardNav('importer', '<button type="submit" class="button button-primary">Next: Entries</button>')}
    </form>`;
}

function entriesTable(entries, removable) {
  const t = totals({ entries });
  if (!entries.length) return '<p class="empty-state">No entries added yet.</p>';
  return `<div class="table-wrap"><table class="data-table" aria-label="Entries on this request">
    <thead><tr><th scope="col" class="num">#</th><th scope="col">Entry number</th><th scope="col">Entry date</th><th scope="col">HTS number</th><th scope="col">Description</th><th scope="col" class="num">IEEPA duty paid (USD)</th>${removable ? '<th scope="col"><span class="visually-hidden">Actions</span></th>' : ''}</tr></thead>
    <tbody>${entries.map((e, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${h(e.entry)}</td><td>${h(e.date)}</td><td class="mono">${h(e.hts)}</td><td>${h(e.description)}</td><td class="num">${money(e.dutyUsd)}</td>${removable ? `<td><button type="button" class="button button-link danger" data-action="remove-entry" data-index="${i}" aria-label="Remove entry ${h(e.entry)}">Remove</button></td>` : ''}</tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row" colspan="5">IEEPA duty total (${t.count} ${t.count === 1 ? 'entry' : 'entries'})</th><td class="num"><strong>${money(t.dutyUsd)}</strong></td>${removable ? '<td></td>' : ''}</tr></tfoot>
  </table></div>`;
}

function stepEntries() {
  const p = pending.entry;
  return `<h2 id="step-title">Step 2: Entries</h2>
    <p class="lead">Add each import entry one at a time. The duty total updates as entries are added.</p>
    <form id="entry-form" class="add-entry" novalidate aria-labelledby="add-entry-title">
      <h3 id="add-entry-title">Add entry</h3>
      <div class="entry-grid">
        ${field({ compact: true, id: 'newEntry', label: 'Entry number', value: p.entry, hint: 'e.g. LKS-2541187-3', sync: false })}
        ${field({ compact: true, id: 'newDate', label: 'Entry date', value: p.date, hint: 'YYYY-MM-DD', sync: false, attrs: 'inputmode="numeric"' })}
        ${field({ compact: true, id: 'newHts', label: 'HTS number', value: p.hts, hint: 'e.g. 8421.39.4090', sync: false })}
        ${field({ compact: true, id: 'newDescription', label: 'Description', value: p.description, hint: 'Goods description', sync: false })}
        ${field({ compact: true, id: 'newDuty', label: 'IEEPA duty paid (USD)', value: p.dutyUsd, hint: 'e.g. 98400', sync: false, attrs: 'inputmode="decimal"' })}
        <div class="form-group add-button-cell"><button type="submit" class="button button-primary">Add entry</button></div>
      </div>
    </form>
    ${totalsBar()}
    ${entriesTable(draft.entries, true)}
    ${wizardNav('entries', '<button type="button" class="button button-primary" data-action="next" data-step="interest">Next: Interest</button>')}`;
}

function stepInterest() {
  const t = totals(draft);
  const confirmErr = errorFor('interestConfirmed');
  return `<h2 id="step-title">Step 3: Interest</h2>
    <p class="lead">Enter the total interest claimed for the entries on this request. The refund total is duty plus interest.</p>
    <form id="interest-form" novalidate>
      <dl class="summary-list compact">
        <div><dt>Entries</dt><dd>${t.count}</dd></div>
        <div><dt>IEEPA duty total</dt><dd id="interest-duty-total">${money(t.dutyUsd)}</dd></div>
      </dl>
      <div class="form-grid narrow">
        ${field({ id: 'interestUsd', label: 'Interest claimed (USD) — total for all entries', value: draft.interestUsd, hint: 'e.g. 18940. Enter 0 if no interest is claimed.', attrs: 'inputmode="decimal"' })}
        <div class="form-group"><span class="label" id="refund-total-label">Refund total (duty + interest)</span><output id="refund-total" class="big-number" aria-labelledby="refund-total-label" aria-live="polite">${money(totals(draft).refundUsd)}</output></div>
      </div>
      <div class="form-group checkbox-group ${confirmErr ? 'has-error' : ''}">
        ${confirmErr ? `<div class="field-error" id="interestConfirmed-error">${h(confirmErr.message)}</div>` : ''}
        <input type="checkbox" id="interestConfirmed" name="interestConfirmed" data-field="interestConfirmed" ${draft.interestConfirmed ? 'checked' : ''} ${confirmErr ? 'aria-invalid="true" aria-describedby="interestConfirmed-error"' : ''}>
        <label for="interestConfirmed">I confirm the interest amount and the refund total shown above.</label>
      </div>
      ${wizardNav('interest', '<button type="submit" class="button button-primary">Next: Attachments</button>')}
    </form>`;
}

function stepAttachments() {
  const p = pending.attachment;
  const typeErr = errorFor('attachmentType');
  return `<h2 id="step-title">Step 4: Attachments</h2>
    <p class="lead">Attach the supporting refund package. In this demonstration, type the document’s file name; no file is uploaded.</p>
    <form id="attachment-form" class="add-entry" novalidate aria-labelledby="attach-title">
      <h3 id="attach-title">Attach a document</h3>
      <div class="attach-grid">
        ${field({ compact: true, id: 'fileName', label: 'File name', value: p.fileName, hint: 'e.g. refund-package-6-entries.pdf', sync: false })}
        <div class="form-group ${typeErr ? 'has-error' : ''}"><label for="attachmentType">Document type</label><div class="hint">Classify the document</div><select id="attachmentType" name="attachmentType">${documentTypes.map(t => `<option ${p.type === t ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></div>
        <div class="form-group span-2 ${errorFor('note') ? 'has-error' : ''}"><label for="note">Note <span class="optional">(optional)</span></label><div class="hint">Visible to your broker</div>${errorFor('note') ? `<div class="field-error">${h(errorFor('note').message)}</div>` : ''}<textarea id="note" name="note" rows="1">${h(p.note)}</textarea></div>
        <div class="form-group add-button-cell"><button type="submit" class="button button-primary">Attach</button></div>
      </div>
    </form>
    ${draft.attachments.length ? attachmentsTable(draft.attachments, true) : '<p class="empty-state">No documents attached yet.</p>'}
    ${wizardNav('attachments', '<button type="button" class="button button-primary" data-action="next" data-step="review">Next: Review</button>')}`;
}
function attachmentsTable(list, removable) {
  return `<div class="table-wrap"><table class="data-table" aria-label="Attached documents"><thead><tr><th scope="col">File name</th><th scope="col">Document type</th><th scope="col">Note</th>${removable ? '<th scope="col"><span class="visually-hidden">Actions</span></th>' : ''}</tr></thead>
    <tbody>${list.map((a, i) => `<tr><td class="mono">${h(a.fileName)}</td><td>${h(a.type)}</td><td>${h(a.note || '—')}</td>${removable ? `<td><button type="button" class="button button-link danger" data-action="remove-attachment" data-index="${i}" aria-label="Remove attachment ${h(a.fileName)}">Remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function headerSummary(r) {
  return `<dl class="summary-list">
    <div><dt>Internal reference</dt><dd id="summary-internal-reference">${h(r.internalReference) || '—'}</dd></div>
    <div><dt>Refund programme</dt><dd>IEEPA duties</dd></div>
    <div><dt>Importer of record</dt><dd>${h(r.iorName) || '—'}</dd></div>
    <div><dt>Importer of record number</dt><dd class="mono">${h(r.iorNumber) || '—'}</dd></div>
    <div><dt>Filer (customs broker)</dt><dd>${h(r.filer) || '—'}</dd></div>
    <div><dt>Contact</dt><dd>${h(r.contactName) || '—'}${r.contactEmail ? ` · ${h(r.contactEmail)}` : ''}</dd></div>
  </dl>`;
}
function totalsSummary(r) {
  const t = totals(r);
  return `<dl class="totals-summary" aria-label="Refund totals">
    <div><dt>Entries</dt><dd id="total-entries">${t.count}</dd></div>
    <div><dt>IEEPA duty total</dt><dd id="total-duty">${money(t.dutyUsd)}</dd></div>
    <div><dt>Interest total</dt><dd id="total-interest">${money(t.interestUsd)}</dd></div>
    <div class="grand"><dt>Refund total</dt><dd id="total-refund">${money(t.refundUsd)}</dd></div>
  </dl>`;
}
function stepReview() {
  return `<h2 id="step-title">Step 5: Review</h2>
    <p class="lead">Check every value. Saving marks the request ready for your customs broker to submit.</p>
    <div class="review-section"><div class="section-head"><h3>Importer of record</h3><a href="#new/importer" class="button button-link" aria-label="Edit importer of record">Edit</a></div>${headerSummary(draft)}</div>
    <div class="review-section"><div class="section-head"><h3>Entries (${draft.entries.length})</h3><a href="#new/entries" class="button button-link" aria-label="Edit entries">Edit</a></div>${entriesTable(draft.entries, false)}</div>
    <div class="review-section"><div class="section-head"><h3>Totals</h3><a href="#new/interest" class="button button-link" aria-label="Edit interest">Edit</a></div>${totalsSummary(draft)}</div>
    <div class="review-section"><div class="section-head"><h3>Attachments (${draft.attachments.length})</h3><a href="#new/attachments" class="button button-link" aria-label="Edit attachments">Edit</a></div>${draft.attachments.length ? attachmentsTable(draft.attachments, false) : '<p class="empty-state">No documents attached.</p>'}</div>
    ${wizardNav('review', '<button type="button" class="button button-primary button-save" data-action="save-request">Save — ready for broker submission</button>')}`;
}

// ---------- request detail ----------
function renderRequest(id) {
  const r = state.requests.find(x => x.id === id);
  if (!r) return `<h1 tabindex="-1">Refund request not found</h1><p>No refund request ${h(id)} exists in this browser.</p><a class="button button-secondary" href="#dashboard">Back to refund requests</a>`;
  const ready = r.status === STATUS.ready;
  return `<div class="page-head"><h1 tabindex="-1">Refund request ${h(r.id)}</h1><a class="button button-secondary" href="#dashboard">Back to refund requests</a></div>
    <section class="status-panel ${ready ? 'ready' : ''}" aria-label="Request status">
      <dl class="summary-list status-list">
        <div><dt>Request number</dt><dd id="request-number" class="mono">${h(r.id)}</dd></div>
        <div><dt>Status</dt><dd id="request-status">${statusTag(r.status)}</dd></div>
        <div><dt>Internal reference</dt><dd id="request-internal-reference">${h(r.internalReference)}</dd></div>
        <div><dt>Saved</dt><dd>${formatDateTime(r.createdAt)} by ${h(r.createdBy)}</dd></div>
      </dl>
      ${ready ? `<div class="final-submit"><button type="button" class="button button-primary" disabled aria-disabled="true" aria-describedby="broker-required-note">Submit to CBP — Broker submission required</button><p id="broker-required-note">Broker submission required. The filer of record (${h(r.filer)}) must transmit this request. This demonstration never submits anything to a government agency.</p></div>` : `<p class="status-note">Last updated ${formatDateTime(r.updatedAt)}. No action is required in this portal.</p>`}
    </section>
    <section class="panel" aria-labelledby="totals-title"><h2 id="totals-title">Refund totals</h2>${totalsSummary(r)}</section>
    <section class="panel" aria-labelledby="ior-title"><h2 id="ior-title">Importer of record</h2>${headerSummary(r)}</section>
    <section class="panel" aria-labelledby="entries-title"><h2 id="entries-title">Entries (${r.entries.length})</h2>${entriesTable(r.entries, false)}</section>
    <section class="panel" aria-labelledby="attach-list-title"><h2 id="attach-list-title">Attachments (${r.attachments.length})</h2>${r.attachments.length ? attachmentsTable(r.attachments, false) : '<p class="empty-state">No documents attached.</p>'}</section>`;
}

// ---------- dialogs ----------
function openDialog(title, body) {
  modal.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${h(title)}</h2><button type="button" class="alert-dismiss" data-action="close-dialog" aria-label="Close dialog">×</button></div><div class="dialog-body">${body}</div>`;
  if (!modal.open) modal.showModal();
}
function showPreferences() {
  openDialog('Preferences', `<dl class="summary-list compact"><div><dt>User ID</dt><dd>${h(state.session?.userId || 'Not signed in')}</dd></div><div><dt>Organization</dt><dd>${h(account.organization)}</dd></div><div><dt>Next request number</dt><dd class="mono">${formatRequestNumber(state.nextSequence)}</dd></div></dl>
    <div class="reset-box"><h3>Demo data</h3><p>Restore the original sample refund requests in this browser and sign out. The next new request will be ${formatRequestNumber(seedState().nextSequence)}. You can also open the portal with <code>?reset=1</code>.</p><button type="button" class="button button-danger" data-action="confirm-reset">Reset demo data</button></div>
    <div class="dialog-actions"><button type="button" class="button button-secondary" data-action="close-dialog">Close</button></div>`);
}

// ---------- actions ----------
function readForm(form) { return Object.fromEntries(new FormData(form).entries()); }
function setErrors(list, focusFirst = true) { errors = list; if (focusFirst && list.length) ui.focus = 'error-summary-title'; }

function next(step) {
  const current = route().arg || 'importer';
  let list = [];
  if (current === 'importer') list = validateImporter(draft, state.requests);
  if (current === 'entries') list = validateEntries(draft);
  if (current === 'interest') list = validateInterest(draft);
  if (current === 'attachments') list = validateAttachments(draft);
  if (list.length) { setErrors(list); render(); focusSummary(); return; }
  errors = [];
  go(`new/${step}`);
}
function focusSummary() { document.getElementById('error-summary-title')?.setAttribute('tabindex', '-1'); document.getElementById('error-summary-title')?.focus(); }

function saveRequest() {
  const list = validateRequest(draft, state.requests);
  if (list.length) { setErrors(list); render(); focusSummary(); return; }
  const existing = findByInternalReference(state.requests, draft.internalReference);
  if (existing) { setErrors([{ field: 'internalReference', message: `Internal reference ${existing.internalReference} is already used by refund request ${existing.id}.` }]); render(); focusSummary(); return; }
  const now = new Date().toISOString();
  const id = formatRequestNumber(state.nextSequence);
  const request = {
    id, internalReference: draft.internalReference.trim(), programme: 'IEEPA',
    iorName: draft.iorName.trim(), iorNumber: draft.iorNumber.trim().toUpperCase(), filer: draft.filer,
    contactName: draft.contactName.trim(), contactEmail: draft.contactEmail.trim(),
    entries: clone(draft.entries), interestUsd: parseUsd(draft.interestUsd), interestConfirmed: true,
    attachments: clone(draft.attachments), status: STATUS.ready, createdAt: now, updatedAt: now, createdBy: state.session.userId,
  };
  const nextState = clone(state);
  nextState.requests.push(request);
  nextState.nextSequence += 1;
  if (!commit(nextState)) { render(); return; }
  draft = null; saveDraft(); errors = []; pending = { entry: {}, attachment: { type: documentTypes[0] } };
  const t = totals(request);
  flash = { type: 'success', text: `Refund request ${id} saved. Status: ${STATUS.ready}. Refund total ${money(t.refundUsd)}.` };
  keepFlash = true;
  go(`request/${encodeURIComponent(id)}`);
}

document.addEventListener('submit', event => {
  const form = event.target;
  event.preventDefault();
  const values = readForm(form);
  switch (form.id) {
    case 'signin-form': {
      const userId = String(values.userId || '').trim();
      if (!userId) { setErrors([{ field: 'userId', message: 'User ID is required.' }]); render(); return; }
      const nextState = clone(state); nextState.session = { userId, signedInAt: new Date().toISOString() };
      if (commit(nextState)) { errors = []; flash = null; go('dashboard'); }
      return;
    }
    case 'search-form': ui.query = String(values.searchQuery || ''); flash = null; render(); return;
    case 'importer-form':
      for (const key of ['internalReference', 'iorName', 'iorNumber', 'filer', 'contactName', 'contactEmail']) draft[key] = String(values[key] ?? '');
      saveDraft(); next('entries'); return;
    case 'interest-form':
      draft.interestUsd = String(values.interestUsd ?? ''); draft.interestConfirmed = form.querySelector('#interestConfirmed')?.checked || false;
      saveDraft(); next('attachments'); return;
    case 'entry-form': {
      const raw = { entry: values.newEntry, date: values.newDate, hts: values.newHts, description: values.newDescription, dutyUsd: values.newDuty };
      pending.entry = raw;
      const { entry, errors: list } = validateEntry(raw, draft.entries, state.requests, draft.id);
      if (list.length) {
        const map = { entry: 'newEntry', date: 'newDate', hts: 'newHts', description: 'newDescription', dutyUsd: 'newDuty' };
        errors = list.map(e => ({ ...e, field: map[e.field] || e.field }));
        flash = null; render(); focusSummary(); return;
      }
      draft.entries.push(entry); saveDraft();
      pending.entry = {}; errors = [];
      const t = totals(draft);
      flash = { type: 'success', text: `Entry ${entry.entry} added. ${t.count} ${t.count === 1 ? 'entry' : 'entries'}, IEEPA duty total ${money(t.dutyUsd)}.` };
      ui.focus = 'newEntry';
      render();
      return;
    }
    case 'attachment-form': {
      const raw = { fileName: values.fileName, type: values.attachmentType, note: values.note };
      pending.attachment = raw;
      const { attachment, errors: list } = validateAttachment(raw, draft.attachments);
      if (list.length) { errors = list; flash = null; render(); focusSummary(); return; }
      draft.attachments.push(attachment); saveDraft();
      pending.attachment = { type: documentTypes[0] }; errors = [];
      flash = { type: 'success', text: `${attachment.fileName} attached as ${attachment.type}.` };
      ui.focus = 'fileName';
      render();
      return;
    }
    case 'preferences-form': return;
    default:
  }
});

function syncField(el) {
  if (!draft || !el.dataset.field) return;
  draft[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  saveDraft();
  if (el.dataset.field === 'interestUsd') {
    const value = parseUsd(el.value);
    const out = document.getElementById('refund-total');
    if (out) out.textContent = Number.isNaN(value) ? 'Enter a valid amount' : money(totals({ ...draft, interestUsd: value }).refundUsd);
  }
}
document.addEventListener('input', event => syncField(event.target));
document.addEventListener('change', event => syncField(event.target));

document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  switch (action) {
    case 'dismiss-flash': flash = null; render(); break;
    case 'focus-field': event.preventDefault(); document.getElementById(el.dataset.fieldId)?.focus(); break;
    case 'sign-out': { const nextState = clone(state); nextState.session = null; commit(nextState); flash = { type: 'success', text: 'You have signed out.' }; keepFlash = true; go('signin'); break; }
    case 'new-request': draft = emptyDraft(); saveDraft(); errors = []; pending = { entry: {}, attachment: { type: documentTypes[0] } }; flash = null; go('new/importer'); break;
    case 'discard-draft': draft = null; saveDraft(); flash = { type: 'success', text: 'The unsaved refund request was discarded.' }; render(); break;
    case 'clear-search': ui.query = ''; flash = null; render(); ui.focus = 'searchQuery'; document.getElementById('searchQuery')?.focus(); break;
    case 'fill-profile':
      Object.assign(draft, { iorName: importerProfile.iorName, iorNumber: importerProfile.iorNumber, contactName: importerProfile.contactName, contactEmail: importerProfile.contactEmail });
      saveDraft(); flash = { type: 'success', text: 'Importer of record and contact filled from the account profile. Check the values before continuing.' }; render(); break;
    case 'next': next(el.dataset.step); break;
    case 'back': errors = []; flash = null; go(`new/${el.dataset.step}`); break;
    case 'cancel-request': openDialog('Cancel this request?', `<p>Unsaved entries and attachments on this request will be discarded.</p><div class="dialog-actions"><button type="button" class="button button-secondary" data-action="close-dialog">Keep editing</button><button type="button" class="button button-danger" data-action="confirm-cancel">Discard request</button></div>`); break;
    case 'confirm-cancel': modal.close(); draft = null; saveDraft(); errors = []; flash = { type: 'success', text: 'The unsaved refund request was discarded.' }; keepFlash = true; go('dashboard'); break;
    case 'remove-entry': { const [removed] = draft.entries.splice(Number(el.dataset.index), 1); saveDraft(); errors = []; flash = { type: 'success', text: `Entry ${removed?.entry} removed.` }; render(); break; }
    case 'remove-attachment': { const [removed] = draft.attachments.splice(Number(el.dataset.index), 1); saveDraft(); errors = []; flash = { type: 'success', text: `${removed?.fileName} removed.` }; render(); break; }
    case 'save-request': saveRequest(); break;
    case 'preferences': showPreferences(); break;
    case 'help': openDialog('Help', `<h3>File an IEEPA refund request</h3><ol><li>Sign in with the demo account.</li><li>On Refund requests, search by Request reference to check for an existing request.</li><li>Choose <strong>New IEEPA refund request</strong>.</li><li>Step 1: enter the internal reference, importer of record, filer and contact.</li><li>Step 2: add each entry with <strong>Add entry</strong>.</li><li>Step 3: enter the total interest and confirm the refund total.</li><li>Step 4: type the refund package file name and click <strong>Attach</strong>.</li><li>Step 5: review and click <strong>Save — ready for broker submission</strong>.</li></ol><p>Final submission is performed by the customs broker and is disabled in this portal.</p><div class="dialog-actions"><button type="button" class="button button-secondary" data-action="close-dialog">Close</button></div>`); break;
    case 'close-dialog': modal.close(); break;
    case 'confirm-reset': openDialog('Reset demo data?', `<p>This removes refund requests created in this browser, restores the sample requests and signs out.</p><div class="dialog-actions"><button type="button" class="button button-secondary" data-action="close-dialog">Cancel</button><button type="button" class="button button-danger" data-action="reset-data">Reset demo data</button></div>`); break;
    case 'reset-data':
      modal.close();
      try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      state = seedState(); draft = null; errors = []; ui.query = ''; pending = { entry: {}, attachment: { type: documentTypes[0] } };
      flash = { type: 'success', text: 'Demo data has been reset. Sign in to continue.' }; keepFlash = true; go('signin'); break;
    default:
  }
});

window.addEventListener('hashchange', () => {
  if (!keepFlash) flash = null;
  keepFlash = false;
  errors = [];
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { state = loadState(); render(); } });

if (!location.hash) history.replaceState(null, '', state.session ? '#dashboard' : '#signin');
render();
