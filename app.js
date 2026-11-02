import { account, aceEntries, seedState, FILE_STATUS, CLAIM_STATUS } from './data.js';
import {
  money, normalizeEntry, buildCsv, templateCsv, splitPasted, submitDeclaration, displayStatus, searchUploads,
  claimTotals, evaluateEntries, validationResultCsv, claimDetailsCsv, TEMPLATE_NAME, MAX_ENTRIES, FILE_NAME_PATTERN,
} from './domain.js';

const STORAGE_KEY = 'im-trade-portal-cape-v2';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDateTime = v => v ? new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(v)) : '—';
const fmtDate = v => v ? new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00Z`)) : '—';

let flash = null;
let query = '';
let refreshTimer = null;
let upload = null; // upload dialog state

const params = new URLSearchParams(location.search);
if (params.get('reset') === '1') {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('im-tariff-refund-portal-v1'); } catch { /* storage unavailable */ }
  params.delete('reset');
  history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + '#signin');
  flash = { type: 'success', text: 'Demo data has been reset. Sign in to continue.' };
}

let state = loadState();
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.uploads) && Array.isArray(saved.claims)) return saved;
  } catch { /* fall back to seed */ }
  return seedState();
}
function commit(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); state = next; return true; }
  catch { flash = { type: 'error', text: 'This browser could not save the upload. Check that site storage is enabled.' }; return false; }
}

function route() {
  const [page, arg] = (location.hash.replace(/^#/, '') || 'home').split('/');
  return { page, arg: arg ? decodeURIComponent(arg) : '' };
}
const go = hash => { if (location.hash === `#${hash}`) render(); else location.hash = hash; };

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- shell ----------
const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'reports', label: 'Reports' },
  { key: 'ach', label: 'ACH Refunds' },
  { key: 'cape', label: 'CAPE', pages: ['cape', 'claims', 'job', 'claim'] },
];

const mark = `<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="7" fill="#e6f1fa" fill-opacity=".12"/><rect x="8" y="9" width="24" height="6" rx="1.5" fill="#73b3e7"/><rect x="8" y="17" width="24" height="6" rx="1.5" fill="#fff"/><rect x="8" y="25" width="15" height="6" rx="1.5" fill="#ffbe2e"/></svg>`;

function render() {
  clearTimeout(refreshTimer);
  let { page, arg } = route();
  if (!state.session && page !== 'signin') { page = 'signin'; history.replaceState(null, '', '#signin'); }
  if (state.session && page === 'signin') { page = 'cape'; history.replaceState(null, '', '#cape'); }

  const views = { signin: viewSignIn, home: viewHome, accounts: viewAccounts, reports: viewReports, ach: viewAch, cape: viewUploads, claims: viewClaims, job: viewJob, claim: viewClaim };
  const view = (views[page] || viewHome)(arg);
  const active = TABS.find(t => (t.pages || [t.key]).includes(page))?.key;
  document.title = `${view.title} | Trade Data Portal (Demo)`;

  app.innerHTML = `
    <section class="demo-banner" aria-label="Demo notice">
      <div class="wrap"><span class="demo-flag">DEMO</span><span><strong>Demo simulation — not affiliated with U.S. Customs and Border Protection.</strong> No data is sent to any government system. Modelled on the publicly documented CAPE refund process.</span></div>
    </section>
    <header class="masthead">
      <div class="wrap masthead-row">
        <a class="brand" href="#${state.session ? 'home' : 'signin'}">${mark}<span><span class="brand-name">Trade Data Portal</span><span class="brand-sub">Secure trade account access · Demo environment</span></span></a>
        ${state.session ? `<div class="who">
          <div class="who-acct"><span class="label">Account</span><span class="acct-pill">${h(account.accountType)}</span><span>${h(account.organization)} · ${h(account.iorNumber)}</span></div>
          <div class="who-user"><span>${h(account.displayName)}</span><span class="dot">·</span><span class="mono">${h(state.session.userId)}</span><button type="button" class="link-btn" data-action="signout">Sign out</button></div>
        </div>` : ''}
      </div>
      ${state.session ? `<nav class="tabs" aria-label="Portal"><div class="wrap">${TABS.map(t => `<a href="#${t.key}" class="tab${t.key === active ? ' active' : ''}"${t.key === active ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}</div></nav>` : ''}
    </header>
    <main id="main" class="wrap main" tabindex="-1">
      ${flash ? `<div class="alert alert-${flash.type}" role="${flash.type === 'error' ? 'alert' : 'status'}"><div class="alert-body">${flash.text}</div></div>` : ''}
      ${view.html}
    </main>
    <footer class="footer">
      <div class="wrap footer-row">
        <div><strong>Trade Data Portal (Demo)</strong><br>A demonstration built for an International Motors scenario. Entries, amounts and account details are fictional.</div>
        <div>Process reference: CAPE Phase 1 Trade User Information Notice (Apr 2026).<br><button type="button" class="link-btn light" data-action="reset">Reset demo data</button></div>
      </div>
    </footer>`;
  flash = null;
  view.after?.();
}

// ---------- sign in ----------
function viewSignIn() {
  return {
    title: 'Sign in',
    html: `<div class="signin">
      <section class="card signin-card">
        <h1>Sign in</h1>
        <p class="muted">Use your trade account user ID. This demo accepts any password.</p>
        <form id="signin-form" novalidate>
          <label class="field"><span>User ID</span><input id="user-id" name="userId" autocomplete="username" value="${h(account.userId)}" required></label>
          <label class="field"><span>Password</span><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Any password"></label>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        </form>
      </section>
      <aside class="signin-aside">
        <h2>IEEPA duty refunds</h2>
        <p>Refunds of IEEPA duties are requested by uploading a <strong>CAPE Declaration</strong>, a CSV list of entry numbers, in the <strong>CAPE</strong> tab.</p>
        <ul class="ticks">
          <li>Up to ${MAX_ENTRIES.toLocaleString('en-US')} entries per declaration; no supporting documents.</li>
          <li>Filed by the importer of record or the broker that filed the entries.</li>
          <li>Refunds, with interest, are paid by ACH to the refund account on file.</li>
        </ul>
      </aside>
    </div>`,
    after() {
      document.querySelector('#signin-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const userId = document.querySelector('#user-id').value.trim();
        if (!userId) { flash = { type: 'error', text: 'Enter your user ID.' }; return render(); }
        if (commit({ ...state, session: { userId, signedInAt: new Date().toISOString() } })) go('cape');
      });
    },
  };
}

// ---------- secondary tabs ----------
function pageHead(title, sub = '', actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
function viewHome() {
  const last = state.claims[0];
  return {
    title: 'Home',
    html: `${pageHead(`Welcome, ${h(account.displayName.split(' ')[0])}`, `${h(account.organization)} · Importer account ${h(account.iorNumber)}`)}
      <div class="alert alert-info"><div class="alert-body"><strong>IEEPA refunds:</strong> submit CAPE Declarations in the <a href="#cape">CAPE tab</a>. Post Summary Corrections cannot be used to request IEEPA refunds.</div></div>
      <div class="tiles">
        <a class="tile" href="#cape"><span class="tile-k">CAPE</span><span class="tile-v">${state.uploads.length} file uploads</span><span class="tile-s">Upload a CAPE Declaration</span></a>
        <a class="tile" href="#claims"><span class="tile-k">Latest claim</span><span class="tile-v mono">${h(last?.claim || '—')}</span><span class="tile-s">${h(last?.status || '')}</span></a>
        <a class="tile" href="#ach"><span class="tile-k">ACH refund account</span><span class="tile-v">•••• ${h(account.ach.last4)}</span><span class="tile-s">${h(account.ach.status)}</span></a>
      </div>`,
  };
}
function viewAccounts() {
  return {
    title: 'Accounts',
    html: `${pageHead('Accounts')}<section class="card"><table class="table"><thead><tr><th>Sub-account</th><th>Organization</th><th>Identifier</th><th>Access</th></tr></thead><tbody>
      <tr><td>Importer</td><td>${h(account.organization)}</td><td class="mono">${h(account.iorNumber)}</td><td>Trade Account Owner delegate · CAPE, ACH Refunds, Reports</td></tr>
    </tbody></table></section>`,
  };
}
function viewReports() {
  const rows = [['REV-603', 'Trade Refund', 'Refunds issued, including CAPE refunds and interest'], ['REV-613', 'ACH Rejected Refunds', 'Refunds rejected because no ACH refund account was on file']];
  return {
    title: 'Reports',
    html: `${pageHead('Reports', 'Refund reports for this importer account.')}<section class="card"><table class="table"><thead><tr><th>Report</th><th>Name</th><th>Description</th></tr></thead><tbody>${rows.map(r => `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table><p class="muted small pad">Reports are not generated in this demo.</p></section>`,
  };
}
function viewAch() {
  const a = account.ach;
  return {
    title: 'ACH Refunds',
    html: `${pageHead('ACH Refund Authorization', 'Refunds are paid electronically to the refund bank account on file. This account is separate from ACH used to pay duties.')}
      <section class="card"><dl class="kv">
        <div><dt>Refund recipient</dt><dd>${h(account.organization)} (${h(account.iorNumber)})</dd></div>
        <div><dt>Bank</dt><dd>${h(a.bank)}</dd></div>
        <div><dt>Account</dt><dd>•••• ${h(a.last4)}</dd></div>
        <div><dt>Status</dt><dd><span class="tag tag-green">${h(a.status)}</span></dd></div>
        <div><dt>Last updated</dt><dd>${fmtDate(a.updated)}</dd></div>
      </dl></section>`,
  };
}

// ---------- CAPE ----------
function capeHead(sub) {
  return `${pageHead('CAPE', 'Consolidated Administration and Processing of Entries — IEEPA duty refund declarations',
    `<button type="button" class="btn btn-primary" data-action="upload">Upload</button>`)}
    <nav class="subtabs" aria-label="CAPE"><a href="#cape" class="${sub === 'uploads' ? 'active' : ''}">File Uploads</a><a href="#claims" class="${sub === 'claims' ? 'active' : ''}">Claim Status</a></nav>`;
}

function statusTag(text) {
  const tone = {
    [FILE_STATUS.accepted]: 'green', [CLAIM_STATUS.accepted]: 'green', [CLAIM_STATUS.acceptedErrors]: 'gold',
    [FILE_STATUS.failedInitial]: 'red', [FILE_STATUS.rejectedBatch]: 'red', [CLAIM_STATUS.rejected]: 'red', [FILE_STATUS.processing]: 'blue',
  }[text] || 'gray';
  return `<span class="tag tag-${tone}">${text === FILE_STATUS.processing ? '<span class="spin" aria-hidden="true"></span>' : ''}${h(text)}</span>`;
}

function scheduleRefresh(ms) {
  if (ms > 0) refreshTimer = setTimeout(render, Math.min(ms + 50, 4000));
}

function viewUploads() {
  const now = Date.now();
  const rows = searchUploads(state.uploads, query);
  let pending = 0;
  const body = rows.map(u => {
    const d = displayStatus(u, now);
    if (d.pendingMs > 0) pending = pending ? Math.min(pending, d.pendingMs) : d.pendingMs;
    return `<tr>
      <td><a class="mono" href="#job/${encodeURIComponent(u.job)}">${h(u.job)}</a></td>
      <td class="break">${h(u.fileName)}</td>
      <td>${h(u.uploadedBy)}</td>
      <td class="nowrap">${fmtDateTime(u.uploadedAt)}</td>
      <td class="num">${u.entryCount.toLocaleString('en-US')}</td>
      <td>${statusTag(d.fileStatus)}</td>
      <td>${d.claimVisible ? `<a class="mono" href="#claim/${encodeURIComponent(u.claim)}">${h(u.claim)}</a>` : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');
  scheduleRefresh(pending);
  return {
    title: 'CAPE File Uploads',
    html: `${capeHead('uploads')}
      <section class="card">
        <div class="card-head">
          <div><h2>File Uploads</h2><p class="muted small">Results of file validation are shown in the File Upload Status column. Select a File Upload Job # to download the Validation Result File.</p></div>
          <form id="search-form" class="search" role="search">
            <label for="search" class="sr-only">Search file uploads</label>
            <input id="search" placeholder="File name, Job # or Claim Number" value="${h(query)}">
            <button class="btn btn-outline" type="submit">Search</button>
            ${query ? '<button class="btn btn-unstyled" type="button" data-action="clear-search">Clear search</button>' : ''}
          </form>
        </div>
        ${query ? `<p class="result-line" role="status">${rows.length} of ${state.uploads.length} file uploads match “${h(query)}”.</p>` : ''}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>File Upload Job #</th><th>File Name</th><th>Uploaded By</th><th>Upload Date</th><th class="num">Entries</th><th>File Upload Status</th><th>Claim Number</th></tr></thead>
          <tbody>${body || `<tr><td colspan="7" class="empty">No file uploads match “${h(query)}”.</td></tr>`}</tbody>
        </table></div>
      </section>`,
    after() {
      document.querySelector('#search-form').addEventListener('submit', ev => { ev.preventDefault(); query = document.querySelector('#search').value.trim(); render(); });
    },
  };
}

function viewClaims() {
  const now = Date.now();
  let pending = 0;
  const rows = state.claims.map(c => {
    const u = state.uploads.find(x => x.job === c.job);
    const d = u ? displayStatus(u, now) : { claimVisible: true, claimDone: true, pendingMs: 0 };
    if (!d.claimVisible) return '';
    if (d.pendingMs > 0) pending = pending ? Math.min(pending, d.pendingMs) : d.pendingMs;
    return `<tr>
      <td><a class="mono" href="#claim/${encodeURIComponent(c.claim)}">${h(c.claim)}</a></td>
      <td class="mono">${h(c.job)}</td>
      <td class="nowrap">${fmtDateTime(c.submittedAt)}</td>
      <td class="num">${c.submitted}</td>
      <td class="num">${d.claimDone ? c.accepted : '—'}</td>
      <td class="num">${d.claimDone ? c.rejected : '—'}</td>
      <td>${statusTag(d.claimDone ? c.status : CLAIM_STATUS.processing)}</td>
    </tr>`;
  }).join('');
  scheduleRefresh(pending);
  return {
    title: 'CAPE Claim Status',
    html: `${capeHead('claims')}
      <section class="card">
        <div class="card-head"><div><h2>Claim Status</h2><p class="muted small">Entry-level validation results. Select a Claim Number to view and download the Claim Details.</p></div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Claim Number</th><th>File Upload Job #</th><th>Submitted</th><th class="num">Entries</th><th class="num">Accepted</th><th class="num">Rejected</th><th>Claim Status</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="empty">No claims yet.</td></tr>'}</tbody>
        </table></div>
      </section>`,
  };
}

function back(href, label) { return `<a class="back" href="${href}">‹ ${label}</a>`; }

function viewJob(id) {
  const u = state.uploads.find(x => x.job === id);
  if (!u) return { title: 'Not found', html: `${back('#cape', 'File Uploads')}<div class="alert alert-error"><div class="alert-body">File Upload Job # ${h(id)} was not found.</div></div>` };
  const d = displayStatus(u, Date.now());
  scheduleRefresh(d.pendingMs);
  const done = d.fileStatus !== FILE_STATUS.processing;
  const rows = !done ? '' : u.errors.length
    ? u.errors.map(e => `<tr><td class="num">${e.row || '—'}</td><td class="mono">${h(e.entry || '—')}</td><td><span class="tag tag-red">Error</span></td><td>${h(e.message)}</td></tr>`).join('')
    : u.entries.map((entry, i) => `<tr><td class="num">${i + 2}</td><td class="mono">${h(entry)}</td><td><span class="tag tag-green">Passed</span></td><td>Passed file validation</td></tr>`).join('');
  return {
    title: `File Upload ${u.job}`,
    html: `${back('#cape', 'File Uploads')}
      ${pageHead(`File Upload Job # <span class="mono">${h(u.job)}</span>`, h(u.fileName))}
      <section class="card"><dl class="kv kv-4">
        <div><dt>File Upload Status</dt><dd>${statusTag(d.fileStatus)}</dd></div>
        <div><dt>Entries in file</dt><dd>${u.entryCount}</dd></div>
        <div><dt>Uploaded</dt><dd>${fmtDateTime(u.uploadedAt)}<br><span class="muted small">${h(u.uploadedBy)}</span></dd></div>
        <div><dt>Claim Number</dt><dd>${d.claimVisible ? `<a class="mono" href="#claim/${encodeURIComponent(u.claim)}">${h(u.claim)}</a>` : '—'}</dd></div>
      </dl></section>
      <section class="card">
        <div class="card-head"><div><h2>Validation Result File</h2><p class="muted small">${done ? (u.errors.length ? 'The CAPE Declaration was rejected. Correct the issues and submit a new CAPE Declaration.' : 'The CAPE Declaration passed file validation and proceeded to entry validation.') : 'File validation is in process.'}</p></div>
          ${done ? '<button type="button" class="btn btn-outline" data-action="download-validation">Download File</button>' : ''}</div>
        ${done ? `<div class="table-wrap"><table class="table"><thead><tr><th class="num">Row</th><th>Entry Number</th><th>Result</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="pad"><span class="spin dark" aria-hidden="true"></span> Validating…</p>'}
      </section>`,
    after() {
      document.querySelector('[data-action="download-validation"]')?.addEventListener('click', () => download(`ValidationResult_${u.job}.csv`, validationResultCsv(u)));
    },
  };
}

function claimResults(c) {
  if (c.results) return c.results;
  const u = state.uploads.find(x => x.job === c.job);
  return evaluateEntries(u?.entries || [], aceEntries);
}

function viewClaim(id) {
  const c = state.claims.find(x => x.claim === id);
  if (!c) return { title: 'Not found', html: `${back('#claims', 'Claim Status')}<div class="alert alert-error"><div class="alert-body">Claim Number ${h(id)} was not found.</div></div>` };
  const u = state.uploads.find(x => x.job === c.job);
  const d = u ? displayStatus(u, Date.now()) : { claimDone: true, pendingMs: 0 };
  scheduleRefresh(d.pendingMs);
  const results = claimResults(c);
  const t = claimTotals(results);
  const sample = !c.results;
  const status = d.claimDone ? c.status : CLAIM_STATUS.processing;
  return {
    title: `Claim ${c.claim}`,
    html: `${back('#claims', 'Claim Status')}
      ${pageHead(`Claim Number <span class="mono">${h(c.claim)}</span>`, `CAPE Declaration ${h(u?.fileName || '')} · File Upload Job # ${h(c.job)}`,
        d.claimDone ? '<button type="button" class="btn btn-outline" data-action="download-claim">Download Claim Details</button>' : '')}
      <section class="card"><dl class="kv kv-4">
        <div><dt>Claim Status</dt><dd>${statusTag(status)}</dd></div>
        <div><dt>Entries</dt><dd>${c.submitted} submitted${d.claimDone ? ` · <strong>${c.accepted} accepted</strong> · ${c.rejected} rejected` : ''}</dd></div>
        <div><dt>Importer of record</dt><dd>${h(account.organization)}<br><span class="mono small">${h(account.iorNumber)}</span></dd></div>
        <div><dt>Refund recipient</dt><dd>Importer of record · ACH •••• ${h(account.ach.last4)}</dd></div>
      </dl></section>
      ${!d.claimDone ? '<section class="card"><p class="pad"><span class="spin dark" aria-hidden="true"></span> Entry validation is in process. ACE is checking each entry summary.</p></section>' : `
      ${sample ? '' : `<section class="card totals-card">
        <div class="total"><span>IEEPA duty removed</span><strong>${money(t.dutyUsd)}</strong></div>
        <div class="total"><span>Estimated interest</span><strong>${money(t.interestUsd)}</strong></div>
        <div class="total total-main"><span>Estimated refund</span><strong>${money(t.refundUsd)}</strong></div>
        <p class="muted small totals-note">Estimates for accepted entries. Following CBP review, entries are liquidated or reliquidated; refunds are consolidated by recipient and liquidation date and paid by ACH. Interest is calculated at liquidation.</p>
      </section>`}
      <section class="card">
        <div class="card-head"><div><h2>Claim Details</h2>${sample ? '<p class="muted small">Showing sample entries from this declaration.</p>' : ''}</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Entry Number</th><th>Type</th><th>Liquidation Status</th><th>IEEPA HTS Chapter 99</th><th class="num">IEEPA Duty Removed</th><th>Result</th><th>Message</th></tr></thead>
          <tbody>${results.map(r => `<tr>
            <td class="mono nowrap">${h(r.entry)}</td><td>${h(r.type || '—')}</td><td class="nowrap">${h(r.liquidation || '—')}</td>
            <td class="mono small">${r.ch99.length ? r.ch99.map(h).join('<br>') : '—'}</td>
            <td class="num">${r.result === 'Accepted' ? money(r.ieepaDutyUsd) : '—'}</td>
            <td>${statusTag(r.result === 'Accepted' ? CLAIM_STATUS.accepted : CLAIM_STATUS.rejected)}</td>
            <td class="small">${h(r.message)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>`}`,
    after() {
      document.querySelector('[data-action="download-claim"]')?.addEventListener('click', () => download(`ClaimDetails_${c.claim}.csv`, claimDetailsCsv(c, results)));
    },
  };
}

// ---------- upload dialog ----------
function openUpload() {
  upload = { mode: 'paste', fileName: '', text: '', sizeBytes: 0, pasteName: '', pasteText: '', ack: false, phase: 'form', job: null };
  renderUpload();
  modal.showModal();
}

function uploadReady() {
  if (!upload.ack) return false;
  if (upload.mode === 'file') return !!upload.text || upload.sizeBytes > 0;
  return !!upload.pasteName.trim() && splitPasted(upload.pasteText).length > 0;
}

function pasteSummary() {
  const tokens = splitPasted(upload.pasteText);
  if (!tokens.length) return 'No entry numbers yet.';
  const bad = tokens.filter(t => !normalizeEntry(t));
  const name = upload.pasteName.trim();
  const nameNote = !name ? 'Enter a file name.' : !FILE_NAME_PATTERN.test(name.endsWith('.csv') ? name : `${name}.csv`) ? 'File name may use letters, numbers, spaces, dots, hyphens and underscores.' : `Saved as ${h(name.endsWith('.csv') ? name : `${name}.csv`)}.`;
  return `${tokens.length} entry number${tokens.length === 1 ? '' : 's'}${bad.length ? ` · <span class="err-text">${bad.length} not 11 characters long</span>` : ''} · ${nameNote}`;
}

function renderUpload() {
  if (upload.phase === 'done') {
    modal.innerHTML = `<div class="dialog">
      <h2 id="dialog-title">CAPE Upload</h2>
      <div class="alert alert-success"><div class="alert-body">Upload complete. <strong>File Upload Job # <span class="mono">${h(upload.job)}</span></strong> has been submitted for validation. Results will appear in the File Upload Status column.</div></div>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-action="close-dialog">Close</button></div>
    </div>`;
    return;
  }
  if (upload.phase === 'uploading') {
    modal.innerHTML = `<div class="dialog"><h2 id="dialog-title">CAPE Upload</h2><p class="pad"><span class="spin dark" aria-hidden="true"></span> Uploading ${h(upload.finalName)}…</p></div>`;
    return;
  }
  modal.innerHTML = `<div class="dialog">
    <h2 id="dialog-title">CAPE Upload</h2>
    <p class="muted">Upload a CAPE Declaration: a CSV file with one column headed <strong>Entry Number</strong> and up to ${MAX_ENTRIES.toLocaleString('en-US')} entry numbers starting on row 2. File must be smaller than 1 MB.
      <button type="button" class="link-btn" data-action="template">CAPE Upload Template</button></p>
    <div class="seg" role="tablist" aria-label="Upload method">
      <button type="button" role="tab" aria-selected="${upload.mode === 'paste'}" class="${upload.mode === 'paste' ? 'on' : ''}" data-mode="paste">Enter entry numbers</button>
      <button type="button" role="tab" aria-selected="${upload.mode === 'file'}" class="${upload.mode === 'file' ? 'on' : ''}" data-mode="file">Choose CSV file</button>
    </div>
    ${upload.mode === 'file' ? `
      <label class="field"><span>CAPE Declaration file (.csv)</span><input id="cape-file" type="file" accept=".csv,text/csv"></label>
      <p class="muted small" id="file-note">${upload.fileName ? `Selected: ${h(upload.fileName)} (${upload.sizeBytes.toLocaleString('en-US')} bytes)` : 'No file selected.'}</p>` : `
      <label class="field"><span>File name</span><input id="paste-name" placeholder="e.g. IM-IEEPA-batch-08.csv" value="${h(upload.pasteName)}" autocomplete="off"></label>
      <label class="field"><span>Entry numbers (one per line)</span><textarea id="paste-entries" rows="7" placeholder="LKS-2541187-3" spellcheck="false">${h(upload.pasteText)}</textarea></label>
      <p class="muted small" id="paste-note">${pasteSummary()}</p>
      <p class="muted small">The portal builds the CSV declaration (header <span class="mono">Entry Number</span>) from this list.</p>`}
    <label class="check"><input id="ack" type="checkbox" ${upload.ack ? 'checked' : ''}><span>I certify that I am the importer of record for the listed entries, or the customs broker that filed the entry summaries on the importer's behalf, and that this CAPE Declaration requests refunds of IEEPA duties only.</span></label>
    <div class="dialog-actions">
      <button type="button" class="btn btn-unstyled" data-action="close-dialog">Cancel</button>
      <button type="button" class="btn btn-primary" id="upload-file" data-action="upload-file" ${uploadReady() ? '' : 'disabled'}>Upload File</button>
    </div>
  </div>`;
  const sync = () => { modal.querySelector('#upload-file').disabled = !uploadReady(); const n = modal.querySelector('#paste-note'); if (n) n.innerHTML = pasteSummary(); };
  modal.querySelector('#ack').addEventListener('change', ev => { upload.ack = ev.target.checked; sync(); });
  modal.querySelector('#paste-name')?.addEventListener('input', ev => { upload.pasteName = ev.target.value; sync(); });
  modal.querySelector('#paste-entries')?.addEventListener('input', ev => { upload.pasteText = ev.target.value; sync(); });
  modal.querySelector('#cape-file')?.addEventListener('change', ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { Object.assign(upload, { fileName: file.name, sizeBytes: file.size, text: String(reader.result || '') }); modal.querySelector('#file-note').textContent = `Selected: ${file.name} (${file.size.toLocaleString('en-US')} bytes)`; sync(); };
    reader.readAsText(file.size < 2 * 1024 * 1024 ? file : file.slice(0, 2 * 1024 * 1024));
  });
}

function doUpload() {
  if (!uploadReady() || upload.phase !== 'form') return;
  let fileName, text, sizeBytes;
  if (upload.mode === 'file') ({ fileName, text, sizeBytes } = upload);
  else {
    const name = upload.pasteName.trim();
    fileName = name.toLowerCase().endsWith('.csv') ? name : `${name}.csv`;
    const tokens = splitPasted(upload.pasteText);
    text = buildCsv(tokens.map(t => normalizeEntry(t) || t));
    sizeBytes = new Blob([text]).size;
  }
  upload.phase = 'uploading';
  upload.finalName = fileName;
  renderUpload();
  setTimeout(() => {
    const result = submitDeclaration(state, { fileName, text, sizeBytes, uploadedBy: `${account.displayName} (${state.session.userId})`, now: new Date().toISOString(), account, aceEntries });
    if (!commit(result.state)) { modal.close(); return render(); }
    upload.phase = 'done';
    upload.job = result.upload.job;
    query = '';
    flash = { type: 'info', text: `File uploaded. File Upload Job # <strong class="mono">${h(result.upload.job)}</strong> (${h(fileName)}) is being validated.` };
    renderUpload();
    if (route().page !== 'cape') go('cape'); else render();
  }, 1200);
}

// ---------- events ----------
document.addEventListener('click', ev => {
  const target = ev.target.closest('[data-action],[data-mode]');
  if (!target) return;
  if (target.dataset.mode && upload) { upload.mode = target.dataset.mode; return renderUpload(); }
  switch (target.dataset.action) {
    case 'signout': commit({ ...state, session: null }); flash = { type: 'success', text: 'You have signed out.' }; go('signin'); break;
    case 'reset': if (confirm('Reset all demo data in this browser?')) { location.href = `${location.pathname}?reset=1`; } break;
    case 'upload': openUpload(); break;
    case 'close-dialog': modal.close(); break;
    case 'upload-file': doUpload(); break;
    case 'template': download(TEMPLATE_NAME, templateCsv()); break;
    case 'clear-search': query = ''; render(); break;
    default: break;
  }
});
modal.addEventListener('close', () => { upload = null; modal.innerHTML = ''; });
window.addEventListener('hashchange', render);
render();
