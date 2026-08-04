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
  '개월', '금액', '내역', '확인', '및', '총'
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

function inbox_merchant_(s) {
  var t = String(s || '');
  /* 줄바꿈을 공백으로, 금액·시각·괄호 안 부가정보 제거 */
  t = t.replace(/[\r\n]+/g, ' ')
       .replace(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/g, ' ')
       .replace(/[0-9]{1,2}[:시][0-9]{1,2}분?/g, ' ')
       .replace(/[0-9]{1,4}[\/\.\-][0-9]{1,2}[\/\.\-]?[0-9]{0,2}/g, ' ')
       .replace(/\([^)]*\)/g, ' ')
       .replace(/\[[^\]]*\]/g, ' ');
  /* 카드사·계좌 이름은 가맹점이 아니다 */
  var names = [];
  ((typeof accountsAll_ === 'function') ? accountsAll_() : []).forEach(function (a) {
    if (a.name) names.push(a.name);
  });
  ['현대카드', '삼성카드', '우리카드', '하나카드', '롯데카드', '신한카드', '국민카드',
   '토스', '토스뱅크', '카카오뱅크', '카카오페이', '네이버페이', '페이코', '농협',
   '케이뱅크', '신한은행', '국민은행', '기업은행', '하나은행', '우리은행'].forEach(function (n) {
    if (names.indexOf(n) < 0) names.push(n);
  });

  var parts = t.split(/\s+/).filter(function (w) {
    if (!w) return false;
    if (/^[0-9,\.\-]+$/.test(w)) return false;
    if (/님$/.test(w)) return false;              /* 예금주 이름 */
    if (names.indexOf(w) >= 0) return false;      /* 카드·계좌명 */
    for (var i = 0; i < INBOX_NOISE.length; i++) {
      if (w === INBOX_NOISE[i]) return false;
    }
    return true;
  });
  /* 한국 결제 알림은 가맹점이 대개 맨 뒤에 온다.
     ('현대카드 승인 홍길동님 13,000원 일시불 고향집')
     뒤에서부터 두 글자 이상인 첫 토막을 고르고, 없으면 가장 긴 것. */
  for (var k = parts.length - 1; k >= 0; k--) {
    if (parts[k].length >= 2) return parts[k];
  }
  var cand = '';
  parts.forEach(function (w) { if (w.length > cand.length) cand = w; });
  return cand;
}

/* ───────── 수신 ───────── */
function inboxPut_(p) {
  var raw = String(p.raw || p.text || '').trim();
  if (!raw) return { ok: false, error: 'empty' };

  var sh = inbox_sheet_();
  var now = new Date();

  /* 같은 원문이 5분 안에 또 오면 중복으로 본다 (알림 갱신·재전송 대비) */
  var last = sh.getLastRow();
  if (last > 1) {
    var n = Math.min(30, last - 1);
    var recent = sh.getRange(last - n + 1, 1, n, 3).getValues();
    for (var i = 0; i < recent.length; i++) {
      var t0 = recent[i][0];
      if (String(recent[i][2] || '').trim() === raw &&
          t0 instanceof Date && (now - t0) < 5 * 60 * 1000) {
        return { ok: true, dup: true };
      }
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
