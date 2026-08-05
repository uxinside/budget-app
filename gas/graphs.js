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
var GFIX_NAME = /꿈꾸는 음악학원|리드인독서논술|렘브란트의풍차학원|다올점핑클럽|새물결|조현길|효성에프엠에스|와우\s*멤버십|와우멤버|컬리\s*\(\s*멤버스|넷플릭스|Netflix|스포티파이|Spotify|밀리의서재|디즈니플러스|티빙|웨이브|왓챠/i;
var GFIX_CAT  = { '주거/관리비': 1, '보험료': 1, '통신비': 1, '대출이자': 1, '대출원금상환': 1 };
var GFIX_NOT  = /해약|환급|취소|반환/;

function isFixed_(cat, desc) {
  if (GFIX_NOT.test(desc)) return false;
  if (cat === '통신비') return !GFIX_PG.test(desc);
  if (GFIX_CAT[cat]) return true;
  if (cat === '저축' && /청약/.test(desc)) return true;
  return GFIX_NAME.test(desc);
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


/* ── 경기지역화폐 1년치 반영 (한 번만 실행) ── */
var LC_C=["교육/육아","기타지출","문화/여가","식비","외식/배달","의료/건강"];
var LC_M=["(주) 휘게문고 동탄점","(주)휘게문고 동탄점","GS25동탄공원점","김포손칼국수","꿈꾸는 음악학원","다올점핑클럽","담가화로구이 동탄센트럴파크점","더힐846","돌핀웨일 동탄본점","동탄연세소아과","렘브란트의풍차학원","리드인독서논술 서동탄역파크자이","마리에뜨","민스커피","설아아이스크림","세븐일레븐_서동탄점","시원바삭아이스크림 서동탄역점","싸멍","씨유(CU) 병점한신점","에이치와이 컴퍼니","오늘초밥","우리동네곰다방","우지커피 동탄센트럴파크점","지에스25 화성우남점","참솥 동탄레이크꼬모점","청옥담","코지아워","토이스타 장난감할인점","헬로방방동탄점","홍수계 찜닭 동탄타임테라스점"];
var LC_E=[["250811",0,4,290000,1],["250815",4,17,1000,0],["250816",4,3,35000,0],["250822",0,5,150000,1],["250822",4,14,4000,0],["250823",4,22,8700,0],["250831",4,7,24000,0],["250914",4,6,149000,0],["250916",0,4,150000,1],["250919",0,5,150000,1],["250920",4,25,86000,0],["250920",2,1,8000,0],["250920",2,0,26500,0],["250920",4,3,40000,0],["250927",2,28,13000,0],["250927",2,28,3000,0],["250927",3,2,1000,0],["250927",4,22,8500,0],["251011",4,20,46590,0],["251013",0,4,150000,1],["251014",0,5,150000,1],["251016",0,10,300000,1],["251106",0,10,150000,1],["251108",4,3,33000,0],["251123",4,3,38500,0],["251126",1,19,328000,0],["251126",4,8,80500,0],["251201",0,5,150000,1],["251220",0,10,150000,1],["251221",2,27,44000,0],["251221",2,27,39000,0],["251225",4,29,51000,0],["251228",4,21,18100,0],["251230",0,4,150000,1],["260105",3,23,6000,0],["260106",0,5,150000,1],["260107",0,11,210000,1],["260123",0,4,150000,1],["260127",3,15,700,0],["260207",4,16,2900,0],["260209",0,11,230000,1],["260213",0,4,150000,1],["260216",4,12,47000,0],["260316",0,5,150000,1],["260316",0,11,160000,1],["260329",4,24,66000,0],["260330",0,4,140000,1],["260410",0,11,160000,1],["260411",4,3,44000,0],["260417",0,4,140000,1],["260424",4,13,11500,0],["260511",0,11,160000,1],["260511",0,4,140000,1],["260513",4,26,16200,0],["260521",0,5,280000,1],["260526",5,9,2900,0],["260531",4,12,47000,0],["260626",0,4,140000,1],["260626",0,11,160000,1],["260721",3,18,4000,0]];
var LC_I=[["250831",294246],["250927",80909],["251016",308326],["251126",57273],["251230",58951],["260127",46973],["260216",58090],["260330",46908],["260424",45541],["260531",58738],["260626",27272],["260721",364]];

function 지역화폐반영() {
  var ss = SpreadsheetApp.openById(GFIX_ID);
  var tx = ss.getSheetByName('거래내역');
  var PAY = '경기지역화폐', ME = '폴', TAG = '지역화폐';
  var ev = tx.getRange(2, 5, tx.getLastRow() - 1, 1).getValues();
  for (var q = 0; q < ev.length; q++) if (String(ev[q][0]).indexOf(TAG) >= 0) return '이미 반영됨 — 건너뜀';

  function dt(s) { return new Date(2000 + +s.substr(0,2), +s.substr(2,2) - 1, +s.substr(4,2)); }
  var out = [];
  LC_E.forEach(function (r) {
    out.push([dt(r[0]), '지출', LC_C[r[1]], LC_M[r[2]], PAY, ME, r[3], r[4] ? '고정' : '변동', TAG]);
  });
  LC_I.forEach(function (r) {
    var ym = '20' + r[0].substr(0,2) + '-' + r[0].substr(2,2);
    out.push([dt(r[0]), '수입', '정부지원금', TAG + ' 인센티브·소비쿠폰 (' + ym + ')', PAY, ME, r[1], '변동', TAG + ' 보조금 사용분']);
  });
  var start = tx.getLastRow() + 1;
  tx.getRange(start, 1, out.length, 9).setValues(out);
  tx.getRange(start, 1, out.length, 1).setNumberFormat('yyyy-mm-dd');
  tx.getRange(start, 7, out.length, 1).setNumberFormat('#,##0');
  var last = tx.getLastRow();
  /* 정렬은 전체 열로. 9열만 걸면 J(낭비)·K(사용처)·L(출처)이 제자리에
     남아 남의 거래 값과 섞인다. import.js 와 같은 버그였다. */
  tx.getRange(2, 1, last - 1, (typeof TX_COLS === 'number' ? TX_COLS : 12))
    .sort({ column: 1, ascending: true });

  var ac = ss.getSheetByName('계좌');
  var av = ac.getRange(5, 1, 60, 1).getValues();
  var has = false, empty = -1;
  for (var i = 0; i < av.length; i++) {
    if (String(av[i][0]).indexOf(TAG) >= 0) has = true;
    if (empty < 0 && !av[i][0]) empty = 5 + i;
  }
  if (!has && empty > 0) ac.getRange(empty, 1, 1, 7).setValues([[PAY, '코나아이', "'9465-44**-****-8719", ME, '카드', '사용', '화성사랑카드 · 충전식']]);

  var st = ss.getSheetByName('설정');
  var sv = st.getRange(5, 5, 60, 1).getValues();
  var has2 = false, empty2 = -1;
  for (var j = 0; j < sv.length; j++) {
    if (String(sv[j][0]).indexOf(TAG) >= 0) has2 = true;
    if (empty2 < 0 && !sv[j][0]) empty2 = 5 + j;
  }
  if (!has2 && empty2 > 0) st.getRange(empty2, 5).setValue(PAY);

  return TAG + ' ' + out.length + '행 추가 (총 ' + last + '행), 날짜순 정렬 완료';
}

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
