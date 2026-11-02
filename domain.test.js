import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  totals, parseUsd, normalizeDate, normalizeHts, validateEntry, validateImporter, validateInterest,
  validateAttachment, validateRequest, findByInternalReference, searchRequests, formatRequestNumber, money,
} from './domain.js';
import { seedState, FIRST_NEW_SEQUENCE, importerProfile } from './data.js';

// The six demo entries mirror the shared O2C fixture's tariff section.
const ENTRIES = [
  { entry: 'LKS-2541187-3', date: '2025-12-04', hts: '8421.39.4090', description: 'SCR catalyst assemblies', dutyUsd: 98400 },
  { entry: 'LKS-2541309-8', date: '2025-12-18', hts: '9026.80.4000', description: 'NOx sensor modules', dutyUsd: 61250 },
  { entry: 'LKS-2541462-1', date: '2026-01-08', hts: '8421.39.8015', description: 'Diesel particulate filters', dutyUsd: 74900 },
  { entry: 'LKS-2541598-6', date: '2026-01-22', hts: '8413.81.0040', description: 'DEF dosing modules', dutyUsd: 52300 },
  { entry: 'LKS-2541744-2', date: '2026-02-05', hts: '8708.92.5000', description: 'Aftertreatment exhaust assemblies', dutyUsd: 81150 },
  { entry: 'LKS-2541820-9', date: '2026-02-12', hts: '8716.90.5060', description: 'DEF tank header assemblies', dutyUsd: 44600 },
];

const demoDraft = () => ({
  id: null, internalReference: 'CASE-O2C-TARIFF-0098', programme: 'IEEPA',
  iorName: importerProfile.iorName, iorNumber: importerProfile.iorNumber, filer: 'Lakeshore Customs Brokerage',
  contactName: 'Owen Gallagher', contactEmail: '', entries: structuredClone(ENTRIES),
  interestUsd: '18940', interestConfirmed: true, attachments: [{ fileName: 'refund-package-6-entries.pdf', type: 'Refund package', note: '' }],
});

test('demo request totals match the shared fixture: $412,600 duty + $18,940 interest = $431,540', () => {
  const t = totals(demoDraft());
  assert.deepEqual(t, { count: 6, dutyUsd: 412600, interestUsd: 18940, refundUsd: 431540 });
  assert.equal(money(t.refundUsd), '$431,540.00');
});

test('shared fixture tariff totals agree with the portal computation', () => {
  const fixturePath = new URL('../international-motors-o2c-recovery/shared/o2c-fixtures.json', import.meta.url);
  let fixture;
  try { fixture = JSON.parse(readFileSync(fixturePath, 'utf8')); } catch { return; } // fixture lives in a sibling repo; skip when absent
  const { entries, totals: expected } = fixture.tariff;
  const t = totals({ entries: entries.map(e => ({ dutyUsd: e.ieepaDutyUsd })), interestUsd: entries.reduce((s, e) => s + e.interestUsd, 0) });
  assert.equal(t.dutyUsd, expected.dutyUsd);
  assert.equal(t.interestUsd, expected.interestUsd);
  assert.equal(t.refundUsd, expected.refundUsd);
});

test('running total grows as entries are added one at a time and avoids float drift', () => {
  const draft = { entries: [], interestUsd: '' };
  const seen = [];
  for (const e of ENTRIES) {
    const { entry, errors } = validateEntry(e, draft.entries, []);
    assert.deepEqual(errors, []);
    draft.entries.push(entry);
    seen.push(totals(draft).dutyUsd);
  }
  assert.deepEqual(seen, [98400, 159650, 234550, 286850, 368000, 412600]);
  assert.equal(totals({ entries: [{ dutyUsd: 0.1 }, { dutyUsd: 0.2 }], interestUsd: '0.05' }).refundUsd, 0.35);
});

test('entry numbers must match AAA-NNNNNNN-N', () => {
  for (const bad of ['', 'LKS2541187-3', 'LKS-254118-3', 'LKS-2541187-33', 'LK-2541187-3', 'LKS-2541187']) {
    assert.ok(validateEntry({ ...ENTRIES[0], entry: bad }).errors.some(e => e.field === 'entry'), bad);
  }
  const { entry, errors } = validateEntry({ ...ENTRIES[0], entry: ' lks-2541187-3 ' });
  assert.deepEqual(errors, []);
  assert.equal(entry.entry, 'LKS-2541187-3');
});

test('duplicate entries are rejected on the same request and across saved requests', () => {
  const dup = validateEntry(ENTRIES[0], [ENTRIES[0]], []);
  assert.match(dup.errors[0].message, /already listed on this request/);
  const saved = [{ id: 'RFD-2026-004812', entries: [ENTRIES[1]] }];
  const claimed = validateEntry({ ...ENTRIES[1], entry: 'lks-2541309-8' }, [], saved);
  assert.match(claimed.errors[0].message, /already claimed on refund request RFD-2026-004812/);
  assert.deepEqual(validateEntry(ENTRIES[1], [], saved, 'RFD-2026-004812').errors, []);
});

test('entry dates, HTS numbers and duty amounts are validated and normalized', () => {
  assert.equal(normalizeDate('12/04/2025'), '2025-12-04');
  assert.equal(normalizeDate('2025-02-30'), '');
  assert.equal(normalizeHts('8421394090'), '8421.39.4090');
  assert.equal(normalizeHts('8421.39'), '');
  assert.equal(parseUsd('$98,400.00'), 98400);
  assert.ok(Number.isNaN(parseUsd('98.400,00')));
  assert.ok(Number.isNaN(parseUsd('1.234')));
  const fields = raw => validateEntry({ ...ENTRIES[0], ...raw }).errors.map(e => e.field);
  assert.ok(fields({ date: '2024-12-31' }).includes('date'));
  assert.ok(fields({ date: '2026-03-01' }).includes('date'));
  assert.ok(fields({ date: 'tomorrow' }).includes('date'));
  assert.ok(fields({ hts: '8421.39.40' }).includes('hts'));
  assert.ok(fields({ description: ' ' }).includes('description'));
  for (const duty of ['', '0', '-5', 'abc', '10.555']) assert.ok(fields({ dutyUsd: duty }).includes('dutyUsd'), duty);
});

test('importer step requires internal reference, IOR, filer and contact, and rejects a reused internal reference', () => {
  assert.deepEqual(validateImporter(demoDraft(), seedState().requests), []);
  const fields = validateImporter({ ...demoDraft(), internalReference: '', iorName: '', iorNumber: '364410987', filer: 'Other', contactName: '' }).map(e => e.field);
  for (const f of ['internalReference', 'iorName', 'iorNumber', 'filer', 'contactName']) assert.ok(fields.includes(f), f);
  const saved = [{ id: 'RFD-2026-004812', internalReference: 'CASE-O2C-TARIFF-0098', status: 'Ready for broker submission', entries: [] }];
  assert.match(validateImporter({ ...demoDraft(), internalReference: 'case-o2c-tariff-0098' }, saved)[0].message, /already used by refund request RFD-2026-004812/);
});

test('interest must be zero or more and confirmed', () => {
  assert.deepEqual(validateInterest({ interestUsd: '18940', interestConfirmed: true }), []);
  assert.deepEqual(validateInterest({ interestUsd: '0', interestConfirmed: true }), []);
  assert.equal(validateInterest({ interestUsd: '', interestConfirmed: true }).length, 1);
  assert.equal(validateInterest({ interestUsd: '-1', interestConfirmed: true }).length, 1);
  assert.equal(validateInterest({ interestUsd: '18940', interestConfirmed: false })[0].field, 'interestConfirmed');
});

test('attachments accept typed document file names and reject duplicates', () => {
  assert.deepEqual(validateAttachment({ fileName: 'refund-package-6-entries.pdf' }).errors, []);
  assert.equal(validateAttachment({ fileName: 'refund-package' }).errors.length, 1);
  assert.equal(validateAttachment({ fileName: 'REFUND-PACKAGE-6-ENTRIES.PDF' }, [{ fileName: 'refund-package-6-entries.pdf' }]).errors.length, 1);
});

test('the full demo request validates; missing parts are reported', () => {
  assert.deepEqual(validateRequest(demoDraft(), seedState().requests), []);
  const fields = validateRequest({ ...demoDraft(), entries: [], attachments: [], interestConfirmed: false }, []).map(e => e.field);
  for (const f of ['entry', 'fileName', 'interestConfirmed']) assert.ok(fields.includes(f), f);
  const twice = demoDraft(); twice.entries.push(structuredClone(ENTRIES[0]));
  assert.ok(validateRequest(twice, []).some(e => /listed more than once/.test(e.message)));
});

test('request numbers are deterministic after reset and lookup works by request number or internal reference', () => {
  const state = seedState();
  assert.equal(formatRequestNumber(FIRST_NEW_SEQUENCE), 'RFD-2026-004812');
  assert.equal(formatRequestNumber(state.nextSequence), 'RFD-2026-004812');
  assert.ok(state.requests.every(r => r.id < 'RFD-2026-004812'));
  assert.equal(findByInternalReference(state.requests, 'CASE-O2C-TARIFF-0098'), undefined);
  const saved = [...state.requests, { id: 'RFD-2026-004812', internalReference: 'CASE-O2C-TARIFF-0098', entries: [] }];
  assert.equal(findByInternalReference(saved, 'case-o2c-tariff-0098').id, 'RFD-2026-004812');
  assert.equal(findByInternalReference(saved, 'CASE-O2C-TARIFF-0098', 'RFD-2026-004812'), undefined);
  assert.deepEqual(searchRequests(saved, 'CASE-O2C-TARIFF-0098').map(r => r.id), ['RFD-2026-004812']);
  assert.deepEqual(searchRequests(saved, 'rfd-2026-004810').map(r => r.id), ['RFD-2026-004810']);
  assert.equal(searchRequests(saved, '').length, 4);
});

test('seeded requests are internally valid and do not claim the demo entries', () => {
  const state = seedState();
  for (const r of state.requests) {
    for (const e of r.entries) assert.deepEqual(validateEntry(e, [], []).errors, [], e.entry);
    for (const e of ENTRIES) assert.equal(r.entries.some(x => x.entry === e.entry), false);
  }
});
