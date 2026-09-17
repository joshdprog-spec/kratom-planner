# Weekly Kratom Planner

An independent, unofficial planner for people who buy from Super Speciosa. Plan a weekly strain rotation, track what you take, keep a stock estimate that burns down on its own, and get told what to order, when, and in which form and size to pay the least. Not affiliated with or endorsed by Super Speciosa. For adults 21+ where kratom is legal. Not medical advice.

## Using it

Open `Weekly Kratom Planner.html` in a browser. There is no build step and no server. Everything you enter stays in that browser's local storage; use **Settings → Backup** to move it to another device or keep a copy.

First run asks who is using it and which strains you keep. After that:

- **This week** is the daily screen: today's doses with check circles, the full rotation, saved weeks, the journal.
- **Stock & orders** is the monthly screen: what's on the shelf, what to order and when, subscription versus one-time, projected monthly cost.

## How it decides

- The rotation draws only from strains you switch on, by vein colour, with the reserve strain placed on a quota and never back to back.
- Stock is tracked per strain and per form (capsules, powder, tablets) in capsule-equivalents: 1 capsule = 500 mg, 1 g of powder = 2 capsules, a 300 mg tablet = 0.6. Standalone items (gummies, extracts, kava, shots, tea) are tracked in their own units on a daily rate.
- Each day that passes, the scheduled servings come off stock automatically, on-the-go doses from capsules or tablets and at-home doses from powder first. Orders you log are added on the arrival date.
- Buying picks price every size and form the store sells, one-time, at an upcoming sale, and on each Subscribe & Save cadence, and choose by your buying style: least cash over 3 months, least over a year, or best per serving.

## Supplier data

`refresh-supplier.js` builds `supplier-data.js` from the store's public catalog: every product classified into strains by form and standalone items, real subscription plan prices per variant, and the scheduled deal calendar from the home page. Run it with Node:

```
node refresh-supplier.js
```

A GitHub Actions workflow (`.github/workflows/refresh-supplier.yml`) runs it daily and commits the result, so a hosted copy stays current. Prices and stock are also fetched live by the app when it opens, since the store's product JSON allows cross-origin reads; the deal calendar can only come from the script.

## Files

- `Weekly Kratom Planner.html` — the app.
- `supplier-data.js` — generated catalog, plans, and deals.
- `refresh-supplier.js` — the generator for the above.
- `build-artifact.py` — strips the document wrappers for publishing as a claude.ai artifact.
- `refresh-and-push.ps1` — Windows equivalent of the daily refresh for a local checkout.
- `Super Speciosa Product Reference.md` — product notes and house rules the model grew out of.
- The two PDFs are fixed printable weeks.

## Hosting

The app is static and published with GitHub Pages at https://joshdprog-spec.github.io/kratom-planner/ (the root `index.html` just redirects to the app file). Any other static host works too; the Actions workflow keeps the deal data fresh either way.
