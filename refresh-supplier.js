// Builds supplier-data.js from superspeciosa.com: the whole catalog classified for the
// planner (strains by form, standalone items, bundles), subscription plans with real
// per-variant prices, and the store's scheduled deal calendar.
//
//   node refresh-supplier.js
//
// Prices and stock are also fetched live by the app (the product JSON allows it); the deal
// calendar lives only in the home page HTML, which a browser can't fetch cross-origin, so
// this script does that part.

const fs = require("fs");
const path = require("path");

const SITE = "https://superspeciosa.com";
const UA = { "user-agent": "Mozilla/5.0 (kratom-planner refresh script)" };

// ---------------- strain dictionary ----------------
// key, display name, vein colour, the phrase that identifies it in a title, vendor copy
const STRAINS = [
  { key: "WT",   name: "White Thai",        color: "w", match: /white thai/i,         desc: "Morning wake-up" },
  { key: "WMD",  name: "White Maeng Da",    color: "w", match: /white maeng da/i,     desc: "Morning energy, motivation" },
  { key: "SR",   name: "Signature Reserve", color: "g", match: /signature reserve/i,  desc: "Energy, focus, mood lift (high-MIT green leaf)" },
  { key: "R250", name: "250th Reserve",     color: "g", match: /250th reserve/i,      desc: "Special release, high-MIT green leaf" },
  { key: "GMD",  name: "Green Maeng Da",    color: "g", match: /green maeng da/i,     desc: "Balanced energy, focus" },
  { key: "GMal", name: "Green Malay",       color: "g", match: /green malay/i,        desc: "All-day energy" },
  { key: "GB",   name: "Green Bali",        color: "g", match: /green bali|premium bali/i, desc: "Everyday / afternoon energy" },
  { key: "RMD",  name: "Red Maeng Da",      color: "r", match: /red maeng da/i,       desc: "Relaxation, tension relief" },
  { key: "RB",   name: "Red Bali",          color: "r", match: /red bali/i,           desc: "Evening wind-down, restful nights" },
  { key: "RBo",  name: "Red Borneo",        color: "r", match: /red borneo/i,         desc: "Sleep support, calm evenings" },
  { key: "SPR",  name: "Super Red",         color: "r", match: /super red/i,          desc: "Night unwind (100% sun-dried)" }
];
// standalone items: dosed by serving, never rotated
const ITEMS = [
  { key: "KAVA",  name: "Kava Gummy",                  match: /kava gummies/i,                     unit: "gummy",   kind: "kava",     color: "y", desc: "Standing evening option, calm only" },
  { key: "GUMS",  name: "Strawberry Kratom Gummy",     match: /strawberry extra strength/i,        unit: "gummy",   kind: "gummies",  color: "x", desc: "Extract gummy, 1 gummy = 1 serving" },
  { key: "GUMB",  name: "Blueberry Kratom Gummy",      match: /blueberry.*kratom gummies/i,        unit: "gummy",   kind: "gummies",  color: "x", desc: "Extract gummy, 1 gummy = 1 serving" },
  { key: "GUMM",  name: "Mango Kratom Gummy",          match: /mango extra strength/i,             unit: "gummy",   kind: "gummies",  color: "x", desc: "Extract gummy, 1 gummy = 1 serving" },
  { key: "RGEM",  name: "Red Gem Enhanced Capsule",    match: /red gem enhanced/i,                 unit: "capsule", kind: "extract",  color: "r", desc: "5x strength red, 1 capsule = 1 serving" },
  { key: "EMER",  name: "Emerald Select Enhanced Capsule", match: /emerald select/i,               unit: "capsule", kind: "extract",  color: "g", desc: "5x strength green, 1 capsule = 1 serving" },
  { key: "JOLT",  name: "Jolt Extract Soft Gel",       match: /jolt kratom extract/i,              unit: "soft gel",kind: "extract",  color: "x", desc: "30mg MIT per gel, 1 gel = 1 serving" },
  { key: "SLING", name: "Slingshot Extract Shot",      match: /slingshot/i,                        unit: "serving", kind: "shot",     color: "x", desc: "60mg MIT per serving, 2 servings a bottle", perUnit: 2, unitName: "bottle" },
  { key: "FEELS", name: "Super Feels Kava & Kratom Shot", match: /super feels/i,                   unit: "serving", kind: "shot",     color: "y", desc: "35mg MIT + 25mg kavalactones per serving, 2 a bottle", perUnit: 2, unitName: "bottle" },
  { key: "TINC",  name: "Watermelon Kratom Tincture",  match: /watermelon kratom tincture/i,       unit: "serving", kind: "tincture", color: "x", desc: "Dropper tincture; assumes 15 servings a bottle", perUnit: 15, unitName: "bottle" },
  { key: "DUA",   name: "Dua Enhanced Powder",         match: /dua enhanced/i,                     unit: "gram",    kind: "enhanced-powder", color: "x", desc: "2.0% MIT enhanced powder; assumes 1 g a serving", servingUnits: 1 },
  { key: "TEA",   name: "Green Maeng Da Tea Bags",     match: /tea bags/i,                         unit: "bag",     kind: "tea",      color: "g", desc: "1 bag = 1 serving" }
];
const IGNORE = /t-shirt|shaker|measuring spoon|powder flight$/i;

function formOf(p) {
  const tags = (p.tags || []).map(function (t) { return String(t).toLowerCase(); });
  const h = p.handle + " " + (p.title || "");
  if (/-tablets|tablet/i.test(h) || tags.indexOf("form_tablets") !== -1 || tags.indexOf("form_tablets".toLowerCase()) !== -1) return "tabs";
  if (/-capsules|capsule/i.test(h) || tags.indexOf("form_capsules") !== -1) return "caps";
  if (/-powder|powder/i.test(h) || tags.indexOf("form_powders") !== -1) return "powder";
  return null;
}
function strainOf(text) {
  for (const s of STRAINS) if (s.match.test(text)) return s;
  return null;
}
// a variant's size in capsule-equivalents (1 capsule = 500 mg, so 1 g = 2; a 300 mg tablet = 0.6)
function sizeOf(title, form) {
  const t = title || "";
  const mc = /(\d+)\s*(?:count|counts|ct)\b/i.exec(t);
  const mg = /(\d+(?:\.\d+)?)\s*(kilograms?|kg|g)\b/i.exec(t);
  if (form === "caps" && mc) return { count: Number(mc[1]), grams: null, label: mc[1] + "ct" };
  if (mg) {
    const grams = Number(mg[1]) * (/^k/i.test(mg[2]) ? 1000 : 1);
    if (form === "tabs") return { count: grams * 2, grams: grams, label: Math.round(grams / 0.3) + " tablets (" + grams + "g)" };
    return { count: grams * 2, grams: grams, label: grams + "g powder" };
  }
  if (form === "tabs" && /tablets?/i.test(t)) { const m = /(\d+)\s*tablets?/i.exec(t); if (m) return { count: Number(m[1]) * 0.6, grams: Number(m[1]) * 0.3, label: m[1] + " tablets" }; }
  return null;
}
function itemUnits(item, title) {
  const t = title || "";
  const mc = /(\d+)\s*(?:count|counts|ct|bags?|servings?)\b/i.exec(t);
  const mb = /(\d+)\s*bottles?/i.exec(t) || (/single bottle|^1 bottle/i.test(t) ? [null, "1"] : null);
  const mg = /(\d+(?:\.\d+)?)\s*g\b/i.exec(t);
  const mp = /pack of (\d+)/i.exec(t);
  if (item.unitName === "bottle") { const n = mb ? Number(mb[1]) : 1; return { count: n * (item.perUnit || 1), label: n + (n > 1 ? " bottles" : " bottle") + " (" + n * (item.perUnit || 1) + " servings)" }; }
  if (item.unit === "gram" && mg) return { count: Number(mg[1]), label: mg[1] + "g" };
  if (mc) return { count: Number(mc[1]), label: mc[1] + " " + (Number(mc[1]) > 1 ? item.unit.replace(/y$/, "ie") + "s" : item.unit) };
  if (mp) return { count: Number(mp[1]), label: "pack of " + mp[1] };
  return { count: 1, label: t };
}

async function productJs(handle) {
  try { return await (await fetch(SITE + "/products/" + handle + ".js", { headers: UA })).json(); }
  catch (e) { return null; }
}
function plansOf(pj) {
  const plans = [];
  (pj && pj.selling_plan_groups || []).forEach(function (g) {
    (g.selling_plans || []).forEach(function (sp) {
      const adj = (sp.price_adjustments || [])[0] || {};
      const m = /every\s+(\d+)\s*(week|month)/i.exec(sp.name || "");
      const days = m ? Math.round(Number(m[1]) * (/^m/i.test(m[2]) ? 30.4 : 7)) : null;
      plans.push({ id: sp.id, name: (sp.name || "").replace(/^Autoship\s+/i, "").toLowerCase(), days: days, percent: adj.value_type === "percentage" ? Number(adj.value) : null, group: g.name });
    });
  });
  return plans;
}
function allocationsOf(pj, variantId) {
  const v = (pj && pj.variants || []).filter(function (x) { return x.id === variantId; })[0];
  const out = {};
  (v && v.selling_plan_allocations || []).forEach(function (a) { out[a.selling_plan_id] = a.price / 100; });
  return out;
}

function balanced(s, start, cap) {
  let depth = 0, instr = false, esc = false;
  const end = Math.min(s.length, start + (cap || 200000));
  for (let i = start; i < end; i++) {
    const c = s[i];
    if (instr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') instr = false; }
    else if (c === '"') instr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}
function extractPromos(html) {
  const out = [], seen = new Set(), now = Date.now();
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
    if (!endsAt || endsAt < now - 86400000) continue;
    const products = []; let percent = null, type = null;
    ((found.segmentsData && found.segmentsData.segmentsList) || []).forEach(function (seg) {
      if (seg.discountValue != null) { percent = Number(seg.discountValue); type = seg.discountType; }
      ((seg.getYRulesData && seg.getYRulesData.rulesList) || []).forEach(function (r) {
        ((r.ruleValue && r.ruleValue.value) || []).forEach(function (v) { if (v && v.handle) products.push({ handle: v.handle, title: v.title || v.handle }); });
      });
    });
    out.push({ title: found.title, percent: percent, discountType: type, startsAt: sr.startsAt || null, endsAt: sr.endsAt || null, status: sr.status || null, products: products });
  }
  out.sort(function (a, b) { return Date.parse(a.startsAt || 0) - Date.parse(b.startsAt || 0); });
  return out;
}

async function main() {
  const home = await (await fetch(SITE + "/", { headers: UA })).text();
  const promos = extractPromos(home);
  const shipMatch = home.match(/free shipping on orders \$\d+\+[^"<\\]{0,160}/i);
  let freeShipping = shipMatch ? shipMatch[0].replace(/\s+/g, " ").trim() : "";
  const valid = /offer valid through ([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i.exec(freeShipping);
  if (valid) { const until = Date.parse(valid[1].replace(".", "")); if (!isNaN(until) && until + 86400000 < Date.now()) freeShipping = ""; }

  const catalogJson = await (await fetch(SITE + "/products.json?limit=250", { headers: UA })).json();
  const all = catalogJson.products || [];

  const strains = {};
  STRAINS.forEach(function (s) { strains[s.key] = { key: s.key, name: s.name, color: s.color, desc: s.desc, forms: {} }; });
  const items = {};
  ITEMS.forEach(function (it) { items[it.key] = { key: it.key, name: it.name, kind: it.kind, unit: it.unit, unitName: it.unitName || it.unit, perUnit: it.perUnit || 1, servingUnits: it.servingUnits || 1, color: it.color, desc: it.desc, variants: [], plans: [] }; });
  const bundles = [];
  const products = {};

  for (const p of all) {
    if (IGNORE.test(p.title)) continue;
    const pj = await productJs(p.handle);
    const plans = plansOf(pj);
    const title = p.title.replace(/^Buy\s+/i, "");
    const isBundle = /trio|flight|sampler|bundle|starter pack|sample pack|variety/i.test(title);
    const isDeal = /deal/i.test(title);
    products[p.handle] = { title: title, plans: plans, variants: [] };

    // standalone item?
    const item = ITEMS.filter(function (it) { return it.match.test(title); })[0];
    if (item && !isBundle) {
      p.variants.forEach(function (v) {
        const u = itemUnits(item, v.title);
        const rec = { id: v.id, handle: p.handle, title: v.title, count: u.count, label: u.label, price: Number(v.price), compareAt: v.compare_at_price ? Number(v.compare_at_price) : null, available: !!v.available, planPrices: allocationsOf(pj, v.id) };
        items[item.key].variants.push(rec);
        products[p.handle].variants.push(rec);
      });
      items[item.key].plans = plans;
      continue;
    }

    const form = formOf(p);
    // per-strain deal listing: variants named by strain
    if (isDeal && form) {
      p.variants.forEach(function (v) {
        const s = strainOf(v.title); if (!s) return;
        const sz = sizeOf(v.title, form) || sizeOf(title, form) || (form === "caps" ? { count: 1000, grams: null, label: "1000ct" } : { count: 2000, grams: 1000, label: form === "tabs" ? "3333 tablets (1000g)" : "1000g powder" });
        const rec = { id: v.id, handle: p.handle, title: title + " — " + v.title, form: form, count: sz.count, grams: sz.grams, label: sz.label + " (deal)", price: Number(v.price), compareAt: v.compare_at_price ? Number(v.compare_at_price) : null, available: !!v.available, planPrices: allocationsOf(pj, v.id), deal: true };
        strains[s.key].forms[form] = strains[s.key].forms[form] || { handle: null, variants: [] };
        strains[s.key].forms[form].variants.push(rec);
        products[p.handle].variants.push(rec);
      });
      products[p.handle].deal = true;
      continue;
    }
    if (isBundle) {
      bundles.push({ handle: p.handle, title: title, url: SITE + "/products/" + p.handle, variants: p.variants.map(function (v) { return { id: v.id, title: v.title, price: Number(v.price), compareAt: v.compare_at_price ? Number(v.compare_at_price) : null, available: !!v.available }; }) });
      continue;
    }
    const s = strainOf(title);
    if (s && form) {
      const f = strains[s.key].forms[form] = strains[s.key].forms[form] || { handle: null, variants: [] };
      if (!f.handle) f.handle = p.handle;
      p.variants.forEach(function (v) {
        const sz = sizeOf(v.title, form) || sizeOf(title, form);
        if (!sz) return;
        const rec = { id: v.id, handle: p.handle, title: v.title, form: form, count: sz.count, grams: sz.grams, label: sz.label, price: Number(v.price), compareAt: v.compare_at_price ? Number(v.compare_at_price) : null, available: !!v.available, planPrices: allocationsOf(pj, v.id) };
        f.variants.push(rec);
        products[p.handle].variants.push(rec);
      });
      if (plans.length) f.plans = plans;
      continue;
    }
    // anything else we didn't understand: keep it visible in the raw product map only
    products[p.handle].unclassified = true;
  }
  // drop strains that turned out to have no products (keeps the dictionary honest)
  Object.keys(strains).forEach(function (k) { if (!Object.keys(strains[k].forms).length) delete strains[k]; });
  Object.keys(items).forEach(function (k) { if (!items[k].variants.length) delete items[k]; });

  // one plan set for the app to fall back on
  const anyPlans = Object.keys(products).map(function (h) { return products[h].plans; }).filter(function (p) { return p && p.length; })[0] || [];

  const uncl = Object.keys(products).filter(function (h) { return products[h].unclassified; });
  const out = { fetchedAt: new Date().toISOString(), site: SITE, freeShipping: freeShipping, promos: promos, plans: anyPlans,
                catalog: { strains: strains, items: items, bundles: bundles, unclassified: uncl } };
  const dest = path.join(__dirname, "supplier-data.js");
  fs.writeFileSync(dest, "// Generated by refresh-supplier.js on " + out.fetchedAt + "\nwindow.SUPPLIER_SNAPSHOT = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("wrote " + dest);
  console.log(Object.keys(strains).length + " strains, " + Object.keys(items).length + " standalone items, " + bundles.length + " bundles, " + promos.length + " promos");
  Object.keys(strains).forEach(function (k) { console.log("  " + strains[k].name + ": " + Object.keys(strains[k].forms).map(function (f) { return f + "(" + strains[k].forms[f].variants.length + ")"; }).join(" ")); });
  Object.keys(items).forEach(function (k) { console.log("  item " + items[k].name + ": " + items[k].variants.map(function (v) { return v.label; }).join(", ")); });
  if (uncl.length) console.log("  unclassified: " + uncl.join(", "));
  promos.forEach(function (p) { console.log("  promo " + p.title + "  " + (p.startsAt || "").slice(0, 10) + " -> " + (p.endsAt || "").slice(0, 10)); });
}

main().catch(function (e) { console.error("refresh failed:", e.message); process.exit(1); });
