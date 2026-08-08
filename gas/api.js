/* ═══════════════════════════════════════════════════════════
   JSON API v2 — GitHub Pages 프런트엔드용
   인증: 구글 ID 토큰(GIS) → tokeninfo 검증 → 이메일 화이트리스트
   기존 route_() 앞단에 끼워 넣어 동작합니다.
   ═══════════════════════════════════════════════════════════ */

var API_CLIENT_ID = '234887197691-1bjbpudf58j29o6onvs3ih0k5og6pco1.apps.googleusercontent.com';
/* 이 집 사람. **이름은 여기 한 줄에서만 정한다.**
   2026-08-07 에 「폴·아내」에서 「고미·고니」로 바꿨다. 폴:
   「아내는 내 입장이고. 고미 고니로 하자, 내가 고미야.」
   — 「아내」는 폴 쪽에서 본 호칭이라, 고니가 직접 쓰는 앱에 띄울 말이 아니다.

   실명(승화·고은)은 **안 씁니다.** 저장소가 Public 이고 바로 옆에 이메일
   주소가 있어서, 실명을 넣으면 실명과 이메일이 나란히 공개로 남습니다.
   별명이라 괜찮습니다. 나중에 다른 집이 쓸 때도 이 두 줄만 바꾸면 됩니다. */
var PEOPLE = ['고미', '고니'];
var WHO_ALL = PEOPLE.concat(['공동']);
var API_ALLOW = { 'uxinside@gmail.com': PEOPLE[0], 'lovelykoni33@gmail.com': PEOPLE[1] };
var API_SS = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';

function api_ss_() { return SpreadsheetApp.openById(API_SS); }

/* 사람 → 애칭 목록. 스크립트 속성에 JSON 으로 둔다.
     이름  PERSON_ALIAS
     값    {"아내":["고니"]}
   비어 있거나 형식이 틀리면 빈 객체를 돌려준다 — 없다고 죽지 않는다.
   앱은 boot.people + boot.alias 를 합쳐 catForMe() 판정에 쓴다. */
function api_alias_() {
  try {
    var v = PropertiesService.getScriptProperties().getProperty('PERSON_ALIAS');
    if (!v || !String(v).trim()) return {};
    var o = JSON.parse(v);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    var out = {};
    Object.keys(o).forEach(function (k) {
      var arr = o[k];
      if (typeof arr === 'string') arr = [arr];
      if (Object.prototype.toString.call(arr) === '[object Array]') {
        out[k] = arr.map(String).filter(function (x) { return x; });
      }
    });
    return out;
  } catch (e) { return {}; }
}
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
      /* 「쓴 사람」(F열)이 있으면 그게 이긴다. 없으면 결제수단 소유자.
         아내가 폴 카드로 긁은 건을 아내 지출로 돌리기 위한 것이다.
         과거 행의 F열은 「누가 입력했나」 뜻이라 1.11.19 에서 비웠다 —
         그대로 뒀으면 138건 8,185,176원이 공동에서 개인으로 잘못 갔다. */
      var ow = String(v[i][5] || '').trim() || out.own[pay] || '공동';
      M.people[ow] = (M.people[ow] || 0) + amt;
      if (fx) M.fixed += amt;
    } else if (gub === '수입') {
      M.income += amt;
    }
  }
  try { c.put(key, JSON.stringify(out), 600); } catch (e) {}
  return out;
}

/* ───────── 목표액(예산) 변경 이력 ─────────
   폴 2026-08-07: 「이직하면서 월 소득이 감소했는데 목표 금액은 높았을 때
   기준이어서, 이달의 목표액을 변경할 수 있도록 하면 좋을 것 같아.」

   「예산」 시트는 **안 건드립니다.** 대신 「예산변경」 시트에 덮어쓸 값만
   적용월과 함께 쌓습니다(줄을 추가만 하고 고치지 않습니다). 그래서
     · 언제 얼마로 바꿨는지가 남고,
     · 지난 달을 열면 **그때 기준**으로 보이고,
     · 잘못 바꿨으면 그 줄만 지우면 원래대로 돌아옵니다.

   ⚠️ 「총액」은 저장하지 않습니다. 총액을 바꾸면 앱이 카테고리를 비율대로
   나눠서 **전부 한 번에** 적어 넣습니다. 총액을 따로 들고 있으면
   「총액은 715만인데 카테고리 합은 709만」 같은 상태가 반드시 생기고,
   그때부터 어느 쪽이 맞는지 아무도 모르게 됩니다. 진실은 한 곳에만 둡니다.

   A 적용월(yyyy-MM 글자) · B 대분류 · C 금액 · D 바꾼 사람 · E 바꾼 시각 */
var BUDLOG = '예산변경';
var BUDLOG_COLS = ['적용월', '대분류', '금액', '바꾼 사람', '바꾼 시각'];

function budSheet_() {
  var ss = api_ss_();
  var sh = ss.getSheetByName(BUDLOG);
  if (!sh) {
    sh = ss.insertSheet(BUDLOG);
    sh.getRange(1, 1, 1, BUDLOG_COLS.length).setValues([BUDLOG_COLS]);
    sh.setFrozenRows(1);
    /* ⚠️ 서식을 값보다 **먼저**. 안 그러면 '2026-08' 이 날짜로 삼켜져
       46,204 같은 숫자가 됩니다 (2026-08-06 카드 점검에서 겪은 것). */
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    sh.getRange(2, 3, sh.getMaxRows() - 1, 1).setNumberFormat('#,##0');
  }
  return sh;
}
/* 적용월 ≤ ym 인 줄만 모아 **앞에서부터 덮어쓴다.** 마지막에 덮은 것이 이긴다.
   같은 달에 두 번 바꿨으면 아래쪽(나중에 적은) 줄이 이긴다. */
function budOver_(ym) {
  var sh = budSheet_();
  var last = sh.getLastRow();
  if (last < 2 || !ym) return {};
  var v = sh.getRange(2, 1, last - 1, 3).getValues();
  var rows = [];
  for (var i = 0; i < v.length; i++) {
    var m = api_ym_(v[i][0]);
    var nm = String(v[i][1] || '').trim();
    if (!m || !nm || m > ym) continue;
    rows.push({ m: m, i: i, nm: nm, amt: api_n_(v[i][2]) });
  }
  rows.sort(function (a, b) { return a.m < b.m ? -1 : a.m > b.m ? 1 : a.i - b.i; });
  var out = {};
  rows.forEach(function (r) { out[r.nm] = r.amt; });
  return out;
}

/* 「**이 달에** 목표를 정한 적이 있나」 — 적용월이 딱 ym 인 줄이 있는지.
   ⚠️ budOver_ 는 적용월 ≤ ym 을 **누적**하므로 이걸 못 냅니다. 7월에 바꾼 값이
   8월로 이어지기만 해도 값은 있지만, 8월에 정한 건 아닙니다.
   홈 배너가 이 둘을 헷갈리면 「안 정했어요」가 영영 안 뜨거나 영영 안 사라집니다. */
function budSetFor_(ym) {
  if (!ym) return false;
  var sh = budSheet_();
  var last = sh.getLastRow();
  if (last < 2) return false;
  var v = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (api_ym_(v[i][0]) === ym) return true;
  return false;
}

/* ───────── 예산 ───────── */
function api_budget_(ym) {
  var sh = api_ss_().getSheetByName('예산');
  var v = sh.getRange(4, 1, 60, 4).getValues();
  var base = {}, order = [];
  for (var i = 0; i < v.length; i++) {
    var name = String(v[i][0] || '').trim();
    if (!name || name === '대분류' || name.indexOf('합계') >= 0) continue;
    var amt = 0;
    for (var c = 1; c <= 3; c++) { var n = api_n_(v[i][c]); if (n > 0) { amt = n; break; } }
    if (!amt) continue;
    base[name] = amt; order.push(name);
  }
  /* 이 달에 적용되는 변경분을 덮어쓴다. 0 으로 바꾼 건 지운다 —
     「예산 0원」과 「예산 없음」은 화면에서 어차피 같은 뜻이다. */
  var by = {}, changed = false;
  order.forEach(function (k) { by[k] = base[k]; });
  var ov = budOver_(ym);
  Object.keys(ov).forEach(function (k) {
    if (ov[k] === base[k]) return;
    changed = true;
    if (ov[k] > 0) { if (order.indexOf(k) < 0) order.push(k); by[k] = ov[k]; }
    else delete by[k];
  });
  var total = 0, bt = 0;
  Object.keys(by).forEach(function (k) { total += by[k]; });
  order.forEach(function (k) { bt += base[k] || 0; });
  return { total: total, byCat: by, base: base, baseTotal: bt,
           order: order, changed: changed };
}

/* ───────── 월별 목표 짜기 (1.17.0) ─────────
   폴 2026-08-07: 「카테고리별 목표 금액을 지난달 기준으로 잡아줘. 그리고 월별
   목표 금액 작성 화면도 따로 있어야 할 것 같아. 디폴트는 지난달 목표 금액으로
   두고 직접 수정할 수 있도록.」

   ⭐ 디폴트는 **이미** 지난달 목표입니다. budOver_ 가 적용월 ≤ ym 을 누적해서
   덮으므로 7월에 바꾼 값은 8월에도 그대로 이어집니다. 그러니 여기서 새로
   필요한 건 딱 하나 — **「지난달에 실제로 얼마 썼나」** 입니다.

   ⚠️ month 응답의 cats 를 쓰면 안 됩니다. 거긴 **상위 8개**만, 그것도 **쓴 게
   있는 것만** 들어 있습니다. 목표를 짜려면 전부 있어야 합니다. */

/* 달 셈은 문자열로만 합니다. Date 를 거치면 시간대에 따라 한 달이 밀립니다. */
function api_prevYm_(ym) {
  var y = Number(String(ym).slice(0, 4)), m = Number(String(ym).slice(5, 7));
  if (!(y > 0) || !(m >= 1 && m <= 12)) return '';
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return y + '-' + (m < 10 ? '0' : '') + m;
}
function api_nextYm_(ym) {
  var y = Number(String(ym).slice(0, 4)), m = Number(String(ym).slice(5, 7));
  if (!(y > 0) || !(m >= 1 && m <= 12)) return '';
  m += 1; if (m > 12) { m = 1; y += 1; }
  return y + '-' + (m < 10 ? '0' : '') + m;
}
function api_curYm_() {
  return Utilities.formatDate(new Date(), api_tz_(), 'yyyy-MM');
}

/* 짤 수 있는 달은 **이번 달과 다음 달뿐**입니다.
   지난달을 소급해서 바꾸면 이미 본 리포트의 숫자가 나중에 달라집니다. */
function api_budgetEditable_(ym) {
  var c = api_curYm_();
  return ym === c || ym === api_nextYm_(c);
}

function api_budgetPlan_(ym) {
  var curYm = api_curYm_();
  ym = /^\d{4}-\d{2}$/.test(String(ym || '')) ? String(ym) : curYm;
  var b = api_budget_(ym);

  /* ⚠️ 「지난달」은 **오늘 기준 지난달**입니다. 다음 달(9월) 목표를 짤 때
     직전 달은 아직 안 끝난 8월이라, 그걸 실적이라고 부르면 목표가 반 토막
     납니다. **마지막으로 끝난 달**을 씁니다 — 그리고 어느 달인지 화면에
     이름으로 박습니다. 「지난달」이라고만 적으면 또 거짓말하는 화면이 됩니다. */
  var srcYm = api_prevYm_(curYm);
  var agg = txAgg_();
  var S = agg.m[srcYm];
  var spend = {}, srcTotal = 0;
  if (S && S.cats) {
    Object.keys(S.cats).forEach(function (k) {
      var name = String(k || '').trim();
      var v = Math.round(api_n_(S.cats[k]));
      if (!name || !(v > 0)) return;
      spend[name] = v; srcTotal += v;
    });
  }

  /* 예산 시트에 없던 카테고리도 뒤에 붙입니다 — 지난달에 돈이 나갔는데
     목표를 적을 칸이 없으면 그 돈은 이 화면에서 영원히 안 보입니다.
     많이 쓴 것부터. */
  var order = b.order.slice(), seen = {};
  order.forEach(function (k) { seen[k] = 1; });
  Object.keys(spend)
    .filter(function (k) { return !seen[k]; })
    .sort(function (a, c) { return spend[c] - spend[a]; })
    .forEach(function (k) { order.push(k); });

  return {
    ym: ym, curYm: curYm, nextYm: api_nextYm_(curYm),
    editable: api_budgetEditable_(ym),
    order: order, eff: b.byCat, base: b.base, changed: b.changed,
    srcYm: srcYm, srcSpend: spend, srcTotal: srcTotal
  };
}

/* 목표액 저장. **지금 적용값과 다른 항목만** 줄로 남긴다 —
   안 바뀐 20줄을 매번 쌓으면 이력이 금세 못 읽을 물건이 된다. */
function budgetSet_(p, email) {
  var ym = String(p.ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: 'bad ym' };
  /* 화면에서만 막으면 규칙이 아닙니다. 진짜 자물쇠는 여기입니다.
     ⚠️ 「지난 달은 안 됩니다」라고만 적으면 두 달 뒤를 거절할 때 거짓말이 됩니다. */
  if (!api_budgetEditable_(ym)) {
    return { ok: false,
             error: '목표는 이번 달과 다음 달만 바꿀 수 있습니다 (' +
                    api_curYm_() + ' · ' + api_nextYm_(api_curYm_()) + ')' };
  }
  var items;
  try { items = JSON.parse(String(p.items || '[]')); } catch (e) { return { ok: false, error: 'bad items' }; }
  if (!items || !items.length) return { ok: false, error: 'empty' };

  var cur = api_budget_(ym).byCat;
  var who = API_ALLOW[email] || '';
  var now = new Date();
  var add = [];
  items.forEach(function (it) {
    var nm = String(it.c || '').trim();
    var amt = Math.max(0, Math.round(api_n_(it.a)));
    if (!nm) return;
    if ((cur[nm] || 0) === amt) return;            /* 안 바뀐 건 안 적는다 */
    add.push([ym, nm, amt, who, now]);
  });
  if (!add.length) return { ok: true, saved: 0, ym: ym };

  var sh = budSheet_();
  var at = sh.getLastRow() + 1;
  /* 서식 먼저, 값 나중 */
  sh.getRange(at, 1, add.length, 1).setNumberFormat('@');
  sh.getRange(at, 3, add.length, 1).setNumberFormat('#,##0');
  sh.getRange(at, 1, add.length, 5).setValues(add);
  api_bump_();
  return { ok: true, saved: add.length, ym: ym };
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
    people: PEOPLE.slice(),
    /* 「쓴 사람」 선택지 — 설정 시트 F5~ 그대로(고미·고니·공동).
       폴: 「각자 필요에 의해 혼자 쓴 것과 가족을 위해 쓴 건 구분하는 게 나으니까」 */
    whoOpts: (typeof inbox_users_ === 'function') ? inbox_users_() : WHO_ALL.slice(),
    /* 카테고리 이름 끝의 (애칭)을 누구 것으로 볼지. 실제 애칭은 코드에
       두지 않는다 — 저장소가 Public 이라 2026-08-06 에 뺐다(1.11.10).
       스크립트 속성에서 읽고, 없으면 빈 객체 = 앱이 사람 이름만 쓴다. */
    alias: api_alias_(),
    cats: cats,
    accounts: acc.map(function (a) {
      return { name: a.name, owner: a.owner || '공동', type: a.type || '' };
    }),
    merchants: mer,
    /* boot 은 달을 모른다 — 이번 달 기준으로 준다. 달을 옮기면 month 응답의
       budget 이 이긴다(아래 apiMonth_). 여긴 첫 화면이 그려질 때까지의 값. */
    budget: api_budget_(api_ym_(new Date())),
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
  var tz = api_tz_();
  var now = new Date();
  var curYm = Utilities.formatDate(now, tz, 'yyyy-MM');
  ym = ym || curYm;
  /* ⚠️ ym 을 정한 **뒤에** 예산을 읽는다. 목표액은 달마다 다를 수 있다 —
     7월을 보고 있는데 8월 목표액으로 재면 지난 달이 통째로 틀리게 보인다. */
  var bud = api_budget_(ym);

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

  var people = WHO_ALL.map(function (n) {
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
      weekAllow: Math.round(left / restDays * 7),
      /* 목표액을 바꿨는지 화면에서 알아야 한다. 원래 값도 같이 준다 —
         「원래 858만이었는데 715만으로 바꿨다」를 보여줄 수 있어야 한다. */
      baseBudget: bud.baseTotal || 0, budChanged: !!bud.changed
    },
    /* 목표액 화면이 쓸 재료. 시트 순서 그대로 준다 — 금액순으로 흔들리면
       매번 줄 위치가 바뀌어서 손으로 고치기가 어려워진다. */
    /* setThis — **이 달에** 목표를 한 번이라도 정했나. 홈 배너가 이걸 봅니다.
       ⚠️ `changed` 로는 못 냅니다. 그건 「예산 시트와 다른가」라서, 7월에 바꾼
       값이 8월로 이어지기만 해도 켜져 있습니다. 「8월에 정했다」와는 다릅니다. */
    budget: { eff: bud.byCat, base: bud.base, order: bud.order,
              setThis: budSetFor_(ym) },
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
    var owner = String(v[i][5] || '').trim() || agg.own[pay] || '공동';   /* F열 우선 */
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

/* ───────── 재무상태표 기준월 ─────────
   폴 2026-08-07: 「종합진단 갱신은 어떻게 되는거야?」

   사슬은 이렇습니다.
     ① 자산·부채 시트   ← 월스냅샷() 이 매월 1일에 한 줄 넣는다
     ② 재무상태표 시트  ← SUMIFS 수식. **C3「기준월」이 가리키는 달만** 합산한다
     ③ report2 → 앱     ← 캐시 없음. 시트를 그대로 읽는다

   ⚠️ ②의 C3 는 **손으로 고르는 드롭다운**이고 월스냅샷은 그걸 안 건드립니다.
   그래서 9월 자료가 다 들어와도 C3 가 2026-08 이면 앱은 **8월 숫자를 계속
   보여주면서 겉으론 멀쩡해 보입니다.** 제일 나쁜 종류의 고장입니다.

   자산 시트의 제일 최신 기준월을 찾아 C3 에 넣습니다. 시트를 열 때(onOpen)
   조용히 한 번 돌고, 「가계부」 메뉴에서 손으로도 부를 수 있습니다.
   ⚠️ 앞으로 당기기만 합니다 — 지난 달을 보려고 C3 를 일부러 내려놨을 때
   그걸 도로 밀어 올리면 화면이 사람 손을 이깁니다. */
function bsYmLatest_() {
  var sh = api_ss_().getSheetByName('자산');
  if (!sh || sh.getLastRow() < 5) return '';
  var v = sh.getRange(5, 1, sh.getLastRow() - 4, 1).getValues();
  var mx = '';
  for (var i = 0; i < v.length; i++) {
    var m = api_ym_(v[i][0]);
    if (/^\d{4}-\d{2}$/.test(m) && m > mx) mx = m;
  }
  return mx;
}
function bsYmSync_() {
  var sh = api_ss_().getSheetByName('재무상태표');
  if (!sh) return { ok: false, error: '재무상태표 시트가 없습니다' };
  var cur = api_ym_(sh.getRange('C3').getValue());
  var last = bsYmLatest_();
  if (!last) return { ok: true, changed: false, ym: cur, note: '자산 시트가 비어 있습니다' };
  if (!(last > cur)) return { ok: true, changed: false, ym: cur, latest: last };
  sh.getRange('C3').setValue(last);
  api_bump_();
  return { ok: true, changed: true, from: cur, ym: last, latest: last };
}
/* ───────── 이번 달 자산·부채 줄 만들기 ─────────
   폴 2026-08-07: 「다음달에는 진단 결과가 알아서 나온다는거지?」

   **아닙니다.** 자산 시트 2행에 규칙이 적혀 있습니다 —
   「매달 1일에 지난달 줄을 복사 → 기준월만 바꾸고 잔액 최신화.」
   `월스냅샷()` 은 자산·부채 시트를 **읽기만** 하고(자산추이에 요약 한 줄만 씁니다),
   새 달 줄은 사람이 만듭니다. 그게 안 되면 진단이 조용히 지난달에 멈춥니다.

   여기서 **줄 복사까지만** 대신합니다. 평가액·잔액은 은행·증권 앱을 봐야 아는
   값이라 앱이 알 방법이 없습니다(거래내역엔 잔액 원장이 없습니다). 폴이 숫자만
   덮어쓰면 됩니다.

   ⚠️ 컬럼 이름을 가정하지 않습니다. **줄을 통째로 복사하고 A열(기준월)만** 바꿉니다.
   시트 모양이 바뀌어도 안 깨집니다.
   ⚠️ 이미 이번 달 줄이 있으면 아무것도 안 만듭니다 — 두 번 눌러도 안전합니다. */
var ROLL_SHEETS = ['자산', '부채'];

function rollPlan_(ym) {
  var ss = api_ss_(), out = { ym: ym, sheets: [] };
  ROLL_SHEETS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 5) { out.sheets.push({ name: name, n: 0, why: '시트가 비어 있음' }); return; }
    var w = Math.max(1, sh.getLastColumn());
    var v = sh.getRange(5, 1, sh.getLastRow() - 4, w).getValues();
    var mx = '', has = false;
    for (var i = 0; i < v.length; i++) {
      var m = api_ym_(v[i][0]);
      if (!/^\d{4}-\d{2}$/.test(m)) continue;
      if (m === ym) has = true;
      if (m > mx) mx = m;
    }
    if (has) { out.sheets.push({ name: name, n: 0, why: '이미 ' + ym + ' 줄이 있음', from: mx }); return; }
    if (!mx) { out.sheets.push({ name: name, n: 0, why: '기준월이 있는 줄이 없음' }); return; }
    var rows = v.filter(function (r) { return api_ym_(r[0]) === mx; })
                .map(function (r) { var c = r.slice(); c[0] = ym; return c; });
    out.sheets.push({ name: name, n: rows.length, from: mx, w: w, rows: rows, at: sh.getLastRow() + 1 });
  });
  out.total = out.sheets.reduce(function (a, s) { return a + s.n; }, 0);
  return out;
}
function rollApply_(plan) {
  var ss = api_ss_();
  plan.sheets.forEach(function (s) {
    if (!s.n) return;
    var sh = ss.getSheetByName(s.name);
    /* 서식 먼저 — '2026-09' 가 날짜로 삼켜지면 안 됩니다 */
    sh.getRange(s.at, 1, s.n, 1).setNumberFormat('@');
    sh.getRange(s.at, 1, s.n, s.w).setValues(s.rows);
  });
  api_bump_();
  return plan;
}
function 이번달자산부채줄만들기() {
  var ui = SpreadsheetApp.getUi();
  var ym = Utilities.formatDate(new Date(), api_tz_(), 'yyyy-MM');
  var plan = rollPlan_(ym);
  var lines = plan.sheets.map(function (s) {
    return '· ' + s.name + ' : ' + (s.n ? s.from + ' 의 ' + s.n + '줄을 ' + ym + ' 로 복사'
                                        : '건너뜀 (' + s.why + ')');
  }).join('\n');
  if (!plan.total) { ui.alert('만들 줄이 없습니다.\n\n' + lines); return; }
  var a = ui.alert(ym + ' 줄을 만들까요?',
    lines + '\n\n금액은 지난달 값 그대로 복사됩니다.\n' +
    '만든 뒤 평가액·잔액을 이번 달 값으로 고쳐 주세요.',
    ui.ButtonSet.YES_NO);
  if (a !== ui.Button.YES) { ui.alert('아무것도 안 바꿨습니다.'); return; }
  rollApply_(plan);
  bsYmSync_();
  ui.alert('만들었습니다.\n\n' + lines +
    '\n\n⚠️ 금액은 아직 지난달 값입니다. 평가액·잔액을 고쳐 주세요.');
}

/* 메뉴에서 부른다 */
function 기준월최신으로() {
  var r = bsYmSync_();
  var ui = SpreadsheetApp.getUi();
  ui.alert(r.changed
    ? '재무상태표 기준월을 ' + r.from + ' → ' + r.ym + ' 으로 바꿨습니다.'
    : '이미 최신입니다 (' + (r.ym || '—') + ').' + (r.note ? '\n' + r.note : ''));
}

/* 만기가 1년 안에 오는 빚. 부채 시트 A기준월 B부채명 C유형 D기관 E잔액
   F금리 G월상환액 H만기일 I메모 — 최신 기준월 줄만 본다.
   가까운 것부터. 이게 유동비율의 정체다. */
function debtDueSoon_() {
  var sh = api_ss_().getSheetByName('부채');
  if (!sh || sh.getLastRow() < 5) return [];
  var v = sh.getRange(5, 1, sh.getLastRow() - 4, 9).getValues();
  var mx = '';
  v.forEach(function (r) { var m = api_ym_(r[0]); if (/^\d{4}-\d{2}$/.test(m) && m > mx) mx = m; });
  if (!mx) return [];
  var tz = api_tz_(), now = new Date(), out = [];
  v.forEach(function (r) {
    if (api_ym_(r[0]) !== mx) return;
    var d = r[7];
    if (!(d instanceof Date)) return;
    var days = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (days > 400) return;                     /* 1년 넘게 남았으면 유동이 아니다 */
    out.push({
      name: String(r[1] || '').trim(), amt: api_n_(r[4]), rate: api_n_(r[5]),
      monthly: api_n_(r[6]), due: Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
      days: days, memo: String(r[8] || '').trim()
    });
  });
  out.sort(function (a, b) { return a.days - b.days; });
  return out;
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
      repayMonthly: api_n_(D(27)), repay12: api_n_(D(28)), dsr: api_n_(D(29)),
      /* 자산 시트에 들어온 제일 최신 달. asOf 보다 뒤면 화면이 낡은 것이다.
         앱이 이 둘을 비교해 배너를 띄운다 — 자동으로 밀지 않고 알려만 준다. */
      asOfLatest: bsYmLatest_()
    };
    /* 곧 만기가 오는 빚. 부채 시트에 **만기일이 이미 있습니다** (H열).
       ⚠️ 2026-08-07 정정: 제가 「유동부채 분류가 잘못됐을 수 있다」고 여러 번
       말했는데 데이터는 반대였습니다. 토스뱅크대환 68,100,000 은 만기 2027-05-06,
       메모에 「이자만 납부」— 원금이 통째로 옵니다. **유동부채가 맞습니다.**
       그러니 처방은 「만기를 확인해 보세요」가 아니라 「그때까지 어떻게 할지
       지금 정하세요」입니다. 시트를 안 보고 조언하면 이렇게 됩니다. */
    out.balance.dueSoon = debtDueSoon_();
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
/* ═══════════ 카드 대금이 이미 나갔나 (1.25.0) ═══════════
   폴 2026-08-08: 「아내 카드값은 이미 나갔는데 앞으로 나갈 금액으로 표시돼 있어.」

   맞는 지적이었다. **고정비에는 `done` 판정이 있는데(`fixedSeen_`) 카드에는
   없었다.** `apiCardDue_` 는 계좌 시트의 결제일만 보고, 그 대금이 실제로
   장부에 들어왔는지는 한 번도 안 봤다. 그래서 이미 빠져나간 돈이 며칠 동안
   「앞으로 나갈 돈」에 그대로 서 있었다.

   판정은 **1.19.0 에서 이미 만든 `cardBillHit_` 을 그대로 쓴다** — 결제수단이
   통장인데 내용에 우리 카드 이름이 있으면 그건 대금이다. 문구를 짐작하지
   않고 **계좌 시트에 등록된 사실로만** 가른다.

   ⚠️ 금액은 안 본다. 예상 청구액과 실제 결제액은 거의 늘 다르다(카드사
   이용기간이 제각각이다 — `note` 에 그렇게 적어 뒀다). 금액까지 맞추라고
   하면 **실제로 나간 건을 못 찾아서 계속 「앞으로 나갈 돈」에 남는다.**
   「그 달에 그 카드 대금이 나갔나」만 본다. */
function cardPaid_(ym) {
  var out = {};
  if (!ym) return out;
  var agg = txAgg_();
  var M = agg.m[ym];
  if (!M) return out;
  var sh = api_ss_().getSheetByName('거래내역');
  if (!sh) return out;
  var v = sh.getRange(M.min, 2, M.max - M.min + 1, 6).getValues();   /* B~G */
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === '수입') continue;           /* B 구분 */
    var hit = cardBillHit_(String(v[i][3] || '').trim(),             /* E 결제수단 */
                          String(v[i][2] || '').trim());             /* D 내용 */
    if (hit) out[hit] = (out[hit] || 0) + api_n_(v[i][5]);           /* G 금액 */
  }
  return out;
}

function apiCardDue_() {
  var acc = accountsAll_().filter(function (a) {
    return a.due >= 1 && a.due <= 31 && a.type === '카드';
  });
  if (!acc.length) return { cards: [], note: '' };
  var paidCache = {};
  function paid_(ym) {
    if (!(ym in paidCache)) paidCache[ym] = cardPaid_(ym);
    return paidCache[ym];
  }
  var agg = txAgg_(), now = new Date();
  var y = now.getFullYear(), m = now.getMonth(), day = now.getDate();
  var nowYm = api_ym_(now), out = [];
  acc.forEach(function (a) {
    var k = day <= a.due ? 0 : 1;           /* 오늘이 결제일을 지났으면 다음 달부터 */
    for (var i = 0; i < 2; i++) {
      var pd = new Date(y, m + k + i, a.due);
      var bl = new Date(pd.getFullYear(), pd.getMonth() - 1, 1);
      var bym = bl.getFullYear() + '-' + ('0' + (bl.getMonth() + 1)).slice(-2);
      var pym = pd.getFullYear() + '-' + ('0' + (pd.getMonth() + 1)).slice(-2);
      var done = paid_(pym)[a.name];
      out.push({
        name: a.name, owner: a.owner, from: a.from,
        pay: pym + '-' + ('0' + a.due).slice(-2),
        ym: bym,
        amt: ((agg.m[bym] || {}).pays || {})[a.name] || 0,
        open: bym >= nowYm,                 /* 청구월이 안 끝났으면 아직 쌓이는 중 */
        /* 이 결제월에 이 카드 대금이 이미 장부에 들어왔나. 들어왔으면
           앱이 「앞으로 나갈 돈」에서 뺀다. 실제 나간 금액도 같이 준다 —
           예상액과 다를 때 사람이 눈으로 대조할 수 있어야 한다. */
        paid: !!done,
        paidAmt: done || 0
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
     byAmtPay 금액·결제수단이 같은 것 — 이름이 달라도 같은 건일 수 있다

   ⚠️ **구분(B)으로 거르지 않는다.** 예전엔 `구분 === '지출'` 만 봤다.
   그래서 폴이 청약저축을 넣어도 「앞으로 나갈 돈」에서 계속 [등록] 으로
   되돌아왔다 (2026-08-07):

     2026. 8. 3 │ **저축/투자** │ 저축 │ 주택청약종합저축 │ 우리은행 │ 20,000 │ 고정

   청약저축·적금은 지출이 아니라 자본거래로 잡는 게 맞다. 그런데 그렇게
   잡는 순간 이 판정에서 빠져버렸다. **저장이 안 된 게 아니라 판정이 못 본
   것이다** — 그래서 폴 눈에는 「등록했는데 다시 돌아왔네?」로 보였다.

   묻는 것은 「이 고정비가 이번 달 장부에 들어갔나」다. 지출로 들어갔는지는
   묻지 않는다. 이름이 같고 '고정' 으로 찍혔으면 그걸로 충분하다. */
function fixedSeen_(ym) {
  var out = { byName: {}, byAmtPay: {} };
  var agg = txAgg_();
  var M = agg.m[ym];
  if (!M) return out;
  var sh = api_ss_().getSheetByName('거래내역');
  if (!sh) return out;
  var v = sh.getRange(M.min, 2, M.max - M.min + 1, 7).getValues(); /* B~H */
  for (var i = 0; i < v.length; i++) {
    var gub = String(v[i][0] || '').trim();                  /* B 구분 */
    if (gub === '수입') continue;                            /* 들어온 돈은 아니다 */
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

/* ───────── 같은 가게 반복 결제 묶기 (1.20.0) ─────────
   폴 2026-08-08: 「오락실 같은데서 소액 결제를 반복해서 하면 내역에 건이
   많이 쌓이는 게 별로거든 이거 하나로 합치는 기능 만들면 좋을 것 같아.」

   폴 선택: 화면에서만 접는 게 아니라 **시트 원본도 한 줄로** 합친다.
   그러면 카드 명세서와 대조가 안 되고 되돌릴 수도 없다. 그래서 지우기 전에
   원본 줄을 통째로 「묶음로그」에 옮겨 적는다 — 시트는 깔끔해지고 원본은 남는다.

   ⚠️ 순서가 전부다.
     ① 먼저 읽고 ② 같은 건인지 **서버가 다시** 확인하고 ③ 로그에 적고
     ④ flush 로 로그를 굳히고 ⑤ 그제서야 지운다.
   지운 뒤에 적으려다 실패하면 되돌릴 길이 아예 없다.

   ⚠️ 행을 지우면 그 아래 번호가 전부 밀린다. 앱이 들고 있는 row 는 그
   순간 전부 옛 번호라, 반드시 다시 받아야 한다(reload). */
var MERGE_SHEET = '묶음로그';
var MERGE_COLS = ['묶은 시각', '묶은 사람', '남긴 행', '날짜', '구분', '대분류', '내용',
                  '결제수단', '쓴 사람', '금액', '주기', '메모', '낭비', '가맹점'];
var MERGE_MAX = 100;

function mergeSheet_() {
  var ss = api_ss_();
  var sh = ss.getSheetByName(MERGE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MERGE_SHEET);
    sh.getRange(1, 1, 1, MERGE_COLS.length).setValues([MERGE_COLS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* 같은 건인가 — 날짜·유형·내용·결제수단이 모두 같아야 한다.
   대분류는 뺐다. 같은 가게인데 분류만 다르게 넣은 건이 실제로 있고,
   그건 합쳐도 되는 게 맞다(남는 줄의 분류를 따라간다). */
function mergeKey_(v) {
  return api_ymd_(v[0]) + '|' + String(v[1] || '').trim() +
         '|' + String(v[3] || '').trim() + '|' + String(v[4] || '').trim();
}

function apiMerge_(p, email) {
  var raw = String(p.rows || '').split(',');
  var seen = {}, rows = [];
  for (var i = 0; i < raw.length; i++) {
    var n = Number(String(raw[i]).trim());
    /* ⚠️ 같은 행이 두 번 들어오면 금액이 그만큼 부풀고, 지울 때
       엉뚱한 줄이 지워진다. 반드시 여기서 걸러낸다. */
    if (!(n > 1) || seen[n]) continue;
    seen[n] = 1; rows.push(n);
  }
  rows.sort(function (a, b) { return a - b; });
  if (rows.length < 2) return { ok: false, error: '합칠 줄이 두 개는 있어야 합니다' };
  if (rows.length > MERGE_MAX) return { ok: false, error: '한 번에 ' + MERGE_MAX + '건까지만 합칩니다' };

  var sh = api_ss_().getSheetByName('거래내역');
  var last = sh.getLastRow();
  var vals = [];
  for (var j = 0; j < rows.length; j++) {
    if (rows[j] > last) return { ok: false, error: '없는 줄이 있습니다 (' + rows[j] + '행)' };
    vals.push(sh.getRange(rows[j], 1, 1, 11).getValues()[0]);
  }

  var k0 = mergeKey_(vals[0]);
  for (var k = 1; k < vals.length; k++) {
    if (mergeKey_(vals[k]) !== k0) {
      return { ok: false, error: '날짜·유형·내용·결제수단이 같은 줄만 합칠 수 있습니다' };
    }
  }

  var total = 0, waste = '';
  vals.forEach(function (v) {
    total += api_n_(v[6]);
    if (String(v[9] || '').trim().toUpperCase() === 'Y') waste = 'Y';
  });

  var ms = mergeSheet_();
  var now = new Date(), whoDid = API_ALLOW[email] || '';
  ms.getRange(ms.getLastRow() + 1, 1, vals.length, MERGE_COLS.length).setValues(
    vals.map(function (v) {
      return [now, whoDid, rows[0], v[0], v[1], v[2], v[3], v[4], v[5],
              api_n_(v[6]), v[7], v[8], v[9], v[10]];
    }));
  SpreadsheetApp.flush();   /* 로그가 굳기 전에는 한 줄도 지우지 않는다 */

  var memo = String(vals[0][8] || '').trim();
  sh.getRange(rows[0], 7).setValue(total);
  sh.getRange(rows[0], 9).setValue((memo ? memo + ' · ' : '') + rows.length + '건 합침');
  if (waste) sh.getRange(rows[0], 10).setValue('Y');
  /* ⚠️ 아래에서부터 지운다. 위에서부터 지우면 남은 번호가 밀려
     엉뚱한 줄이 지워진다. */
  for (var d = rows.length - 1; d >= 1; d--) sh.deleteRow(rows[d]);

  api_bump_();
  return { ok: true, row: rows[0], n: rows.length, total: total, reload: true };
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
  /* 「쓴 사람」도 나중에 고칠 수 있어야 한다(폴 결정 2026-08-06).
     빈 문자열을 보내면 지워서 결제수단 소유자로 되돌린다 — 그래서
     undefined 와 '' 를 구분한다. 목록에 없는 이름은 무시한다. */
  if (p.who !== undefined) {
    var w = String(p.who).trim();
    sh.getRange(r, 6).setValue(w === '' ? '' : (api_who_(w) || sh.getRange(r, 6).getValue()));
  }
  api_bump_();
  return { row: r, updated: true };
}
/* 「쓴 사람」 이름 검증 — 설정 시트 F5~ 사용자 목록에 있는 이름만 통과.
   URL 로 아무 값이나 들어올 수 있으니 반드시 거른다. 공동도 목록에 있다.
   inbox_users_() 는 inbox.js 에 있다 — Apps Script 는 전역을 공유하지만,
   그 파일이 없는 배포에서도 안 죽게 typeof 로 감싼다. */
function api_who_(w) {
  var v = String(w == null ? '' : w).trim();
  if (!v) return '';
  if (typeof inbox_users_ === 'function') {
    return inbox_users_().indexOf(v) >= 0 ? v : '';
  }
  return WHO_ALL.indexOf(v) >= 0 ? v : '';
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
/* ───────── 카드값을 지출로 넣는 것 막기 (1.19.0) ─────────
   폴 2026-08-08: 「아내가 우리카드값을 기타로 등록했어. 등록할 때 감지해서
   그대로 입력 못하게 해야할 것 같은데.」

   카드로 긁은 건 이미 **각 건이 지출로** 들어가 있다. 결제일에 통장에서
   빠지는 대금까지 지출로 넣으면 **같은 돈을 두 번 센다.**
   실제로 8월 지출이 1,255,130원 부풀어 있었다.

   ⭐ 물건을 산 것과 대금은 **결제수단만 보면 갈린다 — 짐작할 필요가 없다.**
     · 결제수단이 **카드**   → 물건을 산 것. 지출이 맞다. **여기선 아예 안 본다.**
     · 결제수단이 **통장**인데 내용에 우리 카드 이름 → 결제일에 빠진 대금. 이체다.
   그래서 이번 달에 그 카드로 무엇을 사든 한 건도 안 건드린다.

   ⚠️ **아주 막지는 않는다.** 카드사로 나가는 돈이 전부 대금은 아니다 —
   연회비·이자·수수료는 진짜 지출이다. 한 번 물어보고 `force` 로 통과시킨다.
   막기만 하면 「왜 저장이 안 되지」 하다가 엉뚱한 카테고리로 우회하게 된다. */
function cardNames_() {
  var out = [];
  ((typeof accountsAll_ === 'function') ? accountsAll_() : []).forEach(function (a) {
    if (a && a.name && /카드/.test(a.type || '')) out.push(a.name);
  });
  return out;
}
/* 「우리카드(아내)」의 꼬리를 떼고 견준다 — 알림 문구엔 꼬리가 없다 */
function cardBase_(n) { return String(n || '').replace(/\s*\([^)]*\)\s*/g, '').trim(); }

/* 카드값으로 보이면 그 카드 이름을, 아니면 빈 글자를 준다. */
function cardBillHit_(pay, desc) {
  var p = String(pay || '').trim();
  var d = String(desc || '').trim();
  if (!p || !d) return '';
  var cards = cardNames_();
  /* 결제수단 자체가 카드면 물건을 산 것 — 볼 것도 없다 */
  for (var i = 0; i < cards.length; i++) {
    if (cards[i] === p || cardBase_(cards[i]) === cardBase_(p)) return '';
  }
  for (var j = 0; j < cards.length; j++) {
    var b = cardBase_(cards[j]);
    if (b && d.indexOf(b) >= 0) return cards[j];
  }
  return '';
}

function apiAdd_(p, email) {
  /* ⚠️ 화면에서만 막으면 규칙이 아니다. 진짜 자물쇠는 여기다. */
  if (!p.force && String(p.gubun || '지출') === '지출') {
    var bill = cardBillHit_(p.pay, (p.desc || '') + ' ' + (p.merchant || ''));
    if (bill) {
      return { ok: false, cardBill: bill, code: 409,
               error: bill + ' 대금은 지출이 아니라 이체입니다 — 긁은 건 이미 각각 들어가 있어요' };
    }
  }
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
    /* 「쓴 사람」 — 앱이 고른 값이 이긴다. 안 보내면 로그인 계정으로 떨어진다.
       예전엔 로그인 계정이 무조건 이겨서, 고니가 고미 카드로 긁은 걸 고미가
       등록하면 고미 지출이 됐다. 그게 이 변경의 이유다. */
    var who = api_who_(p.who) || API_ALLOW[email] || PEOPLE[0];
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
               'waste', 'upd', 'del', 'merge', 'add2', 'init', 'fxSkip',
               'budgetSet', 'budgetPlan',
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
       수신함이 아직 없는 배포에서도 죽지 않게 try 로 감싼다.
       hb 는 폰 맥박 — 홈의 「알림이 끊겼어요」 배너가 이걸 보고 뜬다.
       속성 한 번 읽기라 init 이 느려지지 않는다. */
    if (api === 'init')    return { ok: true, me: API_ALLOW[email],
                                    data: { boot: apiBootC_(), month: apiMonthC_(p.ym, p.who),
                                            inbox: (function () {
                                              try { return inboxList_(); }
                                              catch (e) { return { items: [] }; }
                                            })(),
                                            hb: (function () {
                                              try { return inbox_hbGet_(); }
                                              catch (e) { return {}; }
                                            })() } };
    if (api === 'tx2')     return { ok: true, data: apiTx_(p) };
    if (api === 'report2') return { ok: true, data: apiReport_() };
    if (api === 'waste')   return { ok: true, data: apiWaste_(p.row, String(p.on) === '1') };
    if (api === 'upd')     return { ok: true, data: apiUpdate_(p) };
    if (api === 'del')     return { ok: true, data: apiDelete_(p.row) };
    /* 겉껍데기는 ok:true 로 두고 data.ok 로 성공/실패를 가른다 —
       add2 의 카드값 거절과 같은 방식이라 앱 쪽 처리가 하나다. */
    if (api === 'merge')   return { ok: true, data: apiMerge_(p, email) };
    /* 맥박을 같이 얹는다. 앱을 오래 켜두면 init 때 받은 맥박이 낡아서
       살아 있는 폰을 두고 「끊겼어요」 배너가 뜬다. */
    if (api === 'inboxList') {
      var il = inboxList_();
      try { il.hb = inbox_hbGet_(); } catch (e) {}
      return { ok: true, data: il };
    }
    if (api === 'inboxHealth') return { ok: true, data: inboxHealth_() };
    if (api === 'inboxOk')   return { ok: true, data: inboxOk_(p, email) };
    if (api === 'inboxNo')   return { ok: true, data: inboxNo_(p) };
    /* month 재계산은 응답에서 뺀다 — 저장이 8초를 넘겨 클라이언트가
       재시도하면서 중복 행이 생기던 원인. 갱신은 클라이언트가 따로 부른다. */
    if (api === 'add2')    return { ok: true, data: apiAdd_(p, email) };
    if (api === 'fxSkip')  return { ok: true, data: fxSkipSet_(
                             String(p.ym || ''), String(p.name || ''), String(p.on) === '1') };
    /* 목표를 짜는 화면의 재료. 읽기 전용이라 캐시를 따로 두지 않는다 —
       자주 여는 화면이 아니고, txAgg_ 가 이미 10분 캐시다. */
    if (api === 'budgetPlan') return { ok: true, data: api_budgetPlan_(p.ym) };
    if (api === 'budgetSet') {
      var bs = budgetSet_(p, email);
      if (!bs.ok) return { ok: false, error: bs.error };
      return { ok: true, data: bs };
    }
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
