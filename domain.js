import { REQUEST_YEAR, filers } from './data.js';

export const clone = value => structuredClone(value);
export const ENTRY_PATTERN = /^[A-Z0-9]{3}-\d{7}-\d$/;
export const IOR_PATTERN = /^\d{2}-\d{7}-[A-Z0-9]{2}$/;
export const INTERNAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
export const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,119}\.(pdf|xlsx|xls|csv|docx|zip)$/i;
export const IEEPA_PERIOD = { start: '2025-02-01', end: '2026-02-28' };
export const MAX_ENTRIES = 99;

export const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(amount) || 0);
const toCents = value => Math.round(Number(value) * 100);
const fromCents = cents => cents / 100;

export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Accepts YYYY-MM-DD or MM/DD/YYYY. Returns YYYY-MM-DD, or '' when unreadable. */
export function normalizeDate(input) {
  const value = String(input ?? '').trim();
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = us ? `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` : value;
  return validDate(iso) ? iso : '';
}

export const normalizeEntryNumber = input => String(input ?? '').trim().toUpperCase();

/** Accepts 8421.39.4090 or 8421394090. Returns the dotted 10-digit form, or ''. */
export function normalizeHts(input) {
  const digits = String(input ?? '').trim().replace(/\./g, '');
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}` : '';
}

/** Accepts 98400, 98,400, $98,400.00. Returns a number with at most two decimals, or NaN. */
export function parseUsd(input) {
  if (typeof input === 'number') return Number.isFinite(input) && Math.abs(input * 100 - Math.round(input * 100)) < 1e-6 ? input : NaN;
  const value = String(input ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  return Number(value);
}

export function totals(request) {
  const entries = request?.entries || [];
  const dutyCents = entries.reduce((sum, entry) => sum + toCents(entry.dutyUsd || 0), 0);
  const interest = parseUsd(request?.interestUsd ?? 0);
  const interestCents = Number.isNaN(interest) ? 0 : toCents(interest);
  return { count: entries.length, dutyUsd: fromCents(dutyCents), interestUsd: fromCents(interestCents), refundUsd: fromCents(dutyCents + interestCents) };
}

export const formatRequestNumber = sequence => `RFD-${REQUEST_YEAR}-${String(sequence).padStart(6, '0')}`;

const sameEntry = (a, b) => normalizeEntryNumber(a) === normalizeEntryNumber(b);
const sameReference = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

/** Saved request (other than the one being edited) that already uses this internal reference. */
export function findByInternalReference(requests, reference, excludeId = null) {
  if (!String(reference || '').trim()) return undefined;
  return requests.find(request => request.id !== excludeId && sameReference(request.internalReference, reference));
}

/** Saved request (other than the one being edited) that already claims this entry. */
export function findEntryClaim(requests, entryNumber, excludeId = null) {
  return requests.find(request => request.id !== excludeId && request.entries.some(entry => sameEntry(entry.entry, entryNumber)));
}

export function searchRequests(requests, query) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return requests;
  return requests.filter(request => request.id.toUpperCase().includes(q) || String(request.internalReference || '').toUpperCase().includes(q));
}

/** Validates one entry from the Add entry form. Returns { entry, errors }. */
export function validateEntry(raw, draftEntries = [], requests = [], excludeId = null) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const entry = {
    entry: normalizeEntryNumber(raw.entry),
    date: normalizeDate(raw.date),
    hts: normalizeHts(raw.hts),
    description: String(raw.description ?? '').trim(),
    dutyUsd: parseUsd(raw.dutyUsd),
  };
  if (!entry.entry) add('entry', 'Entry number is required.');
  else if (!ENTRY_PATTERN.test(entry.entry)) add('entry', 'Entry number must use the format AAA-NNNNNNN-N, for example LKS-2541187-3.');
  else if (draftEntries.some(existing => sameEntry(existing.entry, entry.entry))) add('entry', `Entry ${entry.entry} is already listed on this request.`);
  else {
    const claim = findEntryClaim(requests, entry.entry, excludeId);
    if (claim) add('entry', `Entry ${entry.entry} is already claimed on refund request ${claim.id}.`);
  }
  if (!String(raw.date ?? '').trim()) add('date', 'Entry date is required.');
  else if (!entry.date) add('date', 'Entry date must be a valid date in the format YYYY-MM-DD.');
  else if (entry.date < IEEPA_PERIOD.start || entry.date > IEEPA_PERIOD.end) add('date', `Entry date must fall within the IEEPA duty period (${IEEPA_PERIOD.start} to ${IEEPA_PERIOD.end}).`);
  if (!String(raw.hts ?? '').trim()) add('hts', 'HTS number is required.');
  else if (!entry.hts) add('hts', 'HTS number must have 10 digits, for example 8421.39.4090.');
  if (!entry.description) add('description', 'Description is required.');
  else if (entry.description.length > 120) add('description', 'Description must be 120 characters or fewer.');
  if (String(raw.dutyUsd ?? '').trim() === '') add('dutyUsd', 'IEEPA duty paid is required.');
  else if (Number.isNaN(entry.dutyUsd) || entry.dutyUsd <= 0) add('dutyUsd', 'IEEPA duty paid must be a positive USD amount with no more than two decimals.');
  else if (entry.dutyUsd > 100000000) add('dutyUsd', 'IEEPA duty paid exceeds the supported amount for one entry.');
  if (draftEntries.length >= MAX_ENTRIES) add('entry', `A refund request can list at most ${MAX_ENTRIES} entries.`);
  return { entry, errors };
}

export function validateImporter(draft, requests = []) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!String(draft.internalReference || '').trim()) add('internalReference', 'Internal reference is required.');
  else if (!INTERNAL_REFERENCE_PATTERN.test(draft.internalReference.trim())) add('internalReference', 'Internal reference may contain letters, numbers, dots, colons, underscores and hyphens (up to 64 characters).');
  else {
    const existing = findByInternalReference(requests, draft.internalReference, draft.id);
    if (existing) add('internalReference', `Internal reference ${existing.internalReference} is already used by refund request ${existing.id} (${existing.status}).`);
  }
  if (!String(draft.iorName || '').trim()) add('iorName', 'Importer of record name is required.');
  if (!String(draft.iorNumber || '').trim()) add('iorNumber', 'Importer of record number is required.');
  else if (!IOR_PATTERN.test(draft.iorNumber.trim().toUpperCase())) add('iorNumber', 'Importer of record number must use the format NN-NNNNNNN-XX, for example 36-4410987-00.');
  if (!filers.some(filer => filer.name === draft.filer)) add('filer', 'Select the filer (customs broker) for these entries.');
  if (!String(draft.contactName || '').trim()) add('contactName', 'Contact name is required.');
  if (draft.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())) add('contactEmail', 'Enter a valid contact email address.');
  return errors;
}

export function validateEntries(draft) {
  return draft.entries.length ? [] : [{ field: 'entry', message: 'Add at least one entry before continuing.' }];
}

export function validateInterest(draft) {
  const errors = [];
  const raw = draft.interestUsd;
  const value = parseUsd(raw);
  if (raw === '' || raw === null || raw === undefined) errors.push({ field: 'interestUsd', message: 'Interest claimed is required. Enter 0 if no interest is claimed.' });
  else if (Number.isNaN(value) || value < 0) errors.push({ field: 'interestUsd', message: 'Interest claimed must be a USD amount of zero or more, with no more than two decimals.' });
  if (!draft.interestConfirmed) errors.push({ field: 'interestConfirmed', message: 'Confirm the interest amount and refund total.' });
  return errors;
}

export function validateAttachments(draft) {
  return draft.attachments.length ? [] : [{ field: 'fileName', message: 'Attach at least one supporting document.' }];
}

export function validateAttachment(raw, attachments = []) {
  const errors = [];
  const fileName = String(raw.fileName ?? '').trim();
  if (!fileName) errors.push({ field: 'fileName', message: 'File name is required.' });
  else if (!FILE_NAME_PATTERN.test(fileName)) errors.push({ field: 'fileName', message: 'File name must end in .pdf, .xlsx, .xls, .csv, .docx or .zip and use letters, numbers, spaces, dots, hyphens or underscores.' });
  else if (attachments.some(a => a.fileName.toLowerCase() === fileName.toLowerCase())) errors.push({ field: 'fileName', message: `${fileName} is already attached.` });
  if (String(raw.note ?? '').length > 500) errors.push({ field: 'note', message: 'Note must be 500 characters or fewer.' });
  return { attachment: { fileName, type: raw.type || 'Refund package', note: String(raw.note ?? '').trim() }, errors };
}

/** Full validation before saving the request. */
export function validateRequest(draft, requests = []) {
  const errors = [...validateImporter(draft, requests), ...validateEntries(draft), ...validateInterest(draft), ...validateAttachments(draft)];
  const seen = new Set();
  for (const entry of draft.entries) {
    const key = normalizeEntryNumber(entry.entry);
    if (seen.has(key)) errors.push({ field: 'entry', message: `Entry ${key} is listed more than once.` });
    seen.add(key);
    const recheck = validateEntry(entry, [], requests, draft.id);
    for (const error of recheck.errors) errors.push({ field: 'entry', message: `${key}: ${error.message}` });
  }
  return errors;
}
