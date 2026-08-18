# HireLane pitch deck — real-screenshot pipeline

Generates `HireLane-Pitch.pptx` (in the repo root) with **real** screenshots of
the running app plus a step-by-step, role-by-role walkthrough. Super-admin is
intentionally excluded.

## One-time setup

```bash
npx playwright install chromium
```

## Generate the deck

```bash
# 1. Start the app (in one terminal), on dev data:
npm run dev

# 2. In another terminal, capture real screenshots as each seed role:
npm run pitch:capture       # -> pitch/shots/*.png

# 3. Build the deck from those screenshots + the walkthroughs:
npm run pitch:deck          # -> HireLane-Pitch.pptx (repo root)
```

Then commit the deck to stagging:

```bash
git add HireLane-Pitch.pptx && git commit -m "docs: pitch deck" && git push origin stagging
```

## Notes

- Uses the demo seed accounts (`hr@`, `recruiter@`, `lead@`, `manager@` `hirelane.app`,
  password `Hirelane-Demo-2026`). Seed them first with `npm run db:seed-demo` /
  `npm run db:seed-team` if they don't exist.
- If an account has 2FA enabled, that role is skipped (capture needs a non-2FA
  account). Use accounts without 2FA for the capture pass.
- Override the target/password with `PITCH_BASE_URL` and `PITCH_PASSWORD`.
- Candidate-portal screens are token-based; capture them manually and drop them
  into `pitch/shots/` as `candidate--apply.png` / `candidate--portal.png` if you
  want them embedded (the deck falls back to a labelled placeholder otherwise).
- `pitch/shots/` is git-ignored; only the built `.pptx` is committed.
