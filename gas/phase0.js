/* Phase 0 — 데이터 기반 작업
   1) 거래내역 J(낭비) · K(사용처) 열 추가
   2) 사용처 시트 신설 + 기존 거래내역에서 시딩
   3) 자산추이 시트 신설 + 2025-08~2026-07 역산 추정
   4) 매월 1일 자산·부채 스냅샷 트리거 설치
   한 번만 실행하면 됩니다. 여러 번 실행해도 안전합니다. */

var P0_SS = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';

function Phase0_실행() {
  var ss = SpreadsheetApp.openById(P0_SS);
  var log = [];
  log.push('1) ' + p0_txCols_(ss));
  log.push('2) ' + p0_merchants_(ss));
  log.push('3) ' + p0_assetTrend_(ss));
  log.push('4) ' + p0_trigger_());
  var msg = log.join('\n');
  Logger.log(msg);
  return msg;
}

/* ───────── 1. 거래내역 J·K 열 ───────── */
function p0_txCols_(ss) {
  var sh = ss.getSheetByName('거래내역');
  if (sh.getMaxColumns() < 11) sh.insertColumnsAfter(sh.getMaxColumns(), 11 - sh.getMaxColumns());
  var h = sh.getRange(1, 10, 1, 2).getValues()[0];
  var done = [];
  if (String(h[0]).trim() !== '낭비') { sh.getRange(1, 10).setValue('낭비'); done.push('J=낭비'); }
  if (String(h[1]).trim() !== '사용처') { sh.getRange(1, 11).setValue('사용처'); done.push('K=사용처'); }
  sh.getRange(1, 10, 1, 2).setFontWeight('bold');
  return done.length ? ('열 추가 — ' + done.join(', ')) : '열 이미 있음 (건너뜀)';
}

/* ───────── 2. 사용처 시트 ───────── */
function p0_key_(s) {
  return String(s || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[\s()\[\]·.\-_,*\/]/g, '')
    .toUpperCase().slice(0, 12);
}

function p0_merchants_(ss) {
  var tx = ss.getSheetByName('거래내역');
  var last = tx.getLastRow();
  if (last < 2) return '거래내역이 비어 있습니다.';
  var v = tx.getRange(2, 2, last - 1, 3).getValues();   // B구분 C대분류 D내용

  var m = {};
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() !== '지출') continue;
    var raw = String(v[i][2] || '').trim();
    if (!raw || raw.length < 2) continue;
    var k = p0_key_(raw);
    if (k.length < 2) continue;
    if (!m[k]) m[k] = { n: 0, names: {}, cats: {} };
    m[k].n++;
    m[k].names[raw] = (m[k].names[raw] || 0) + 1;
    var c = String(v[i][1] || '').trim();
    if (c) m[k].cats[c] = (m[k].cats[c] || 0) + 1;
  }

  function top(o) {
    var best = '', bn = -1;
    for (var x in o) if (o[x] > bn) { bn = o[x]; best = x; }
    return best;
  }

  var arr = [];
  for (var k in m) {
    if (m[k].n < 3) continue;
    arr.push({ name: top(m[k].names), cat: top(m[k].cats), n: m[k].n });
  }
  arr.sort(function (a, b) { return b.n - a.n; });
  arr = arr.slice(0, 80);
  if (!arr.length) return '사용처 후보를 찾지 못했습니다.';

  var sh = ss.getSheetByName('사용처');
  var keep = {};
  if (sh) {
    var ln = sh.getLastRow();
    if (ln >= 5) sh.getRange(5, 1, ln - 4, 4).getValues().forEach(function (r) {
      if (r[0]) keep[String(r[0]).trim()] = { cat: r[1], memo: r[2], hide: r[3] };
    });
    ss.deleteSheet(sh);
  }
  sh = ss.insertSheet('사용처', ss.getSheetByName('계좌').getIndex());
  sh.setHiddenGridlines(true);
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 130); sh.setColumnWidth(3, 190);
  sh.setColumnWidth(4, 70); sh.setColumnWidth(5, 90);

  sh.getRange('A1').setValue('사용처 (가게)').setFontSize(16).setFontWeight('bold')
    .setFontColor('#1F3A5F');
  sh.getRange('A2').setValue('입력 화면의 "어디에" 칩 목록입니다. 숨김에 Y를 넣으면 칩에서 빠집니다. 사용횟수는 자동입니다.')
    .setFontSize(9).setFontColor('#94A3B8').setFontStyle('italic');
  sh.getRange(4, 1, 1, 5).setValues([['사용처', '기본 대분류', '기본 내용', '숨김', '사용횟수']])
    .setBackground('#1F3A5F').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');

  var rows = arr.map(function (o) {
    var k = keep[o.name] || {};
    return [o.name, k.cat || o.cat, k.memo || o.name, k.hide || '', o.n];
  });
  sh.getRange(5, 1, rows.length, 5).setValues(rows);
  sh.getRange(5, 5, rows.length, 1).setNumberFormat('#,##0').setHorizontalAlignment('right');
  sh.getRange(5, 4, rows.length, 1).setHorizontalAlignment('center');
  sh.setFrozenRows(4);

  return '사용처 ' + rows.length + '개 시딩 (기존 수정값 ' + Object.keys(keep).length + '개 보존) — 1위 '
    + arr[0].name + ' ' + arr[0].n + '회';
}

/* ───────── 3. 자산추이 (역산 추정) ─────────
   순자산(m-1) = 순자산(m) - (수입(m) - 지출(m))
   부채(m-1)   = 부채(m) + 부채상환(m)
   자산(m-1)   = 순자산(m-1) + 부채(m-1)
   ※ 주식·부동산 시세 변동은 반영하지 않으므로 '추정'입니다. */
function p0_assetTrend_(ss) {
  var ws = ss.getSheetByName('월별요약');
  var v = ws.getRange(5, 1, 30, 6).getValues();          // A월 B수입 C지출 D저축 E부채상환 F순현금
  var rowsIn = [];
  for (var i = 0; i < v.length; i++) {
    var ym = v[i][0];
    if (!ym) continue;
    var s = (ym instanceof Date)
      ? Utilities.formatDate(ym, Session.getScriptTimeZone(), 'yyyy-MM')
      : String(ym).trim();
    var inc = Number(v[i][1]) || 0, sp = Number(v[i][2]) || 0, rp = Number(v[i][4]) || 0;
    if (inc === 0 && sp === 0) continue;
    rowsIn.push({ ym: s, inc: inc, sp: sp, rp: rp });
  }
  if (!rowsIn.length) return '월별요약에서 데이터가 있는 달을 찾지 못했습니다.';
  rowsIn.sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });

  // 실측 기준월 = 자산 시트의 최신 기준월
  var av = ss.getSheetByName('자산').getRange(5, 1, 300, 6).getValues();
  var lv = ss.getSheetByName('부채').getRange(5, 1, 300, 5).getValues();
  function ymOf(x) {
    return (x instanceof Date)
      ? Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM') : String(x).trim();
  }
  var base = '', asset0 = 0, debt0 = 0;
  av.forEach(function (r) { if (r[0]) { var s = ymOf(r[0]); if (s > base) base = s; } });
  if (!base) return '자산 시트에 기준월이 없습니다.';
  av.forEach(function (r) { if (r[0] && ymOf(r[0]) === base) asset0 += Number(r[5]) || 0; });
  lv.forEach(function (r) { if (r[0] && ymOf(r[0]) === base) debt0 += Number(r[4]) || 0; });

  var byYm = {};
  rowsIn.forEach(function (r) { byYm[r.ym] = r; });

  var idx = -1;
  for (var j = 0; j < rowsIn.length; j++) if (rowsIn[j].ym === base) idx = j;
  if (idx < 0) { rowsIn.push({ ym: base, inc: 0, sp: 0, rp: 0 }); idx = rowsIn.length - 1; }

  var out = [];
  out[idx] = { ym: base, asset: asset0, debt: debt0, net: asset0 - debt0, kind: '실측' };
  for (var k = idx - 1; k >= 0; k--) {
    var nx = out[k + 1], cur = rowsIn[k + 1];
    var net = nx.net - ((cur.inc || 0) - (cur.sp || 0));
    var debt = nx.debt + (cur.rp || 0);
    out[k] = { ym: rowsIn[k].ym, asset: net + debt, debt: debt, net: net, kind: '추정' };
  }
  out = out.filter(Boolean);

  var sh = ss.getSheetByName('자산추이');
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet('자산추이', ss.getSheetByName('재무상태표').getIndex());
  sh.setHiddenGridlines(true);
  sh.setColumnWidth(1, 100);
  [2, 3, 4].forEach(function (c) { sh.setColumnWidth(c, 140); });
  sh.setColumnWidth(5, 80);

  sh.getRange('A1').setValue('자산 · 부채 월별 추이').setFontSize(16).setFontWeight('bold')
    .setFontColor('#1F3A5F');
  sh.getRange('A2').setValue('실측은 자산·부채 시트의 기준월 스냅샷입니다. 추정은 수입−지출과 부채상환액으로 역산한 값이며 주식·부동산 시세 변동은 반영하지 않습니다.')
    .setFontSize(9).setFontColor('#94A3B8').setFontStyle('italic');
  sh.getRange(4, 1, 1, 5).setValues([['기준월', '자산', '부채', '순자산', '구분']])
    .setBackground('#1F3A5F').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');

  var body = out.map(function (o) { return [o.ym, o.asset, o.debt, o.net, o.kind]; });
  sh.getRange(5, 1, body.length, 5).setValues(body);
  sh.getRange(5, 2, body.length, 3).setNumberFormat('#,##0');
  sh.getRange(5, 1, body.length, 1).setHorizontalAlignment('center');
  sh.getRange(5, 5, body.length, 1).setHorizontalAlignment('center').setFontSize(10);
  for (var b = 0; b < body.length; b++) {
    if (body[b][4] === '추정') sh.getRange(5 + b, 1, 1, 5).setFontColor('#94A3B8');
  }
  sh.setFrozenRows(4);

  var chart = sh.newChart().asColumnChart()
    .addRange(sh.getRange(5, 1, body.length, 1))
    .addRange(sh.getRange(5, 4, body.length, 1))
    .addRange(sh.getRange(5, 3, body.length, 1))
    .setNumHeaders(0).setStacked()
    .setOption('title', '순자산 · 부채 (기둥 전체 = 자산)')
    .setOption('colors', ['#2E8B78', '#E0A79A'])
    .setOption('legend', { position: 'bottom' })
    .setOption('vAxis', { format: '#,##0' })
    .setOption('width', 620).setOption('height', 300)
    .setPosition(5, 7, 6, 0).build();
  sh.insertChart(chart);

  return '자산추이 ' + body.length + '개월 (실측 ' + base + ' 1개 + 추정 ' + (body.length - 1)
    + '개) — ' + body[0][0] + ' 순자산 ' + Math.round(body[0][3]).toLocaleString()
    + ' → ' + base + ' ' + Math.round(asset0 - debt0).toLocaleString();
}

/* ───────── 4. 매월 1일 스냅샷 트리거 ───────── */
function p0_trigger_() {
  var got = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === '월스냅샷';
  });
  if (got) return '트리거 이미 있음 (건너뜀)';
  ScriptApp.newTrigger('월스냅샷').timeBased().onMonthDay(1).atHour(9).create();
  return '트리거 설치 — 매월 1일 오전 9시 월스냅샷()';
}

/* 매월 1일 실행: 자산·부채의 최신 기준월 행을 이번 달로 복사하고 자산추이에 실측 1행 추가 */
function 월스냅샷() {
  var ss = SpreadsheetApp.openById(P0_SS);
  var tz = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  function ymOf(x) {
    return (x instanceof Date) ? Utilities.formatDate(x, tz, 'yyyy-MM') : String(x).trim();
  }
  var tot = { asset: 0, debt: 0 };

  [['자산', 6], ['부채', 5]].forEach(function (pair) {
    var sh = ss.getSheetByName(pair[0]);
    var w = sh.getLastColumn();
    var n = sh.getLastRow() - 4;
    if (n < 1) return;
    var v = sh.getRange(5, 1, n, w).getValues();
    var latest = '';
    v.forEach(function (r) { if (r[0]) { var s = ymOf(r[0]); if (s > latest) latest = s; } });
    if (!latest || latest === now) return;
    var src = v.filter(function (r) { return r[0] && ymOf(r[0]) === latest; });
    if (!src.length) return;
    var copy = src.map(function (r) { var c = r.slice(); c[0] = now; return c; });
    sh.getRange(sh.getLastRow() + 1, 1, copy.length, w).setValues(copy);
  });

  var av = ss.getSheetByName('자산').getRange(5, 1, 400, 6).getValues();
  var lv = ss.getSheetByName('부채').getRange(5, 1, 400, 5).getValues();
  av.forEach(function (r) { if (r[0] && ymOf(r[0]) === now) tot.asset += Number(r[5]) || 0; });
  lv.forEach(function (r) { if (r[0] && ymOf(r[0]) === now) tot.debt += Number(r[4]) || 0; });

  var tr = ss.getSheetByName('자산추이');
  if (tr) {
    var tn = tr.getLastRow();
    var exists = false;
    if (tn >= 5) tr.getRange(5, 1, tn - 4, 1).getValues().forEach(function (r) {
      if (String(r[0]).trim() === now) exists = true;
    });
    if (!exists) {
      tr.getRange(tn + 1, 1, 1, 5)
        .setValues([[now, tot.asset, tot.debt, tot.asset - tot.debt, '실측']]);
      tr.getRange(tn + 1, 2, 1, 3).setNumberFormat('#,##0');
    }
  }
  return now + ' 스냅샷 완료';
}
