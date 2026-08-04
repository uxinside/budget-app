/* ═══════════════════════════════════════════════════════════
   JSON API v2 — GitHub Pages 프런트엔드용
   인증: 구글 ID 토큰(GIS) → tokeninfo 검증 → 이메일 화이트리스트
   기존 route_() 앞단에 끼워 넣어 동작합니다.
   ═══════════════════════════════════════════════════════════ */

var API_CLIENT_ID = '234887197691-1bjbpudf58j29o6onvs3ih0k5og6pco1.apps.googleusercontent.com';
var API_ALLOW = { 'uxinside@gmail.com': '폴', 'lovelykoni33@gmail.com': '아내' };
var API_SS = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';

function api_ss_() { return SpreadsheetApp.openById(API_SS); }
function api_tz_() { return Session.getScriptTimeZone(); }
function api_ym_(d) {
  return (d instanceof Date) ? Utilities.formatDate(d, api_tz_(), 'yyyy-MM') : String(d || '').trim();
}
function api_ymd_(d) {
  return (d instanceof Date) ? Utilities.formatDate(d, api_tz_(), 'yyyy-MM-dd') : String(d || '').trim();
}
function api_n_(x) { var v = Number(x); return isFinite(v) ? v : 0; }

/* ───────── 인증 ───────── */
function verifyToken_(tok) {
  if (!tok) return null;
  var c = CacheService.getScriptCache();
  var key = 'tk' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok)).slice(0, 40);
  var hit = c.get(key);
  if (hit) return hit === '-' ? null : hit;

  var email = null;
  try {
    var r = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok),
      { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var j = JSON.parse(r.getContentText());
      var em = String(j.email || '').toLowerCase();
      if (j.aud === API_CLIENT_ID && String(j.email_verified) !== 'false' && API_ALLOW[em]) email = em;
    }
  } catch (e) {}
  c.put(key, email || '-', 300);
  return email;
}

/* ───────── 캐시 버전 (쓰기 시 무효화) ───────── */
function api_ver_() {
  var p = PropertiesService.getScriptProperties();
  var v = p.getProperty('API_VER');
  if (!v) { v = '1'; p.setProperty('API_VER', v); }
  return v;
}
function api_bump_() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('API_VER', String(Number(p.getProperty('API_VER') || 1) + 1));
}

/* ───────── 거래내역 1회 스캔 → 월별 집계 캐시 ─────────
   A날짜 B구분 C대분류 D내용 E결제수단 F입력자 G금액 H고정/변동 */
function txAgg_() {
  var c = CacheService.getScriptCache();
  var key = 'agg' + api_ver_();
  var hit = c.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var sh = api_ss_().getSheetByName('거래내역');
  var last = sh.getLastRow();
  var out = { m: {}, own: {} };
  if (last < 2) return out;

  var acc = accountsAll_();
  acc.forEach(function (a) { out.own[a.name] = a.owner || '공동'; });

  var v = sh.getRange(2, 1, last - 1, 8).getValues();
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date)) continue;
    var ym = api_ym_(d), day = d.getDate();
    var gub = String(v[i][1] || '').trim();
    var cat = String(v[i][2] || '').trim();
    var pay = String(v[i][4] || '').trim();
    var amt = api_n_(v[i][6]);
    var fx = String(v[i][7] || '').trim() === '고정';
    var row = i + 2;

    var M = out.m[ym];
    if (!M) M = out.m[ym] = {
      daily: [], people: {}, cats: {}, spend: 0, income: 0, fixed: 0,
      cnt: 0, min: row, max: row
    };
    if (row < M.min) M.min = row;
    if (row > M.max) M.max = row;
    M.cnt++;

    if (gub === '지출') {
      M.spend += amt;
      M.daily[day - 1] = (M.daily[day - 1] || 0) + amt;
      M.cats[cat] = (M.cats[cat] || 0) + amt;
      var ow = out.own[pay] || '공동';
      M.people[ow] = (M.people[ow] || 0) + amt;
      if (fx) M.fixed += amt;
    } else if (gub === '수입') {
      M.income += amt;
    }
  }
  try { c.put(key, JSON.stringify(out), 600); } catch (e) {}
  return out;
}

/* ───────── 예산 ───────── */
function api_budget_() {
  var sh = api_ss_().getSheetByName('예산');
  var v = sh.getRange(4, 1, 60, 4).getValues();
  var by = {}, total = 0;
  for (var i = 0; i < v.length; i++) {
    var name = String(v[i][0] || '').trim();
    if (!name || name === '대분류' || name.indexOf('합계') >= 0) continue;
    var amt = 0;
    for (var c = 1; c <= 3; c++) { var n = api_n_(v[i][c]); if (n > 0) { amt = n; break; } }
    if (!amt) continue;
    by[name] = amt; total += amt;
  }
  return { total: total, byCat: by };
}

/* ───────── boot ───────── */
function apiBoot_() {
  var ss = api_ss_();
  var set = ss.getSheetByName('설정');
  var sv = set.getRange(5, 1, 60, 2).getValues();
  var cats = [];
  sv.forEach(function (r) {
    var n = String(r[0] || '').trim(), g = String(r[1] || '').trim();
    if (n && g) cats.push({ name: n, gubun: g });
  });

  var acc = ((typeof accounts_ === 'function') ? accounts_() : []) || [];
  var mer = [];
  var msh = ss.getSheetByName('사용처');
  if (msh && msh.getLastRow() >= 5) {
    msh.getRange(5, 1, msh.getLastRow() - 4, 5).getValues().forEach(function (r) {
      if (!r[0]) return;
      if (String(r[3] || '').trim().toUpperCase() === 'Y') return;
      mer.push({ name: String(r[0]).trim(), cat: String(r[1] || '').trim(),
                 memo: String(r[2] || '').trim(), n: api_n_(r[4]) });
    });
  }

  var agg = txAgg_();
  var months = Object.keys(agg.m).sort().reverse();

  return {
    v: api_ver_(),
    people: ['폴', '아내'],
    cats: cats,
    accounts: acc.map(function (a) {
      return { name: a.name, owner: a.owner || '공동', type: a.type || '' };
    }),
    merchants: mer,
    budget: api_budget_(),
    months: months.slice(0, 24)
  };
}

/* 특정 월을 특정 소유자 기준으로만 다시 집계한다.
   해당 월의 행 범위(min~max)만 읽으므로 시트 전체 스캔이 아니다.
   people(사람 카드)은 가구 전체 값을 그대로 물려준다. */
function api_slice_(agg, ym, who) {
  var M = agg.m[ym];
  if (!M) return null;
  var sh = api_ss_().getSheetByName('거래내역');
  var v = sh.getRange(M.min, 1, M.max - M.min + 1, 8).getValues();
  var out = { daily: [], people: M.people, cats: {}, spend: 0, income: 0,
              fixed: 0, cnt: 0, min: M.min, max: M.max };
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date) || api_ym_(d) !== ym) continue;
    if ((agg.own[String(v[i][4] || '').trim()] || '공동') !== who) continue;
    var gub = String(v[i][1] || '').trim();
    var amt = api_n_(v[i][6]);
    out.cnt++;
    if (gub === '지출') {
      var day = d.getDate();
      out.spend += amt;
      out.daily[day - 1] = (out.daily[day - 1] || 0) + amt;
      var cat = String(v[i][2] || '').trim();
      out.cats[cat] = (out.cats[cat] || 0) + amt;
      if (String(v[i][7] || '').trim() === '고정') out.fixed += amt;
    } else if (gub === '수입') {
      out.income += amt;
    }
  }
  return out;
}

/* ───────── month (대시보드) ───────── */
function apiMonth_(ym, who) {
  var agg = txAgg_();
  var bud = api_budget_();
  var tz = api_tz_();
  var now = new Date();
  var curYm = Utilities.formatDate(now, tz, 'yyyy-MM');
  ym = ym || curYm;

  var y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
  var dim = new Date(y, mo, 0).getDate();
  var day = (ym === curYm) ? now.getDate() : dim;

  var M = agg.m[ym] || { daily: [], people: {}, cats: {}, spend: 0, income: 0, fixed: 0, cnt: 0 };
  var pm = new Date(y, mo - 2, 1);
  var pYm = Utilities.formatDate(pm, tz, 'yyyy-MM');
  var P = agg.m[pYm] || { daily: [], people: {}, cats: {}, spend: 0, income: 0, fixed: 0 };

  /* 사람 전환 — 해당 소유자 기준으로 갈아끼운다 */
  if (who) {
    var mS = api_slice_(agg, ym, who);  if (mS) M = mS;
    var pS = api_slice_(agg, pYm, who); if (pS) P = pS;
  }

  function cum(A, n) {
    var out = [], s = 0;
    for (var i = 0; i < n; i++) { s += (A.daily[i] || 0); out.push(s); }
    return out;
  }
  var pDim = new Date(y, mo - 1, 0).getDate();
  var cur = cum(M, dim), prev = cum(P, pDim);
  for (var i = day; i < dim; i++) cur[i] = null;

  var spend = M.spend, income = M.income;
  var net = income - spend;
  var pnet = P.income - P.spend;

  // 카테고리 (지출만, 예산 있는 것 우선)
  var cats = [];
  Object.keys(M.cats).forEach(function (k) {
    cats.push({ name: k, spend: M.cats[k], budget: bud.byCat[k] || 0,
                prev: (P.cats[k] || 0) });
  });
  cats.sort(function (a, b) { return b.spend - a.spend; });
  cats = cats.slice(0, 8).map(function (o) {
    return {
      name: o.name, spend: o.spend, budget: o.budget,
      ratio: o.budget ? o.spend / o.budget : null,
      delta: o.prev ? (o.spend - o.prev) / o.prev : null
    };
  });

  var people = ['폴', '아내', '공동'].map(function (n) {
    return { name: n, spend: M.people[n] || 0 };
  });

  var B = bud.total || 0;
  var ideal = B * day / dim;
  var used = cur[day - 1] || 0;
  var left = Math.max(0, B - used);
  var restDays = Math.max(1, dim - day);

  return {
    ym: ym, day: day, dim: dim, prevYm: pYm, who: who || null,
    pnl: {
      income: income, spend: spend, net: net,
      savingRate: income ? net / income : null,
      prevDelta: net - pnet,
      fixed: M.fixed, variable: spend - M.fixed
    },
    pace: {
      budget: B, cur: cur, prev: prev,
      gap: used - ideal,
      prevGap: used - (prev[day - 1] || 0),
      weekAllow: Math.round(left / restDays * 7)
    },
    cats: cats,
    people: people,
    count: M.cnt || 0
  };
}

/* ───────── tx (내역) ───────── */
function apiTx_(p) {
  var agg = txAgg_();
  var ym = p.ym || Utilities.formatDate(new Date(), api_tz_(), 'yyyy-MM');
  var M = agg.m[ym];
  if (!M) return { sum: { spend: 0, income: 0, count: 0 }, days: [], waste: 0 };

  var sh = api_ss_().getSheetByName('거래내역');
  var n = M.max - M.min + 1;
  var v = sh.getRange(M.min, 1, n, 11).getValues();

  var fCat = p.cat ? String(p.cat).split('|') : null;
  var fPay = p.pay ? String(p.pay).split('|') : null;
  var fWho = p.who && p.who !== 'all' ? String(p.who) : null;
  var fWaste = String(p.waste) === '1';
  var q = p.q ? String(p.q).toLowerCase() : '';

  var byDay = {}, spend = 0, income = 0, cnt = 0, wasteN = 0;
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date) || api_ym_(d) !== ym) continue;
    var gub = String(v[i][1] || '').trim();
    var cat = String(v[i][2] || '').trim();
    var desc = String(v[i][3] || '').trim();
    var pay = String(v[i][4] || '').trim();
    var amt = api_n_(v[i][6]);
    var wst = String(v[i][9] || '').trim().toUpperCase() === 'Y';
    var owner = agg.own[pay] || '공동';
    if (wst) wasteN++;

    if (gub === '지출') spend += amt; else if (gub === '수입') income += amt;
    cnt++;

    if (fCat && fCat.indexOf(cat) < 0) continue;
    if (fPay && fPay.indexOf(pay) < 0) continue;
    if (fWho && owner !== fWho) continue;
    if (fWaste && !wst) continue;
    if (q && (desc + ' ' + cat + ' ' + pay).toLowerCase().indexOf(q) < 0) continue;

    var k = api_ymd_(d);
    if (!byDay[k]) byDay[k] = { d: k, total: 0, rows: [] };
    if (gub === '지출') byDay[k].total += amt;
    byDay[k].rows.push({
      row: M.min + i, gubun: gub, cat: cat, desc: desc,
      pay: pay, who: owner, amt: amt, waste: wst
    });
  }

  var days = Object.keys(byDay).sort().reverse().map(function (k) { return byDay[k]; });
  return { sum: { spend: spend, income: income, count: cnt }, waste: wasteN, days: days };
}

/* ───────── report ───────── */
function apiReport_() {
  var ss = api_ss_();
  var out = { balance: {}, consumption: {} };

  var bs = ss.getSheetByName('재무상태표');
  if (bs) {
    var d = bs.getRange(5, 4, 25, 1).getValues().map(function (r) { return r[0]; });
    function D(row) { return d[row - 5]; }
    out.balance = {
      asOf: String(bs.getRange('C3').getValue() || '').trim(),
      liquid: api_n_(D(6)), invest: api_n_(D(7)), real: api_n_(D(8)), etc: api_n_(D(9)),
      asset: api_n_(D(10)),
      curDebt: api_n_(D(13)), longDebt: api_n_(D(14)), debt: api_n_(D(15)),
      net: api_n_(D(18)),
      debtRatio: api_n_(D(21)), equityRatio: api_n_(D(22)),
      currentRatio: api_n_(D(23)), cashMonths: api_n_(D(24)),
      repayMonthly: api_n_(D(27)), repay12: api_n_(D(28)), dsr: api_n_(D(29))
    };
  }

  var tr = ss.getSheetByName('자산추이');
  var trend = [];
  if (tr && tr.getLastRow() >= 5) {
    tr.getRange(5, 1, tr.getLastRow() - 4, 5).getValues().forEach(function (r) {
      if (!r[0]) return;
      trend.push({ m: String(r[0]).trim(), asset: api_n_(r[1]), debt: api_n_(r[2]),
                   net: api_n_(r[3]), kind: String(r[4] || '').trim() });
    });
  }
  out.balance.trend = trend.slice(-6);
  if (trend.length >= 2) {
    var a = trend[trend.length - 1], b = trend[trend.length - 2];
    out.balance.prevDelta = a.net - b.net;
  }

  var agg = txAgg_();
  var ms = Object.keys(agg.m).sort().slice(-6);
  out.consumption.months = ms.map(function (k) {
    return { m: k, income: agg.m[k].income, spend: agg.m[k].spend };
  });
  if (ms.length >= 2) {
    var cu = agg.m[ms[ms.length - 1]], pv = agg.m[ms[ms.length - 2]];
    var ch = [];
    Object.keys(cu.cats).forEach(function (k) {
      var a2 = cu.cats[k], b2 = pv.cats[k] || 0;
      if (a2 < 50000) return;
      ch.push({ cat: k, amt: a2, delta: b2 ? (a2 - b2) / b2 : null });
    });
    ch.sort(function (x, y) { return (y.delta || 0) - (x.delta || 0); });
    out.consumption.changes = ch.slice(0, 4);
  }
  return out;
}

/* ───────── 쓰기 ───────── */
function apiWaste_(row, on) {
  var sh = api_ss_().getSheetByName('거래내역');
  sh.getRange(Number(row), 10).setValue(on ? 'Y' : '');
  api_bump_();
  return { row: Number(row), waste: !!on };
}
function apiDelete_(row) {
  var sh = api_ss_().getSheetByName('거래내역');
  sh.deleteRow(Number(row));
  api_bump_();
  return { row: Number(row), deleted: true };
}
function apiUpdate_(p) {
  var sh = api_ss_().getSheetByName('거래내역');
  var r = Number(p.row);
  if (p.cat !== undefined) sh.getRange(r, 3).setValue(p.cat);
  if (p.desc !== undefined) sh.getRange(r, 4).setValue(p.desc);
  if (p.pay !== undefined) sh.getRange(r, 5).setValue(p.pay);
  if (p.amt !== undefined) sh.getRange(r, 7).setValue(Number(p.amt));
  if (p.memo !== undefined) sh.getRange(r, 9).setValue(p.memo);
  api_bump_();
  return { row: r, updated: true };
}
/* 'yyyy-MM-dd' → 시각 없는 순수 날짜. new Date('...T00:00:00') 은
   런타임 타임존 해석 때문에 시각이 붙는다. */
function api_pureDate_(s) {
  /* new Date(y, m, d) 는 런타임 타임존 기준이라 시트 타임존과 어긋나
     08:00 같은 시각이 붙었다. 시트 타임존으로 명시해서 만든다. */
  var tz = api_tz_();
  var ymd = null;
  var m = s ? String(s).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (m) ymd = m[1] + '-' + m[2] + '-' + m[3];
  else ymd = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  try { return Utilities.parseDate(ymd, tz, 'yyyy-MM-dd'); }
  catch (e) { return new Date(ymd + 'T00:00:00'); }
}

/* 멱등 저장 — 같은 nonce 로 다시 들어오면 행을 새로 만들지 않고
   먼저 만든 결과를 그대로 돌려준다. 잠금으로 동시 진입도 막는다. */
function apiAdd_(p, email) {
  var c = CacheService.getScriptCache();
  var nk = p.n ? ('add:' + String(p.n).slice(0, 64)) : null;
  if (nk) {
    var pre = c.get(nk);
    if (pre) { try { return JSON.parse(pre); } catch (e) {} }
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) {}
  try {
    if (nk) {
      var hit = c.get(nk);
      if (hit) { try { return JSON.parse(hit); } catch (e) {} }
    }
    var sh = api_ss_().getSheetByName('거래내역');
    var who = API_ALLOW[email] || p.who || '폴';
    var row = [
      api_pureDate_(p.date), p.gubun || '지출', p.cat || '', p.desc || '', p.pay || '', who,
      Number(p.amt) || 0, p.fixed ? '고정' : '변동', p.memo || '', '', p.merchant || ''
    ];
    sh.appendRow(row);
    api_bump_();
    var out = { row: sh.getLastRow(), ok: true };
    if (nk) { try { c.put(nk, JSON.stringify(out), 900); } catch (e) {} }
    return out;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ───────── 라우터 (route_ 앞단에서 호출) ───────── */
var API_PUBLIC = { 'ping2': 1 };

function apiRoute_(api, p) {
  if (!api) return null;
  var isNew = ['ping2', 'boot2', 'month', 'tx2', 'report2',
               'waste', 'upd', 'del', 'add2', 'init',
               'inbox', 'inboxList', 'inboxOk', 'inboxNo'].indexOf(api) >= 0;
  if (!isNew) return null;

  if (api === 'ping2') return { ok: true, data: 'pong2' };

  /* 수신함 적재는 구글 토큰이 아니라 전용 키로 인증한다 (쓰기 전용) */
  if (api === 'inbox') {
    return (typeof inboxRoute_ === 'function') ? inboxRoute_(api, p)
                                               : { ok: false, error: 'inbox 미설치' };
  }

  var email = verifyToken_(p && p.t);
  if (!email) return { ok: false, error: 'unauthorized', code: 401 };

  try {
    if (api === 'boot2')   return { ok: true, me: API_ALLOW[email], data: apiBootC_() };
    if (api === 'month')   return { ok: true, data: apiMonthC_(p.ym, p.who) };
    /* 첫 화면에 필요한 것을 한 번에 — 수신함 대기 건까지 같이 내려준다.
       수신함이 아직 없는 배포에서도 죽지 않게 try 로 감싼다. */
    if (api === 'init')    return { ok: true, me: API_ALLOW[email],
                                    data: { boot: apiBootC_(), month: apiMonthC_(p.ym, p.who),
                                            inbox: (function () {
                                              try { return inboxList_(); }
                                              catch (e) { return { items: [] }; }
                                            })() } };
    if (api === 'tx2')     return { ok: true, data: apiTx_(p) };
    if (api === 'report2') return { ok: true, data: apiReport_() };
    if (api === 'waste')   return { ok: true, data: apiWaste_(p.row, String(p.on) === '1') };
    if (api === 'upd')     return { ok: true, data: apiUpdate_(p) };
    if (api === 'del')     return { ok: true, data: apiDelete_(p.row) };
    if (api === 'inboxList') return { ok: true, data: inboxList_() };
    if (api === 'inboxOk')   return { ok: true, data: inboxOk_(p, email) };
    if (api === 'inboxNo')   return { ok: true, data: inboxNo_(p) };
    /* month 재계산은 응답에서 뺀다 — 저장이 8초를 넘겨 클라이언트가
       재시도하면서 중복 행이 생기던 원인. 갱신은 클라이언트가 따로 부른다. */
    if (api === 'add2')    return { ok: true, data: apiAdd_(p, email) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
  return null;
}

/* ───────── 응답 캐시 (버전 키) ───────── */
function apiBootC_() {
  var c = CacheService.getScriptCache(), k = 'bt' + api_ver_();
  var h = c.get(k); if (h) { try { return JSON.parse(h); } catch (e) {} }
  var d = apiBoot_();
  try { c.put(k, JSON.stringify(d), 1500); } catch (e) {}
  return d;
}
function apiMonthC_(ym, who) {
  var c = CacheService.getScriptCache();
  var k = 'mo' + api_ver_() + '_' + (ym || 'cur') + '_' + (who || 'all');
  var h = c.get(k); if (h) { try { return JSON.parse(h); } catch (e) {} }
  var d = apiMonth_(ym, who);
  try { c.put(k, JSON.stringify(d), 1500); } catch (e) {}
  return d;
}

/* ───── 소유자 매핑 전용 계좌 목록 ─────
   accounts_() 는 F열이 '사용'이 아닌 계좌을 제외한다. 그러나 '미사용' 계좌에도
   과거 거래는 남아 있으므로, 소유자 매핑에서까지 빠지면 전부 '공동'으로 붕괴한다. */
function accountsAll_() {
  var s = api_ss_().getSheetByName('계좌');
  if (!s) return [];
  var v = s.getRange(5, 1, 80, 4).getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    out.push({ name: String(v[i][0]).trim(), owner: String(v[i][3] || '').trim() || '공동' });
  }
  return out;
}
