// Synthetic demonstration data. Names, entries and amounts are fictional.
// Process modelled on the publicly documented CAPE workflow (CBP Trade Information Notice, April 2026).
export const YEAR = 2026;
export const FIRST_JOB = 118207;
export const FIRST_CLAIM = 4812;
export const PROCESSING_MS = 3500; // simulated ACE processing time per stage

export const account = {
  userId: 'im.trade.compliance',
  displayName: 'Owen Gallagher',
  title: 'Trade Compliance Manager',
  organization: 'International Motors, LLC',
  accountType: 'Importer',
  iorNumber: '36-4410987-00',
  ach: { bank: 'Fifth Lakes Bank, N.A.', last4: '4471', status: 'Active — refunds', updated: '2026-04-14' },
};

export const FILE_STATUS = {
  processing: 'In process',
  accepted: 'Accepted',
  failedInitial: 'Failed initial validation',
  rejectedBatch: 'Rejected by batch validation',
};
export const CLAIM_STATUS = {
  processing: 'In process',
  accepted: 'Accepted',
  acceptedErrors: 'Accepted with Error(s)',
  rejected: 'Rejected',
};

// Simulated ACE entry summary records for this importer of record.
// ch99: dutiable IEEPA Chapter 99 lines declared on the entry summary.
const e = (entry, type, date, liq, description, ieepaDutyUsd, interestUsd, ch99, ior = '36-4410987-00') =>
  ({ entry, type, date, liquidation: liq, description, ieepaDutyUsd, interestUsd, ch99, ior });

export const aceEntries = [
  // The six Lakeshore entries missing from the refund batches.
  e('LKS-2541187-3', '01', '2025-12-04', 'Liquidated 2026-10-16', 'SCR catalyst assemblies', 98400, 4610, ['9903.01.24', '9903.01.25']),
  e('LKS-2541309-8', '01', '2025-12-18', 'Liquidated 2026-10-30', 'NOx sensor modules', 61250, 2870, ['9903.01.24', '9903.01.25']),
  e('LKS-2541462-1', '01', '2026-01-08', 'Unliquidated', 'Diesel particulate filters', 74900, 3420, ['9903.01.24', '9903.01.25']),
  e('LKS-2541598-6', '01', '2026-01-22', 'Unliquidated', 'DEF dosing modules', 52300, 2360, ['9903.01.24', '9903.01.25']),
  e('LKS-2541744-2', '01', '2026-02-05', 'Unliquidated', 'Aftertreatment exhaust assemblies', 81150, 3690, ['9903.01.24', '9903.01.25']),
  e('LKS-2541820-9', '01', '2026-02-12', 'Unliquidated', 'DEF tank header assemblies', 44600, 1990, ['9903.01.24', '9903.01.25']),
  // Previously claimed through Great Lakes Trade Services batches.
  e('GLT-7730412-5', '01', '2025-04-17', 'Reliquidated 2026-07-02', 'Chassis brackets', 41200, 1980, ['9903.01.25']),
  e('GLT-7730598-1', '01', '2025-05-02', 'Reliquidated 2026-07-02', 'Gear housings', 28650, 1370, ['9903.01.25']),
  e('GLT-7741106-2', '01', '2025-08-06', 'Unliquidated', 'Wiring harness assemblies', 52400, 2110, ['9903.01.24', '9903.01.25']),
  e('GLT-7741320-7', '01', '2025-08-21', 'Unliquidated', 'Lighting assemblies', 19880, 790, ['9903.01.25']),
  e('GLT-7752218-4', '01', '2025-10-14', 'Unliquidated', 'Air brake valves', 23760, 690, ['9903.01.25']),
  // Entries that fail entry-level validation.
  e('GLT-7760031-6', '01', '2025-11-03', 'Unliquidated', 'Seat frames (USMCA, no IEEPA lines)', 0, 0, []),
  e('GLT-7709914-2', '01', '2024-11-20', 'Liquidation final 2025-10-03', 'Mirror assemblies', 0, 0, []),
];

const job = (n, fileName, uploadedBy, uploadedAt, entryCount, fileStatus, claim, entries = [], errors = []) =>
  ({ job: `J-${YEAR}-${n}`, fileName, uploadedBy, uploadedAt, entryCount, fileStatus, claim, entries, errors });

export function seedState() {
  return {
    nextJob: FIRST_JOB,
    nextClaim: FIRST_CLAIM,
    session: null,
    uploads: [
      job(118163, 'IM-IEEPA-batch-05.csv', 'Great Lakes Trade Services (filer GLT)', '2026-09-18T14:05:00.000Z', 41, FILE_STATUS.accepted, `CAPE-${YEAR}-004771`, ['GLT-7730412-5', 'GLT-7730598-1']),
      job(118171, 'IM-IEEPA-batch-06.csv', 'Great Lakes Trade Services (filer GLT)', '2026-10-07T13:22:00.000Z', 36, FILE_STATUS.accepted, `CAPE-${YEAR}-004790`, ['GLT-7741106-2', 'GLT-7741320-7']),
      job(118188, 'IM-IEEPA-batch-07 (1).csv', 'Great Lakes Trade Services (filer GLT)', '2026-10-09T15:02:00.000Z', 0, FILE_STATUS.failedInitial, null, [], [{ row: 1, entry: '', message: 'Column header must be "Entry Number".' }]),
      job(118189, 'IM-IEEPA-batch-07.csv', 'Great Lakes Trade Services (filer GLT)', '2026-10-09T15:10:00.000Z', 29, FILE_STATUS.accepted, `CAPE-${YEAR}-004797`, ['GLT-7752218-4', 'GLT-7760031-6']),
    ],
    claims: [
      { claim: `CAPE-${YEAR}-004771`, job: `J-${YEAR}-118163`, submittedAt: '2026-09-18T14:05:00.000Z', submitted: 41, accepted: 41, rejected: 0, status: CLAIM_STATUS.accepted, results: null },
      { claim: `CAPE-${YEAR}-004790`, job: `J-${YEAR}-118171`, submittedAt: '2026-10-07T13:22:00.000Z', submitted: 36, accepted: 36, rejected: 0, status: CLAIM_STATUS.accepted, results: null },
      { claim: `CAPE-${YEAR}-004797`, job: `J-${YEAR}-118189`, submittedAt: '2026-10-09T15:10:00.000Z', submitted: 29, accepted: 28, rejected: 1, status: CLAIM_STATUS.acceptedErrors, results: null },
    ],
  };
}
