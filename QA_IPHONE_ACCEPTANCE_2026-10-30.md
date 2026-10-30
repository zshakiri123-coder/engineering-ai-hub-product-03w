# Product 03W — Physical iPhone Safari acceptance checklist (2026-10-30)

**Release status: HOLD until validated on the real iPhone and authentic engineering evidence exists.**

## Verified without user intervention
- [x] GitHub Node 22 core engine and QA release-gate tests succeeded, 39 original QA-branch scenarios.
- [x] Chromium navigation, data import/export, persistence, QTO editing, attached image persistence, generated PDF tests succeeded.
- [x] Touch-enabled WebKit emulation passed navigation of 10 languages × 12 panels, QTO editing, photo and storage checks.
- [ ] Newly added localized 10-language PDF generation and independent localized navigation label assertions: check current CI conclusions before marking success.

## Requires the user's real iPhone (no fabricated evidence)
1. Confirm the production Safari app opens with expected version, navigation, and no fatal visual layout or keyboard bugs.
2. On an isolated test project, edit a QTO item, save, reload and verify persistence. Do not overwrite real user data.
3. Attach a real photo using Safari's picker/camera, save, reload, verify attachment persists.
4. Export JSON to Files, import into an isolated test project and verify its records (make a backup first).
5. Check iOS Share → Print/Save PDF and visually inspect page breaks, text clipping, and 10-language script legibility.
6. Visually inspect representative inputs/headings from all 10 languages, especially Arabic/Persian RTL, on the physical device.
7. Check that QA-001 OPEN and unverified SSOT reference such as TEST-ONLY-SSOT-001 leave CHK-010/015 HOLD.

## Actual engineering approval is a separate operation
- Real site inspection, signed QA/QC record, authentic evidence/reference, qualified inspector and independent SSOT review are needed to clear genuine engineering HOLD.
- Software field completeness and test-only placeholder identifiers are not evidence of engineering verification.
- A physical iPhone software test may PASS while engineering QA/QC and SSOT remain HOLD.

**Guardrails:** QA branch only, do not merge changes into production without review, do not auto-approve SSOT, and never alter the user's locally stored project or claim physical acceptance from WebKit emulation.
