/* 진단 도구 — 읽기만 합니다. 아무것도 바꾸지 않습니다. */

/* ═════════ 정리실행() 은 2026-08-06 에 폐기 ═════════

   드라이런이 없어서 누르는 즉시 행을 지웠고, cleanup.js 의 판정 로직을
   낡은 사본으로 한 벌 더 갖고 있었습니다. 그래서 cleanup.js 를 고쳐도
   이쪽은 옛 규칙 그대로 돌아 — 잘못 누르면 새 규칙이 아니라 옛 규칙으로
   데이터가 지워졌습니다.

   대신 「가계부 › 중복 정리 점검 / 중복 정리 적용」 을 쓰세요.

   함수 이름은 남겨 둡니다 — 어딘가에 트리거나 메뉴가 남아 있어도
   조용히 데이터를 지우는 대신 안내만 하고 멈추게 하려는 것입니다. */
function 정리실행() {
  var s = '정리실행() 은 폐기됐습니다.\n\n「가계부 › 중복 정리 점검」 을 쓰세요.';
  Logger.log(s);
  try { SpreadsheetApp.getUi().alert(s); } catch (e) {}
  return s;
}

/* ═════════ 입력자점검() — F열을 「쓴 사람」으로 재해석하면 뭐가 바뀌나 ═════════

   폴: 「아내가 내 카드로 긁으면 나한테 알림이 뜨는데, 내가 등록하면 내가 쓴 걸로 된다.
        등록할 때 누가 쓴 건지 고를 수 있으면 좋겠다.」

   지금 구조:
     F열 「입력자」  = 로그인한 계정(API_ALLOW[email]). 고를 수 없고 집계에도 안 쓴다.
     사람별 집계    = 결제수단의 소유자 (계좌 시트 D열).

   F열을 「쓴 사람」으로 재정의하면 집계가 F열을 먼저 보게 됩니다. 그런데 과거 행의
   F열은 「누가 입력했나」 뜻이라, 재해석하는 순간 과거 숫자가 흔들립니다.

   ⚠️ **그래서 바꾸기 전에 얼마나 흔들리는지 먼저 셉니다.** 이 함수는 읽기만 합니다. */
var DG_OUT = '입력자점검_결과';

function 입력자점검() {
  var ss = SpreadsheetApp.openById(CL_SS_ID);
  var sh = ss.getSheetByName('거래내역');
  var last = sh.getLastRow();
  if (last < 2) return '거래내역이 비었습니다.';

  var own = {};
  var accs = (typeof accountsAll_ === 'function') ? accountsAll_() : [];
  accs.forEach(function (a) { own[a.name] = a.owner || '공동'; });

  var tz = Session.getScriptTimeZone();
  var v = sh.getRange(2, 1, last - 1, 7).getValues();

  var tot = 0, filled = 0, differ = 0, differAmt = 0;
  var pairs = {};           /* 'F열 → 소유자' → { n, amt } */
  var byYm = {};            /* ym → { now:{}, next:{} } */
  var sample = [];          /* 어긋난 행 예시 */

  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date)) continue;
    if (String(v[i][1] || '').trim() !== '지출') continue;
    tot++;

    var ym  = Utilities.formatDate(d, tz, 'yyyy-MM');
    var pay = String(v[i][4] || '').trim();
    var f   = String(v[i][5] || '').trim();
    var amt = Number(v[i][6]) || 0;
    var o   = own[pay] || '공동';
    var nx  = f || o;                       /* 재해석 뒤의 사람 */

    if (f) filled++;
    if (f && f !== o) {
      differ++; differAmt += amt;
      var k = f + ' → ' + o;
      var P = pairs[k] || (pairs[k] = { n: 0, amt: 0 });
      P.n++; P.amt += amt;
      if (sample.length < 40) {
        sample.push([i + 2, Utilities.formatDate(d, tz, 'yyyy-MM-dd'),
                     String(v[i][3] || ''), pay, amt, f, o]);
      }
    }

    var B = byYm[ym] || (byYm[ym] = { now: {}, next: {} });
    B.now[o]   = (B.now[o]   || 0) + amt;
    B.next[nx] = (B.next[nx] || 0) + amt;
  }

  /* ── 결과 시트 ── */
  var out = ss.getSheetByName(DG_OUT);
  if (out) out.clear(); else out = ss.insertSheet(DG_OUT);

  var rows = [];
  rows.push(['── 어긋나는 행 (F열 ≠ 결제수단 소유자) ──', '', '', '', '', '', '']);
  rows.push(['행', '날짜', '내용', '결제수단', '금액', 'F열(입력자)', '소유자']);
  sample.forEach(function (s) { rows.push(s); });
  if (differ > sample.length) {
    rows.push(['…', '', '앞 ' + sample.length + '건만 보였습니다. 전체 ' + differ + '건.', '', '', '', '']);
  }

  rows.push(['', '', '', '', '', '', '']);
  rows.push(['── 어떤 쌍이 몇 건인가 ──', '', '', '', '', '', '']);
  rows.push(['F열 → 소유자', '건수', '금액', '', '', '', '']);
  Object.keys(pairs).sort(function (a, b) { return pairs[b].n - pairs[a].n; })
    .forEach(function (k) { rows.push([k, pairs[k].n, pairs[k].amt, '', '', '', '']); });

  rows.push(['', '', '', '', '', '', '']);
  rows.push(['── 사람별 월 지출: 지금 → 재해석 뒤 ──', '', '', '', '', '', '']);
  rows.push(['월', '폴 지금', '폴 뒤', '아내 지금', '아내 뒤', '공동 지금', '공동 뒤']);
  var ml = Object.keys(byYm).sort().reverse().slice(0, 12);
  ml.forEach(function (m) {
    var B = byYm[m];
    rows.push([m, B.now['폴'] || 0, B.next['폴'] || 0,
                  B.now['아내'] || 0, B.next['아내'] || 0,
                  B.now['공동'] || 0, B.next['공동'] || 0]);
  });

  out.getRange(1, 1, rows.length, 7).setValues(rows);
  out.getRange(2, 1, 1, 7).setFontWeight('bold');
  var mFirst = rows.length - ml.length + 1;
  if (ml.length) out.getRange(mFirst, 2, ml.length, 6).setNumberFormat('#,##0');
  [70, 95, 240, 130, 100, 110, 110].forEach(function (w, i) { out.setColumnWidth(i + 1, w); });
  /* ── 시트 수식이 거래내역 F열을 참조하나 ──

     F열을 비우기 전에 반드시 봐야 합니다. 월별요약·대시보드·월별집계·그래프는
     전부 자동 수식이라, 어딘가 F열을 보고 있으면 비우는 순간 조용히 0이 되거나
     깨집니다. **그리고 이런 건 깨져도 티가 잘 안 납니다** — 시트 시간대가 LA라
     모든 날짜가 8시간 밀렸던 그 버그처럼요. */
  var refs = dg_scanF_(ss);
  rows = [];
  rows.push(['', '', '', '', '', '', '']);
  rows.push(['── 거래내역 F열을 참조하는 수식 ──', '', '', '', '', '', '']);
  if (!refs.length) {
    rows.push(['(없음) — F열을 비워도 수식은 안 깨집니다', '', '', '', '', '', '']);
  } else {
    rows.push(['시트', '셀', '수식', '', '', '', '']);
    refs.forEach(function (r) { rows.push([r.sheet, r.a1, r.f, '', '', '', '']); });
  }
  out.getRange(out.getLastRow() + 1, 1, rows.length, 7).setValues(rows);

  out.setFrozenRows(2);

  var txt = [
    '── 입력자 열 점검 (아무것도 바꾸지 않았습니다) ──',
    '지출 행           : ' + tot,
    'F열이 채워진 행   : ' + filled + '  (' + Math.round(filled / (tot || 1) * 100) + '%)',
    '어긋나는 행       : ' + differ + '  ' + cl_num_(differAmt) + '원',
    '',
    '「어긋난다」 = F열에 적힌 사람과 결제수단 소유자가 다르다.',
    'F열을 「쓴 사람」으로 재정의하면 이 행들의 집계가 옮겨갑니다.',
    ''
  ];
  Object.keys(pairs).sort(function (a, b) { return pairs[b].n - pairs[a].n; })
    .slice(0, 6).forEach(function (k) {
      txt.push('  ' + k + ' : ' + pairs[k].n + '건 ' + cl_num_(pairs[k].amt) + '원');
    });
  txt.push('');
  txt.push('거래내역 F열을 보는 수식 : ' + refs.length + '개' +
           (refs.length ? '  ⚠️ 비우면 깨집니다 — 시트를 보세요' : '  (비워도 안전)'));
  refs.slice(0, 5).forEach(function (r) { txt.push('  ' + r.sheet + '!' + r.a1); });
  txt.push('');
  txt.push("자세한 내역은 '" + DG_OUT + "' 시트를 보세요.");

  var s = txt.join('\n');
  Logger.log(s);
  try { SpreadsheetApp.getUi().alert(s); } catch (e) {}
  return s;
}

/* ═════════ 입력자 열 비우기 (실제로 바꿉니다) ═════════

   왜 비우나 — F열을 「쓴 사람」으로 재정의하는데, 과거 F열은 「누가 입력했나」
   뜻이라 그대로 두면 집계가 잘못 옮겨갑니다. 실측으로 138건 8,185,176원이
   공동에서 개인으로 잘못 갈 뻔했습니다(전부 경기지역화폐. 폴: 「지역화폐는 공동이 맞아」).

   비우고 나면 집계는 **지금과 완전히 똑같아집니다** — 전부 결제수단 소유자 기준.
   그 뒤 앱으로 넣는 행만 F열이 채워지고 집계가 그걸 먼저 봅니다.

   ⚠️ 돌기 직전에 수식을 다시 훑고, 하나라도 걸리면 **아무것도 안 하고 멈춥니다.**
   제가 아까 읽어본 결과를 믿지 않고 그 순간 다시 봅니다 — 그 사이에 누가
   수식을 넣었을 수도 있습니다. */
function 입력자비우기확인() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return '스프레드시트 메뉴에서 실행하세요.'; }

  var ss = SpreadsheetApp.openById(CL_SS_ID);
  var sh = ss.getSheetByName('거래내역');
  var last = sh.getLastRow();
  if (last < 2) { ui.alert('거래내역이 비었습니다.'); return; }

  var v = sh.getRange(2, 1, last - 1, 7).getValues();
  var nSpend = 0, nOther = 0;
  for (var i = 0; i < v.length; i++) {
    if (!String(v[i][5] || '').trim()) continue;
    if (String(v[i][1] || '').trim() === '지출') nSpend++; else nOther++;
  }
  var n = nSpend + nOther;
  if (!n) { ui.alert('F열이 이미 비어 있습니다.'); return; }

  /* 안전장치 — 지금 이 순간 다시 훑는다 */
  var refs = dg_scanF_(ss);
  if (refs.length) {
    ui.alert('중단했습니다',
      '거래내역 F열을 보는 수식이 ' + refs.length + '개 있습니다.\n' +
      '비우면 그 수식들이 깨집니다.\n\n' +
      refs.slice(0, 5).map(function (r) { return '  ' + r.sheet + '!' + r.a1; }).join('\n') +
      '\n\n「가계부 › 입력자 열 점검」 으로 전체 목록을 보세요.',
      ui.ButtonSet.OK);
    return;
  }

  var r = ui.alert('입력자 열 비우기 — 실제로 바꿉니다',
    'F열에 값이 있는 ' + n + '행을 비웁니다.\n' +
    '  지출 ' + nSpend + '행 · 그 외 ' + nOther + '행\n\n' +
    'F열을 보는 수식은 0개입니다 (방금 다시 확인).\n' +
    '집계는 지금과 똑같아집니다 — 전부 결제수단 소유자 기준.\n\n' +
    '거래내역 백업 시트를 먼저 만듭니다.\n\n진행할까요?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) { ui.alert('취소했습니다. 아무것도 바꾸지 않았습니다.'); return; }

  var log = [];
  var bn = '거래내역_백업_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(bn);
  log.push('백업 시트: ' + bn);

  sh.getRange(2, 6, last - 1, 1).clearContent();
  log.push('F열 비움: ' + n + '행 (지출 ' + nSpend + ' · 그 외 ' + nOther + ')');

  var p = PropertiesService.getScriptProperties();
  p.setProperty('API_VER', String(Number(p.getProperty('API_VER') || 1) + 1));
  log.push('API 캐시 버전 → ' + p.getProperty('API_VER'));
  log.push('');
  log.push('집계는 안 바뀝니다. 「가계부 › 입력자 열 점검」 으로 확인하세요');
  log.push('— 어긋나는 행이 0 이 되어야 맞습니다.');

  var s = log.join('\n');
  Logger.log(s);
  try { ui.alert(s); } catch (e) {}
  return s;
}

/* 모든 시트의 수식에서 「거래내역의 F열」 참조를 찾는다. 읽기만 한다.

   찾는 모양 — 시트 이름이 붙은 것만 본다(같은 시트 안 상대참조는 거래내역 자기 자신뿐).
     거래내역!F        거래내역!$F        '거래내역'!F
     거래내역!A:F 처럼 F 를 포함하는 범위        거래내역!A2:H 처럼 F 를 감싸는 범위
   범위형은 시작~끝 열을 실제로 펴서 F 가 들어가는지 본다 — A:H 를 놓치면 안 된다. */
function dg_scanF_(ss) {
  var TXN = /^'?거래내역'?$/;
  var out = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (name === '거래내역' || name === DG_OUT || name === CL_OUT) return;
    if (name.indexOf('거래내역_백업_') === 0) return;
    var rg = sh.getDataRange();
    if (rg.getNumRows() * rg.getNumColumns() > 200000) return;   /* 너무 크면 건너뛴다 */
    var fs = rg.getFormulas();
    for (var r = 0; r < fs.length; r++) {
      for (var c = 0; c < fs[r].length; c++) {
        var f = fs[r][c];
        if (!f || f.indexOf('거래내역') < 0) continue;
        if (!dg_hitsF_(f, TXN)) continue;
        out.push({ sheet: name, a1: sh.getRange(r + 1, c + 1).getA1Notation(),
                   f: f.slice(0, 300) });
        if (out.length >= 200) return;
      }
    }
  });
  return out;
}

function dg_hitsF_(f, TXN) {
  /* 거래내역!<범위> 를 전부 꺼내 각 범위가 F 열을 덮는지 본다 */
  var re = /('?거래내역'?)!(\$?[A-Z]{1,2})(\$?\d+)?(?:\s*:\s*(\$?[A-Z]{1,2})(\$?\d+)?)?/g;
  var m;
  while ((m = re.exec(f)) !== null) {
    if (!TXN.test(m[1])) continue;
    var a = dg_col_(m[2]);
    var b = m[4] ? dg_col_(m[4]) : a;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo <= 6 && 6 <= hi) return true;          /* F = 6번째 열 */
  }
  return false;
}

function dg_col_(s) {
  s = String(s).replace('$', '').toUpperCase();
  var n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

/* ═════════ 카드부채점검() — 긁어놓고 아직 안 나간 카드값이 얼마인가 ═════════

   폴: 「카드값 나가면 현금이 줄어드는데 어케돼?」

   확인한 것:
     · 이중집계는 없다. 카드로 긁으면 「지출」 1번, 카드값이 통장에서
       나갈 때는 「이체」다. CASH_G = { 수입:1, 지출:1 } 이라 이체는
       돈이 움직인 걸로 안 친다.
     · 대신 `부채` 시트에 **카드 미결제액이 한 줄도 없다.** 세 줄 전부
       확정된 대출이다(안심전환·토스뱅크대환·폴스타 할부).
       그래서 긁은 날부터 결제일까지는 순자산이 부풀어 보인다.

   ⚠️ 고치기 전에 잰다. 이 함수는 **읽기만** 합니다.

   재는 것 셋:
     ① 카드별 월 지출 — 얼마나 긁는가
     ② 카드대금 결제로 보이는 이체 행 — 실제로 언제 얼마가 나갔는가
     ③ ②를 ①과 맞대본다. 「전달 1일~말일 사용분」 모델이 맞는지 보려는 것.
        앱의 `apiCardDue_` 가 그 모델을 쓰고 있는데, 진짜 카드 마감일은
        따로 있을 수 있다. **맞는지 안 맞는지는 숫자로만 알 수 있다.**

   ③이 맞으면 그 모델로 부채를 얹으면 되고, 안 맞으면 계좌 시트에
   「마감일」 칸을 하나 더 받아야 합니다. 어느 쪽인지 정하는 게 이 점검입니다. */
var DG_CARD_OUT = '카드부채점검_결과';

function 카드부채점검() {
  var ss = SpreadsheetApp.openById(CL_SS_ID);
  var sh = ss.getSheetByName('거래내역');
  var last = sh.getLastRow();
  if (last < 2) return '거래내역이 비었습니다.';

  var tz = Session.getScriptTimeZone();
  var accs = (typeof accountsAll_ === 'function') ? accountsAll_() : [];

  /* 진짜 신용카드 = 종류가 「카드」이고 결제일이 있는 것.
     체크카드·간편결제·지역화폐는 결제일이 없다 — 긁는 즉시 빠지거나
     선불이라 갚을 게 안 남는다. 그래서 부채가 아니다. */
  var cards = accs.filter(function (a) {
    return a.type === '카드' && a.due >= 1 && a.due <= 31;
  });
  if (!cards.length) return '결제일이 있는 카드가 계좌 시트에 없습니다.';

  var isCard = {}, dueOf = {}, fromOf = {}, ownOf = {};
  cards.forEach(function (c) {
    isCard[c.name] = 1; dueOf[c.name] = c.due;
    fromOf[c.name] = c.from || ''; ownOf[c.name] = c.owner || '공동';
  });

  var v = sh.getRange(2, 1, last - 1, 8).getValues();

  var spend = {};       /* card → ym → 금액 */
  var payRows = [];     /* 카드대금 결제로 보이는 이체 행 */
  var today = new Date();
  var todayYmd = Utilities.formatDate(today, tz, 'yyyy-MM-dd');

  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date)) continue;
    var ymd = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (ymd > todayYmd) continue;                  /* 미래 행은 뺀다 */
    var ym  = Utilities.formatDate(d, tz, 'yyyy-MM');
    var gub = String(v[i][1] || '').trim();
    var desc= String(v[i][3] || '');
    var pay = String(v[i][4] || '').trim();
    var amt = Number(v[i][6]) || 0;

    if (gub === '지출' && isCard[pay]) {
      var S = spend[pay] || (spend[pay] = {});
      S[ym] = (S[ym] || 0) + amt;
      continue;
    }

    /* 카드대금 결제로 보이는 이체.
       내용에 카드 표시명이 들어 있으면 후보로 본다. 여러 카드가 걸리면
       **고르지 않고 둘 다 적는다** — 자동으로 고르는 순간 틀려도 안 보인다. */
    if (gub === '이체' || gub === '') {
      var hit = [];
      cards.forEach(function (c) {
        if (desc.indexOf(c.name) >= 0) hit.push(c.name);
      });
      if (!hit.length && /카드/.test(desc) && /(결제|대금)/.test(desc)) hit.push('(카드 이름 없음)');
      if (hit.length) {
        payRows.push({ ymd: ymd, ym: ym, desc: desc, pay: pay, amt: amt,
                       hit: hit, gub: gub });
      }
    }
  }

  /* ── 결과 시트 ── */
  var out = ss.getSheetByName(DG_CARD_OUT);
  if (out) out.clear(); else out = ss.insertSheet(DG_CARD_OUT);
  var R = [], W = 8;
  function row() {
    var a = Array.prototype.slice.call(arguments);
    while (a.length < W) a.push('');
    R.push(a.slice(0, W));
  }

  row('── ① 결제일이 있는 카드 ──');
  row('표시명', '소유자', '결제일', '출금계좌', '', '', '', '');
  cards.forEach(function (c) {
    row(c.name, c.owner, c.due + '일', c.from || '(없음)');
  });
  row();

  /* 최근 13개월 */
  var months = {};
  Object.keys(spend).forEach(function (c) {
    Object.keys(spend[c]).forEach(function (m) { months[m] = 1; });
  });
  var ml = Object.keys(months).sort().reverse().slice(0, 13).reverse();

  row('── ② 카드별 월 지출 ──');
  var head = ['월'];
  cards.forEach(function (c) { head.push(c.name); });
  head.push('합계');
  W = Math.max(W, head.length);
  row.apply(null, head);
  ml.forEach(function (m) {
    var line = [m], sum = 0;
    cards.forEach(function (c) {
      var x = (spend[c.name] || {})[m] || 0;
      line.push(x); sum += x;
    });
    line.push(sum);
    row.apply(null, line);
  });
  row();

  /* ③ 결제 이체를 직전달 지출과 맞대본다 */
  row('── ③ 카드대금 결제로 보이는 이체 ──');
  row('「직전달 지출」과 금액이 맞으면 「전달 1일~말일」 모델이 맞다는 뜻입니다.',
      '많이 어긋나면 카드마다 마감일이 따로 있는 것이므로 계좌 시트에 칸을 하나 더 받아야 합니다.');
  row('날짜', '내용', '출금 결제수단', '금액', '걸린 카드', '직전달 그 카드 지출', '차이', '차이%');
  payRows.sort(function (a, b) { return a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0; });
  payRows.slice(0, 60).forEach(function (p) {
    var one = p.hit.length === 1 ? p.hit[0] : '';
    var prev = '', diff = '', pctv = '';
    if (one && spend[one]) {
      var y = Number(p.ym.slice(0, 4)), mo = Number(p.ym.slice(5, 7));
      var pm = new Date(y, mo - 2, 1);
      var pym = Utilities.formatDate(pm, tz, 'yyyy-MM');
      prev = spend[one][pym] || 0;
      diff = p.amt - prev;
      pctv = prev ? Math.round((p.amt - prev) / prev * 1000) / 10 + '%' : '';
    }
    row(p.ymd, p.desc.slice(0, 60), p.pay, p.amt, p.hit.join(' · '), prev, diff, pctv);
  });
  if (!payRows.length) {
    row('(하나도 못 찾았습니다)', '내용에 카드 이름이 안 들어가 있다는 뜻입니다. ' +
        '그러면 「지출 − 결제」로는 잔액을 못 구하고 청구주기로만 추정해야 합니다.');
  } else if (payRows.length > 60) {
    row('…', '최근 60건만 보였습니다. 전체 ' + payRows.length + '건.');
  }
  row();

  /* ④ 지금 미결제 추정 — 「전달 1일~말일」 모델 기준 */
  row('── ④ 지금 미결제 추정 (전달 1일~말일 모델) ──');
  row('결제일이 아직 안 지난 청구분을 전부 더한 것입니다. ③이 맞아야 이 숫자를 믿을 수 있습니다.');
  row('카드', '청구월', '결제 예정일', '금액', '비고', '', '', '');
  var sec4 = R.length + 1;        /* ④ 표의 첫 데이터 행 (1-기준) */
  var day = today.getDate(), yy = today.getFullYear(), mm = today.getMonth();
  var grand = 0;
  cards.forEach(function (c) {
    var k = day <= c.due ? 0 : 1;      /* 오늘이 결제일을 지났으면 다음 달부터 */
    for (var j = 0; j < 2; j++) {
      var pd = new Date(yy, mm + k + j, c.due);
      var bl = new Date(pd.getFullYear(), pd.getMonth() - 1, 1);
      var bym = Utilities.formatDate(bl, tz, 'yyyy-MM');
      var amt = (spend[c.name] || {})[bym] || 0;
      if (!amt) continue;
      var note = bym >= Utilities.formatDate(today, tz, 'yyyy-MM')
        ? '아직 쌓이는 중 (' + Utilities.formatDate(today, tz, 'M월 d일') + '까지)' : '';
      row(c.name, bym, Utilities.formatDate(pd, tz, 'yyyy-MM-dd'), amt, note);
      grand += amt;
    }
  });
  row('합계', '', '', grand, '← 부채 시트에 없는 금액');
  var sec4n = R.length - sec4 + 1;
  row();

  /* ⑤ 이중집계 위험 */
  row('── ⑤ 조심할 것 ──');
  row('· 삼성카드 메모에 「폴스타 할부」가 있습니다. 부채 시트에는 폴스타 자동차 할부');
  row('  50,285,721 원이 이미 통째로 잡혀 있습니다. 삼성카드 월 지출에 할부금이');
  row('  섞여 있으면 그 달치가 **두 번** 잡힙니다. ②에서 삼성카드 금액이 다른 달보다');
  row('  1,226,481 원(월상환액)만큼 크면 그게 원인입니다.');
  row('· 경기지역화폐·체크카드·간편결제는 결제일이 없어 여기서 뺐습니다.');
  row('  선불이거나 즉시 출금이라 갚을 게 안 남습니다.');
  row('· 이 함수는 아무것도 안 바꿉니다.');

  /* ⚠️ 서식을 **값보다 먼저** 넣습니다. 시트는 setValues 하는 순간 글자를
     보고 날짜인지 숫자인지 스스로 정해버립니다. 그래서 첫 판에서 ④의
     청구월 '2026-07' 이 날짜로 삼켜지고, 그 위에 「#,##0」이 덮여
     **46,204** 로 찍혔습니다. 서식을 먼저 '@'(글자)로 박아두면 안 삼킵니다.
     — 같은 이유로 예전에 788,876 이 4059-11-12 로 렌더된 적이 있습니다. */
  out.getRange(1, 2, R.length, Math.min(6, W - 1)).setNumberFormat('#,##0');
  if (sec4n > 0) out.getRange(sec4, 2, sec4n, 2).setNumberFormat('@');   /* 청구월·결제예정일 */

  out.getRange(1, 1, R.length, W).setValues(R.map(function (r) {
    while (r.length < W) r.push('');
    return r.slice(0, W);
  }));
  [95, 260, 130, 110, 150, 150, 110, 80].forEach(function (w, i) {
    if (i < W) out.setColumnWidth(i + 1, w);
  });
  out.setFrozenRows(1);
  ss.setActiveSheet(out);

  var msg = '카드부채점검 끝. 「' + DG_CARD_OUT + '」 시트를 보세요.\n\n' +
            '지금 미결제 추정: ' + grand.toLocaleString() + '원\n' +
            '카드대금 결제로 보이는 이체: ' + payRows.length + '건';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}
