# Trade Refund Filing Portal (Demo)

Live site: https://yonahs-wonderful.github.io/international-motors-tariff-refund-portal/

**Demo simulation — not affiliated with U.S. Customs and Border Protection.** This is a static, plain trade-portal mock for the International Motors "Order-to-Cash Recovery" demo. It uses no government seals or logos, does not claim to be CBP or any agency system, and never transmits anything. All names, entries and amounts are fictional and come from the shared demo fixture (`international-motors-o2c-recovery/shared/o2c-fixtures.json`, `tariff` section).

## Flow

1. **Sign in** — demo user `im.trade.compliance` is prefilled; any password (or none) is accepted. Click **Sign in**.
2. **Refund requests** (dashboard) — lists saved requests. Search with the **Request reference** box (request number `RFD-…` or internal reference) and **Search**.
3. **New IEEPA refund request**
   - **Step 1: Importer of record** — Internal reference, importer of record name and number (`NN-NNNNNNN-XX`), filer (customs broker) and contact. **Use account importer profile** fills International Motors, LLC / 36-4410987-00 / Owen Gallagher. A reused Internal reference is rejected here and names the existing request.
   - **Step 2: Entries** — add entries one at a time with the **Add entry** form (Entry number, Entry date, HTS number, Description, IEEPA duty paid (USD)). Entry numbers must match `AAA-NNNNNNN-N` (e.g. `LKS-2541187-3`); duplicates on the same request or already claimed on another saved request are rejected. Dates accept `YYYY-MM-DD` or `MM/DD/YYYY` and must fall within 2025-02-01 to 2026-02-28. The running count and duty total update after each entry.
   - **Step 3: Interest** — enter the interest total for all entries; the refund total (duty + interest) is computed live. Tick the confirmation checkbox.
   - **Step 4: Attachments** — type a file name (e.g. `refund-package-6-entries.pdf`), choose a document type, optional note, **Attach**. No file is uploaded.
   - **Step 5: Review** — all entries, duty total, interest total, refund total and the Internal reference. Click **Save — ready for broker submission**.
4. **Request detail** — shows the generated request number, status **Ready for broker submission**, totals, entries and attachments. The final **Submit to CBP — Broker submission required** button is permanently disabled: the licensed broker must transmit.

All totals and validation are computed in `domain.js` (integer cents) and covered by `domain.test.js`.

## Agent scenario

The `international-motors-tariff-refund-cu` computer-use back-office agent files the six Lakeshore Customs Brokerage entries that were missing from the primary broker's refund batches:

| Field | Value |
|---|---|
| Internal reference | `CASE-O2C-TARIFF-0098` |
| Importer of record | International Motors, LLC — `36-4410987-00` |
| Filer | Lakeshore Customs Brokerage |
| Contact | Owen Gallagher |
| Entries | `LKS-2541187-3`, `LKS-2541309-8`, `LKS-2541462-1`, `LKS-2541598-6`, `LKS-2541744-2`, `LKS-2541820-9` |
| IEEPA duty total | **$412,600.00** |
| Interest total | **$18,940.00** |
| Refund total | **$431,540.00** |
| Attachment | `refund-package-6-entries.pdf` |

Expected result after a reset: request **RFD-2026-004812**, status **Ready for broker submission**. The agent searches the dashboard by internal reference first and reports `already_processed` if a matching request exists; it never attempts the final submission.

## Reset

- Open `https://yonahs-wonderful.github.io/international-motors-tariff-refund-portal/?reset=1`, or
- **Preferences → Reset demo data** (header or footer).

Reset restores the three seeded requests (RFD-2026-004809 to 004811), signs out, and makes the next new request RFD-2026-004812. Hash routes (`#dashboard`, `#new/entries`, `#request/RFD-2026-004812`) work on GitHub Pages.

## Development

Node.js 18+ and Python 3; no dependencies or build step.

```sh
npm start      # http://127.0.0.1:4179/
npm run check
npm test
```

GitHub Pages publishes the repository root from `main`.

## Persistence and limits

Saved requests live in `localStorage` for one browser profile and origin; the in-progress request lives in `sessionStorage` for the tab. There is no shared database: a fresh agent browser will not see a request saved in another browser, so the duplicate check by Internal reference only works within the same browser profile. Callers must deduplicate webhook deliveries across independent runs.
