import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeEntry, parseDeclaration, buildCsv, splitPasted, submitDeclaration, displayStatus, claimTotals,
  evaluateEntries, priorClaims, searchUploads, validationResultCsv, claimDetailsCsv, formatClaim, money,
} from './domain.js';
import { seedState, account, aceEntries, FILE_STATUS, CLAIM_STATUS, PROCESSING_MS } from './data.js';

const SIX = ['LKS-2541187-3', 'LKS-2541309-8', 'LKS-2541462-1', 'LKS-2541598-6', 'LKS-2541744-2', 'LKS-2541820-9'];
const NOW = '2026-11-04T15:30:00.000Z';
const submit = (state, entries, fileName = 'CASE-O2C-TARIFF-0098.csv', text = buildCsv(entries)) =>
  submitDeclaration(state, { fileName, text, uploadedBy: 'Owen Gallagher', now: NOW, account, aceEntries });

test('entry numbers normalize to the 11-character AAA-NNNNNNN-N form', () => {
  assert.equal(normalizeEntry('lks25411873'), 'LKS-2541187-3');
  assert.equal(normalizeEntry(' LKS-2541187-3 '), 'LKS-2541187-3');
  assert.equal(normalizeEntry('LKS-254118-3'), null);
  assert.equal(normalizeEntry('LKS-25411870-3'), null);
});

test('six demo entries: accepted claim CAPE-2026-004812 with $412,600 duty + $18,940 interest = $431,540', () => {
  const { state, upload } = submit(seedState(), SIX);
  assert.equal(upload.job, 'J-2026-118207');
  assert.equal(upload.fileStatus, FILE_STATUS.accepted);
  assert.equal(upload.claim, 'CAPE-2026-004812');
  const claim = state.claims[0];
  assert.equal(claim.status, CLAIM_STATUS.accepted);
  assert.deepEqual([claim.submitted, claim.accepted, claim.rejected], [6, 6, 0]);
  const t = claimTotals(claim.results);
  assert.deepEqual([t.dutyUsd, t.interestUsd, t.refundUsd], [412600, 18940, 431540]);
  assert.equal(money(t.refundUsd), '$431,540.00');
});

test('totals match the shared O2C fixture', () => {
  const fx = JSON.parse(readFileSync(new URL('../international-motors-o2c-recovery/shared/o2c-fixtures.json', import.meta.url), 'utf8')).tariff;
  assert.deepEqual(fx.entries.map(e => e.entry), SIX);
  const t = claimTotals(evaluateEntries(SIX, aceEntries));
  assert.deepEqual({ dutyUsd: t.dutyUsd, interestUsd: t.interestUsd, refundUsd: t.refundUsd }, fx.totals);
});

test('refiling the same entries is rejected entry-by-entry as duplicated in a prior declaration', () => {
  const first = submit(seedState(), SIX).state;
  const { state, upload } = submit(first, SIX, 'retry.csv');
  assert.equal(upload.fileStatus, FILE_STATUS.accepted);
  assert.equal(state.claims[0].status, CLAIM_STATUS.rejected);
  assert.match(state.claims[0].results[0].message, /duplicated in prior declaration CAPE-2026-004812/);
});

test('entry-level failures produce Accepted with Error(s)', () => {
  const { state } = submit(seedState(), ['LKS-2541187-3', 'GLT-7760031-6', 'XYZ-1111111-1', 'GLT-7709914-2', 'LKS-2541187-3', 'GLT-7730412-5']);
  const r = state.claims[0].results;
  assert.equal(state.claims[0].status, CLAIM_STATUS.acceptedErrors);
  assert.equal(r[0].result, 'Accepted');
  assert.match(r[1].message, /No dutiable IEEPA HTS Chapter 99/);
  assert.match(r[2].message, /not found in ACE/);
  assert.match(r[3].message, /Liquidation is final/);
  assert.match(r[4].message, /duplicated in this declaration/);
  assert.match(r[5].message, /prior declaration CAPE-2026-004771/);
});

test('file-level errors reject the whole declaration with no claim', () => {
  const bad = submit(seedState(), [], 'bad.csv', 'Entry\r\nLKS-2541187-3\r\n');
  assert.equal(bad.upload.fileStatus, FILE_STATUS.failedInitial);
  assert.equal(bad.upload.claim, null);
  assert.match(bad.upload.errors[0].message, /Column header must be "Entry Number"/);
  assert.match(parseDeclaration('Entry Number\r\nLKS-123\r\n', 'a.csv').errors[0].message, /not 11 characters long/);
  assert.match(parseDeclaration('Entry Number\r\n', 'a.csv').errors[0].message, /does not contain a list of entry numbers/);
  assert.match(parseDeclaration(buildCsv(SIX), 'a.xlsx').errors[0].message, /CSV/);
  assert.equal(parseDeclaration(buildCsv(SIX), 'a.csv', 1024 * 1024).errors.length, 1);
  assert.equal(parseDeclaration(buildCsv(Array(10000).fill('LKS-2541187-3')), 'big.csv').errors.at(-1).message.includes('9,999'), true);
});

test('entries of another importer fail batch validation', () => {
  const other = [...aceEntries, { entry: 'ZZZ-0000001-1', type: '01', date: '2025-06-01', liquidation: 'Unliquidated', description: 'x', ieepaDutyUsd: 1, interestUsd: 0, ch99: ['9903.01.25'], ior: '99-9999999-00' }];
  const { upload } = submitDeclaration(seedState(), { fileName: 'x.csv', text: buildCsv(['ZZZ-0000001-1']), uploadedBy: 'u', now: NOW, account, aceEntries: other });
  assert.equal(upload.fileStatus, FILE_STATUS.rejectedBatch);
  assert.equal(upload.claim, null);
});

test('processing is simulated in two stages', () => {
  const { upload } = submit(seedState(), SIX);
  const t0 = Date.parse(NOW);
  assert.equal(displayStatus(upload, t0 + 10).fileStatus, FILE_STATUS.processing);
  const mid = displayStatus(upload, t0 + PROCESSING_MS + 10);
  assert.equal(mid.fileStatus, FILE_STATUS.accepted);
  assert.equal(mid.claimVisible, true);
  assert.equal(mid.claimDone, false);
  assert.equal(displayStatus(upload, t0 + PROCESSING_MS * 2).claimDone, true);
});

test('search by file name finds the prior filing (agent duplicate check)', () => {
  const { state } = submit(seedState(), SIX);
  assert.deepEqual(searchUploads(state.uploads, 'case-o2c-tariff-0098').map(u => u.claim), ['CAPE-2026-004812']);
  assert.equal(searchUploads(seedState().uploads, 'CASE-O2C-TARIFF-0098').length, 0);
});

test('paste parsing, seeds, CSV downloads', () => {
  assert.deepEqual(splitPasted('LKS-2541187-3\nLKS-2541309-8, LKS-2541462-1'), SIX.slice(0, 3));
  assert.equal(priorClaims(seedState(), aceEntries).get('GLT-7741106-2'), 'CAPE-2026-004790');
  assert.equal(priorClaims(seedState(), aceEntries).has('GLT-7760031-6'), false);
  assert.equal(formatClaim(4812), 'CAPE-2026-004812');
  const { state, upload } = submit(seedState(), SIX);
  assert.match(validationResultCsv(upload), /^File Upload Job #,Row,Entry Number,Result,Message\r\nJ-2026-118207,2,LKS-2541187-3,Passed/);
  assert.match(claimDetailsCsv(state.claims[0], state.claims[0].results), /CAPE-2026-004812,LKS-2541187-3,01,Liquidated 2026-10-16,9903.01.24 9903.01.25,98400.00,Accepted/);
});
