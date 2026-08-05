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
      daily: [], people: {}, cats: {}, pays: {}, spend: 0, income: 0, fixed: 0,
      cnt: 0, min: row, max: row
    };
    if (row < M.min) M.min = row;
    if (row > M.max) M.max = row;
    M.cnt++;

    if (gub === '지출') {
      M.spend += amt;
      M.daily[day - 1] = (M.daily[day - 1] || 0) + amt;
      M.cats[cat] = (M.cats[cat] || 0) + amt;
      /* 카드 대금 예상액을 뽑으려면 결제수단별 월 합계가 필요하다 */
      M.pays[pay] = (M.pays[pay] || 0) + amt;
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
/* 응답을 '사전 + 번호' 로 접는다.
   재보니 Apps Script 는 응답이 커질수록 급격히 느려진다 — 시트를 안
   건드리는 ping 이 1.2초인데, 40KB 짜리 내역은 5초가 넘었다. 그런데
   그 40KB의 대부분은 매 건마다 반복되는 필드 이름("cat","pay"…)과
   같은 문자열("현대카드", "쿠팡")이었다. 한 번만 적고 번호로 가리키면
   바이트가 3분의 1 아래로 떨어지고, 그만큼 시간이 준다. */
function api_pool_() {
  var ix = {}, arr = [];
  return {
    a: arr,
    i: function (v) {
      var str = v == null ? '' : String(v);
      var k = '' + str;          /* __proto__ 같은 키와 안 부딪히게 */
      var n = ix[k];
      if (n === undefined) { n = arr.length; ix[k] = n; arr.push(str); }
      return n;
    }
  };
}

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

  var G = api_pool_(), C = api_pool_(), P = api_pool_(),
      W = api_pool_(), D = api_pool_();
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
    if (!byDay[k]) byDay[k] = { d: k, r: [] };
    /* 하루 합계는 앱이 어차피 다시 더한다 — 안 보낸다 */
    byDay[k].r.push([M.min + i, G.i(gub), C.i(cat), P.i(pay), W.i(owner), amt, D.i(desc)]);
  }

  var days = Object.keys(byDay).sort().reverse().map(function (k) { return byDay[k]; });
  return { v: 2, sum: { spend: spend, income: income, count: cnt }, waste: wasteN,
           G: G.a, C: C.a, P: P.a, W: W.a, D: D.a, days: days };
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
  out.cardDue = apiCardDue_();
  out.fixedLeft = apiFixedLeft_();
  return out;
}

/* ───────── 다가오는 카드 결제 ─────────
   신용카드는 쓴 날이 아니라 결제일에 계좌에서 빠진다. 계좌 시트의
   결제일(H)·출금계좌(I)가 채워진 '카드' 행만 본다.
   청구 기준은 '결제일이 든 달의 전달 1일~말일 사용분' 으로 잡았다.
   카드사마다 이용기간이 조금씩 달라서, 앱 화면에 이 기준을 적어둔다.
   계좌 잔액은 건드리지 않는다 — 보여주기만 한다. */
function apiCardDue_() {
  var acc = accountsAll_().filter(function (a) {
    return a.due >= 1 && a.due <= 31 && a.type === '카드';
  });
  if (!acc.length) return { cards: [], note: '' };
  var agg = txAgg_(), now = new Date();
  var y = now.getFullYear(), m = now.getMonth(), day = now.getDate();
  var nowYm = api_ym_(now), out = [];
  acc.forEach(function (a) {
    var k = day <= a.due ? 0 : 1;           /* 오늘이 결제일을 지났으면 다음 달부터 */
    for (var i = 0; i < 2; i++) {
      var pd = new Date(y, m + k + i, a.due);
      var bl = new Date(pd.getFullYear(), pd.getMonth() - 1, 1);
      var bym = bl.getFullYear() + '-' + ('0' + (bl.getMonth() + 1)).slice(-2);
      out.push({
        name: a.name, owner: a.owner, from: a.from,
        pay: pd.getFullYear() + '-' + ('0' + (pd.getMonth() + 1)).slice(-2) +
             '-' + ('0' + a.due).slice(-2),
        ym: bym,
        amt: ((agg.m[bym] || {}).pays || {})[a.name] || 0,
        open: bym >= nowYm                  /* 청구월이 안 끝났으면 아직 쌓이는 중 */
      });
    }
  });
  out.sort(function (x, z) { return x.pay < z.pay ? -1 : x.pay > z.pay ? 1 : 0; });
  return { cards: out, note: '전달 1일~말일 사용분 기준' };
}

/* ───────── 이번 달 고정지출 ─────────
   고정비 시트: 4행이 머리글(항목·대분류·금액·주기·결제일·결제수단/계좌·
   시작일·종료일·월환산액·메모), 5행부터 데이터.

   카드로 빠지는 고정비는 **뺀다.** 자동차 할부처럼 결제수단이 카드면
   그 금액은 이미 카드 대금 안에 들어 있어서, 따로 더하면 두 번 센다.

   예전엔 `결제일 <= 오늘` 이면 목록에서 통째로 뺐다. 그래서 결제일이 되는
   순간 항목이 사라져, 정작 「나갔으니 장부에 넣자」 를 할 수가 없었다.
   지금은 지난 것도 남기고 `late` 로 표시한다 — 그게 반영해야 할 것들이다.

   `done` 은 거래내역을 직접 보고 정한다. 별도 마커 열을 만들지 않는 이유는
   손으로 넣은 건까지 같이 잡히기 때문이다. 판정 기준은
   **이 달 + 고정/변동 열이 '고정' + 내용이 항목명과 같음** 이다. */
function apiFixedLeft_() {
  var out = { amt: 0, n: 0, items: [], ym: '' };
  var sh = api_ss_().getSheetByName('고정비');
  if (!sh) return out;
  var last = sh.getLastRow();
  if (last < 5) return out;

  var W = 12;
  var hdr = sh.getRange(4, 1, 1, W).getValues()[0].map(function (x) {
    return String(x || '').trim();
  });
  var ix = function (n) { return hdr.indexOf(n); };
  var iNm = ix('항목'), iCat = ix('대분류'), iAmt = ix('금액'), iCyc = ix('주기'),
      iDay = ix('결제일'), iPay = ix('결제수단/계좌'), iSt = ix('시작일'), iEnd = ix('종료일');
  if (iNm < 0 || iAmt < 0 || iDay < 0) return out;

  var typ = {};
  accountsAll_().forEach(function (a) { typ[a.name] = a.type; });

  var now = new Date(), today = now.getDate(), mon = now.getMonth();
  var ym = api_ym_(now);
  out.ym = ym;
  var seen = fixedSeen_(ym);
  var skip = fxSkipGet_()[ym] || {};

  var v = sh.getRange(5, 1, last - 4, W).getValues();
  for (var i = 0; i < v.length; i++) {
    var nm = String(v[i][iNm] || '').trim();
    if (!nm) continue;
    var amt = api_n_(v[i][iAmt]);
    if (amt <= 0) continue;
    var d = Math.round(api_n_(v[i][iDay]));
    if (!(d >= 1 && d <= 31)) continue;
    var end = iEnd >= 0 ? v[i][iEnd] : null;
    if (end instanceof Date && end < now) continue; /* 끝난 항목 */
    if (String(v[i][iCyc] || '').trim() === '매년') {
      var st = iSt >= 0 ? v[i][iSt] : null;
      if (!(st instanceof Date) || st.getMonth() !== mon) continue;
    }
    var pay = iPay >= 0 ? String(v[i][iPay] || '').trim() : '';
    if (typ[pay] === '카드') continue;              /* 카드 대금에 이미 있다 */
    var isSkip = !!skip[nm];
    var isDone = !isSkip && !!seen.byName[nm];
    /* 이름이 안 맞아도 금액·결제수단이 같으면 같은 건일 공산이 크다.
       실제로 「쿠팡 와우멤버십」을 「쿠팡 (와우 멤버십)」으로 손입력해 둔 게
       계속 미등록으로 잡혔다. 다만 20,000원처럼 겹치는 금액이 있어서
       done 으로 단정하지 않고 near 로만 알린다 — 판단은 사람이 한다. */
    var isNear = !isSkip && !isDone && !!seen.byAmtPay[amt + '|' + pay];
    out.items.push({
      name: nm,
      cat: iCat >= 0 ? String(v[i][iCat] || '').trim() : '',
      amt: amt, day: d, pay: pay,
      done: isDone, near: isNear, skip: isSkip,
      late: !isDone && !isNear && !isSkip && d <= today /* 날은 지났는데 아직 안 넣음 */
    });
    /* 합계는 아직 안 나간 돈만. 장부에 있거나 무시한 건 「앞으로 나갈 돈」이 아니다.
       near 는 확정이 아니라서 합계에 남긴다 — 빼려면 [무시]를 누른다. */
    if (!isDone && !isSkip) { out.amt += amt; out.n++; }
  }
  /* 밀린 것 → 비슷한 게 있는 것 → 남은 것 → 처리 끝난 것 순 */
  function rank(x) { return x.skip ? 4 : x.done ? 3 : x.late ? 0 : x.near ? 1 : 2; }
  out.items.sort(function (a, b) {
    return (rank(a) - rank(b)) || (a.day - b.day);
  });
  out.items = out.items.slice(0, 30);
  return out;
}

/* 이 달 거래내역에서 이미 나간 것으로 볼 만한 단서 두 가지.
   D=내용, E=결제수단, G=금액, H=고정/변동.
     byName   이름이 같고 '고정' 으로 찍힌 것 — 확실
     byAmtPay 금액·결제수단이 같은 지출 — 이름이 달라도 같은 건일 수 있다 */
function fixedSeen_(ym) {
  var out = { byName: {}, byAmtPay: {} };
  var agg = txAgg_();
  var M = agg.m[ym];
  if (!M) return out;
  var sh = api_ss_().getSheetByName('거래내역');
  if (!sh) return out;
  var v = sh.getRange(M.min, 2, M.max - M.min + 1, 7).getValues(); /* B~H */
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() !== '지출') continue;   /* B 구분 */
    var nm = String(v[i][2] || '').trim();                   /* D 내용 */
    var pay = String(v[i][3] || '').trim();                  /* E 결제수단 */
    var amt = api_n_(v[i][5]);                               /* G 금액 */
    if (nm && String(v[i][6] || '').trim() === '고정') out.byName[nm] = true;
    if (amt > 0) out.byAmtPay[amt + '|' + pay] = true;
  }
  return out;
}

/* 「이건 이 달엔 안 나간다」 를 사람이 직접 빼는 자리.
   시트에 열을 더하지 않는 이유는 달마다 비워줘야 하기 때문이다.
   스크립트 속성에 달 단위로 담고, 지난 달 것은 읽을 때 버린다. */
var FX_SKIP_K = 'FX_SKIP';
function fxSkipGet_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(FX_SKIP_K);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (e) { return {}; }
}
function fxSkipSet_(ym, name, on) {
  var all = fxSkipGet_();
  /* 이번 달과 지난 달만 남긴다 — 그 이상은 볼 일이 없다 */
  var keep = {};
  var cur = api_ym_(new Date());
  Object.keys(all).forEach(function (k) { if (k >= cur.slice(0, 4) + '-01') keep[k] = all[k]; });
  var m = keep[ym] || (keep[ym] = {});
  if (on) m[name] = 1; else delete m[name];
  PropertiesService.getScriptProperties().setProperty(FX_SKIP_K, JSON.stringify(keep));
  api_bump_();
  return { ok: true, ym: ym, name: name, skip: !!on };
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
/* 앱에서 내역을 고칠 때 쓴다. 예전엔 대분류·내용·결제수단·금액만
   받아서, 화면에서 날짜나 지출/수입을 바꿔도 저장이 안 됐다.
   날짜는 api_pureDate_ 로 시각 없는 순수 날짜를 만들어 넣는다. */
function apiUpdate_(p) {
  var sh = api_ss_().getSheetByName('거래내역');
  var r = Number(p.row);
  if (!(r > 1)) return { ok: false, error: 'bad row' };
  if (p.date !== undefined && p.date !== '') sh.getRange(r, 1).setValue(api_pureDate_(p.date));
  if (p.gubun !== undefined && p.gubun !== '') sh.getRange(r, 2).setValue(p.gubun);
  if (p.cat !== undefined) sh.getRange(r, 3).setValue(p.cat);
  if (p.desc !== undefined) sh.getRange(r, 4).setValue(p.desc);
  if (p.pay !== undefined) sh.getRange(r, 5).setValue(p.pay);
  if (p.amt !== undefined) sh.getRange(r, 7).setValue(Number(p.amt));
  if (p.memo !== undefined) sh.getRange(r, 9).setValue(p.memo);
  if (p.merchant !== undefined) sh.getRange(r, 11).setValue(p.merchant);
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
               'waste', 'upd', 'del', 'add2', 'init', 'fxSkip',
               'inbox', 'inboxList', 'inboxOk', 'inboxNo', 'inboxHealth'].indexOf(api) >= 0;
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
    if (api === 'inboxHealth') return { ok: true, data: inboxHealth_() };
    if (api === 'inboxOk')   return { ok: true, data: inboxOk_(p, email) };
    if (api === 'inboxNo')   return { ok: true, data: inboxNo_(p) };
    /* month 재계산은 응답에서 뺀다 — 저장이 8초를 넘겨 클라이언트가
       재시도하면서 중복 행이 생기던 원인. 갱신은 클라이언트가 따로 부른다. */
    if (api === 'add2')    return { ok: true, data: apiAdd_(p, email) };
    if (api === 'fxSkip')  return { ok: true, data: fxSkipSet_(
                             String(p.ym || ''), String(p.name || ''), String(p.on) === '1') };
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
  /* A표시명 B기관 C번호 D소유자 E종류 F사용 G메모 H결제일 I출금계좌 */
  var v = s.getRange(5, 1, 80, 9).getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    out.push({ name: String(v[i][0]).trim(),
               owner: String(v[i][3] || '').trim() || '공동',
               type: String(v[i][4] || '').trim(),
               due: api_n_(v[i][7]),
               from: String(v[i][8] || '').trim() });
  }
  return out;
}
