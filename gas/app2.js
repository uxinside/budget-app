/* 웹앱 보강 — 계좌 목록 + 거래내역 조회 */
var A2_SS = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';
function a2ss_() { return SpreadsheetApp.openById(A2_SS); }

function accounts_() {
  var s = a2ss_().getSheetByName('계좌');
  if (!s) return null;
  var v = s.getRange(5, 1, 80, 6).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    var u = String(v[i][5] || '').trim();
    if (u && u !== '사용') continue;
    out.push({ name: String(v[i][0]).trim(), bank: String(v[i][1] || '').trim(),
               no: String(v[i][2] || '').trim(), owner: String(v[i][3] || '').trim(),
               type: String(v[i][4] || '').trim() });
  }
  return out.length ? out : null;
}
function listAccounts() { return accounts_() || []; }

function listTx(o) {
  o = o || {};
  var n = o.n || 100;
  var s = a2ss_().getSheetByName('거래내역');
  var last = s.getLastRow();
  if (last < 2) return [];
  var rows = Math.min(last - 1, 3000);
  var start = last - rows + 1;
  var v = s.getRange(start, 1, rows, 9).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0 && out.length < n; i--) {
    var d = v[i][0];
    if (!(d instanceof Date)) continue;
    var ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    if (o.ym && o.ym !== ym) continue;
    out.push({ row: start + i,
               date: Utilities.formatDate(d, 'Asia/Seoul', 'MM-dd'),
               gubun: String(v[i][1] || ''), cat: String(v[i][2] || ''),
               memo: String(v[i][3] || ''), pay: String(v[i][4] || ''),
               user: String(v[i][5] || ''), amt: Number(v[i][6]) || 0 });
  }
  return out;
}

function txMonths() {
  var s = a2ss_().getSheetByName('거래내역');
  var last = s.getLastRow();
  if (last < 2) return [];
  var v = s.getRange(2, 1, last - 1, 1).getValues();
  var m = {};
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (d instanceof Date) m[d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2)] = 1;
  }
  return Object.keys(m).sort().reverse();
}

/* ── 빠른 요약 (월별요약/월별집계에서 읽음) + 번다운 ── */
function fmtYm_(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

function summary2_() {
  var ss = a2ss_();
  var sm = ss.getSheetByName('월별요약');
  var v = sm.getRange(5, 1, 30, 13).getValues();
  var ms = [];
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!(d instanceof Date)) continue;
    ms.push({ ym: fmtYm_(d), income: Number(v[i][1]) || 0, spend: Number(v[i][2]) || 0,
              net: Number(v[i][5]) || 0, fixed: Number(v[i][7]) || 0,
              asset: Number(v[i][9]) || 0, liab: Number(v[i][10]) || 0,
              worth: Number(v[i][11]) || 0, delta: Number(v[i][12]) || 0 });
  }
  var now = new Date();
  var ym = fmtYm_(now);
  var ci = -1;
  for (var k = 0; k < ms.length; k++) if (ms[k].ym === ym) ci = k;
  if (ci < 0) { for (var k2 = 0; k2 < ms.length; k2++) if (ms[k2].income || ms[k2].spend) ci = k2; }
  var cur = ms[ci] || { ym: ym, income: 0, spend: 0, net: 0, fixed: 0 };

  var w = { asset: 0, liab: 0, worth: 0, delta: 0 };
  for (var a = ms.length - 1; a >= 0; a--) if (ms[a].asset) { w = ms[a]; break; }

  var tr = [];
  for (var t = 0; t <= ci; t++) if (ms[t].income || ms[t].spend) tr.push({ m: ms[t].ym, income: ms[t].income, spend: ms[t].spend });
  tr = tr.slice(-6);

  var bud = {};
  ss.getSheetByName('예산').getRange(5, 1, 40, 2).getValues().forEach(function (r) {
    if (r[0]) bud[String(r[0]).trim()] = Number(r[1]) || 0;
  });

  var ag = ss.getSheetByName('월별집계');
  var hd = ag.getRange(4, 2, 1, 24).getValues()[0];
  var col = -1;
  for (var c = 0; c < hd.length; c++) if (hd[c] instanceof Date && fmtYm_(hd[c]) === cur.ym) col = c;
  var names = ag.getRange(5, 1, 21, 1).getValues();
  var vals = col >= 0 ? ag.getRange(5, 2 + col, 21, 1).getValues() : null;
  var cats = [], expBud = 0;
  for (var n = 0; n < names.length; n++) {
    var nm = String(names[n][0] || '').trim();
    if (!nm) continue;
    expBud += (bud[nm] || 0);
    var sp = vals ? (Number(vals[n][0]) || 0) : 0;
    if (!sp && !bud[nm]) continue;
    cats.push({ cat: nm, spend: sp, budget: bud[nm] || 0 });
  }
  cats.sort(function (x, y) { return y.spend - x.spend; });
  cats = cats.slice(0, 8);

  return { ym: cur.ym, net: cur.net, income: cur.income, spend: cur.spend, fixed: cur.fixed,
           worth: w.worth, delta: w.delta, asset: w.asset, liab: w.liab,
           cats: cats, trend: tr, recent: recent_(), bd: burndown_(ms, ci, expBud) };
}

function burndown_(ms, ci, expBud) {
  var cur = ms[ci] || null;
  if (!cur) return null;
  var prev = ci > 0 ? ms[ci - 1] : null;
  var lo = null, hi = null;
  for (var i = 0; i < ci; i++) {
    if (!ms[i].spend) continue;
    if (!lo || ms[i].spend < lo.spend) lo = ms[i];
    if (!hi || ms[i].spend > hi.spend) hi = ms[i];
  }
  var y = Number(cur.ym.slice(0, 4)), mo = Number(cur.ym.slice(5, 7));
  var dim = new Date(y, mo, 0).getDate();
  var now = new Date();
  var day = (fmtYm_(now) === cur.ym) ? now.getDate() : dim;

  var tx = a2ss_().getSheetByName('거래내역');
  var last = tx.getLastRow();
  var take = Math.min(last - 1, 1500);
  var rows = take > 0 ? tx.getRange(last - take + 1, 1, take, 7).getValues() : [];
  var curD = [], prvD = [];
  for (var z = 0; z <= 31; z++) { curD.push(0); prvD.push(0); }
  for (var r = 0; r < rows.length; r++) {
    var d = rows[r][0];
    if (!(d instanceof Date)) continue;
    if (String(rows[r][1]).trim() !== '지출') continue;
    var k = fmtYm_(d), amt = Number(rows[r][6]) || 0;
    if (k === cur.ym) curD[d.getDate()] += amt;
    else if (prev && k === prev.ym) prvD[d.getDate()] += amt;
  }
  var curC = [], prvC = [], s1 = 0, s2 = 0;
  for (var q = 1; q <= dim; q++) { s1 += curD[q]; s2 += prvD[q]; curC.push(q <= day ? s1 : null); prvC.push(s2); }

  return { ym: cur.ym, dim: dim, day: day, budget: expBud,
           cur: curC, prev: prvC,
           prevYm: prev ? prev.ym : '', prevTotal: prev ? prev.spend : 0,
           loYm: lo ? lo.ym : '', loTotal: lo ? lo.spend : 0,
           hiYm: hi ? hi.ym : '', hiTotal: hi ? hi.spend : 0 };
}

function recent_() {
  var tx = a2ss_().getSheetByName('거래내역');
  var last = tx.getLastRow();
  if (last < 2) return [];
  var n = Math.min(last - 1, 8);
  var v = tx.getRange(last - n + 1, 1, n, 7).getValues();
  var out = [];
  for (var i = v.length - 1; i >= 0; i--) {
    if (!(v[i][0] instanceof Date)) continue;
    out.push({ gubun: String(v[i][1] || ''), cat: String(v[i][2] || ''),
               memo: String(v[i][3] || ''), amt: Number(v[i][6]) || 0 });
  }
  return out.slice(0, 6);
}

function overview(ym) { return summary2_(); }
