/** 우리집 가계부 - 모바일 입력 웹앱 */
const SS_ID = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';
const TX = '거래내역', SET = '설정', FIX = '고정비', BUD = '예산';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api) return json_(route_(p.api, p));

  const t = HtmlService.createTemplateFromFile('Index');
  t.who = (e && e.parameter && e.parameter.u) || '';
  return t.evaluate()
    .setTitle('우리집 가계부')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ss_() { return SpreadsheetApp.openById(SS_ID); }

function bootstrap() {
  const s = ss_();
  const set = s.getSheetByName(SET);

  const cats = {}, catGubun = {};
  set.getRange(5, 1, 60, 2).getValues().forEach(function (r) {
    const name = String(r[0]).trim(), g = String(r[1]).trim();
    if (!name || !g || g === '이체') return;
    (cats[g] = cats[g] || []).push(name);
    catGubun[name] = g;
  });

  const acc = (typeof accounts_ === 'function') ? accounts_() : null;
  const pay = acc ? acc.map(function (a) { return a.name; })
            : set.getRange(5, 5, 30, 1).getValues().map(function (r) { return String(r[0]).trim(); }).filter(String);
  const users = set.getRange(5, 6, 10, 1).getValues().map(function (r) { return String(r[0]).trim(); }).filter(String);
  const users2 = users.filter(function (u) { return u !== '공동'; });

  const fixed = {};
  s.getSheetByName(FIX).getRange(5, 2, 60, 1).getValues().forEach(function (r) {
    const v = String(r[0]).trim(); if (v) fixed[v] = true;
  });

  return { cats: cats, catGubun: catGubun, pay: pay, accounts: acc, users: (users2 && users2.length ? users2 : users), fixed: fixed, summary: (typeof summary2_ === 'function') ? summary2_() : summary_(s, catGubun) };
}

function summary_(s, catGubun) {
  s = s || ss_();
  if (!catGubun) {
    catGubun = {};
    s.getSheetByName(SET).getRange(5, 1, 60, 2).getValues().forEach(function (r) {
      if (r[0] && r[1]) catGubun[String(r[0]).trim()] = String(r[1]).trim();
    });
  }
  const tx = s.getSheetByName(TX);
  const last = tx.getLastRow();
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  let spend = 0, income = 0, count = 0;
  const recent = [];

  if (last >= 2) {
    const v = tx.getRange(2, 1, last - 1, 7).getValues();
    for (let i = 0; i < v.length; i++) {
      const d = v[i][0];
      if (!(d instanceof Date)) continue;
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      const amt = Number(v[i][6]) || 0;
      if (v[i][1] === '지출') { spend += amt; count++; }
      else if (v[i][1] === '수입') income += amt;
    }
    for (let i = v.length - 1; i >= 0 && recent.length < 6; i--) {
      if (!v[i][2]) continue;
      recent.push({ cat: v[i][2], amt: Number(v[i][6]) || 0, gubun: v[i][1], memo: v[i][3] });
    }
  }

  let budget = 0;
  s.getSheetByName(BUD).getRange(5, 1, 40, 2).getValues().forEach(function (r) {
    const name = String(r[0]).trim();
    if (name && catGubun[name] === '지출') budget += Number(r[1]) || 0;
  });

  return { spend: spend, income: income, budget: budget, count: count, recent: recent, month: (m + 1) };
}

function addTx(p) {
  const s = ss_();
  const tx = s.getSheetByName(TX);
  const row = tx.getLastRow() + 1;
  const parts = String(p.date).split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  tx.getRange(row, 1, 1, 9).setValues([[
    d, p.gubun, p.cat, p.memo || '', p.pay, p.user, Number(p.amount), p.fv, ''
  ]]);
  tx.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
  tx.getRange(row, 7).setNumberFormat('#,##0;[RED]-#,##0');
  SpreadsheetApp.flush();

  return { row: row, summary: summary_(s) };
}

function undoTx(row) {
  const s = ss_();
  const tx = s.getSheetByName(TX);
  if (row > 1 && row === tx.getLastRow()) tx.deleteRow(row);
  SpreadsheetApp.flush();
  return { summary: summary_(s) };
}


function _removeSampleRows() {
  const s = ss_();
  const targets = [
    { name: TX, memoCol: 9, first: 2 },
    { name: '자산', memoCol: 7, first: 5 },
    { name: '부채', memoCol: 9, first: 5 },
    { name: FIX, memoCol: 10, first: 5 }
  ];
  const out = {};
  targets.forEach(function (t) {
    const sh = s.getSheetByName(t.name);
    const last = sh.getLastRow();
    if (last < t.first) { out[t.name] = 0; return; }
    const vals = sh.getRange(t.first, t.memoCol, last - t.first + 1, 1).getValues();
    let n = 0;
    for (let i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).indexOf('※예시') === 0) { sh.deleteRow(t.first + i); n++; }
    }
    out[t.name] = n;
  });
  SpreadsheetApp.flush();
  console.log(JSON.stringify(out));
  return out;
}

function overviewLegacy_(ym) {
  const s = ss_();
  const key = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); };
  const rows = s.getSheetByName('월별요약').getRange(5, 1, 36, 13).getValues();
  if (!ym) ym = key(new Date());
  let idx = -1;
  const months = [];
  for (let i = 0; i < rows.length; i++) {
    if (!(rows[i][0] instanceof Date)) continue;
    months.push(key(rows[i][0]));
    if (key(rows[i][0]) === ym) idx = i;
  }
  if (idx < 0) return { error: 'no-month' };
  const r = rows[idx];
  const num = function (v) { return (typeof v === 'number') ? v : 0; };

  const trend = [];
  for (let i = Math.max(0, idx - 5); i <= idx; i++) {
    trend.push({ m: key(rows[i][0]), income: num(rows[i][1]), spend: num(rows[i][2]) });
  }

  const catGubun = {}, budget = {};
  s.getSheetByName(SET).getRange(5, 1, 60, 2).getValues().forEach(function (x) {
    if (x[0] && x[1]) catGubun[String(x[0]).trim()] = String(x[1]).trim();
  });
  s.getSheetByName(BUD).getRange(5, 1, 40, 2).getValues().forEach(function (x) {
    if (x[0]) budget[String(x[0]).trim()] = Number(x[1]) || 0;
  });

  const spendBy = {};
  const tx = s.getSheetByName(TX);
  const last = tx.getLastRow();
  if (last >= 2) {
    tx.getRange(2, 1, last - 1, 7).getValues().forEach(function (v) {
      if (!(v[0] instanceof Date) || key(v[0]) !== ym || v[1] !== '지출') return;
      const c = String(v[2]).trim();
      spendBy[c] = (spendBy[c] || 0) + (Number(v[6]) || 0);
    });
  }
  const cats = Object.keys(budget)
    .filter(function (c) { return catGubun[c] === '지출'; })
    .map(function (c) { return { cat: c, spend: spendBy[c] || 0, budget: budget[c] }; })
    .filter(function (x) { return x.spend > 0 || x.budget > 0; })
    .sort(function (a, b) { return b.spend - a.spend; });

  return {
    ym: ym, months: months,
    income: num(r[1]), spend: num(r[2]), save: num(r[3]), debt: num(r[4]),
    net: num(r[5]), rate: (typeof r[6] === 'number' ? r[6] : null),
    fixed: num(r[7]), vari: num(r[8]),
    asset: num(r[9]), liab: num(r[10]), worth: num(r[11]), delta: num(r[12]),
    trend: trend, cats: cats
  };
}


/* ================= JSON API (정적 앱용) ================= */

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return json_(route_(p.api, p));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(api, p) {
  try {
    if (typeof apiRoute_ === 'function') { var _r = apiRoute_(api, p); if (_r) return _r; }
    if (api === 'clearcache') return { ok: true, data: clearBootCache() };
    if (api === 'master')   return { ok: true, data: master_() };
    if (api === 'summary')  return { ok: true, data: summary_() };
    if (api === 'boot')     return { ok: true, data: bootCached_() };
    if (api === 'overview') return { ok: true, data: overview(p.ym) };
    if (api === 'add')      return { ok: true, data: addTx(p) };
    if (api === 'undo')     return { ok: true, data: undoTx(Number(p.row)) };
    if (api === 'ping')     return { ok: true, data: 'pong' };
    return { ok: false, error: 'unknown api: ' + api };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* 마스터 데이터(카테고리·결제수단·입력자·고정비)는 거의 안 바뀌므로 캐시.
   요약은 매번 새로 계산해서 붙인다. */
function bootCached_() {
  const c = CacheService.getScriptCache();
  const hit = c.get('boot_master_v1');
  let master;
  if (hit) {
    master = JSON.parse(hit);
  } else {
    const b = bootstrap();
    master = { cats: b.cats, catGubun: b.catGubun, pay: b.pay, users: b.users, fixed: b.fixed };
    c.put('boot_master_v1', JSON.stringify(master), 600);
    return { cats: b.cats, catGubun: b.catGubun, pay: b.pay, users: b.users,
             fixed: b.fixed, summary: b.summary };
  }
  return {
    cats: master.cats, catGubun: master.catGubun, pay: master.pay,
    users: master.users, fixed: master.fixed,
    summary: summary_(null, master.catGubun)
  };
}

function clearBootCache() {
  CacheService.getScriptCache().remove('boot_master_v1');
  return 'cleared';
}


/* 마스터만 (캐시 적중 시 스프레드시트를 아예 열지 않는다 → 가장 빠른 경로) */
function master_() {
  const c = CacheService.getScriptCache();
  const hit = c.get('boot_master_v1');
  if (hit) return JSON.parse(hit);
  const b = bootstrap();
  const master = { cats: b.cats, catGubun: b.catGubun, pay: b.pay, users: b.users, fixed: b.fixed };
  c.put('boot_master_v1', JSON.stringify(master), 600);
  return master;
}
