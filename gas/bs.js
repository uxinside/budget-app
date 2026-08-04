/* 재무상태표(대차대조표) 생성 — 가계부 메뉴에서 실행 */

var BS_SS = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';
var BS_NAME = '재무상태표';

function 재무상태표() {
  var ss = SpreadsheetApp.openById(BS_SS);
  var old = ss.getSheetByName(BS_NAME);
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet(BS_NAME, ss.getSheetByName('부채').getIndex());

  var av = ss.getSheetByName('자산').getRange(5, 1, 300, 1).getValues();
  var seen = {}, list = [];
  for (var i = 0; i < av.length; i++) {
    var v = av[i][0];
    if (!v) continue;
    var s = (v instanceof Date)
      ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM')
      : String(v).trim();
    if (!seen[s]) { seen[s] = 1; list.push(s); }
  }
  list.sort(function (a, b) { return a < b ? 1 : -1; });
  var cur = list.length ? list[0] : '';

  sh.setHiddenGridlines(true);
  sh.setColumnWidth(1, 28);
  sh.setColumnWidth(2, 140);
  sh.setColumnWidth(3, 250);
  sh.setColumnWidth(4, 140);
  sh.setColumnWidth(5, 80);
  sh.setColumnWidth(6, 28);

  sh.getRange('B1').setValue('재무상태표')
    .setFontSize(18).setFontWeight('bold').setFontColor('#1F3A5F');
  sh.getRange('B2').setValue('어느 시점에 무엇을 얼마나 가지고 있고 얼마를 빚지고 있는지 한 장으로 봅니다.')
    .setFontSize(9).setFontColor('#94A3B8').setFontStyle('italic');
  sh.getRange('B3').setValue('기준월').setFontWeight('bold');
  sh.getRange('C3').setValue(cur).setBackground('#FEF9C3')
    .setFontWeight('bold').setHorizontalAlignment('left');
  if (list.length) {
    sh.getRange('C3').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(list, true).build());
  }
  sh.getRange('D3').setValue('← 노란 칸만 바꾸면 전체가 갱신됩니다')
    .setFontSize(9).setFontColor('#94A3B8');

  var A = "'자산'", L = "'부채'", M = '$C$3';
  function sumA(types) {
    return types.map(function (t) {
      return 'SUMIFS(' + A + '!F5:F,' + A + '!A5:A,' + M + ',' + A + '!C5:C,"' + t + '")';
    }).join('+');
  }

  /* 행 배치
     5 ■자산 / 6 유동 / 7 투자 / 8 실물 / 9 기타 / 10 자산합계
     11 공백 / 12 ■부채 / 13 유동 / 14 비유동 / 15 부채합계
     16 공백 / 17 ■순자산 / 18 순자산
     19 공백 / 20 ■건전성 / 21 부채비율 / 22 자기자본 / 23 유동비율 / 24 현금성개월
     25 공백 / 26 ■상환부담 / 27 월상환 / 28 12개월 / 29 DSR            */
  var rows = [
    ['■ 자산', '', '', ''],
    ['유동자산', '입출금·예금·적금 — 바로 쓸 수 있는 돈', '=' + sumA(['예금', '예적금']), ''],
    ['투자자산', '주식·펀드·코인·연금 — 현금화에 시간과 손실 위험', '=' + sumA(['투자', '연금']), ''],
    ['실물자산', '부동산·자동차 — 시세 추정', '=' + sumA(['부동산', '자동차']), ''],
    ['기타자산', '위 분류에 없는 항목', '=SUMIFS(' + A + '!F5:F,' + A + '!A5:A,' + M + ')-D6-D7-D8', ''],
    ['자산 합계', '', '=SUM(D6:D9)', ''],
    ['', '', '', ''],
    ['■ 부채', '', '', ''],
    ['유동부채', '만기 1년 이내',
      '=SUMIFS(' + L + '!E5:E,' + L + '!A5:A,' + M + ',' + L + '!H5:H,"<="&EDATE(TODAY(),12))', ''],
    ['비유동부채', '만기 1년 초과 — 장기 대출',
      '=SUMIFS(' + L + '!E5:E,' + L + '!A5:A,' + M + ')-D13', ''],
    ['부채 합계', '', '=SUM(D13:D14)', ''],
    ['', '', '', ''],
    ['■ 순자산', '', '', ''],
    ['순자산', '자산 합계 − 부채 합계', '=D10-D15', ''],
    ['', '', '', ''],
    ['■ 건전성 지표', '', '', ''],
    ['부채비율', '부채 ÷ 자산 — 낮을수록 안전 (40% 이하 권장)', '=IF(D10=0,"",D15/D10)', ''],
    ['자기자본비율', '순자산 ÷ 자산 — 높을수록 안전', '=IF(D10=0,"",D18/D10)', ''],
    ['유동비율', '유동자산 ÷ 유동부채 — 100% 이상 권장', '=IF(D13=0,"—",D6/D13)', ''],
    ['현금성 개월수', '유동자산 ÷ 월평균 지출 — 3~6개월 권장',
      '=IFERROR(D6/AVERAGEIF(\'월별요약\'!C5:C28,">0",\'월별요약\'!C5:C28),"")', ''],
    ['', '', '', ''],
    ['■ 상환 부담', '', '', ''],
    ['월 상환액 합계', '원리금 기준 — 부채 시트 월상환액',
      '=SUMIFS(' + L + '!G5:G,' + L + '!A5:A,' + M + ')', ''],
    ['향후 12개월 상환예정', '월 상환액 × 12', '=D27*12', ''],
    ['DSR (참고)', '월 상환액 ÷ 월평균 수입',
      '=IFERROR(D27/AVERAGEIF(\'월별요약\'!B5:B28,">0",\'월별요약\'!B5:B28),"")', '']
  ];
  sh.getRange(5, 2, rows.length, 4).setValues(rows);

  [5, 12, 17, 20, 26].forEach(function (r) {
    sh.getRange(r, 2, 1, 4).setBackground('#1F3A5F').setFontColor('#FFFFFF').setFontWeight('bold');
  });
  [10, 15].forEach(function (r) {
    sh.getRange(r, 2, 1, 4).setBackground('#E2E8F0').setFontWeight('bold');
  });
  sh.getRange(18, 2, 1, 4).setBackground('#DCFCE7').setFontWeight('bold').setFontSize(12);

  sh.getRange(6, 4, 24, 1).setNumberFormat('#,##0');
  sh.getRange(21, 4, 3, 1).setNumberFormat('0.0%');
  sh.getRange(24, 4, 1, 1).setNumberFormat('0.0"개월"');
  sh.getRange(29, 4, 1, 1).setNumberFormat('0.0%');
  sh.getRange(6, 3, 24, 1).setFontSize(9).setFontColor('#64748B');

  sh.getRange('E5').setValue('비중').setFontColor('#FFFFFF').setFontWeight('bold');
  [6, 7, 8, 9].forEach(function (r) {
    sh.getRange(r, 5).setFormula('=IF($D$10=0,"",D' + r + '/$D$10)').setNumberFormat('0.0%');
  });
  sh.getRange('E12').setValue('비중').setFontColor('#FFFFFF').setFontWeight('bold');
  [13, 14].forEach(function (r) {
    sh.getRange(r, 5).setFormula('=IF($D$15=0,"",D' + r + '/$D$15)').setNumberFormat('0.0%');
  });
  sh.getRange(5, 5, 25, 1).setHorizontalAlignment('right');

  var pie = sh.newChart().asPieChart()
    .addRange(sh.getRange('B6:B9')).addRange(sh.getRange('D6:D9'))
    .setNumHeaders(0)
    .setOption('title', '자산 구성')
    .setOption('pieHole', 0.45)
    .setOption('legend', { position: 'right' })
    .setOption('width', 430).setOption('height', 250)
    .setPosition(5, 7, 6, 0).build();
  sh.insertChart(pie);

  var ws = ss.getSheetByName('월별요약');
  var bar = sh.newChart().asColumnChart()
    .addRange(ws.getRange('A5:A28')).addRange(ws.getRange('L5:L28'))
    .setNumHeaders(0)
    .setOption('title', '순자산 추이')
    .setOption('colors', ['#2E8B78'])
    .setOption('legend', { position: 'none' })
    .setOption('vAxis', { format: '#,##0' })
    .setOption('width', 430).setOption('height', 250)
    .setPosition(19, 7, 6, 0).build();
  sh.insertChart(bar);

  ss.toast('재무상태표 시트를 만들었습니다.', '완료', 5);
  return '재무상태표 생성 완료 (기준월 ' + cur + ')';
}
