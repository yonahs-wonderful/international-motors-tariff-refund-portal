// Synthetic demonstration data. Names, entries and amounts are fictional.
export const REQUEST_YEAR = 2026;
export const FIRST_NEW_SEQUENCE = 4812;

export const account = {
  userId: 'im.trade.compliance',
  displayName: 'Owen Gallagher',
  organization: 'International Motors, LLC',
};

export const importerProfile = {
  iorName: 'International Motors, LLC',
  iorNumber: '36-4410987-00',
  contactName: 'Owen Gallagher',
  contactEmail: 'owen.gallagher@intl-motors.example',
};

export const filers = [
  { code: 'LKS', name: 'Lakeshore Customs Brokerage' },
  { code: 'GLT', name: 'Great Lakes Trade Services' },
];

export const documentTypes = ['Refund package', 'Entry summary', 'Commercial invoice', 'Other supporting document'];

export const STATUS = {
  ready: 'Ready for broker submission',
  submitted: 'Submitted by broker',
  approved: 'Refund approved',
};

const seededEntry = (entry, date, hts, description, duty) => ({ entry, date, hts, description, dutyUsd: duty });

export function seedState() {
  return {
    nextSequence: FIRST_NEW_SEQUENCE,
    session: null,
    requests: [
      {
        id: 'RFD-2026-004809',
        internalReference: 'CASE-O2C-TARIFF-0061',
        programme: 'IEEPA',
        iorName: 'International Motors, LLC',
        iorNumber: '36-4410987-00',
        filer: 'Great Lakes Trade Services',
        contactName: 'Owen Gallagher',
        contactEmail: 'owen.gallagher@intl-motors.example',
        entries: [
          seededEntry('GLT-7730412-5', '2025-04-17', '8708.99.8180', 'Chassis brackets', 41200),
          seededEntry('GLT-7730598-1', '2025-05-02', '8483.40.5010', 'Gear housings', 28650),
          seededEntry('GLT-7730844-0', '2025-05-29', '8409.99.9190', 'Cylinder head castings', 36110),
        ],
        interestUsd: 4870,
        interestConfirmed: true,
        attachments: [{ fileName: 'batch-6-refund-package.pdf', type: 'Refund package', note: '' }],
        status: STATUS.approved,
        createdAt: '2026-09-18T14:05:00.000Z',
        updatedAt: '2026-10-21T16:40:00.000Z',
        createdBy: 'im.trade.compliance',
      },
      {
        id: 'RFD-2026-004810',
        internalReference: 'CASE-O2C-TARIFF-0074',
        programme: 'IEEPA',
        iorName: 'International Motors, LLC',
        iorNumber: '36-4410987-00',
        filer: 'Great Lakes Trade Services',
        contactName: 'Owen Gallagher',
        contactEmail: 'owen.gallagher@intl-motors.example',
        entries: [
          seededEntry('GLT-7741106-2', '2025-08-06', '8544.42.9090', 'Wiring harness assemblies', 52400),
          seededEntry('GLT-7741320-7', '2025-08-21', '8512.20.2040', 'Lighting assemblies', 19880),
        ],
        interestUsd: 2310,
        interestConfirmed: true,
        attachments: [{ fileName: 'batch-7-refund-package.pdf', type: 'Refund package', note: '' }],
        status: STATUS.submitted,
        createdAt: '2026-10-07T13:22:00.000Z',
        updatedAt: '2026-10-09T15:10:00.000Z',
        createdBy: 'im.trade.compliance',
      },
      {
        id: 'RFD-2026-004811',
        internalReference: 'CASE-O2C-TARIFF-0081',
        programme: 'IEEPA',
        iorName: 'International Motors, LLC',
        iorNumber: '36-4410987-00',
        filer: 'Great Lakes Trade Services',
        contactName: 'Owen Gallagher',
        contactEmail: 'owen.gallagher@intl-motors.example',
        entries: [
          seededEntry('GLT-7752218-4', '2025-10-14', '8481.80.9050', 'Air brake valves', 23760),
        ],
        interestUsd: 690,
        interestConfirmed: true,
        attachments: [{ fileName: 'supplemental-entry-7752218.pdf', type: 'Entry summary', note: '' }],
        status: STATUS.submitted,
        createdAt: '2026-10-20T18:02:00.000Z',
        updatedAt: '2026-10-22T12:31:00.000Z',
        createdBy: 'im.trade.compliance',
      },
    ],
  };
}
