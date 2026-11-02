import { YEAR, FILE_STATUS, CLAIM_STATUS, PROCESSING_MS } from './data.js';

export const MAX_ENTRIES = 9999;
export const MAX_BYTES = 1024 * 1024;
export const HEADER = 'Entry Number';
export const TEMPLATE_NAME = 'ACEP_CapeEntryNumberUploadTemplate.csv';
export const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,95}\.csv$/i;

export const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(amount) || 0);
export const formatJob = n => `J-${YEAR}-${n}`;
export const formatClaim = n => `CAPE-${YEAR}-${String(n).padStart(6, '0')}`;

/** Entry numbers are 11 characters: 3-character filer code, 7-digit number, check digit. Dashes and spaces are ignored. */
export function normalizeEntry(raw) {
  const compact = String(raw ?? '').replace(/^﻿/, '').replace(/["'\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{3}\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 3)}-${compact.slice(3, 10)}-${compact.slice(10)}`;
}

/** Builds a CAPE Declaration CSV from a list of entry numbers. */
export const buildCsv = entries => [HEADER, ...entries].join('\r\n') + '\r\n';
export const templateCsv = () => `${HEADER}\r\n`;

/** Splits pasted text (new lines, commas, semicolons or spaces) into raw entry tokens. */
export const splitPasted = text => String(text ?? '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);

/**
 * File-level validation of a CAPE Declaration. Any error rejects the whole file ("Failed initial validation").
 * Returns { errors: [{row, entry, message}], entries: [normalized entry numbers in file order] }.
 */
export function parseDeclaration(text, fileName, sizeBytes = new Blob([text]).size) {
  const errors = [];
  const add = (row, entry, message) => errors.push({ row, entry, message });
  if (!FILE_NAME_PATTERN.test(String(fileName || ''))) add(0, '', 'File must be saved as CSV (Comma delimited) with a .csv extension.');
  if (sizeBytes >= MAX_BYTES) add(0, '', 'File must be smaller than 1 MB.');
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const header = (lines[0] || '').split(',')[0].replace(/"/g, '').trim();
  if (header.toLowerCase() !== HEADER.toLowerCase()) add(1, '', `Column header must be "${HEADER}".`);
  const entries = [];
  lines.slice(1).forEach((line, i) => {
    const row = i + 2;
    const cells = line.split(',').map(c => c.replace(/"/g, '').trim());
    if (!cells[0]) { if (line.trim()) add(row, line.trim(), 'Entry number is missing.'); return; }
    if (cells.slice(1).some(Boolean)) add(row, cells[0], 'File must contain only one column (Entry Number).');
    const entry = normalizeEntry(cells[0]);
    if (!entry) add(row, cells[0], 'Entry number is not 11 characters long (filer code, 7-digit number, check digit).');
    else entries.push(entry);
  });
  if (!entries.length && !errors.some(e => e.row > 1)) add(0, '', 'The CAPE Declaration does not contain a list of entry numbers.');
  if (entries.length > MAX_ENTRIES) add(0, '', `A CAPE Declaration is limited to ${MAX_ENTRIES.toLocaleString('en-US')} entries. Submit additional entries on another declaration.`);
  return { errors, entries };
}

/** Batch validation: the submitter must be the importer of record (or its filer) for every listed entry that exists. */
export function batchErrors(entries, account, aceEntries) {
  const byNumber = new Map(aceEntries.map(x => [x.entry, x]));
  return entries
    .map((entry, i) => ({ entry, row: i + 2, ace: byNumber.get(entry) }))
    .filter(x => x.ace && x.ace.ior !== account.iorNumber)
    .map(x => ({ row: x.row, entry: x.entry, message: 'Submitter is not the importer of record or the filer of record for this entry.' }));
}

/** Entry-level validation. Failed entries are rejected; the rest of the declaration is processed. */
export function evaluateEntries(entries, aceEntries, priorClaims = new Map()) {
  const byNumber = new Map(aceEntries.map(x => [x.entry, x]));
  const seen = new Set();
  return entries.map(entry => {
    const ace = byNumber.get(entry);
    const base = { entry, type: ace?.type ?? '', liquidation: ace?.liquidation ?? '', description: ace?.description ?? '', ch99: ace?.ch99 ?? [], ieepaDutyUsd: 0, interestUsd: 0 };
    const reject = message => ({ ...base, result: 'Rejected', message });
    if (seen.has(entry)) return reject('Entry summary number is duplicated in this declaration.');
    seen.add(entry);
    if (!ace) return reject('Entry summary not found in ACE.');
    if (priorClaims.has(entry)) return reject(`Entry summary number duplicated in prior declaration ${priorClaims.get(entry)}.`);
    if (/final/i.test(ace.liquidation)) return reject('Liquidation is final. Entry is not eligible for CAPE.');
    if (!ace.ch99.length) return reject('No dutiable IEEPA HTS Chapter 99 code declared on the entry summary.');
    return { ...base, result: 'Accepted', ieepaDutyUsd: ace.ieepaDutyUsd, interestUsd: ace.interestUsd, message: 'Updated successfully. IEEPA Chapter 99 lines removed; new entry summary version created.' };
  });
}

export function claimStatus(results) {
  const ok = results.filter(r => r.result === 'Accepted').length;
  if (!ok) return CLAIM_STATUS.rejected;
  return ok === results.length ? CLAIM_STATUS.accepted : CLAIM_STATUS.acceptedErrors;
}

const cents = v => Math.round(Number(v || 0) * 100);
export function claimTotals(results) {
  const accepted = results.filter(r => r.result === 'Accepted');
  const duty = accepted.reduce((s, r) => s + cents(r.ieepaDutyUsd), 0);
  const interest = accepted.reduce((s, r) => s + cents(r.interestUsd), 0);
  return { submitted: results.length, accepted: accepted.length, rejected: results.length - accepted.length, dutyUsd: duty / 100, interestUsd: interest / 100, refundUsd: (duty + interest) / 100 };
}

/** Entries already accepted on claims other than `exclude`, mapped to their claim number. */
export function priorClaims(state, aceEntries, exclude = null) {
  const map = new Map();
  for (const upload of state.uploads) {
    if (!upload.claim || upload.claim === exclude) continue;
    const claim = state.claims.find(c => c.claim === upload.claim);
    const results = claim?.results ?? evaluateEntries(upload.entries, aceEntries);
    for (const r of results) if (r.result === 'Accepted' && !map.has(r.entry)) map.set(r.entry, upload.claim);
  }
  return map;
}

/**
 * Runs the full CAPE pipeline for an upload and returns the new state (pure).
 * file validation → batch validation → claim number → entry validation.
 */
export function submitDeclaration(state, { fileName, text, sizeBytes, uploadedBy, now, account, aceEntries }) {
  const next = structuredClone(state);
  const jobId = formatJob(next.nextJob++);
  const parsed = parseDeclaration(text, fileName, sizeBytes);
  const upload = { job: jobId, fileName, uploadedBy, uploadedAt: now, entryCount: parsed.entries.length, fileStatus: FILE_STATUS.accepted, claim: null, entries: parsed.entries, errors: [] };
  if (parsed.errors.length) {
    upload.fileStatus = FILE_STATUS.failedInitial;
    upload.errors = parsed.errors;
  } else {
    const batch = batchErrors(parsed.entries, account, aceEntries);
    if (batch.length) {
      upload.fileStatus = FILE_STATUS.rejectedBatch;
      upload.errors = batch;
    } else {
      const results = evaluateEntries(parsed.entries, aceEntries, priorClaims(next, aceEntries));
      const t = claimTotals(results);
      upload.claim = formatClaim(next.nextClaim++);
      next.claims.unshift({ claim: upload.claim, job: jobId, submittedAt: now, submitted: t.submitted, accepted: t.accepted, rejected: t.rejected, status: claimStatus(results), results });
    }
  }
  next.uploads.unshift(upload);
  return { state: next, upload };
}

/** Simulated asynchronous processing: what the screen shows `nowMs` after upload. */
export function displayStatus(upload, nowMs, delay = PROCESSING_MS) {
  const age = nowMs - Date.parse(upload.uploadedAt);
  const fileDone = age >= delay;
  const claimDone = age >= delay * 2;
  return {
    fileStatus: fileDone ? upload.fileStatus : FILE_STATUS.processing,
    claimVisible: fileDone && !!upload.claim,
    claimDone,
    pendingMs: fileDone ? (upload.claim && !claimDone ? delay * 2 - age : 0) : delay - age,
  };
}

export function searchUploads(uploads, query) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return uploads;
  return uploads.filter(u => [u.job, u.fileName, u.claim || ''].some(v => v.toUpperCase().includes(q)));
}

const csvCell = v => /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function validationResultCsv(upload) {
  const rows = [['File Upload Job #', 'Row', 'Entry Number', 'Result', 'Message']];
  if (upload.errors.length) upload.errors.forEach(e => rows.push([upload.job, e.row || '', e.entry, 'Error', e.message]));
  else upload.entries.forEach((entry, i) => rows.push([upload.job, i + 2, entry, 'Passed', 'Passed file validation']));
  return csv(rows);
}

export function claimDetailsCsv(claim, results) {
  const rows = [['Claim Number', 'Entry Number', 'Entry Type', 'Liquidation Status', 'IEEPA HTS Chapter 99', 'IEEPA Duty Removed (USD)', 'Result', 'Message']];
  results.forEach(r => rows.push([claim.claim, r.entry, r.type, r.liquidation, r.ch99.join(' '), r.result === 'Accepted' ? r.ieepaDutyUsd.toFixed(2) : '0.00', r.result, r.message]));
  return csv(rows);
}
