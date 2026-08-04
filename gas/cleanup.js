/* ═══════════════════════════════════════════════════════════
   거래내역 정리 — 점검(dry-run) / 적용

   정리점검()  아무것도 바꾸지 않습니다. '정리점검_결과' 시트에 계획만 씁니다.
   정리적용()  점검과 똑같은 판정으로 실제 반영합니다. 백업 시트를 먼저 만듭니다.

   diag.js 의 정리실행() 을 대체합니다 (정리실행은 dry-run이 없어 위험).
   ═══════════════════════════════════════════════════════════ */

var CL_SS_ID = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';
var CL_TX    = '거래내역';
var CL_OUT   = '정리점검_결과';

/* A) 집계에서 뺄 건 — 날짜 + 내용 부분일치.
   ※ 지금은 일회성 하드코딩이다. 4단계에서 시트 기반 '제외규칙'으로 승격 예정. */
var CL_EXCLUDE = [
  { ymd: '2026-08-02', has: '판교매일식당', why: '가족계좌' },
  { ymd: '2026-08-02', has: '헤이븐커피',   why: '가족계좌' }
];

/* 간편결제 원장 — 계좌 원장과 이중으로 잡히는 쪽. 중복 시 이쪽을 버린다. */
var CL_PAY_LAYER = ['네이버페이', '카카오페이'];

/* ───────── 유틸 ───────── */
function cl_ss_() { return SpreadsheetApp.openById(CL_SS_ID); }
function cl_tz_() { return Session.getScriptTimeZone(); }
function cl_ymd_(d) { return Utilities.formatDate(d, cl_tz_(), 'yyyy-MM-dd'); }
function cl_nk_(s) {
  return String(s || '').replace(/\([^)]*\)/g, '')
    .replace(/[\s()\[\]·.\-_,*\/]/g, '').toUpperCase().slice(0, 10);
}
function cl_shift_(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
  var z = function (x) { return (x < 10 ? '0' : '') + x; };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
function cl_isLayer_(pay) { return CL_PAY_LAYER.indexOf(pay) >= 0; }
function cl_num_(n) { return (Number(n) || 0).toLocaleString('en-US'); }

/* ───────── 읽기 ───────── */
function cl_read_() {
  var sh = cl_ss_().getSheetByName(CL_TX);
  var last = sh.getLastRow();
  var rows = [];
  if (last < 2) return rows;
  var v = sh.getRange(2, 1, last - 1, 8).getValues();
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date)) continue;
    var ymd = cl_ymd_(d);
    var amt = Number(v[i][6]) || 0;
    rows.push({
      row:  i + 2,
      ymd:  ymd,
      ym:   ymd.slice(0, 7),
      gub:  String(v[i][1] || '').trim(),
      cat:  String(v[i][2] || '').trim(),
      desc: String(v[i][3] || ''),
      pay:  String(v[i][4] || '').trim(),
      amt:  amt,
      amt0: amt
    });
  }
  return rows;
}

/* ───────── 판정 (읽기만 한다) ───────── */
function cl_plan_() {
  var rows = cl_read_();
  var del = {}, why = {}, newAmt = {};
  var bGroups = [], cSame = [], cNear = [];

  /* A) 제외 규칙 */
  rows.forEach(function (r) {
    for (var i = 0; i < CL_EXCLUDE.length; i++) {
      var x = CL_EXCLUDE[i];
      if (r.ymd === x.ymd && r.desc.indexOf(x.has) >= 0) {
        del[r.row] = 1;
        why[r.row] = 'A · ' + x.why + ' 제외';
        return;
      }
    }
  });

  /* B) 간편결제 분할 결제 병합 — 같은 날 · 같은 결제수단 · 같은 가맹점 */
  var g = {};
  rows.forEach(function (r) {
    if (r.gub !== '지출' || del[r.row] || !cl_isLayer_(r.pay)) return;
    var k = r.ymd + '|' + r.pay + '|' + cl_nk_(r.desc);
    (g[k] = g[k] || []).push(r);
  });
  Object.keys(g).forEach(function (k) {
    var arr = g[k];
    if (arr.length < 2) return;
    arr.sort(function (x, y) { return y.amt - x.amt; });
    var sum = 0;
    arr.forEach(function (x) { sum += x.amt; });
    newAmt[arr[0].row] = sum;
    arr[0].amt = sum;                       // 이후 C) 판정은 병합된 금액으로
    for (var j = 1; j < arr.length; j++) {
      del[arr[j].row] = 1;
      why[arr[j].row] = 'B · 분할결제 병합 → #' + arr[0].row + ' 로 합침';
    }
    bGroups.push({ keep: arr[0], drop: arr.slice(1), sum: sum });
  });

  /* C) 이중집계 — 같은 날 · 같은 금액 · 같은 가맹점, 간편결제 vs 계좌 */
  var byK = {};
  rows.forEach(function (r) {
    if (r.gub !== '지출' || del[r.row]) return;
    var k = r.ymd + '|' + r.amt + '|' + cl_nk_(r.desc);
    (byK[k] = byK[k] || []).push(r);
  });
  Object.keys(byK).forEach(function (k) {
    var arr = byK[k];
    if (arr.length < 2) return;
    var lay = arr.filter(function (x) { return cl_isLayer_(x.pay); });
    var acc = arr.filter(function (x) { return !cl_isLayer_(x.pay); });
    if (!lay.length || !acc.length) return;
    lay.forEach(function (x) {
      del[x.row] = 1;
      why[x.row] = 'C · 이중집계 → #' + acc[0].row + ' (' + acc[0].pay + ') 유지';
      cSame.push({ drop: x, keep: acc[0] });
    });
  });

  /* C2) ±1일 어긋난 이중집계 — 후보만 보고하고 삭제하지 않는다 */
  var idx = {};
  rows.forEach(function (r) {
    if (r.gub !== '지출' || del[r.row]) return;
    var k = r.amt + '|' + cl_nk_(r.desc);
    (idx[k] = idx[k] || []).push(r);
  });
  Object.keys(idx).forEach(function (k) {
    var arr = idx[k];
    if (arr.length < 2) return;
    for (var i = 0; i < arr.length; i++) {
      for (var j = i + 1; j < arr.length; j++) {
        var a = arr[i], b = arr[j];
        if (a.ymd === b.ymd) continue;
        if (cl_shift_(a.ymd, 1) !== b.ymd && cl_shift_(b.ymd, 1) !== a.ymd) continue;
        var la = cl_isLayer_(a.pay), lb = cl_isLayer_(b.pay);
        if (la === lb) continue;
        cNear.push({ drop: la ? a : b, keep: la ? b : a });
      }
    }
  });

  return { rows: rows, del: del, why: why, newAmt: newAmt,
           bGroups: bGroups, cSame: cSame, cNear: cNear };
}

/* ───────── 월별 전/후 집계 ───────── */
function cl_summary_(P) {
  var before = {}, after = {};
  P.rows.forEach(function (r) {
    if (r.gub !== '지출') return;
    var b = before[r.ym] || (before[r.ym] = { n: 0, sum: 0 });
    b.n++; b.sum += r.amt0;
    if (P.del[r.row]) return;
    var a = after[r.ym] || (after[r.ym] = { n: 0, sum: 0 });
    a.n++; a.sum += (P.newAmt[r.row] != null ? P.newAmt[r.row] : r.amt0);
  });
  return { before: before, after: after };
}

/* ═════════ 점검 (dry-run) ═════════ */
function 정리점검() {
  var P = cl_plan_();
  var S = cl_summary_(P);
  var ss = cl_ss_();
  var sh = ss.getSheetByName(CL_OUT);
  if (sh) sh.clear(); else sh = ss.insertSheet(CL_OUT);

  var byRow = {};
  P.rows.forEach(function (r) { byRow[r.row] = r; });

  var out = [];
  out.push(['구분', '행', '날짜', '내용', '결제수단', '금액', '판정']);

  Object.keys(P.del).map(Number).sort(function (a, b) { return a - b; })
    .forEach(function (n) {
      var r = byRow[n];
      out.push(['삭제', n, r.ymd, r.desc, r.pay, r.amt0, P.why[n]]);
    });

  Object.keys(P.newAmt).map(Number).forEach(function (n) {
    if (P.del[n]) return;
    var r = byRow[n];
    out.push(['금액변경', n, r.ymd, r.desc, r.pay, P.newAmt[n],
              'B · 병합 합계 (원래 ' + cl_num_(r.amt0) + ')']);
  });

  P.cNear.forEach(function (c) {
    out.push(['후보(미적용)', c.drop.row, c.drop.ymd, c.drop.desc, c.drop.pay, c.drop.amt0,
              '±1일 이중집계 의심 → #' + c.keep.row + ' ' + c.keep.ymd + ' ' + c.keep.pay]);
  });

  var months = {};
  Object.keys(S.before).forEach(function (m) { months[m] = 1; });
  var ml = Object.keys(months).sort().reverse().slice(0, 6);
  out.push([]);
  out.push(['── 월별 지출 전/후 ──', '', '', '', '', '', '']);
  out.push(['월', '전 건수', '전 금액', '후 건수', '후 금액', '차이', '']);
  ml.forEach(function (m) {
    var b = S.before[m] || { n: 0, sum: 0 };
    var a = S.after[m]  || { n: 0, sum: 0 };
    out.push([m, b.n, b.sum, a.n, a.sum, a.sum - b.sum, '']);
  });

  sh.getRange(1, 1, out.length, 7).setValues(out.map(function (r) {
    while (r.length < 7) r.push('');
    return r;
  }));
  sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  [90, 55, 95, 240, 120, 100, 320].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var nDel = Object.keys(P.del).length;
  var nAmt = Object.keys(P.newAmt).filter(function (n) { return !P.del[n]; }).length;
  var txt = [
    '── 정리점검 (아무것도 바꾸지 않았습니다) ──',
    '삭제 예정      : ' + nDel + '행',
    '  A 제외규칙   : ' + P.rows.filter(function (r) { return P.del[r.row] && P.why[r.row].indexOf('A ·') === 0; }).length + '행',
    '  B 분할결제   : ' + P.bGroups.length + '그룹 → ' + P.bGroups.reduce(function (a, g) { return a + g.drop.length; }, 0) + '행 삭제 / ' + nAmt + '행 금액변경',
    '  C 이중집계   : ' + P.cSame.length + '행',
    '±1일 후보(미적용): ' + P.cNear.length + '행',
    ''
  ];
  ml.forEach(function (m) {
    var b = S.before[m] || { n: 0, sum: 0 };
    var a = S.after[m]  || { n: 0, sum: 0 };
    txt.push(m + '  ' + b.n + '건 ' + cl_num_(b.sum) + '  →  ' + a.n + '건 ' + cl_num_(a.sum));
  });
  txt.push('');
  txt.push("자세한 내역은 '" + CL_OUT + "' 시트를 보세요.");

  var s = txt.join('\n');
  Logger.log(s);
  try { SpreadsheetApp.getUi().alert(s); } catch (e) {}
  return s;
}

/* ═════════ 적용 (실제로 바꿉니다) ═════════ */
function 정리적용() {
  var ss = cl_ss_();
  var sh = ss.getSheetByName(CL_TX);
  var log = [];

  var bn = '거래내역_백업_' + Utilities.formatDate(new Date(), cl_tz_(), 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(bn);
  log.push('백업 시트: ' + bn);

  var P = cl_plan_();
  var S = cl_summary_(P);

  var na = 0;
  Object.keys(P.newAmt).map(Number).forEach(function (n) {
    if (P.del[n]) return;
    sh.getRange(n, 7).setValue(P.newAmt[n]);
    na++;
  });
  log.push('금액 갱신: ' + na + '행');

  var ds = Object.keys(P.del).map(Number).sort(function (a, b) { return b - a; });
  var i = 0, blocks = 0;
  while (i < ds.length) {
    var end = ds[i], cnt = 1;
    while (i + cnt < ds.length && ds[i + cnt] === end - cnt) cnt++;
    sh.deleteRows(end - cnt + 1, cnt);
    blocks++; i += cnt;
  }
  log.push('삭제: ' + ds.length + '행 (' + blocks + '블록)');
  log.push('남은 행: ' + (sh.getLastRow() - 1));

  var p = PropertiesService.getScriptProperties();
  p.setProperty('API_VER', String(Number(p.getProperty('API_VER') || 1) + 1));
  log.push('API 캐시 버전 → ' + p.getProperty('API_VER'));

  Object.keys(S.after).sort().reverse().slice(0, 3).forEach(function (m) {
    var a = S.after[m];
    log.push(m + ' 결과: ' + a.n + '건 ' + cl_num_(a.sum));
  });

  var s = log.join('\n');
  Logger.log(s);
  try { SpreadsheetApp.getUi().alert(s); } catch (e) {}
  return s;
}
