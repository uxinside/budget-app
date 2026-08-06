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
  txt.push("자세한 내역은 '" + DG_OUT + "' 시트를 보세요.");

  var s = txt.join('\n');
  Logger.log(s);
  try { SpreadsheetApp.getUi().alert(s); } catch (e) {}
  return s;
}
