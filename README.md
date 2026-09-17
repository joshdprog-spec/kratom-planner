# Weekly Kratom Planner

A single-file app for planning a weekly Super Speciosa capsule rotation, tracking what you took, and keeping an eye on supply and supplier deals.

- **Weekly Kratom Planner.html** is the app. Open it in a browser. No build step, no server.
- **refresh-supplier.js** pulls the supplier's deal calendar and current prices into `supplier-data.js`, which the app reads. Run it with Node whenever you want fresh deals:

  ```
  node refresh-supplier.js
  ```

  Prices and stock are also fetched live by the app itself when it opens. The deal calendar can only be read by the script, because it lives in the store's home page, which browsers can't fetch cross-origin.

- **refresh-and-push.ps1** runs the refresh, commits and pushes the data file if it changed, and shows a Windows notification listing upcoming deals. Register it as a weekly task with:

  ```
  schtasks /Create /F /SC WEEKLY /D MON /ST 09:00 /TN "Kratom Planner deal refresh" /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"C:\Users\zolem\Kratom Planner\refresh-and-push.ps1\""
  ```

- **Phone access.** The app is also published as a private claude.ai artifact at https://claude.ai/artifact/LvvF6aLDNcZexcms4ZgwEy. There it keeps profiles, inventory, check-offs and journal in shared storage, so every device sees the same state. Live price fetching is not possible inside claude.ai, so that copy shows prices and deals from `supplier-data.js` as of its last publish. To republish after changes:

  ```
  python build-artifact.py artifact.html
  ```

  then publish `artifact.html` with `supplier-data.js` as a supporting file, to the same artifact URL.

- **Super Speciosa Product Reference.md** is the product and house-rules reference the app is built from.
- The two printable PDFs are fixed weekly sheets.

Data (profiles, journal, inventory, cached prices) lives in the browser's local storage.
