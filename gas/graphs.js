/* ═══════════════════════════════════════════════════════════
   그래프 보정 — 한 번만 실행하면 됩니다.
   Apps Script 편집기에서 파일 추가(+) → 스크립트 →
   이름을 graphs 로 하고 이 내용을 통째로 붙여넣은 뒤,
   함수 목록에서  그래프정리  를 선택해 ▶ 실행하세요.
   ═══════════════════════════════════════════════════════════ */

var GFIX_ID = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';

function 그래프정리() {
  var ss = SpreadsheetApp.openById(GFIX_ID);
  var log = [];
  log.push('1) ' + markFixedVar_(ss));
  log.push('2) ' + sortAggByTotal_(ss));
  log.push('3) ' + rebuildChart1());
  log.push('4) ' + fixSavingRate_(ss));
  var msg = log.join('\n');
  Logger.log(msg);
  return msg;
}

/* ───────── 1. 거래내역 H열(고정/변동) 자동 판정 ───────── */

var GFIX_PG   = /나이스정보통신|KIS ?정보통신|정보통신 ?주식회사|다우데이타|토스페이먼츠|이니시스|올앳|KG모빌리언스/i;
/* 어느 집에서나 고정비인 것 — 구독 서비스류. 코드에 둬도 된다. */
var GFIX_NAME = /와우\s*멤버십|와우멤버|컬리\s*\(\s*멤버스|넷플릭스|Netflix|스포티파이|Spotify|밀리의서재|디즈니플러스|티빙|웨이브|왓챠/i;

/* 이 집에서만 고정비인 것(학원 이름·사람 이름 등)은 코드가 아니라
   스크립트 속성에 둔다. 저장소가 Public 이라 실명·상호가 그대로
   노출돼 있었다 (2026-08-06 정리).

   설정 방법 — 프로젝트 설정 › 스크립트 속성
     이름  GFIX_NAMES
     값    정규식 조각을 | 로 이어서. 예) ○○학원|△△센터|사람이름

   비어 있으면 위 GFIX_NAME 만 쓴다 — 없다고 죽지 않는다. */
var gfixHouse_ = undefined;
function gfixHouse_get_() {
  if (gfixHouse_ !== undefined) return gfixHouse_;
  gfixHouse_ = null;
  try {
    var v = PropertiesService.getScriptProperties().getProperty('GFIX_NAMES');
    if (v && String(v).trim()) gfixHouse_ = new RegExp(String(v).trim(), 'i');
  } catch (e) { gfixHouse_ = null; }
  return gfixHouse_;
}
var GFIX_CAT  = { '주거/관리비': 1, '보험료': 1, '통신비': 1, '대출이자': 1, '대출원금상환': 1 };
var GFIX_NOT  = /해약|환급|취소|반환/;

function isFixed_(cat, desc) {
  if (GFIX_NOT.test(desc)) return false;
  if (cat === '통신비') return !GFIX_PG.test(desc);
  if (GFIX_CAT[cat]) return true;
  if (cat === '저축' && /청약/.test(desc)) return true;
  if (GFIX_NAME.test(desc)) return true;
  var h = gfixHouse_get_();
  return !!(h && h.test(desc));
}

function markFixedVar_(ss) {
  var sh = ss.getSheetByName('거래내역');
  var last = sh.getLastRow();
  if (last < 2) return '거래내역이 비어 있습니다.';
  var n = last - 1;
  var v = sh.getRange(2, 3, n, 2).getValues();   // C 대분류, D 내용
  var out = [], cnt = 0;
  for (var i = 0; i < n; i++) {
    var f = isFixed_(String(v[i][0] || ''), String(v[i][1] || ''));
    if (f) cnt++;
    out.push([f ? '고정' : '변동']);
  }
  sh.getRange(2, 8, n, 1).setValues(out);
  return '고정/변동 판정 완료 — 전체 ' + n + '건 중 고정 ' + cnt + '건';
}

/* ───────── 2. 월별집계 지출 대분류를 합계 큰 순서로 정렬 ─────────
   ⑥ 누적 막대는 첫 번째 계열이 맨 아래에 쌓이므로,
   합계가 큰 대분류를 위에서부터(=차트에서는 아래에서부터) 배치합니다. */

function sortAggByTotal_(ss) {
  var ag = ss.getSheetByName('월별집계');
  var set = ss.getSheetByName('설정');

  // 설정 A:B 에서 '지출' 구분인 대분류 집합
  var sv = set.getRange(5, 1, 60, 2).getValues();
  var isExp = {};
  for (var i = 0; i < sv.length; i++) {
    if (sv[i][0] && String(sv[i][1]).trim() === '지출') isExp[String(sv[i][0]).trim()] = 1;
  }

  // 5행부터 '지출' 대분류가 이어지는 구간만 대상으로
  var raw = ag.getRange(5, 1, 40, 1).getValues();
  var n = 0;
  while (n < raw.length && raw[n][0] && isExp[String(raw[n][0]).trim()]) n++;
  if (n < 2) return '월별집계에서 지출 대분류 구간을 찾지 못했습니다.';

  var vals = ag.getRange(5, 2, n, 24).getValues();
  var arr = [];
  for (var r = 0; r < n; r++) {
    var t = 0;
    for (var c = 0; c < 24; c++) t += Number(vals[r][c]) || 0;
    arr.push({ cat: String(raw[r][0]).trim(), tot: t });
  }
  arr.sort(function (a, b) { return b.tot - a.tot; });
  ag.getRange(5, 1, n, 1).setValues(arr.map(function (o) { return [o.cat]; }));

  return '⑥ 정렬 완료 (' + n + '개) — 아래부터: '
       + arr.slice(0, 5).map(function (o) { return o.cat; }).join(' › ') + ' …';
}

/* ───────── 3. ① 차트에서 순현금흐름만 선그래프로 ───────── */

function netCashToLine_(ss) {
  var gr = ss.getSheetByName('그래프');
  var charts = gr.getCharts();
  var target = null;

  for (var i = 0; i < charts.length; i++) {
    var t = '';
    try { t = String(charts[i].getOptions().get('title') || ''); } catch (e) {}
    if (t.indexOf('순현금흐름') >= 0) { target = charts[i]; break; }
  }
  if (!target) {          // 제목을 못 읽으면 B4 위치(①)로 찾기
    for (var j = 0; j < charts.length; j++) {
      var ci = charts[j].getContainerInfo();
      if (ci.getAnchorRow() <= 6 && ci.getAnchorColumn() <= 4) { target = charts[j]; break; }
    }
  }
  if (!target) return '① 차트를 찾지 못했습니다.';

  var nc = target.modify()
    .setChartType(Charts.ChartType.COMBO)
    .setOption('seriesType', 'bars')
    .setOption('series', {
      0: { type: 'bars', color: '#2E8B78' },                       // 수입
      1: { type: 'bars', color: '#D9534F' },                       // 지출
      2: { type: 'line', color: '#1F3A5F', lineWidth: 3, pointSize: 6 }  // 순현금흐름
    })
    .setOption('vAxes', { 0: { format: '#,##0' } })
    .setOption('vAxis', { format: '#,##0' })
    .setOption('legend', { position: 'right' })
    .build();
  gr.updateChart(nc);
  return '① 순현금흐름을 선그래프로 변경했습니다.';
}


function fixAxis1() {
  var ss = SpreadsheetApp.openById(GFIX_ID);
  var gr = ss.getSheetByName('\uadf8\ub798\ud504');
  var cs = gr.getCharts();
  for (var i=0;i<cs.length;i++){
    
    var ci = cs[i].getContainerInfo();
    if (ci.getAnchorRow()<=6 && ci.getAnchorColumn()<=4){
      var nc = cs[i].modify()
        .setOption('vAxis.format','#,##0')
        .setOption('vAxes.0.format','#,##0')
        .setOption('vAxis.viewWindowMode','pretty')
        .build();
      gr.updateChart(nc);
      return 'axis fixed';
    }
  }
  return 'not found';
}


function rebuildChart1() {
  var ss = SpreadsheetApp.openById(GFIX_ID);
  var gr = ss.getSheetByName('\uadf8\ub798\ud504');
  var sm = ss.getSheetByName('\uc6d4\ubcc4\uc694\uc57d');
  var cs = gr.getCharts();
  var old = [];
  for (var i=0;i<cs.length;i++){
    var ci = cs[i].getContainerInfo();
    if (ci.getAnchorRow()<=6 && ci.getAnchorColumn()<=4) old.push(cs[i]);
  }
  for (var k=0;k<old.length;k++) gr.removeChart(old[k]);
  var b = gr.newChart()
    .setChartType(Charts.ChartType.COMBO)
    .addRange(sm.getRange('A4:C28'))
    .addRange(sm.getRange('F4:F28'))
    .setNumHeaders(1)
    .setOption('title', '\u2460 \uc6d4\ubcc4 \uc218\uc785 \u00b7 \uc9c0\ucd9c \u00b7 \uc21c\ud604\uae08\ud750\ub984')
    .setOption('seriesType', 'bars')
    .setOption('series', {0:{type:'bars',color:'#2E8B78'},1:{type:'bars',color:'#D9534F'},2:{type:'line',color:'#1F3A5F',lineWidth:3,pointSize:6}})
    .setOption('vAxis', {format:'#,##0'})
    .setOption('legend', {position:'right'})
    .setOption('width', 866)
    .setOption('height', 436)
    .setPosition(4, 2, 0, 0)
    .build();
  gr.insertChart(b);
  return 'chart1 ok, removedOld=' + old.length;
}

function fixSavingRate_(ss) {
  var gr = ss.getSheetByName('\uadf8\ub798\ud504');
  var sm = ss.getSheetByName('\uc6d4\ubcc4\uc694\uc57d');
  var cs = gr.getCharts();
  var old = [];
  for (var i=0;i<cs.length;i++){
    var ci = cs[i].getContainerInfo();
    if (ci.getAnchorRow()>=50 && ci.getAnchorRow()<=62 && ci.getAnchorColumn()<=4) old.push(cs[i]);
  }
  for (var k=0;k<old.length;k++) gr.removeChart(old[k]);
  var b = gr.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sm.getRange('A4:A28'))
    .addRange(sm.getRange('G4:G28'))
    .setNumHeaders(1)
    .setOption('title', '\u2464 \uc800\ucd95\ub960 \ucd94\uc774')
    .setOption('vAxis', {format:'0%', viewWindow:{min:-1, max:1}})
    .setOption('series', {0:{color:'#2E8B78', lineWidth:3, pointSize:5}})
    .setOption('legend', {position:'right'})
    .setOption('width', 866)
    .setOption('height', 436)
    .setPosition(56, 2, 0, 0)
    .build();
  gr.insertChart(b);
  return 'chart5 ok, removedOld=' + old.length;
}


/* 경기지역화폐 1년치를 거래내역에 밀어 넣던 일회성 함수가 여기 있었다.
   이미 반영이 끝났고, 그 안에 이 집 실거래 60건과 가맹점 30곳이 상수로
   박혀 있어 공개 저장소에 그대로 노출됐다. 2026-08-06 통째로 지웠다.
   다시 필요하면 시트에 붙여넣고 「② 임포트 실행」을 쓰면 된다. */

function 검증() {
  var ss = SpreadsheetApp.openById(GFIX_ID);
  var tx = ss.getSheetByName('\uac70\ub798\ub0b4\uc5ed');
  var n = tx.getLastRow()-1;
  var v = tx.getRange(2,1,n,7).getValues();
  var byM = {}, cnt=0, tot=0;
  for (var i=0;i<n;i++){
    if (String(v[i][4]).indexOf('\uc9c0\uc5ed\ud654\ud3d0')<0) continue;
    if (v[i][1] !== '\uc9c0\ucd9c') continue;
    var d = v[i][0];
    var k = d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);
    byM[k]=(byM[k]||0)+Number(v[i][6]); cnt++; tot+=Number(v[i][6]);
  }
  return 'rows='+tx.getLastRow()+' lc지출건수='+cnt+' 합='+tot+' | '+JSON.stringify(byM);
}


var PBUD=[["통신비",50000,"실적 월평균 54,029 · 중앙값 57,460"],["보험료",330000,"실적 월평균 327,444 · 중앙값 197,061 (자동차보험 연납 달에 몰림)"],["교통/차량",260000,"실적 월평균 264,607 · 중앙값 212,818"],["식비",1560000,"실적 월평균 1,556,616 · 중앙값 1,837,944"],["외식/배달",570000,"실적 월평균 567,698 · 중앙값 525,585"],["생활용품",420000,"실적 월평균 418,008 · 중앙값 301,641"],["의료/건강",220000,"실적 월평균 220,117 · 중앙값 78,469 (한 달에 96만원 몰림)"],["교육/육아",490000,"실적 월평균 488,241 · 지역화폐 학원비 포함"],["문화/여가",670000,"실적 월평균 665,399 · 중앙값 396,780 (최대 316만원)"],["의류/미용",340000,"실적 월평균 343,974 · 중앙값 301,850"],["경조사",20000,"실적 월평균 19,375"],["세금/공과금",30000,"실적 월평균 31,994 (연 1~2회)"],["기타지출",770000,"실적 월평균 772,588 · 중앙값 608,120 · 정체 불명 지출 많음"],["대출이자",70000,"실적 월평균 69,720 — 고정비 시트 기준은 290,497. 이자가 원금상환·이체에 섞여 있음"],["대출원금상환",1480000,"실적 월평균 1,479,985 (주담대 130만 + 폴스타 할부)"],["주거/관리비",350000,"실적 0원 — 관리비가 어느 카테고리로 들어갔는지 확인 필요 (금액 그대로 둠)"],["여행",200000,"실적 0원 (금액 그대로 둠)"],["저축",700000,"실적 월평균 36,667이지만 목표치라 그대로 둠"],["투자",500000,"실적은 자본거래로 분리됨 · 목표치라 그대로 둠"],["연금",300000,"실적 0원 · 목표치라 그대로 둠"]];
function 예산현실화() {
  var ss = SpreadsheetApp.openById(GFIX_ID);
  var bs = ss.getSheetByName('예산');
  var a = bs.getRange(5,1,40,1).getValues();
  var idx = {};
  for (var i=0;i<a.length;i++) if (a[i][0]) idx[String(a[i][0]).trim()] = 5+i;
  var done = [], miss = [];
  PBUD.forEach(function(r){
    var row = idx[r[0]];
    if (!row) { miss.push(r[0]); return; }
    bs.getRange(row,2).setValue(r[1]);
    bs.getRange(row,3).setValue(r[2]);
    done.push(r[0]);
  });
  return '예산 ' + done.length + '행 갱신' + (miss.length ? ' / 못찾음: ' + miss.join(',') : '');
}
