# Trade Data Portal (Demo) — CAPE refund declarations

Live site: https://yonahs-wonderful.github.io/international-motors-tariff-refund-portal/

**Demo simulation — not affiliated with U.S. Customs and Border Protection.** A static mock for the International Motors "Order-to-Cash Recovery" demo. It uses no government seals, logos or names for itself, and never transmits anything. Entries, amounts and accounts are fictional (shared fixture `international-motors-o2c-recovery/shared/o2c-fixtures.json`, `tariff`).

The workflow follows the publicly documented CAPE process (CBP *CAPE Phase 1 Trade User Information Notice*, April 2026; CSMS #68315804 and #68340863):

- A **CAPE Declaration** is a CSV with one column headed `Entry Number`, entries from row 2, up to 9,999 entries, under 1 MB. No amounts and no supporting documents.
- Filed by the importer of record or the broker that filed the entries, in the **CAPE** tab (Importer, Organizational Broker and Filer sub-accounts) → **File Uploads** → **Upload**, after ticking the acknowledgement.
- File validation (header, format, 11-character entry numbers, submitter is the IOR) → **File Upload Status**: `Accepted`, `Failed initial validation` or `Rejected by batch validation`. Job details offer the **Validation Result File**.
- Entry validation (exists in ACE, has a dutiable IEEPA Chapter 99 line, not duplicated in this or a prior declaration, liquidation not final) → **Claim Status**: `Accepted`, `Accepted with Error(s)` or `Rejected`. The **Claim Number** opens **Claim Details**.
- Refunds with interest are consolidated by recipient and liquidation date and paid by ACH (ACH Refunds tab shows the refund account on file).

Demo simplifications: processing is simulated (≈3.5 s per stage); the upload dialog also offers **Enter entry numbers**, which builds the CSV in the browser (the computer-use agent uses this to avoid a native file picker); Claim Details shows estimated duty removed and interest per entry.

## Agent scenario

The `international-motors-tariff-refund-cu` agent files the six Lakeshore entries missing from the refund batches, after analyst and controller approval in the O2C app.

| Field | Value |
|---|---|
| Sign-in | `im.trade.compliance` (any password) — Importer account, International Motors, LLC `36-4410987-00` |
| File name | `CASE-O2C-TARIFF-0098.csv` (used for the duplicate check) |
| Entries | `LKS-2541187-3`, `LKS-2541309-8`, `LKS-2541462-1`, `LKS-2541598-6`, `LKS-2541744-2`, `LKS-2541820-9` |
| Expected after reset | Job `J-2026-118207`, File Upload Status `Accepted`, Claim `CAPE-2026-004812`, Claim Status `Accepted`, 6/6 accepted |
| Totals on Claim Details | IEEPA duty removed **$412,600.00**, estimated interest **$18,940.00**, estimated refund **$431,540.00** |

Refiling the same entries is rejected by CAPE itself ("duplicated in prior declaration CAPE-2026-004812").

## Reset

Open `…/?reset=1` or use **Reset demo data** in the footer. Seeds four earlier uploads (claims CAPE-2026-004771, 004790, 004797; one failed initial validation).

## Development

```sh
npm start      # http://127.0.0.1:4179/
npm run check
npm test
```

GitHub Pages publishes the repository root from `main`. Data lives in `localStorage` for one browser profile.
