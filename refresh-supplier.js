// Pulls the Super Speciosa deal calendar and current prices into supplier-data.js,
// which the planner loads. Run it whenever you want fresh deals:
//
//   node refresh-supplier.js
//
// Prices are also fetched live by the app itself (the product JSON allows it);
// the deal calendar lives only in the home page HTML, which the browser can't
// fetch cross-origin, so this script does that part.

const fs = require("fs");
const path = require("path");

const SITE = "https://superspeciosa.com";
const CAPS = [
  "white-thai-kratom-capsules", "white-maeng-da-kratom-capsules", "super-speciosa-kratom-capsules",
  "green-maeng-da-kratom-capsules", "green-malay-kratom-capsules", "premium-bali-kratom-capsules",
  "red-maeng-da-kratom-capsules", "red-bali-kratom-capsules", "red-borneo-kratom-capsules",
  "super-red-kratom-capsules"
];
// every capsule strain also sells as powder under the same handle stem
const HANDLES = CAPS.concat(CAPS.map(function (h) { return h.replace("-capsules", "-powder"); }), ["lemon-lime-kava-gummies"]);

// A variant's size in capsule-equivalents (1 capsule = 500 mg, so 1 g = 2).
function parseVariant(v) {
  const t = v.title || "";
  const mc = /(\d+)\s*count/i.exec(t);
  const mg = /(\d+(?:\.\d+)?)\s*(kilograms?|kg|g)\b/i.exec(t);
  let form = "caps", count = null, grams = null, label = t;
  if (mc) { count = Number(mc[1]); label = count + "ct"; }
  else if (mg) {
    grams = Number(mg[1]) * (/^k/i.test(mg[2]) ? 1000 : 1);
    count = grams * 2; form = "powder"; label = grams + "g powder";
  }
  return {
    id: v.id, title: t, form: form, count: count, grams: grams, label: label,
    price: Number(v.price), compareAt: v.compare_at_price ? Number(v.compare_at_price) : null,
    available: !!v.available
  };
}
const UA = { "user-agent": "Mozilla/5.0 (kratom-planner refresh script)" };

function balanced(s, start, cap) {
  let depth = 0, instr = false, esc = false;
  const end = Math.min(s.length, start + (cap || 200000));
  for (let i = start; i < end; i++) {
    const c = s[i];
    if (instr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') instr = false;
    } else if (c === '"') instr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

function extractPromos(html) {
  const out = [], seen = new Set();
  const now = Date.now();
  let idx = 0;
  while ((idx = html.indexOf('"discountData_shopifyResponse"', idx)) !== -1) {
    let found = null;
    for (let back = idx; back > Math.max(0, idx - 60000); back--) {
      if (html[back] !== "{") continue;
      const sub = balanced(html, back);
      if (!sub || sub.length < 400) continue;
      let obj; try { obj = JSON.parse(sub); } catch (e) { continue; }
      if (obj && obj.discountData_shopifyResponse && obj.title) { found = obj; break; }
    }
    idx += 30;
    if (!found) continue;
    const sr = found.discountData_shopifyResponse || {};
    const key = found.title + "|" + sr.startsAt;
    if (seen.has(key)) continue;
    seen.add(key);
    if (found.isDeleted || found.isEnabled === false) continue;
    if (String(found.mode || "").toUpperCase() !== "AUTOMATIC") continue;
    const endsAt = sr.endsAt ? Date.parse(sr.endsAt) : null;
    if (endsAt && endsAt < now - 86400000) continue;          // already over
    if (!endsAt) continue;                                     // open-ended gift rules, not sales
    const products = [];
    let percent = null, type = null;
    const segs = (found.segmentsData && found.segmentsData.segmentsList) || [];
    segs.forEach(function (seg) {
      if (seg.discountValue != null) { percent = Number(seg.discountValue); type = seg.discountType; }
      const rules = (seg.getYRulesData && seg.getYRulesData.rulesList) || [];
      rules.forEach(function (r) {
        const vals = (r.ruleValue && r.ruleValue.value) || [];
        vals.forEach(function (v) {
          if (v && v.handle) products.push({ handle: v.handle, title: v.title || v.handle });
        });
      });
    });
    out.push({
      title: found.title,
      percent: percent,
      discountType: type,
      startsAt: sr.startsAt || null,
      endsAt: sr.endsAt || null,
      status: sr.status || null,
      products: products
    });
  }
  out.sort(function (a, b) { return Date.parse(a.startsAt || 0) - Date.parse(b.startsAt || 0); });
  return out;
}

async function main() {
  const home = await (await fetch(SITE + "/", { headers: UA })).text();
  const promos = extractPromos(home);
  const shipMatch = home.match(/free shipping on orders \$\d+\+[^"<\\]{0,160}/i);
  let freeShipping = shipMatch ? shipMatch[0].replace(/\s+/g, " ").trim() : "";
  // The store leaves stale copy in its banner. If the offer carries a
  // "valid through <date>" clause and that date has passed, drop the line.
  const valid = /offer valid through ([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i.exec(freeShipping);
  if (valid) {
    const until = Date.parse(valid[1].replace(".", ""));
    if (!isNaN(until) && until + 86400000 < Date.now()) freeShipping = "";
  }

  const catalog = await (await fetch(SITE + "/products.json?limit=250", { headers: UA })).json();
  const products = {};
  (catalog.products || []).forEach(function (p) {
    if (HANDLES.indexOf(p.handle) === -1) return;
    products[p.handle] = { title: p.title, variants: p.variants.map(parseVariant) };
  });

  // subscription plans (Subscribe & Save) from each product's .js endpoint
  for (const handle of Object.keys(products)) {
    try {
      const pj = await (await fetch(SITE + "/products/" + handle + ".js", { headers: UA })).json();
      const plans = [];
      (pj.selling_plan_groups || []).forEach(function (g) {
        (g.selling_plans || []).forEach(function (sp) {
          const adj = (sp.price_adjustments || [])[0] || {};
          const m = /every\s+(\d+)\s*(week|month)/i.exec(sp.name || "");
          const days = m ? Number(m[1]) * (/^m/i.test(m[2]) ? 30.4 : 7) : null;
          plans.push({ id: sp.id, name: sp.name, days: days ? Math.round(days) : null,
                       percent: adj.value_type === "percentage" ? Number(adj.value) : null, group: g.name });
        });
      });
      products[handle].plans = plans;
    } catch (e) { products[handle].plans = []; }
  }

  const out = { fetchedAt: new Date().toISOString(), site: SITE, freeShipping: freeShipping, promos: promos, products: products };
  const dest = path.join(__dirname, "supplier-data.js");
  fs.writeFileSync(dest, "// Generated by refresh-supplier.js on " + out.fetchedAt + "\nwindow.SUPPLIER_SNAPSHOT = " + JSON.stringify(out, null, 2) + ";\n");
  console.log("wrote " + dest);
  console.log(promos.length + " upcoming/active promos, " + Object.keys(products).length + " products");
  promos.forEach(function (p) {
    console.log("  " + p.title + "  " + (p.startsAt || "").slice(0, 10) + " -> " + (p.endsAt || "").slice(0, 10) +
      (p.products.length ? "  [" + p.products.map(function (x) { return x.handle; }).join(", ") + "]" : ""));
  });
}

main().catch(function (e) { console.error("refresh failed:", e.message); process.exit(1); });
