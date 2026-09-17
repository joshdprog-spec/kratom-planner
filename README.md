# Weekly Kratom Planner

A single-file app for planning a weekly Super Speciosa capsule rotation, tracking what you took, and keeping an eye on supply and supplier deals.

- **Weekly Kratom Planner.html** is the app. Open it in a browser. No build step, no server.
- **refresh-supplier.js** pulls the supplier's deal calendar and current prices into `supplier-data.js`, which the app reads. Run it with Node whenever you want fresh deals:

  ```
  node refresh-supplier.js
  ```

  Prices and stock are also fetched live by the app itself when it opens. The deal calendar can only be read by the script, because it lives in the store's home page, which browsers can't fetch cross-origin.

- **Super Speciosa Product Reference.md** is the product and house-rules reference the app is built from.
- The two printable PDFs are fixed weekly sheets.

Data (profiles, journal, inventory, cached prices) lives in the browser's local storage.
