/* ══════════════════════════════════════════════════
   임포트 도구 — 스프레드시트 메뉴 [가계부]
   ══════════════════════════════════════════════════ */
var IMP_ID = '1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU';
var IMP = '임포트', RUL = '분류규칙', TXS = '거래내역', SETS = '설정', ACCS = '계좌';

/* 거래내역은 A~K 11열인데 임포트 뒤 정렬을 A~I 9열로만 걸고 있었다.
   그래서 J(낭비)·K(사용처)가 행을 안 따라가고 남의 거래 값과 섞였다.
   L열을 하나 더 두므로 정렬은 12열로 건다.

   L열 = 출처. 임포트로 들어온 행에 「임포트 2026-08-05 23:10」처럼
   배치 시각을 적는다. 예전엔 이 표시를 I열(메모)에 '임포트' 라고만 적었는데
     · 메모와 같은 칸이라 메모를 쓰면 표시가 날아가고
     · 배치 구분이 없어 「직전 임포트 되돌리기」가 지금까지 임포트한
       모든 행(실측 981행)을 지웠다
   두 가지가 한꺼번에 터질 자리였다. */
var TX_COLS = 12;
var SRC_COL = 12;                 /* L */
var SRC_HEAD = '출처';
var SRC_PREFIX = '임포트 ';

/* L열 헤더와 폭을 보장한다. 시트가 좁으면 늘린다. */
function imp_srcCol_(tx) {
  if (tx.getMaxColumns() < SRC_COL) {
    tx.insertColumnsAfter(tx.getMaxColumns(), SRC_COL - tx.getMaxColumns());
  }
  if (String(tx.getRange(1, SRC_COL).getValue() || '').trim() !== SRC_HEAD) {
    tx.getRange(1, SRC_COL).setValue(SRC_HEAD).setFontWeight('bold');
  }
}

function imp_tag_(ss) {
  return SRC_PREFIX + Utilities.formatDate(
    new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
}

function imp_ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }

var DEFAULT_RULES = [["급여","근로소득","고정"],["이자 자동이체","대출이자","고정"],["대출이자","대출이자","고정"],["통장 이자","금융소득",""],["손해보험","보험료","고정"],["화재보험","보험료","고정"],["KB손","보험료","고정"],["한화손","보험료","고정"],["DB손","보험료","고정"],["현대해상","보험료","고정"],["삼성화재","보험료","고정"],["라이나","보험료","고정"],["볼트업","교통/차량",""],["SKTINTERNET","통신비","고정"],["브로드밴드","통신비","고정"],["KT85","통신비","고정"],["티플러스","통신비","고정"],["말톡","통신비","고정"],["유플러스","통신비","고정"],["알뜰폰","통신비","고정"],["고속도로","교통/차량",""],["도로공사","교통/차량",""],["하이패스","교통/차량",""],["순환도로","교통/차량",""],["인천대교","교통/차량",""],["파워큐브","교통/차량",""],["차지비","교통/차량",""],["채비","교통/차량",""],["주유소","교통/차량",""],["칼텍스","교통/차량",""],["오일뱅크","교통/차량",""],["주차","교통/차량",""],["파킹","교통/차량",""],["티머니","교통/차량",""],["코레일","교통/차량",""],["교통-","교통/차량",""],["지하철","교통/차량",""],["택시","교통/차량",""],["폴스타","교통/차량",""],["와우멤버십","기타지출","고정"],["컬리(멤버스","기타지출","고정"],["넷플릭스","기타지출","고정"],["스포티파이","기타지출","고정"],["티빙","기타지출","고정"],["디즈니","기타지출","고정"],["학원","교육/육아","고정"],["구몬","교육/육아","고정"],["교원","교육/육아","고정"],["방과후","교육/육아",""],["유치원","교육/육아",""],["어린이집","교육/육아",""],["문구","교육/육아",""],["약국","의료/건강",""],["의원","의료/건강",""],["병원","의료/건강",""],["치과","의료/건강",""],["한의원","의료/건강",""],["오락실","문화/여가",""],["(주)짱","문화/여가",""],["방방","문화/여가",""],["사격","문화/여가",""],["예스24","문화/여가",""],["문고","문화/여가",""],["알라딘","문화/여가",""],["메가박스","문화/여가",""],["CGV","문화/여가",""],["시네마","문화/여가",""],["리조트","문화/여가",""],["호텔","문화/여가",""],["펜션","문화/여가",""],["에버랜드","문화/여가",""],["워터파크","문화/여가",""],["키즈","문화/여가",""],["아트박스","문화/여가",""],["장난감","문화/여가",""],["토이","문화/여가",""],["롯데쇼핑","의류/미용",""],["아울렛","의류/미용",""],["백화점","의류/미용",""],["AK PLAZA","의류/미용",""],["스타필드","의류/미용",""],["타임빌라스","의류/미용",""],["신세계","의류/미용",""],["유니클로","의류/미용",""],["나이키","의류/미용",""],["에프알엘","의류/미용",""],["무신사","의류/미용",""],["올리브영","의류/미용",""],["헤어","의류/미용",""],["미용","의류/미용",""],["네일","의류/미용",""],["다이소","생활용품",""],["오늘의집","생활용품",""],["아름다운가게","생활용품",""],["굿윌스토어","생활용품",""],["철물","생활용품",""],["세탁","생활용품",""],["코스트코","식비",""],["이마트","식비",""],["홈플러스","식비",""],["트레이더스","식비",""],["롯데마트","식비",""],["하나로마트","식비",""],["컬리","식비",""],["쿠팡","식비",""],["GS25","식비",""],["지에스25","식비",""],["씨유","식비",""],["세븐일레븐","식비",""],["편의점","식비",""],["매머드","외식/배달",""],["커피","외식/배달",""],["카페","외식/배달",""],["COFFEE","외식/배달",""],["스타벅스","외식/배달",""],["투썸","외식/배달",""],["이디야","외식/배달",""],["메가엠지씨","외식/배달",""],["컴포즈","외식/배달",""],["빽다방","외식/배달",""],["파리바게","외식/배달",""],["뚜레쥬르","외식/배달",""],["배달의민족","외식/배달",""],["요기요","외식/배달",""],["쿠팡이츠","외식/배달",""],["국수","외식/배달",""],["순대","외식/배달",""],["김밥","외식/배달",""],["피자","외식/배달",""],["치킨","외식/배달",""],["찜닭","외식/배달",""],["초밥","외식/배달",""],["삼겹","외식/배달",""],["곱창","외식/배달",""],["분식","외식/배달",""],["식당","외식/배달",""],["밥상","외식/배달",""],["베이커리","외식/배달",""],["도넛","외식/배달",""],["아이스크림","외식/배달",""],["화환","경조사",""],["플라워","경조사",""],["축의","경조사",""],["부의","경조사",""],["지자체세입","세금/공과금",""],["세무서","세금/공과금",""],["국세","세금/공과금",""],["지방세","세금/공과금",""],["인터넷지로","세금/공과금",""],["등기소","세금/공과금",""],["관리비","주거/관리비","고정"],["한국전력","주거/관리비","고정"],["도시가스","주거/관리비","고정"],["수도사업","주거/관리비","고정"],["월세","주거/관리비","고정"],["청약","저축","고정"],["적금","저축",""],["펀드","투자",""],["증권","투자",""],["연금","연금","고정"],["원금상환","대출원금상환","고정"],["대출상환","대출원금상환","고정"],["페이레터","기타지출",""],["나이스페이","기타지출",""],["NHNKCP","기타지출",""],["KICC","기타지출",""],["KSNET","기타지출",""],["코페이","기타지출",""],["발트페이","기타지출",""],["정보통신","기타지출",""],["ATM","기타지출",""],["네이버페이","기타지출",""],["카카오페이","기타지출",""]];

function onOpen() {
  /* ⚠️ 시트를 열 때 재무상태표 기준월을 조용히 최신으로 당긴다.
     이게 없으면 9월 자료가 다 들어와도 앱은 8월 숫자를 보여주면서 멀쩡해 보인다.
     try 로 감싼다 — 여기서 터지면 메뉴가 통째로 안 뜬다. */
  try { if (typeof bsYmSync_ === 'function') bsYmSync_(); } catch (e) {}
  try {
    SpreadsheetApp.getUi().createMenu('가계부')
      .addItem('① 초기 설정 (시트 만들기)', '초기설정')
      .addItem('② 임포트 실행', '임포트실행')
      .addSeparator()
      .addItem('임포트 시트 비우기', '임포트비우기')
      .addItem('직전 임포트 되돌리기', '임포트취소')
      .addSeparator()
      .addItem('임포트 표시를 L열로 옮기기 (한 번만)', '임포트마커이전')
      .addItem('분류규칙 기본값 덮어쓰기', '규칙초기화')
      .addSeparator()
      /* 점검은 읽기만 한다. 적용은 확인창(정리적용확인)을 거친다.
         편집기 함수 드롭다운은 직전 함수가 도는 사고가 있어서,
         지우는 동작도 메뉴로 부르는 편이 안전하다 — cleanup.js 주석 참고. */
      .addItem('중복 정리 점검 (안 바꿈)', '정리점검')
      .addItem('중복 정리 적용 (지웁니다)', '정리적용확인')
      .addSeparator()
      .addItem('입력자 열 점검 (안 바꿈)', '입력자점검')
      .addItem('입력자 열 비우기 (지웁니다)', '입력자비우기확인')
      .addSeparator()
      .addItem('카드 부채 점검 (안 바꿈)', '카드부채점검')
      .addSeparator()
      .addItem('이름 바꾸기 점검 (안 바꿈)', '이름바꾸기점검')
      .addItem('이름 바꾸기 적용 (바꿉니다)', '이름바꾸기적용')
      .addSeparator()
      .addItem('재무상태표 기준월 최신으로', '기준월최신으로')
      .addToUi();
  } catch (e) {}
}

function ss_() {
  try { var a = SpreadsheetApp.getActive(); if (a) return a; } catch (e) {}
  return SpreadsheetApp.openById(IMP_ID);
}
function say_(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) {} Logger.log(m); return m; }

/* ───── 초기 설정 ───── */
function 초기설정() {
  var ss = ss_();
  return say_('초기 설정 완료\n\n' + makeRules_(ss, false) + '\n' + makeImport_(ss));
}
function 규칙초기화() { return say_(makeRules_(ss_(), true)); }

function makeRules_(ss, force) {
  var sh = ss.getSheetByName(RUL);
  if (sh && !force) return RUL + ' 시트: 이미 있어서 그대로 뒀습니다';
  if (!sh) sh = ss.insertSheet(RUL);
  sh.clear();
  sh.getRange('A1').setValue('분류규칙 — 내용에 키워드가 들어 있으면 그 대분류로 자동 분류합니다')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1F3A5F');
  sh.getRange('A2').setValue('위에서부터 검사해서 먼저 걸리는 규칙을 씁니다. 새 가맹점이 생기면 아래에 한 줄 추가하세요.')
    .setFontSize(9).setFontColor('#888888');
  sh.getRange(4, 1, 1, 4).setValues([['키워드(부분일치)', '대분류', '고정/변동', '메모']])
    .setBackground('#1F3A5F').setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(5, 1, DEFAULT_RULES.length, 3).setValues(DEFAULT_RULES);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 130);
  sh.setColumnWidth(3, 90); sh.setColumnWidth(4, 300);
  sh.setFrozenRows(4);
  return RUL + ' 시트: 규칙 ' + DEFAULT_RULES.length + '개 기록';
}

function makeImport_(ss) {
  var sh = ss.getSheetByName(IMP);
  if (sh) return IMP + ' 시트: 이미 있어서 그대로 뒀습니다';
  sh = ss.insertSheet(IMP, 5);
  sh.getRange('A1').setValue('임포트 — 여기에 붙여넣고 [가계부 → ② 임포트 실행]')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1F3A5F');
  sh.getRange('A2').setValue('날짜 · 내용 · 결제수단/계좌 · 입력자 · 금액만 채우면 됩니다. 구분과 대분류는 비워두면 분류규칙으로 자동 채웁니다.')
    .setFontSize(9).setFontColor('#888888');
  sh.getRange('A3').setValue("중복(날짜+금액+내용)과, 소유자가 '공동'인 계좌의 아내 데이터는 자동으로 건너뜁니다. 처리 결과는 H열에 표시됩니다.")
    .setFontSize(9).setFontColor('#888888');
  sh.getRange(4, 1, 1, 8).setValues([['날짜', '구분', '대분류', '내용', '결제수단/계좌', '입력자', '금액', '처리결과']])
    .setBackground('#1F3A5F').setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(5, 1, 2000, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(5, 7, 2000, 1).setNumberFormat('#,##0');
  var w = [95, 90, 110, 250, 130, 70, 100, 260];
  for (var i = 0; i < w.length; i++) sh.setColumnWidth(i + 1, w[i]);
  sh.setFrozenRows(4);
  return IMP + ' 시트: 새로 만들었습니다';
}

function 임포트비우기() {
  var sh = ss_().getSheetByName(IMP);
  if (!sh) return say_('임포트 시트가 없습니다.');
  var last = sh.getLastRow();
  if (last >= 5) sh.getRange(5, 1, last - 4, 8).clearContent();
  return say_('임포트 시트를 비웠습니다.');
}

/* ───── 임포트 실행 ───── */
function 임포트실행() {
  var ss = ss_();
  var im = ss.getSheetByName(IMP), tx = ss.getSheetByName(TXS), rl = ss.getSheetByName(RUL);
  if (!im || !rl) return say_('먼저 [가계부 → ① 초기 설정]을 실행하세요.');
  if (!tx) return say_('거래내역 시트를 찾을 수 없습니다.');

  var last = im.getLastRow();
  if (last < 5) return say_('임포트 시트에 데이터가 없습니다.');
  var n = last - 4;
  var v = im.getRange(5, 1, n, 7).getValues();

  var rn = rl.getLastRow() - 4;
  var rv = rn > 0 ? rl.getRange(5, 1, rn, 3).getValues().filter(function (r) { return r[0]; }) : [];

  var gmap = {};
  ss.getSheetByName(SETS).getRange(5, 1, 60, 2).getValues().forEach(function (r) {
    if (r[0]) gmap[String(r[0]).trim()] = String(r[1]).trim();
  });

  var own = {};
  var ac = ss.getSheetByName(ACCS);
  if (ac) ac.getRange(5, 1, 60, 4).getValues().forEach(function (r) {
    if (r[0]) own[String(r[0]).trim()] = String(r[3]).trim();
  });

  var seen = {}, tn = tx.getLastRow() - 1;
  if (tn > 0) tx.getRange(2, 1, tn, 7).getValues().forEach(function (r) {
    if (r[0]) { var kk = key_(r[0], r[3], r[6]); seen[kk] = (seen[kk] || 0) + 1; }
  });

  imp_srcCol_(tx);
  var TAG = imp_tag_(ss);
  var out = [], res = [], add = 0, dup = 0, sk = 0, unk = 0, err = 0;
  for (var i = 0; i < n; i++) {
    var r = v[i];
    if (!r[0] || !r[6]) { res.push(['']); continue; }
    var d = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime())) { res.push(['오류 · 날짜를 읽을 수 없음']); err++; continue; }
    var desc = String(r[3] || '').trim();
    var acc = String(r[4] || '').trim();
    var usr = String(r[5] || '').trim();
    var amt = Math.abs(Number(r[6]));

    /* 두 번째 사람이 올린 파일에서 공동계좌 건은 건너뛴다 — 첫 번째 사람 것에
       이미 들어 있어서 두 번 잡힌다. 이름은 api.js 의 PEOPLE 한 곳에서 온다. */
    if (usr === PEOPLE[1] && own[acc] === '공동') { res.push(['건너뜀 · 공동계좌(이미 반영된 거래)']); sk++; continue; }

    var k = key_(d, desc, amt);
    if (seen[k] > 0) { seen[k]--; res.push(['건너뜀 · 중복']); dup++; continue; }

    var cat = String(r[2] || '').trim(), fv = '', auto = false;
    if (!cat) {
      auto = true;
      var U = desc.toUpperCase();
      for (var j = 0; j < rv.length; j++) {
        if (U.indexOf(String(rv[j][0]).toUpperCase()) >= 0) {
          cat = String(rv[j][1]).trim(); fv = String(rv[j][2] || '').trim(); break;
        }
      }
    }
    var note;
    if (!cat) { cat = '기타지출'; unk++; note = '추가 · 분류실패 → 기타지출 (규칙 추가 필요)'; }
    else note = auto ? ('추가 · 자동분류 ' + cat) : '추가';

    var g = String(r[1] || '').trim() || gmap[cat] || '지출';
    out.push([d, g, cat, desc, acc, usr, amt, fv || '변동', '', '', '', TAG]);
    res.push([note]); add++;
  }

  if (out.length) {
    var st = tx.getLastRow() + 1;
    tx.getRange(st, 1, out.length, TX_COLS).setValues(out);
    tx.getRange(st, 1, out.length, 1).setNumberFormat('yyyy-mm-dd');
    tx.getRange(st, 7, out.length, 1).setNumberFormat('#,##0');
    /* 정렬은 반드시 전체 열로. 9열만 걸면 J·K·L 이 제자리에 남는다. */
    tx.getRange(2, 1, tx.getLastRow() - 1, TX_COLS).sort({ column: 1, ascending: true });
  }
  if (res.length) im.getRange(5, 8, res.length, 1).setValues(res);

  return say_('임포트 완료 — ' + TAG + '\n\n' +
    '추가 ' + add + '건\n' +
    '중복 건너뜀 ' + dup + '건\n' +
    '공동계좌 건너뜀 ' + sk + '건\n' +
    '분류실패(기타지출로 넣음) ' + unk + '건\n' +
    (err ? '날짜 오류 ' + err + '건\n' : '') +
    '\n자세한 결과는 임포트 시트 H열을 보세요.');
}

function key_(d, desc, amt) {
  var dd = (d instanceof Date)
    ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd')
    : String(d);
  var s = String(desc || '').replace(/[\s()\[\]·.\-_,]/g, '').toUpperCase().slice(0, 8);
  return dd + '|' + s + '|' + Math.abs(Number(amt));
}
/* 「직전」 배치만 되돌린다.

   예전에는 I열이 '임포트' 인 행을 전부 지웠다. 임포트실행이 이전 표시를
   안 지우니, 두 번 임포트한 뒤 한 번 되돌리면 두 배치가 같이 날아간다.
   실측으로 4,300행 중 981행이 그 상태였다 — 한 번 누르면 23%가 사라진다.
   이제 L열 배치 태그가 가장 늦은 것만 고르고, 지우기 전에 몇 행인지 보인다. */
function 임포트취소() {
  var ss = ss_();
  var tx = ss.getSheetByName(TXS);
  var n = tx.getLastRow() - 1;
  if (n < 1) return say_('거래내역이 비어 있습니다.');
  imp_srcCol_(tx);

  var vv = tx.getRange(2, SRC_COL, n, 1).getValues();
  var last = '';
  for (var i = 0; i < n; i++) {
    var t = String(vv[i][0] || '').trim();
    /* 태그가 「임포트 yyyy-MM-dd HH:mm」 라 문자열 비교로 최신이 가려진다 */
    if (t.indexOf(SRC_PREFIX) === 0 && t > last) last = t;
  }
  if (!last) {
    return say_('되돌릴 임포트가 없습니다.\n\n' +
      '옛 임포트는 표시가 I열(메모)에 있습니다. ' +
      '[가계부 → 임포트 표시를 L열로 옮기기] 를 먼저 한 번 실행하세요.');
  }

  var del = [];
  for (var j = 0; j < n; j++) if (String(vv[j][0] || '').trim() === last) del.push(j + 2);

  var ui = imp_ui_();
  if (ui) {
    var ans = ui.alert('직전 임포트 되돌리기',
      '「' + last + '」 로 들어온 ' + del.length + '행을 지웁니다.\n' +
      '되돌릴 수 없습니다. 진행할까요?', ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return say_('취소했습니다. 아무것도 안 지웠습니다.');
  }

  for (var k = del.length - 1; k >= 0; k--) tx.deleteRow(del[k]);
  var im = ss.getSheetByName(IMP);
  if (im && im.getLastRow() >= 5) im.getRange(5, 8, im.getLastRow() - 4, 1).clearContent();
  if (typeof api_bump_ === 'function') { try { api_bump_(); } catch (e) {} }
  return say_('「' + last + '」 ' + del.length + '행을 되돌렸습니다.');
}

/* ───── 한 번만 쓰는 이사 도구 ─────
   I열(메모)에 '임포트' 라고만 적혀 있던 옛 표시를 L열 배치 태그로 옮긴다.
   옛 행들은 배치를 구분할 방법이 없어 전부 「임포트 (이전)」 하나로 묶는다.
   그 묶음은 「직전」이 될 수 없으니 임포트취소가 건드리지 않는다 — 의도한 것이다.

   메모가 진짜로 적힌 행(실측 124행: 「뱅샐 누락분」·「급여」·「지역화폐」…)은
   손대지 않는다. 값이 정확히 '임포트' 인 칸만 옮긴다. */
function 임포트마커이전() {
  var ss = ss_();
  var tx = ss.getSheetByName(TXS);
  if (!tx) return say_('거래내역 시트를 찾을 수 없습니다.');
  var n = tx.getLastRow() - 1;
  if (n < 1) return say_('거래내역이 비어 있습니다.');

  var memo = tx.getRange(2, 9, n, 1).getValues();
  var hit = [];
  for (var i = 0; i < n; i++) if (String(memo[i][0] || '').trim() === '임포트') hit.push(i);
  if (!hit.length) {
    return say_('옮길 표시가 없습니다.\n이미 옮겼거나, 임포트로 들어온 행이 없습니다.');
  }

  var ui = imp_ui_();
  if (ui) {
    var ans = ui.alert('임포트 표시를 L열로 옮기기',
      hit.length + '행의 I열(메모) 「임포트」 를 L열(출처)로 옮깁니다.\n' +
      '메모가 적힌 다른 행은 건드리지 않습니다.\n\n' +
      '먼저 거래내역 백업 시트를 만듭니다. 진행할까요?', ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return say_('취소했습니다. 아무것도 안 바꿨습니다.');
  }

  var stamp = Utilities.formatDate(new Date(),
    ss.getSpreadsheetTimeZone() || 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var bk = '거래내역_백업_' + stamp;
  tx.copyTo(ss).setName(bk);

  imp_srcCol_(tx);
  var src = tx.getRange(2, SRC_COL, n, 1).getValues();
  var tag = SRC_PREFIX + '(이전)';
  for (var j = 0; j < hit.length; j++) { src[hit[j]][0] = tag; memo[hit[j]][0] = ''; }
  tx.getRange(2, SRC_COL, n, 1).setValues(src);
  tx.getRange(2, 9, n, 1).setValues(memo);
  if (typeof api_bump_ === 'function') { try { api_bump_(); } catch (e) {} }

  return say_('옮겼습니다.\n\n' +
    '· ' + hit.length + '행 → L열 「' + tag + '」\n' +
    '· I열(메모)의 그 칸은 비웠습니다\n' +
    '· 백업 시트: ' + bk);
}
