/* ═════════════════════════════════════════════════════════════
   수신함 — 폰 알림을 받아 쌓아두는 곳
   MacroDroid/Tasker 등이 알림을 잡아 여기로 쏜다. 파싱은 실패해도
   원문은 반드시 남긴다. 확인은 사람이 앱에서 한다.

   인증: 구글 토큰이 아니라 스크립트 속성의 INBOX_KEY (긴 랜덤값).
        이 경로는 '수신함에 쓰기'만 가능하고 거래내역 조회·수정은 못 한다.
        키는 절대 소스에 두지 않는다 — 저장소가 공개라서.
   ═════════════════════════════════════════════════════════════ */

var INBOX_SHEET = '수신함';
var INBOX_COLS = ['수신시각', '출처', '원문', '날짜', '가맹점', '금액', '결제수단', '상태', '거래행'];

/* 편집기에서 한 번만 실행 — 새 키를 만들어 실행 로그에 찍는다 */
function 수신키발급() {
  var k = Utilities.getUuid().replace(/-/g, '') +
          Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  PropertiesService.getScriptProperties().setProperty('INBOX_KEY', k);
  Logger.log('INBOX_KEY = ' + k);
  return k;
}

function inbox_key_() {
  return PropertiesService.getScriptProperties().getProperty('INBOX_KEY') || '';
}

function inbox_sheet_() {
  var ss = api_ss_();
  var sh = ss.getSheetByName(INBOX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INBOX_SHEET);
    sh.getRange(1, 1, 1, INBOX_COLS.length).setValues([INBOX_COLS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, INBOX_COLS.length).setFontWeight('bold');
    sh.setColumnWidth(3, 420);
  }
  return sh;
}

/* ───────── 파싱 ─────────
   알림 문구는 카드사·페이사마다 제각각이라 규칙을 느슨하게 잡는다.
   못 읽어낸 값은 비워두고 원문을 남긴다. 앱에서 사람이 고친다. */

var INBOX_NOISE = [
  '승인', '결제', '출금', '입금', '사용', '완료', '취소', '일시불', '할부',
  '누적', '잔액', '체크', '신용', '카드', '알림', '님', '건', '원',
  '개월', '금액', '내역', '확인', '및', '총', '승인취소', '해외', '국내'
];

function inbox_amt_(s) {
  /* '13,000원' 같은 패턴 중 가장 큰 값을 쓴다. 누적/잔액이 같이 오는
     알림이 있어 첫 번째가 결제액이 아닌 경우가 있는데, 그런 알림은
     보통 결제액이 앞이고 잔액이 뒤라 최댓값이 틀릴 수 있다.
     → 첫 번째 값을 결제액으로 보되, 잔액/누적 뒤의 숫자는 제외한다. */
  var cut = s.split(/잔액|누적|한도/)[0];
  var m = cut.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
  if (!m) return 0;
  return Number(String(m[1]).replace(/,/g, '')) || 0;
}

function inbox_isCancel_(s) {
  return /취소|환불|승인취소/.test(s);
}

/* 계좌 시트 표시명 중 알림 문구·앱 이름에 나타나는 것을 고른다 */
function inbox_pay_(text, src) {
  var hay = String(text || '') + ' ' + String(src || '');
  var accs = (typeof accountsAll_ === 'function') ? accountsAll_() : [];
  var best = '', bestLen = 0;
  accs.forEach(function (a) {
    var n = a.name;
    if (n && n.length > bestLen && hay.indexOf(n) >= 0) { best = n; bestLen = n.length; }
  });
  if (best) return best;
  /* 표시명이 안 걸리면 기관 키워드로 한 번 더 */
  var alias = [
    ['네이버페이', '네이버'], ['카카오페이', '카카오페이'], ['카카오뱅크', '카카오뱅크'],
    ['토스부부', '토스'], ['하나은행', '하나'], ['우리카드', '우리카드'],
    ['현대카드', '현대'], ['삼성카드', '삼성'], ['국민은행', '국민'], ['신한은행', '신한']
  ];
  for (var i = 0; i < alias.length; i++) {
    if (hay.indexOf(alias[i][1]) >= 0) return alias[i][0];
  }
  return '';
}

/* 이미 등록된 사용처(가게) 목록 — 가장 긴 이름부터 맞춰본다 */
function inbox_merchants_() {
  var c = CacheService.getScriptCache(), k = 'inbmer' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = [];
  var sh = api_ss_().getSheetByName('사용처');
  if (sh && sh.getLastRow() >= 5) {
    sh.getRange(5, 1, sh.getLastRow() - 4, 1).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim();
      if (n.length >= 2) out.push(n);
    });
  }
  out.sort(function (a, b) { return b.length - a.length; });
  try { c.put(k, JSON.stringify(out), 1500); } catch (e) {}
  return out;
}

/* 카드·계좌 이름은 가맹점이 아니다 */
function inbox_names_() {
  var names = [];
  ((typeof accountsAll_ === 'function') ? accountsAll_() : []).forEach(function (a) {
    if (a.name) names.push(a.name);
  });
  ['현대카드', '삼성카드', '우리카드', '하나카드', '롯데카드', '신한카드', '국민카드',
   '토스', '토스뱅크', '카카오뱅크', '카카오페이', '네이버페이', '페이코', '농협',
   '케이뱅크', '신한은행', '국민은행', '기업은행', '하나은행', '우리은행'].forEach(function (n) {
    if (names.indexOf(n) < 0) names.push(n);
  });
  return names;
}

function inbox_merchant_(s) {
  var raw = String(s || '');

  /* 1) 등록된 사용처가 원문에 있으면 그대로 쓴다. 가장 정확하다. */
  var mers = inbox_merchants_();
  for (var i = 0; i < mers.length; i++) {
    if (raw.indexOf(mers[i]) >= 0) return mers[i];
  }

  /* 2) 없으면 토큰에서 추린다.
     실측 문구:
       현대카드 김승화 님, 네이버 현대카드 승인 14,892원 일시불, 8/4 16:33
       토스 22,900원 결제 쿠팡(쿠페이)
       네이버페이 1,900원 결제 완료 컬리(멤버스)
     카드명·예금주·노이즈를 걷어내면 남는 첫 토막이 가맹점이다. */
  var t = raw.replace(/[\r\n]+/g, ' ')
             .replace(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/g, ' ')
             .replace(/[0-9]{1,2}[:시][0-9]{1,2}분?/g, ' ')
             .replace(/[0-9]{1,4}[\/\.\-][0-9]{1,2}[\/\.\-]?[0-9]{0,2}/g, ' ');

  /* 토큰 앞뒤 문장부호 제거 — '일시불,' 같은 게 노이즈 목록에 안 걸리던 문제.
     괄호는 건드리지 않는다. '컬리(멤버스)' 가 '컬리(멤버스' 로 깨진다. */
  var toks = t.split(/\s+/).map(function (w) {
    return w.replace(/^["'·,\.]+/, '').replace(/["'·,\.;:]+$/, '');
  }).filter(String);

  /* '님' 은 예금주 표시 — 자기 자신과 바로 앞 토막(이름)을 함께 버린다 */
  var keep = [];
  for (var k = 0; k < toks.length; k++) {
    if (toks[k] === '님') { keep.pop(); continue; }
    keep.push(toks[k]);
  }

  var names = inbox_names_();
  function bad(w) {
    return w.length < 2 || /^[0-9,\.\-]+$/.test(w) ||
           names.indexOf(w) >= 0 || INBOX_NOISE.indexOf(w) >= 0;
  }
  /* 쓸 만한 토막이 처음 나오는 지점부터, 끊길 때까지를 통째로 가맹점으로 본다.
     '스타벅스 코리아' 처럼 두 단어인 상호를 살리기 위함. */
  var a = -1, b = -1;
  for (var i = 0; i < keep.length; i++) {
    if (!bad(keep[i])) { if (a < 0) a = i; b = i; }
    else if (a >= 0) break;
  }
  return a >= 0 ? keep.slice(a, b + 1).join(' ') : '';
}

/* ───────── 수신 ───────── */
function inboxPut_(p) {
  var raw = String(p.raw || p.text || '').trim();
  if (!raw) return { ok: false, error: 'empty' };

  var sh = inbox_sheet_();
  var now = new Date();

  /* 같은 원문이 또 들어오면 언제 오든 중복으로 본다.
     예전엔 5분 안쪽만 걸렀는데, 안드로이드가 묶음 알림을 갱신하면서
     몇 시간 전 알림을 통째로 다시 게시하는 일이 있다. 그때 이미 처리한
     결제가 새 건으로 또 들어왔다. 원문이 같으면 같은 결제다. */
  var last = sh.getLastRow();
  if (last > 1) {
    var n = Math.min(300, last - 1);
    var recent = sh.getRange(last - n + 1, 3, n, 1).getValues();
    for (var i = 0; i < recent.length; i++) {
      if (String(recent[i][0] || '').trim() === raw) return { ok: true, dup: true };
    }
  }

  var src = String(p.src || p.pkg || '').trim();
  var amt = inbox_amt_(raw);
  var row = [
    now, src, raw,
    api_pureDate_(p.date || Utilities.formatDate(now, api_tz_(), 'yyyy-MM-dd')),
    inbox_merchant_(raw), amt, inbox_pay_(raw, src),
    inbox_isCancel_(raw) ? '취소보류' : '대기', ''
  ];
  sh.appendRow(row);
  return { ok: true, row: sh.getLastRow(), amt: amt };
}

/* 알림 문구 안의 승인 시각 — '8/4 09:12' 또는 '09:12' */
function inbox_when_(raw) {
  var s = String(raw || '');
  var m = s.match(/(\d{1,2})\s*[\/\.]\s*(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) return { mo: +m[1], d: +m[2], h: +m[3], mi: +m[4] };
  m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return { mo: 0, d: 0, h: +m[1], mi: +m[2] };
  return null;
}

/* 승인 시각과 수신 시각이 30분 넘게 벌어지면 '지난 알림'으로 본다.
   재게시된 옛 알림을 조용히 새 결제로 받아들이지 않기 위한 표시다. */
function inbox_late_(at, raw) {
  if (!(at instanceof Date)) return false;
  var w = inbox_when_(raw);
  if (!w) return false;
  var appr = new Date(at.getFullYear(),
                      w.mo ? w.mo - 1 : at.getMonth(),
                      w.d ? w.d : at.getDate(), w.h, w.mi, 0);
  var gap = Math.abs(at.getTime() - appr.getTime()) / 60000;
  return gap > 30 && gap < 60 * 24 * 40;
}

/* ───────── 카테고리 추천 ─────────
   1) 사용처 시트에 그 가게가 등록돼 있으면 거기 적힌 대분류가 가장 정확하다.
   2) 없으면 분류규칙을 가맹점명에만 먼저 대본다. 원문에는 '네이버페이',
      '카카오페이' 같은 결제사 이름이 섞여 있어서, 원문부터 대면
      실제 가게(컬리·쿠팡)가 아니라 결제사 규칙이 먼저 걸린다.
   3) 그래도 안 잡히면 마지막으로 원문 전체를 대본다. */
function inbox_merCat_() {
  var c = CacheService.getScriptCache(), k = 'inbmc' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var map = {};
  var sh = api_ss_().getSheetByName('사용처');
  if (sh && sh.getLastRow() >= 5) {
    sh.getRange(5, 1, sh.getLastRow() - 4, 2).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim(), cat = String(r[1] || '').trim();
      if (n && cat) map[n] = cat;
    });
  }
  try { c.put(k, JSON.stringify(map), 1500); } catch (e) {}
  return map;
}

function inbox_rules_() {
  var c = CacheService.getScriptCache(), k = 'inbrul' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = [];
  var sh = api_ss_().getSheetByName('분류규칙');
  if (sh && sh.getLastRow() >= 5) {
    sh.getRange(5, 1, sh.getLastRow() - 4, 2).getValues().forEach(function (r) {
      var kw = String(r[0] || '').trim(), cat = String(r[1] || '').trim();
      if (kw && cat) out.push([kw.toUpperCase(), cat]);
    });
  }
  try { c.put(k, JSON.stringify(out), 1500); } catch (e) {}
  return out;
}

function inbox_ruleHit_(text, rv) {
  if (!text) return '';
  var U = String(text).toUpperCase();
  for (var i = 0; i < rv.length; i++) {
    if (U.indexOf(rv[i][0]) >= 0) return rv[i][1];
  }
  return '';
}

function inbox_guess_(mer, raw) {
  var mc = inbox_merCat_();
  if (mer && mc[mer]) return mc[mer];
  var rv = inbox_rules_();
  return inbox_ruleHit_(mer, rv) || inbox_ruleHit_(raw, rv) || '';
}

/* ───────── 앱에서 쓰는 조회/확정 ───────── */
function inboxList_() {
  var sh = inbox_sheet_();
  var last = sh.getLastRow();
  if (last < 2) return { items: [] };
  var start = Math.max(2, last - 200);
  var v = sh.getRange(start, 1, last - start + 1, INBOX_COLS.length).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0; i--) {
    var st = String(v[i][7] || '').trim();
    if (st !== '대기' && st !== '취소보류') continue;
    out.push({
      row: start + i,
      at: v[i][0] instanceof Date ? api_ymd_(v[i][0]) : '',
      src: String(v[i][1] || ''),
      raw: String(v[i][2] || ''),
      date: v[i][3] instanceof Date ? api_ymd_(v[i][3]) : '',
      desc: String(v[i][4] || ''),
      amt: api_n_(v[i][5]),
      pay: String(v[i][6] || ''),
      cat: inbox_guess_(String(v[i][4] || ''), String(v[i][2] || '')),
      late: inbox_late_(v[i][0], String(v[i][2] || '')),
      state: st
    });
    if (out.length >= 50) break;
  }
  return { items: out };
}

function inboxOk_(p, email) {
  var sh = inbox_sheet_();
  var r = Number(p.row);
  if (!(r > 1)) return { ok: false, error: 'bad row' };
  var st = String(sh.getRange(r, 8).getValue() || '').trim();
  if (st === '등록') return { ok: true, already: true, row: Number(sh.getRange(r, 9).getValue()) || 0 };

  var add = apiAdd_({
    date: p.date, gubun: p.gubun || '지출', cat: p.cat || '',
    desc: p.desc || '', pay: p.pay || '', amt: p.amt,
    memo: p.memo || '', merchant: p.merchant || p.desc || '',
    n: 'inbox' + r
  }, email);

  sh.getRange(r, 4, 1, 5).setValues([[
    api_pureDate_(p.date), p.desc || '', Number(p.amt) || 0, p.pay || '', '등록'
  ]]);
  sh.getRange(r, 9).setValue(add.row || '');
  return { ok: true, row: add.row };
}

function inboxNo_(p) {
  var sh = inbox_sheet_();
  var r = Number(p.row);
  if (!(r > 1)) return { ok: false, error: 'bad row' };
  sh.getRange(r, 8).setValue('무시');
  return { ok: true };
}

/* ───────── 라우팅 (api.js 의 apiRoute_ 에서 호출) ───────── */
function inboxRoute_(api, p) {
  /* 키 인증 — 쓰기 전용 */
  if (api === 'inbox') {
    var key = inbox_key_();
    if (!key || String(p.k || '') !== key) return { ok: false, error: 'bad key', code: 403 };
    try { return inboxPut_(p); }
    catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  }
  return null;
}
