/* ═════════════════════════════════════════════════════════════
   수신함 — 폰 알림을 받아 쌓아두는 곳
   MacroDroid/Tasker 등이 알림을 잡아 여기로 쏜다. 파싱은 실패해도
   원문은 반드시 남긴다. 확인은 사람이 앱에서 한다.

   인증: 구글 토큰이 아니라 스크립트 속성의 INBOX_KEY (긴 랜덤값).
        이 경로는 '수신함에 쓰기'만 가능하고 거래내역 조회·수정은 못 한다.
        키는 절대 소스에 두지 않는다 — 저장소가 공개라서.
   ═════════════════════════════════════════════════════════════ */

var INBOX_SHEET = '수신함';
/* J열 소유자 = 어느 폰에서 온 알림인가.
   부부가 같은 앱(카카오뱅크·토스 등)을 쓰면 패키지명만으로는 계좌를 못 가른다.
   그래서 폰이 URL 파라미터 w 로 알려주고, 시트에 남긴다.
   저장까지 하는 이유 — 안 남기면 나중에 수신함_다시파싱() 을 돌릴 때
   누구 폰이었는지를 잃어버려 파서를 고칠 때마다 소유자가 틀어진다.
   빈 값이면 힌트 없음으로 보고 예전과 똑같이 동작한다. */
var INBOX_COLS = ['수신시각', '출처', '원문', '날짜', '가맹점', '금액', '결제수단', '상태', '거래행', '소유자'];

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

/* 헤더는 시트를 처음 만들 때만 쓴다. 이미 있던 시트는 J열이 없을 수 있으므로
   읽을 때 실제 열 수로 잘라 준다. 없는 열은 undefined 로 나와 ''로 취급된다. */
function inbox_ncols_(sh) {
  return Math.min(INBOX_COLS.length, sh.getMaxColumns());
}

/* ───────── 소유자(누구 폰인가) ─────────
   URL 로 아무 값이나 들어올 수 있으니 설정 시트 F5~ 사용자 목록에 있는
   이름만 통과시킨다. 목록에 없으면 빈 문자열 — 힌트 없음과 같다. */
function inbox_users_() {
  var c = CacheService.getScriptCache(), k = 'inbusr' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = [];
  var sh = api_ss_().getSheetByName('설정');
  if (sh) {
    sh.getRange(5, 6, 40, 1).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim();
      if (n && out.indexOf(n) < 0) out.push(n);
    });
  }
  try { c.put(k, JSON.stringify(out), 1500); } catch (e) {}
  return out;
}

/* ⚠️ 이름을 바꾸면 폰은 안 따라온다 (2026-08-08 실제 사고).
   8/5 에 두 폰 플로우를 `&w=아내` · `&w=폴` 로 만들어 뒀는데, 8/7 에 사람
   이름을 「폴·아내」에서 「고미·고니」로 바꿨다. 그 뒤로 아내 폰에서 온
   알림이 전부 여기서 버려져 수신함에 「폰 미상」으로 쌓였다. 버렸다는
   기록조차 안 남겨서 사흘을 몰랐다.

   그래서 두 가지를 한다.
     ① 애칭 표(PERSON_ALIAS)로 옛 이름을 이어준다 — 폰을 안 고쳐도 낫는다.
     ② 그래도 모르는 이름이면 inbox_whoRaw_ 로 원래 값을 남겨서
        맥박에 「모르는 이름: 아내」로 뜨게 한다. 조용히 사라지지 않는다. */
function inbox_who_(w) {
  var v = String(w || '').trim();
  if (!v) return '';
  var users = inbox_users_();
  if (users.indexOf(v) >= 0) return v;

  /* 애칭 표는 {사람: [다른 이름들]} 이다. 어느 쪽으로 적혀 있어도 찾도록
     키와 값을 한 묶음으로 놓고 그 안에 v 가 있는지 본다. */
  var al = (typeof api_alias_ === 'function') ? api_alias_() : {};
  var keys = Object.keys(al);
  for (var i = 0; i < keys.length; i++) {
    var names = [keys[i]].concat(al[keys[i]] || []);
    if (names.indexOf(v) < 0) continue;
    for (var j = 0; j < names.length; j++) {
      if (users.indexOf(names[j]) >= 0) return names[j];
    }
  }
  return '';
}

/* 못 알아들은 이름 그대로. 진단용이라 길이만 막는다 — URL 로 아무거나
   들어오므로 이 값을 사람 이름으로 믿고 쓰면 안 된다. */
function inbox_whoRaw_(w) {
  return String(w || '').trim().slice(0, 20);
}

/* base = '카카오뱅크' 같은 기관/표시명 후보. who 가 있으면 그 사람 소유 계좌를
   먼저 고른다. 표시명이 '기관(아내)' 규칙을 따르긴 하지만 이름 규칙이 아니라
   계좌 시트 D열 소유자를 본다 — 이름 규칙은 언제든 깨질 수 있다.
   who 소유 계좌를 못 찾으면 base 를 그대로 둔다. 공동 계좌(토스부부)가
   어느 폰에서 오든 공동으로 남는 건 이 폴백 덕분이다. */
function inbox_acc_(base, who) {
  if (!base) return '';
  var accs = (typeof accountsAll_ === 'function') ? accountsAll_() : [];
  if (who) {
    for (var i = 0; i < accs.length; i++) {
      if (accs[i].owner === who && String(accs[i].name).indexOf(base) === 0) return accs[i].name;
    }
  }
  return base;
}

/* ───────── 파싱 ─────────
   알림 문구는 카드사·페이사마다 제각각이라 규칙을 느슨하게 잡는다.
   못 읽어낸 값은 비워두고 원문을 남긴다. 앱에서 사람이 고친다. */

var INBOX_NOISE = [
  '승인', '결제', '출금', '입금', '사용', '완료', '취소', '일시불', '할부',
  '누적', '잔액', '체크', '신용', '카드', '알림', '님', '건', '원',
  '개월', '금액', '내역', '확인', '및', '총', '승인취소', '해외', '국내'
];

function inbox_amt_(s) {
  /* '13,000원' 같은 패턴 중 가장 큰 값을 쓴다. 누적/잔액이 같이 오는
     알림이 있어 첫 번째가 결제액이 아닌 경우가 있는데, 그런 알림은
     보통 결제액이 앞이고 잔액이 뒤라 최댓값이 틀릴 수 있다.
     → 첫 번째 값을 결제액으로 보되, 잔액/누적 뒤의 숫자는 제외한다. */
  var cut = String(s || '').split(/잔액|누적|한도|잔여|적립|포인트|마일리지/)[0];
  var m = cut.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
  if (!m) m = cut.match(/KRW\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)/);
  if (!m) return 0;
  return Number(String(m[1]).replace(/,/g, '')) || 0;
}

function inbox_isCancel_(s) {
  return /취소|환불|승인취소/.test(s);
}

/* 계좌 시트 표시명 중 알림 문구·앱 이름에 나타나는 것을 고른다 */
/* 앱 패키지명은 문구보다 훨씬 믿을 만한 단서다. 문구는 카드사마다
   제각각이지만 패키지명은 고정이다. 다만 토스처럼 한 앱이 여러 계좌를
   덮는 경우가 있어서, 문구로 계좌명이 잡히면 그쪽을 먼저 쓴다. */
var INBOX_PKG = [
  ['com.hyundaicard',        '현대카드'],
  ['com.wooricard',          '우리카드'],
  ['com.wooribank',          '우리은행'],
  ['com.shinhancard',        '신한카드'],
  ['com.shinhan',            '신한은행'],
  ['com.kbcard',             '국민카드'],
  ['com.kbstar',             '국민은행'],
  ['com.samsungcard',        '삼성카드'],
  ['com.lcacApp',            '롯데카드'],
  ['com.lotte',              '롯데카드'],
  ['com.hanaskcard',         '하나카드'],
  ['com.kebhana',            '하나은행'],
  ['com.hanabank',           '하나은행'],
  ['nh.smart',               '농협'],
  ['com.nh',                 '농협'],
  ['com.IBK',                '기업은행'],
  ['com.kakaobank',          '카카오뱅크'],
  ['com.kakaopay',           '카카오페이'],
  ['com.kakao.pay',          '카카오페이'],
  ['viva.republica',         '토스'],
  ['com.nhn.android.search', '네이버페이'],
  ['com.naver',              '네이버페이'],
  ['com.nhnpayco',           '페이코'],
  /* 지역화폐(코나아이 발급). 앱 패키지는 실제 알림으로 확인 전 추정치라
     문구 별칭이 먼저 잡도록 뒤에 둔다. */
  ['com.konai',              '경기지역화폐'],
  ['kr.co.kona',             '경기지역화폐'],
  ['com.samsung.android.spay', '삼성페이']
];
function inbox_pkgPay_(src) {
  var v = String(src || '');
  if (!v) return '';
  /* 가장 긴 접두사가 이긴다. 'com.nh'(농협) 가 'com.nhn.android.search'
     (네이버) 보다 먼저 걸려서 네이버페이가 농협으로 둔갑했었다. */
  var best = '', bestLen = 0;
  for (var i = 0; i < INBOX_PKG.length; i++) {
    var k = INBOX_PKG[i][0];
    if (v.indexOf(k) === 0 && k.length > bestLen) { best = INBOX_PKG[i][1]; bestLen = k.length; }
  }
  return best;
}

/* 결제 알림처럼 보이는가. 플로우가 앱을 안 가리고 다 넘겨도
   수신함이 카톡·뉴스로 덮이지 않게 하는 문턱이다. */
/* 「~하지 않았습니다」·「~되지 않았습니다」 같은 안내문.
   키워드를 부분 문자열로 보기 때문에 「결제하지 않은 건이 있습니다」가
   결제로 통과했다(미해결 ⑱). 폴은 [무시]를 누르면 그만이었지만 처음
   쓰는 사람에겐 「이 앱 이상한데」로 읽힌다.

   ⚠️ 키워드 목록을 좁히는 쪽으로 고치면 안 된다 — 진짜 결제를 놓칠
      위험이 더 크다. 부정형만 앞에서 걷어낸다.
   ⚠️ 「결제 취소」는 진짜 거래다(상태 `취소보류`). 부정 표현이 아니므로
      아래 정규식에 안 걸린다. */
var INBOX_NEG = /(결제|출금|입금|승인|이체|납부|사용)\s*(이|가|을|를|은|는)?\s*(하지|되지|하시지|받지)\s*(않|못)/;

/* ═══════════ 들어온 돈인가 나간 돈인가 (1.44.0) ═══════════
   폴 2026-08-10: 「캐시백 입금건까지 -로 표시하네」

   수신함 줄에 앱이 **전부 마이너스**를 붙이고 있었다. 「프렌즈 체크카드
   캐시백 입금」은 «들어온» 돈인데 −584 로 그려졌다. 서버가 방향을 아예
   안 보고 있었고, 앱은 그걸 모른 채 부호를 지어내고 있었다.

   ⚠️ 수신함의 계약은 「결제만 담는다」라서 **기본은 나간 돈이 맞다.**
   그래서 여기서는 「들어온 돈으로 «보이는» 것만」 골라낸다. 모르면 종전대로
   나간 돈이다 — 멀쩡히 읽히던 대다수를 부호 없는 줄로 만들면 그게 더 나쁘다.

   ⚠️⚠️ **「입출금알림」에는 입금과 출금이 «둘 다» 들어 있다.** 그대로 대면
   은행 앱 이름만으로 들어온 돈이 돼버린다. 먼저 지운다.
   ⚠️⚠️ **들어온 말과 나간 말이 «같이» 있는 게 흔하다.** 실물(폴 2026-08-10):

     「프렌즈 체크카드 캐시백 입금결과 안내 … **결제**금액에 대한
       캐시백 584원이 계좌로 **입금**되었습니다」

   여기서 「결제」는 «무엇에 대한» 캐시백인지를 설명하는 말이지 이 알림이 한
   일이 아니다. 처음엔 「섞이면 나간 돈」으로 뒀는데, 그래서 캐시백 넉 줄 중
   셋이 그대로 마이너스로 남았다.

   **한국어 결제 알림은 «한 일»을 문장 끝에 적는다.** 그래서 IN·OUT 낱말 중
   **마지막에 나온 쪽**을 따른다. 위 문장은 마지막이 「입금」이라 들어온 돈이고,
   「요금납부 … 출금 내 통장 → 삼성카드」는 마지막이 「출금」이라 나간 돈이다.
   둘 다 없으면 종전대로 나간 돈이다 (수신함은 원래 결제를 담는 곳). */
var INBOX_IN  = /입금|캐시백|캐쉬백|급여|월급|이자지급|환급|환입/g;
var INBOX_OUT = /출금|결제|승인|납부|이체|송금|사용/g;

/* 마지막으로 걸린 자리를 준다. 없으면 -1. (정규식은 g 라 lastIndex 를 씻는다) */
function inbox_lastHit_(re, t) {
  re.lastIndex = 0;
  var m, at = -1;
  while ((m = re.exec(t)) !== null) { at = m.index; if (m.index === re.lastIndex) re.lastIndex++; }
  return at;
}

function inbox_dir_(raw) {
  /* ⚠️ 「입출금알림」·「입출금통장」에는 입금과 출금이 «둘 다» 들어 있다.
     그대로 대면 은행 앱·통장 이름만으로 방향이 뒤집힌다. 먼저 지운다. */
  var t = String(raw || '').replace(/입출금/g, '');
  var i = inbox_lastHit_(INBOX_IN, t);
  var o = inbox_lastHit_(INBOX_OUT, t);
  if (i < 0) return 'out';
  return i > o ? 'in' : 'out';
}

function inbox_looksLikePayment_(raw) {
  var s = String(raw || '');
  if (!/[0-9]\s*원|KRW\s*[0-9]/.test(s)) return false;
  if (INBOX_NEG.test(s)) return false;
  return /승인|결제|출금|입금|사용|취소|환불|이체|납부/.test(s);
}

/* who = '고미' | '고니' | '' — 어느 폰에서 온 알림인가. 세 단계 어디서 골라도
   마지막에 inbox_acc_ 로 그 사람 계좌로 좁힌다. */
function inbox_pay_(text, src, who) {
  var hay = String(text || '') + ' ' + String(src || '');
  var accs = (typeof accountsAll_ === 'function') ? accountsAll_() : [];
  /* 표시명이 원문에 통째로 들어 있으면 가장 긴 것이 이긴다. 다만 who 가
     있으면 그 사람 소유 계좌 안에서 먼저 찾는다 — 원문에 '카카오뱅크'만
     있어도 이름이 더 긴 '카카오뱅크(아내)' 가 이겨버리는 걸 막는다. */
  var best = '', bestLen = 0;
  function scan(only) {
    best = ''; bestLen = 0;
    accs.forEach(function (a) {
      var n = a.name;
      if (only && a.owner !== only) return;
      if (n && n.length > bestLen && hay.indexOf(n) >= 0) { best = n; bestLen = n.length; }
    });
  }
  if (who) scan(who);
  if (!best) scan('');
  if (best) return inbox_acc_(best, who);
  /* 계좌 표시명이 안 걸리면 기관 키워드로 한 번 더.
     이게 패키지명보다 먼저인 이유: 별칭표는 '토스' → '토스부부' 처럼
     실제 계좌 표기로 바꿔주는데, 패키지명은 '토스' 까지밖에 못 준다. */
  var alias = [
    /* 토스 모임통장 카드는 알림 문구에 '토스' 가 아예 안 나온다.
         13,410원 결제 부부통장 카드 | 쿠팡(쿠페이)  잔액 479,672원
       그래서 표시명·'토스' 별칭을 다 지나쳐 패키지명(viva.republica → '토스')
       까지 내려가고, 거기서 inbox_acc_ 가 폴 소유의 '토스개인' 을 골랐다.
       계좌 시트에 '토스부부' 는 공동이라 who 로는 절대 못 고른다 — 문구로 잡는다.
       '토스' 별칭보다 반드시 앞에 둔다. (2026-08-05 실측) */
    ['토스부부', '부부통장'], ['토스부부', '모임통장'],
    ['네이버페이', '네이버'], ['카카오페이', '카카오페이'], ['카카오뱅크', '카카오뱅크'],
    ['토스부부', '토스'], ['하나은행', '하나'], ['우리카드', '우리카드'],
    ['현대카드', '현대'], ['삼성카드', '삼성'], ['국민은행', '국민'], ['신한은행', '신한'],
    /* 화성 지역화폐 = 화성사랑카드, 계좌 시트 표시명은 '경기지역화폐'.
       알림 문구에는 '경기지역화폐' 라고 안 나오므로 별칭으로 잇는다. */
    ['경기지역화폐', '화성사랑'], ['경기지역화폐', '지역화폐'],
    ['경기지역화폐', '코나카드'], ['경기지역화폐', '코나아이']
  ];
  for (var i = 0; i < alias.length; i++) {
    if (hay.indexOf(alias[i][1]) >= 0) return inbox_acc_(alias[i][0], who);
  }
  /* 문구에 기관 이름이 아예 없는 알림도 있다. 마지막으로 패키지명.
     카카오뱅크 입금 알림이 여기까지 오는데, 부부가 같은 패키지를 쓰므로
     소유자 힌트가 가장 절실한 지점이다. */
  return inbox_acc_(inbox_pkgPay_(src), who);
}

/* 이미 등록된 사용처(가게) 목록 — 가장 긴 이름부터 맞춰본다 */
function inbox_merchants_() {
  var c = CacheService.getScriptCache(), k = 'inbmer' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = [];
  var sh = api_ss_().getSheetByName('사용처');
  if (sh && sh.getLastRow() >= 5) {
    sh.getRange(5, 1, sh.getLastRow() - 4, 1).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim();
      if (n.length >= 2) out.push(n);
    });
  }
  out.sort(function (a, b) { return b.length - a.length; });
  try { c.put(k, JSON.stringify(out), 1500); } catch (e) {}
  return out;
}

/* 카드·계좌 이름은 가맹점이 아니다 */
function inbox_names_() {
  var names = [];
  ((typeof accountsAll_ === 'function') ? accountsAll_() : []).forEach(function (a) {
    if (a.name) names.push(a.name);
  });
  ['현대카드', '삼성카드', '우리카드', '하나카드', '롯데카드', '신한카드', '국민카드',
   '토스', '토스뱅크', '카카오뱅크', '카카오페이', '네이버페이', '페이코', '농협',
   '케이뱅크', '신한은행', '국민은행', '기업은행', '하나은행', '우리은행',
   '화성사랑카드', '화성사랑', '지역화폐', '경기지역화폐', '코나아이',
   '코나카드'].forEach(function (n) {
    if (names.indexOf(n) < 0) names.push(n);
  });
  return names;
}

function inbox_merchant_(s) {
  var raw = String(s || '');

  /* 1) 등록된 사용처가 원문에 있으면 그대로 쓴다. 가장 정확하다. */
  var mers = inbox_merchants_();
  for (var i = 0; i < mers.length; i++) {
    if (raw.indexOf(mers[i]) >= 0) return mers[i];
  }

  /* 2) 없으면 토큰에서 추린다.
     실측 문구:
       현대카드 김승화 님, 네이버 현대카드 승인 14,892원 일시불, 8/4 16:33
       토스 22,900원 결제 쿠팡(쿠페이)
       네이버페이 1,900원 결제 완료 컬리(멤버스)
     카드명·예금주·노이즈를 걷어내면 남는 첫 토막이 가맹점이다. */
  var t = raw.replace(/[\r\n]+/g, ' ')
             .replace(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/g, ' ')
             .replace(/[0-9]{1,2}[:시][0-9]{1,2}분?/g, ' ')
             .replace(/[0-9]{1,4}[\/\.\-][0-9]{1,2}[\/\.\-]?[0-9]{0,2}/g, ' ');

  /* 토큰 앞뒤 문장부호 제거 — '일시불,' 같은 게 노이즈 목록에 안 걸리던 문제.
     대괄호도 뗀다. '[화성사랑카드]' 가 카드 이름으로 안 걸리고
     그대로 가맹점이 되던 문제가 있었다.
     소괄호는 건드리지 않는다. '컬리(멤버스)' 가 '컬리(멤버스' 로 깨진다. */
  var toks = t.split(/\s+/).map(function (w) {
    return w.replace(/^["'·,\.\[\]【】]+/, '').replace(/["'·,\.;:\[\]【】]+$/, '');
  }).filter(String);

  /* '님' 은 예금주 표시. 떨어져 있으면('김승화 님') 앞 토막까지,
     붙어 있으면('김승화님') 그 토막을 통째로 버린다. */
  var keep = [];
  for (var k = 0; k < toks.length; k++) {
    var w = toks[k];
    if (w === '님') { keep.pop(); continue; }
    if (w.length >= 2 && w.slice(-1) === '님') continue;
    keep.push(w);
  }

  var names = inbox_names_();
  function bad(w) {
    return w.length < 2 || /^[0-9,\.\-]+$/.test(w) ||
           names.indexOf(w) >= 0 || INBOX_NOISE.indexOf(w) >= 0;
  }
  /* 쓸 만한 토막이 처음 나오는 지점부터, 끊길 때까지를 통째로 가맹점으로 본다.
     '스타벅스 코리아' 처럼 두 단어인 상호를 살리기 위함. */
  var a = -1, b = -1;
  for (var i = 0; i < keep.length; i++) {
    if (!bad(keep[i])) { if (a < 0) a = i; b = i; }
    else if (a >= 0) break;
  }
  return a >= 0 ? keep.slice(a, b + 1).join(' ') : '';
}

/* ───────── 맥박 ─────────
   폰이 살아 있는가. 결제든 카톡이든 요청이 서버에 닿기만 하면 찍는다.
   수신함에 안 남는 요청(중복·비결제)까지 세어야
     「플로우가 죽었다」  — 요청 자체가 끊김
     「결제 알림만 안 온다」 — 요청은 오는데 결제가 없음
   을 가를 수 있다. 8/5 현대카드 건에서 이 둘을 구분할 방법이 없었다.
   쓰기가 잦아지지 않게 60초 안쪽 재기록은 건너뛴다. */
var INBOX_HB_K = 'INBOX_HB';

function inbox_hbGet_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties()
                        .getProperty(INBOX_HB_K) || '{}') || {};
  } catch (e) { return {}; }
}

/* who 를 못 알아들었으면 raw 를 '?이름' 으로 남긴다. 열쇠가 이름마다
   하나씩만 생기므로 늘어나 봐야 사람 수만큼이다. 건강 진단이 이걸 읽어
   「모르는 이름: 아내」로 띄운다. */
function inbox_hb_(who, raw) {
  try {
    var o = inbox_hbGet_();
    var k = who || (raw ? '?' + raw : '?'), t = Date.now();
    if (o['*'] && t - o['*'] < 60000 && o[k] && t - o[k] < 60000) return;
    o[k] = t; o['*'] = t;
    PropertiesService.getScriptProperties().setProperty(INBOX_HB_K, JSON.stringify(o));
  } catch (e) {}
}

/* ───────── 맥박 열쇠 빼기 (1.45.0) ─────────
   폴 2026-08-10: 「장기간 맥박 확인이 안되는 경우 계속 뜨는데 … 제외하고 싶어」

   열쇠는 한 번 생기면 «영영» 안 없어졌다. 없애는 입구가 아예 없었다.
   그리고 안 쓰는 열쇠는 반드시 시간이 지나 빨간불이 된다.
   **고칠 수 없는 경고는 경고가 아니라 소음이고, 소음이 쌓이면 진짜 사고를
   못 본다.** 실제로 이 집에 유령이 셋 있었다:

     폴 · 아내      2026-08-07 에 고미·고니로 이름을 바꾸며 남은 옛 열쇠
     ?              w 없이 수신 주소를 한 번 두드려서 생긴 것 (2026-08-08)

   ⚠️ **여기서만은 「끄기」가 아니라 「지우기」가 맞다.** 자동채움은 무엇을
   배웠었는지가 근거로 남아야 하지만, 맥박은 살아 있으면 **다음 알림 한 건에
   스스로 다시 찍힌다.** 지웠는데 안 돌아오면 그건 진짜로 안 오고 있는 것이고,
   그게 이 화면이 답해야 하는 질문 그대로다. 되돌리기가 저절로 된다. */
function inboxHbDrop_(p) {
  var k = String((p && p.k) || '');
  if (!k) return { ok: false, error: '무엇을 뺄지 안 왔어요' };
  /* '*' 는 「아무 폰이든 닿은 마지막 시각」이다. 이걸 지우면 「폰이 다 살아
     있어요」의 근거가 사라지는데, 그건 유령을 치우는 것과 아무 상관이 없다. */
  if (k === '*') return { ok: false, error: '전체 맥박은 못 빼요' };
  try {
    var o = inbox_hbGet_();
    if (!Object.prototype.hasOwnProperty.call(o, k)) {
      /* 이미 없는 걸 지워 달라는 건 실패가 아니다 — 원하던 상태다.
         두 번 눌렀을 때 빨간 토스트가 뜨면 폴이 뭘 잘못한 줄 안다. */
      return { ok: true, dropped: 0, left: Object.keys(o).length };
    }
    delete o[k];
    PropertiesService.getScriptProperties().setProperty(INBOX_HB_K, JSON.stringify(o));
    return { ok: true, dropped: 1, left: Object.keys(o).length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ───────── 수신로그 (버려진 요청) ─────────
   예전엔 중복·비결제·키오류를 조용히 return 해버려서, 결제가 안 들어왔을 때
   「폰이 안 보냈다」 와 「보냈는데 서버가 버렸다」 를 구분할 수가 없었다.
   버린 것만 적는다 — 담은 것은 수신함에 이미 있으니까. */
var INBOX_LOG_SHEET = '수신로그';
var INBOX_LOG_COLS = ['시각', '출처', '소유자', '결과', '원문'];

function inbox_logSheet_() {
  var ss = api_ss_();
  var sh = ss.getSheetByName(INBOX_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INBOX_LOG_SHEET);
    sh.getRange(1, 1, 1, INBOX_LOG_COLS.length).setValues([INBOX_LOG_COLS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, INBOX_LOG_COLS.length).setFontWeight('bold');
    sh.setColumnWidth(5, 460);
    sh.hideSheet();
  }
  return sh;
}

/* 카톡·뉴스까지 다 적으면 로그가 하루면 덮인다. 결제였을 가능성이 조금이라도
   있는 것 — 금융 앱에서 왔거나 금액처럼 보이는 게 들어 있는 것 — 만 남긴다.
   나머지는 애초에 잃어버린 결제일 수가 없다. */
/* 수신로그에 남길 만한가.
   ⚠️⚠️ 1.52.0 — **`res` 를 받는다.** 예전엔 「출처가 결제 앱이면 무조건 기록」
   이었는데, **토스가 결제 앱**이라 「6,532 걸음」 알림이 전부 로그에 쌓였다.
   한 건마다 `appendRow` 한 번 + 600줄 넘으면 `deleteRows` 까지였다.
   이제 「비결제」로 버리는 건은 **금액이 보일 때만** 남긴다 — 파서를 고칠 거리가
   되는 건 그런 것들이고(예: 「잔액 1,234,567원」), 걸음 수는 아니다.
   ⚠️ 나머지 사유(키오류·오류·중복·빈값)는 **그대로 다 남긴다.** 그건 진단용
   흔적이고, 8/13 사고를 그 시트로 찾아냈다. */
function inbox_worthLog_(src, raw, res) {
  var hasAmt = /[0-9][0-9,]*\s*원|KRW\s*[0-9]/.test(String(raw || ''));
  if (String(res || '') === '비결제') return hasAmt;
  if (inbox_pkgPay_(src)) return true;
  return hasAmt;
}

function inbox_drop_(res, src, who, raw) {
  try {
    if (!inbox_worthLog_(src, raw, res)) return;
    var sh = inbox_logSheet_();
    sh.appendRow([new Date(), String(src || ''), String(who || ''),
                  String(res), String(raw || '').slice(0, 300)]);
    /* 링버퍼 — 600줄을 넘으면 오래된 것부터 잘라 400줄로 되돌린다 */
    var last = sh.getLastRow();
    if (last > 601) sh.deleteRows(2, last - 401);
  } catch (e) {}
}

/* 최근에 버려진 것 — 알림 연결 확인 화면에서 보여준다 */
function inbox_dropsRecent_(n) {
  var out = [];
  try {
    var sh = api_ss_().getSheetByName(INBOX_LOG_SHEET);
    if (!sh) return out;
    var last = sh.getLastRow();
    if (last < 2) return out;
    var take = Math.min(n || 8, last - 1);
    var v = sh.getRange(last - take + 1, 1, take, 5).getValues();
    for (var i = v.length - 1; i >= 0; i--) {
      out.push({
        at: v[i][0] instanceof Date
              ? Utilities.formatDate(v[i][0], api_tz_(), 'MM-dd HH:mm') : '',
        src: String(v[i][1] || ''), who: String(v[i][2] || ''),
        res: String(v[i][3] || ''), raw: String(v[i][4] || '').slice(0, 90)
      });
    }
  } catch (e) {}
  return out;
}

/* ───────── 수신 ───────── */
function inboxPut_(p) {
  var raw = String(p.raw || p.text || '').trim();
  var src = String(p.src || p.pkg || '').trim();
  var who = inbox_who_(p.w);

  /* 무엇이 되든 「요청이 닿았다」 는 사실부터 남긴다.
     아래 어느 갈래로 빠져나가도 이 줄은 이미 지나온 뒤다.
     이름을 못 알아들었으면 보낸 값 그대로 같이 남긴다. */
  inbox_hb_(who, who ? '' : inbox_whoRaw_(p.w));

  if (!raw) { inbox_drop_('빈값', src, who, ''); return { ok: false, error: 'empty' }; }

  /* ⚠️⚠️ 1.52.0 — **결제 판정을 제일 먼저** 한다 (폴 2026-08-15: 배터리).
     예전엔 이 검사가 «중복 검사 뒤»에 있어서, 토스 걸음 수 알림 한 건에도
       · 수신함 시트 열기
       · getLastRow()
       · 최근 300줄 읽기
     를 다 하고 나서야 「비결제」로 버렸다. 3분마다 오는 알림이라 하루
     수백 번이었고, 그래서 응답이 15초 → 28초 → 96초로 밀렸다.
     **폰은 그동안 라디오를 켜 놓고 기다린다 — 그게 배터리다.**
     이 검사는 시트를 안 건드리는 정규식 두 줄이다. 순서만 바꾸면
     쓰레기 알림의 비용이 «시트 왕복 3회 → 0회»가 된다.
     ⚠️ 결과는 안 바뀐다 — 결제 알림은 아래에서 그대로 중복 검사를 받는다. */
  if (!inbox_looksLikePayment_(raw)) {
    inbox_drop_('비결제', src, who, raw);
    return { ok: true, skip: 'not payment' };
  }

  var sh = inbox_sheet_();
  var now = new Date();

  /* 같은 원문이 또 들어오면 언제 오든 중복으로 본다.
     예전엔 5분 안쪽만 걸렀는데, 안드로이드가 묶음 알림을 갱신하면서
     몇 시간 전 알림을 통째로 다시 게시하는 일이 있다. 그때 이미 처리한
     결제가 새 건으로 또 들어왔다. 원문이 같으면 같은 결제다. */
  var last = sh.getLastRow();
  if (last > 1) {
    var n = Math.min(300, last - 1);
    var recent = sh.getRange(last - n + 1, 3, n, 1).getValues();
    for (var i = 0; i < recent.length; i++) {
      if (String(recent[i][0] || '').trim() === raw) {
        inbox_drop_('중복', src, who, raw);
        return { ok: true, dup: true };
      }
    }
  }

  var amt = inbox_amt_(raw);
  /* 금액을 못 읽었으면 '대기'로 두면 안 된다. 0원짜리를 확인 화면에
     띄워봐야 등록이 안 된다. 대신 원문은 남겨서 파서를 고칠 때 쓴다. */
  var st = amt > 0 ? (inbox_isCancel_(raw) ? '취소보류' : '대기') : '확인필요';
  var row = [
    now, src, raw,
    api_pureDate_(p.date || Utilities.formatDate(now, api_tz_(), 'yyyy-MM-dd')),
    inbox_merchant_(raw), amt, inbox_pay_(raw, src, who), st, '', who
  ];
  sh.appendRow(row);
  return { ok: true, row: sh.getLastRow(), amt: amt, state: st, who: who };
}

/* 알림 문구 안의 승인 시각 — '8/4 09:12' 또는 '09:12' */
function inbox_when_(raw) {
  var s = String(raw || '');
  var m = s.match(/(\d{1,2})\s*[\/\.]\s*(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) return { mo: +m[1], d: +m[2], h: +m[3], mi: +m[4] };
  m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return { mo: 0, d: 0, h: +m[1], mi: +m[2] };
  return null;
}

/* 승인 시각과 수신 시각이 30분 넘게 벌어지면 '지난 알림'으로 본다.
   재게시된 옛 알림을 조용히 새 결제로 받아들이지 않기 위한 표시다. */
function inbox_late_(at, raw) {
  if (!(at instanceof Date)) return false;
  var w = inbox_when_(raw);
  if (!w) return false;
  var appr = new Date(at.getFullYear(),
                      w.mo ? w.mo - 1 : at.getMonth(),
                      w.d ? w.d : at.getDate(), w.h, w.mi, 0);
  var gap = Math.abs(at.getTime() - appr.getTime()) / 60000;
  return gap > 30 && gap < 60 * 24 * 40;
}

/* ───────── 카테고리 추천 ─────────
   1) 사용처 시트에 그 가게가 등록돼 있으면 거기 적힌 대분류가 가장 정확하다.
   2) 없으면 분류규칙을 가맹점명에만 먼저 대본다. 원문에는 '네이버페이',
      '카카오페이' 같은 결제사 이름이 섞여 있어서, 원문부터 대면
      실제 가게(컬리·쿠팡)가 아니라 결제사 규칙이 먼저 걸린다.
   3) 그래도 안 잡히면 마지막으로 원문 전체를 대본다. */
function inbox_merCat_() {
  var c = CacheService.getScriptCache(), k = 'inbmc' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var map = {};
  var sh = api_ss_().getSheetByName('사용처');
  if (sh && sh.getLastRow() >= 5) {
    sh.getRange(5, 1, sh.getLastRow() - 4, 2).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim(), cat = String(r[1] || '').trim();
      if (n && cat) map[n] = cat;
    });
  }
  try { c.put(k, JSON.stringify(map), 1500); } catch (e) {}
  return map;
}

function inbox_rules_() {
  var c = CacheService.getScriptCache(), k = 'inbrul' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var out = [];
  var sh = api_ss_().getSheetByName('분류규칙');
  if (sh && sh.getLastRow() >= 5) {
    sh.getRange(5, 1, sh.getLastRow() - 4, 2).getValues().forEach(function (r) {
      var kw = String(r[0] || '').trim(), cat = String(r[1] || '').trim();
      if (kw && cat) out.push([kw.toUpperCase(), cat]);
    });
  }
  try { c.put(k, JSON.stringify(out), 1500); } catch (e) {}
  return out;
}

function inbox_ruleHit_(text, rv) {
  if (!text) return '';
  var U = String(text).toUpperCase();
  for (var i = 0; i < rv.length; i++) {
    if (U.indexOf(rv[i][0]) >= 0) return rv[i][1];
  }
  return '';
}

function inbox_guess_(mer, raw) {
  var mc = inbox_merCat_();
  if (mer && mc[mer]) return mc[mer];
  var rv = inbox_rules_();
  return inbox_ruleHit_(mer, rv) || inbox_ruleHit_(raw, rv) || '';
}

/* ───────── 앱에서 쓰는 조회/확정 ───────── */
/* ───────── 알림 연결 확인 ─────────
   폰마다 Automate 플로우가 살아 있는지 각자 확인할 수 있게 한다.
   권한이나 배터리 최적화를 빼먹으면 백그라운드에서 조용히 죽는데,
   그러면 '알림이 원래 안 오는 카드인가' 와 구분이 안 된다.

   알림 자체에는 어느 폰에서 왔는지가 없다. J열 소유자(w)가 있으면 그걸 쓰고,
   없는 옛 행은 결제수단의 소유자로 미룬다 — 폴 카드 알림이 들어왔으면
   폴 폰은 살아 있다. 공동 계좌는 둘 다일 수 있어서 사람 판정에서 뺀다.

   hb 는 수신함에 안 남은 요청까지 포함한 맥박이다. hb 는 뛰는데 last 가
   멀면 「플로우는 사는데 결제 알림만 안 온다」, hb 자체가 멀면 「폰이 죽었다」. */
function inboxHealth_() {
  var sh = inbox_sheet_();
  var last = sh.getLastRow();
  var own = {};
  accountsAll_().forEach(function (a) { own[a.name] = a.owner || '공동'; });
  var fmt = function (d) {
    return Utilities.formatDate(d, api_tz_(), 'yyyy-MM-dd HH:mm');
  };
  var hbRaw = inbox_hbGet_();
  var hb = { any: 0, by: [] };
  Object.keys(hbRaw).forEach(function (k) {
    var t = Number(hbRaw[k]) || 0;
    if (!t) return;
    if (k === '*') { hb.any = t; return; }
    /* '?이름' 은 폰이 보냈는데 사용자 목록에 없어서 버린 값이다.
       그냥 '(이름 없음)' 으로 뭉개면 「w 를 아예 안 보낸다」 와 구분이
       안 된다 — 고칠 곳이 폰 플로우냐 설정 시트냐가 갈린다. */
    var bad = k.length > 1 && k.charAt(0) === '?';
    /* ⚠️ 1.45.0 — «원래 열쇠»를 같이 실어 보낸다. 화면에 적는 이름은
       「모르는 이름: 아내」처럼 사람이 읽으라고 꾸민 것이라, 그걸로는
       속성에서 무엇을 지울지 못 찾는다. 지우기는 열쇠로만 한다. */
    hb.by.push({ k: k,
                 who: k === '?' ? '(이름 없음)' : bad ? '모르는 이름: ' + k.slice(1) : k,
                 bad: bad, noname: k === '?', t: t, at: fmt(new Date(t)) });
  });
  hb.by.sort(function (a, b) { return b.t - a.t; });
  hb.at = hb.any ? fmt(new Date(hb.any)) : '';

  var out = { last: '', lastT: 0, by: [], srcs: [], total7: 0,
              hb: hb, drops: inbox_dropsRecent_(8) };
  if (last < 2) return out;

  var start = Math.max(2, last - 1500);
  var v = sh.getRange(start, 1, last - start + 1, inbox_ncols_(sh)).getValues();
  var now = new Date(), d7 = now.getTime() - 7 * 864e5;
  var who = {}, src = {}, lastAt = null;

  for (var i = 0; i < v.length; i++) {
    var at = v[i][0];
    if (!(at instanceof Date)) continue;
    if (!lastAt || at > lastAt) lastAt = at;
    var fresh = at.getTime() >= d7;
    if (fresh) out.total7++;

    var sname = String(v[i][1] || '').trim() || '(출처 없음)';
    var S = src[sname] || (src[sname] = { src: sname, last: at, n7: 0 });
    if (at > S.last) S.last = at;
    if (fresh) S.n7++;

    var w = String(v[i][9] || '').trim() || own[String(v[i][6] || '').trim()];
    if (!w || w === '공동') continue;
    var W = who[w] || (who[w] = { who: w, last: at, n7: 0 });
    if (at > W.last) W.last = at;
    if (fresh) W.n7++;
  }
  out.last = lastAt ? fmt(lastAt) : '';
  out.lastT = lastAt ? lastAt.getTime() : 0;
  Object.keys(who).forEach(function (k) {
    out.by.push({ who: k, last: fmt(who[k].last), n7: who[k].n7 });
  });
  out.by.sort(function (a, b) { return a.last < b.last ? 1 : -1; });
  Object.keys(src).forEach(function (k) {
    out.srcs.push({ src: src[k].src, last: fmt(src[k].last), n7: src[k].n7 });
  });
  out.srcs.sort(function (a, b) { return a.last < b.last ? 1 : -1; });
  out.srcs = out.srcs.slice(0, 12);
  return out;
}

function inboxList_() {
  var sh = inbox_sheet_();
  var last = sh.getLastRow();
  if (last < 2) return { items: [] };
  var start = Math.max(2, last - 200);
  var v = sh.getRange(start, 1, last - start + 1, inbox_ncols_(sh)).getValues();
  /* 「한 번 고치면 다음부터 자동」 — 배운 것을 한 번만 읽어 전부에 입힌다 */
  var fill = inbox_fillMap_();
  var out = [];
  for (var i = v.length - 1; i >= 0; i--) {
    var st = String(v[i][7] || '').trim();
    if (st !== '대기' && st !== '취소보류') continue;
    out.push(inbox_fillApply_({
      row: start + i,
      at: v[i][0] instanceof Date ? api_ymd_(v[i][0]) : '',
      src: String(v[i][1] || ''),
      raw: String(v[i][2] || ''),
      date: v[i][3] instanceof Date ? api_ymd_(v[i][3]) : '',
      desc: String(v[i][4] || ''),
      amt: api_n_(v[i][5]),
      pay: String(v[i][6] || ''),
      /* J열 소유자 = 어느 폰에서 온 알림인가. 앱의 「누가 썼나」 기본값이다.
         폴 결정 2026-08-06: 「기본값은 핸드폰 소유자가 낫겠다」 */
      who: String(v[i][9] || '').trim(),
      cat: inbox_guess_(String(v[i][4] || ''), String(v[i][2] || '')),
      /* 들어온 돈인가 나간 돈인가. 앱이 부호를 «지어내지» 않게 알려준다. */
      dir: inbox_dir_(String(v[i][2] || '')),
      late: inbox_late_(v[i][0], String(v[i][2] || '')),
      state: st
    }, fill));
    if (out.length >= 50) break;
  }
  return { items: out };
}

/* ═══════════ 알림 자동채움 — 「한 번 고치면 다음부터 자동」 ═══════════
   폴 2026-08-10: 「확인 버튼 누르고 들어가서 새로 입력하듯이 써야돼서 불편하더라고」

   재 보니 날짜·금액·결제수단·누가는 이미 채워져서 넘어가고 있었다.
   매번 다시 손대는 건 **대분류 · 어디에 · 내용** 셋이었다. 은행 입출금
   알림은 가맹점 자리에 「우리WON뱅킹 입출금알림」 같은 **앱 이름**이 들어와서,
   폴이 매달 똑같이 지우고 다시 쓰고 있었다. 앱이 그걸 **기억한 적이 없다.**

   그래서 [확인]으로 저장할 때, 폴이 «고친» 이름과 대분류를 한 줄 쌓아 둔다.
   다음 달 같은 알림이 오면 그 값으로 채워서 내려간다.

   ⚠️ 왜 「사용처」 시트를 안 쓰나 — 거긴 A 이름 · B 대분류 · C 메모 · D 숨김 ·
   E 건수라 **「고쳐 쓸 이름」을 담을 칸이 없다.** C(메모)에 밀어 넣으면 메모의
   뜻이 오염되고, 새 칸을 끼우면 폴이 쓰던 시트가 밀린다. 남의 시트를 비틀지
   않고 전용 시트를 둔다.

   ⚠️ 시트가 없으면 **만든다.** 폴이 손으로 만들 일을 늘리지 않는다
   (배포패키지 P1: 「시트 13장을 손으로 만들어야 함 — 설치의 진짜 벽」).

   ⚠️ 사람이 열어서 고칠 수 있어야 한다. 조용히 배우고 조용히 채우면 나중에
   「이 값이 어디서 왔지」를 아무도 못 찾는다. G열 「끄기」에 Y 를 적으면
   그 줄은 안 쓴다 — 지우지 않아도 멈출 수 있다. */
var FILL_SHEET = '알림 자동채움';
var FILL_HEAD = ['알림에서 뽑힌 이름', '고쳐 쓴 이름', '대분류',
                 '배운 날', '쓴 횟수', '마지막으로 쓴 날', '끄기(Y)'];

function inbox_fillSheet_(make) {
  var ss = api_ss_();
  var sh = ss.getSheetByName(FILL_SHEET);
  if (sh) return sh;
  if (!make) return null;
  sh = ss.insertSheet(FILL_SHEET);
  /* ⚠️ 헤더는 **글자**다. setValues 가 날짜로 삼키지 않게 서식을 먼저 준다
     (가계부앱_시트에_직접_쓸때 와 같은 규칙). */
  sh.getRange(1, 1, 1, FILL_HEAD.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, FILL_HEAD.length).setValues([FILL_HEAD]);
  sh.getRange(1, 1, 1, FILL_HEAD.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/* {뽑힌 이름 → {desc, cat, row}} — 끄기(Y)인 줄은 뺀다 */
function inbox_fillMap_() {
  var c = CacheService.getScriptCache(), k = 'inbfill' + api_ver_();
  var hit = c.get(k);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var map = {};
  var sh = inbox_fillSheet_(false);
  if (sh && sh.getLastRow() >= 2) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, FILL_HEAD.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var key = String(v[i][0] || '').trim();
      if (!key) continue;
      if (String(v[i][6] || '').trim().toUpperCase() === 'Y') continue;
      map[key] = { desc: String(v[i][1] || '').trim(),
                   cat: String(v[i][2] || '').trim(), row: i + 2 };
    }
  }
  try { c.put(k, JSON.stringify(map), 300); } catch (e) {}
  return map;
}
function inbox_fillBust_() {
  try { CacheService.getScriptCache().remove('inbfill' + api_ver_()); } catch (e) {}
}

/* 배운다. 폴이 «실제로 고쳤을 때»만 — 안 고친 걸 배우면 규칙만 불어난다.
   같은 키가 이미 있으면 덮어쓴다(마지막 판단이 이긴다). 반환값은 앱이
   「다음부터 이렇게 채울게요」라고 알려주기 위한 것이다. */
function inbox_learn_(srcName, desc, cat) {
  srcName = String(srcName || '').trim();
  desc = String(desc || '').trim();
  cat = String(cat || '').trim();
  if (!srcName || (!desc && !cat)) return null;
  /* 고친 게 없으면 배울 것도 없다 */
  if (desc === srcName && !cat) return null;

  var sh = inbox_fillSheet_(true);
  if (!sh) return null;
  var now = new Date();
  var last = sh.getLastRow();
  var at = 0;
  if (last >= 2) {
    var keys = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === srcName) { at = i + 2; break; }
    }
  }
  if (at) {
    sh.getRange(at, 2, 1, 2).setValues([[desc, cat]]);
  } else {
    at = last + 1;
    /* ⚠️ A·B·C 는 글자다. 「8/10」 같은 이름을 setValues 가 날짜로 삼킨다. */
    sh.getRange(at, 1, 1, 3).setNumberFormat('@');
    sh.getRange(at, 1, 1, 5).setValues([[srcName, desc, cat, now, 0]]);
  }
  inbox_fillBust_();
  return { name: srcName, desc: desc, cat: cat };
}

/* 자동채움을 적용한다. 쓴 횟수는 여기서 세지 않는다 — 목록을 그릴 때마다
   올라가면 「몇 번 도움이 됐나」가 아니라 「화면을 몇 번 열었나」가 된다.
   실제로 저장될 때(inboxOk_) 한 번만 올린다. */
function inbox_fillApply_(it, map) {
  var f = map[it.desc];
  if (!f) return it;
  if (f.desc) { it.fillFrom = it.desc; it.desc = f.desc; }
  if (f.cat) it.cat = f.cat;
  it.filled = true;
  return it;
}

function inbox_fillBump_(srcName) {
  try {
    var sh = inbox_fillSheet_(false);
    if (!sh || sh.getLastRow() < 2) return;
    var keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() !== String(srcName || '').trim()) continue;
      var r = i + 2;
      sh.getRange(r, 5).setValue(api_n_(sh.getRange(r, 5).getValue()) + 1);
      sh.getRange(r, 6).setValue(new Date());
      return;
    }
  } catch (e) {}
}

/* 앱이 목록을 보여주고 지울 수 있게 한다 — 「되돌릴 입구」가 없으면
   조용히 배우는 것과 같다. 지우기는 줄을 «삭제»하지 않고 끄기(Y)로 둔다:
   무엇을 배웠었는지가 남아야 나중에 왜 그랬는지 볼 수 있다. */
function inboxFillList_() {
  var sh = inbox_fillSheet_(false);
  if (!sh || sh.getLastRow() < 2) return { ok: true, data: { items: [] } };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, FILL_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var key = String(v[i][0] || '').trim();
    if (!key) continue;
    out.push({ row: i + 2, name: key,
               desc: String(v[i][1] || '').trim(),
               cat: String(v[i][2] || '').trim(),
               n: api_n_(v[i][4]),
               off: String(v[i][6] || '').trim().toUpperCase() === 'Y' });
  }
  out.sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
  return { ok: true, data: { items: out } };
}

function inboxFillOff_(p) {
  var sh = inbox_fillSheet_(false);
  if (!sh) return { ok: false, error: '아직 배운 게 없어요' };
  var r = Number(p.row);
  if (!(r >= 2) || r > sh.getLastRow()) return { ok: false, error: 'bad row' };
  sh.getRange(r, 7).setValue(String(p.off) === '0' ? '' : 'Y');
  inbox_fillBust_();
  return { ok: true };
}

/* ───────── 여러 줄 한꺼번에 (1.21.0) ─────────
   폴 2026-08-08: 오락실에서 500원짜리 결제 열 건이 입력 대기에 쌓였다.
   확인을 열 번 눌러야 했다. 「p.rows」 로 여러 줄을 한 번에 받는다.

   ⚠️ 같은 줄이 두 번 들어오면 「등록」을 두 번 찍고 멱등키가 어긋난다.
   반드시 걸러낸다. */
var INBOX_BULK_MAX = 100;

function inboxRows_(p) {
  var src = String(p.rows || p.row || '').split(',');
  var seen = {}, out = [];
  for (var i = 0; i < src.length; i++) {
    var n = Number(String(src[i]).trim());
    if (!(n > 1) || seen[n]) continue;
    seen[n] = 1; out.push(n);
  }
  out.sort(function (a, b) { return a - b; });
  return out.slice(0, INBOX_BULK_MAX);
}

function inboxOk_(p, email) {
  var sh = inbox_sheet_();
  var rows = inboxRows_(p);
  if (!rows.length) return { ok: false, error: 'bad row' };
  var r0 = rows[0];

  var done = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(sh.getRange(rows[i], 8).getValue() || '').trim() === '등록') done.push(rows[i]);
  }
  if (done.length === rows.length) {
    return { ok: true, already: true, row: Number(sh.getRange(r0, 9).getValue()) || 0 };
  }
  /* ⚠️ 일부만 이미 등록돼 있으면 멈춘다. 그대로 진행하면 그 결제가
     장부에 두 번 들어간다 — 다른 기기에서 먼저 처리했을 때 실제로 난다. */
  if (done.length) {
    return { ok: false, error: '이미 등록된 줄이 섞여 있어요 — 새로고침하고 다시 해주세요' };
  }

  /* 「쓴 사람」 기본값은 **핸드폰 소유자**(J열) — 폴 결정 2026-08-06.
     아내가 폴 카드로 긁으면 알림은 폴 폰에 뜨니 기본값이 「폴」로 잡히고,
     거기서 손으로 「아내」로 바꾸는 흐름이다. 앱이 골라 보내면 그게 이긴다.
     J열이 비었으면(w 를 안 싣던 시절 행) 빈 값 → apiAdd_ 가 로그인 계정으로. */
  var who = api_who_(p.who) || inbox_who_(sh.getRange(r0, 10).getValue());

  /* ⚠️ 배울 «키»는 알림에서 뽑힌 원래 이름이다. 아래에서 E열을 p.desc 로
     덮어쓰기 «전에» 읽어 둔다 — 덮은 뒤에 읽으면 고친 이름으로 배워서,
     다음 달엔 아무것도 안 맞는 규칙이 한 줄 쌓인다.
     앱이 srcDesc 를 실어 보내면 그걸 쓴다(묶음일 때 맨 윗줄 기준). */
  var srcName = String(p.srcDesc || sh.getRange(r0, 5).getValue() || '').trim();

  var add = apiAdd_({
    date: p.date, gubun: p.gubun || '지출', cat: p.cat || '',
    desc: p.desc || '', pay: p.pay || '', amt: p.amt,
    memo: p.memo || '', merchant: p.merchant || p.desc || '',
    who: who,
    /* 멱등키는 맨 위 줄 하나로. 같은 묶음을 두 번 보내도 한 건이다. */
    n: 'inbox' + r0
  }, email);

  /* ⚠️ 거절당했으면 「등록」으로 찍으면 안 된다. 장부엔 없는데 수신함만
     끝난 것처럼 보이면 그 결제는 영영 안 들어간다 (카드값 거절 · 1.19.0). */
  if (add && add.ok === false) return add;

  /* ⚠️⚠️ **여기가 장부에 쓴 «뒤»다.** 이 아래에서 무엇이 터지든 앱은
     「저장 실패」를 보고, 폴이 한 번 더 누르면 같은 결제가 두 번 들어간다.
     그래서 배우는 일은 «부르는 자리»에서 막는다.

     헬퍼를 하나 만들어 그 «안»에 `typeof` 를 넣는 건 소용이 없다 —
     그 헬퍼 이름 자체가 없으면 부르는 순간 똑같이 터진다.
     `typeof` 는 선언조차 없는 이름에도 안 터지는 유일한 연산자라, 그 검사가
     **부르는 자리에 있어야** 한다.
     (시험대의 `inboxbulktest` 가 실제로 이걸 잡았다. 이 저장소가
     `accounts_`·`inbox_users_` 에 쓰는 것과 같은 방식이다.) */
  var learned = null;
  try {
    if (typeof inbox_teach_ === 'function') learned = inbox_teach_(p, srcName);
  } catch (e) {}

  if (rows.length > 1) {
    /* ⚠️ 원본을 덮어쓰지 않는다. 500원짜리 열 줄이 5,000원 열 줄로 바뀌면
       나중에 카드 명세서와 대조할 근거가 통째로 사라진다.
       상태와 거래행만 찍는다 — 열 줄이 같은 한 거래를 가리킨다. */
    for (var j = 0; j < rows.length; j++) {
      sh.getRange(rows[j], 8).setValue('등록');
      sh.getRange(rows[j], 9).setValue(add.row || '');
    }
    return { ok: true, row: add.row, n: rows.length, learned: learned };
  }

  sh.getRange(r0, 4, 1, 5).setValues([[
    api_pureDate_(p.date), p.desc || '', Number(p.amt) || 0, p.pay || '', '등록'
  ]]);
  sh.getRange(r0, 9).setValue(add.row || '');
  return { ok: true, row: add.row, n: 1, learned: learned };
}

/* 저장이 «성공한 뒤에만» 배운다. 장부에 안 들어간 판단을 규칙으로 굳히면
   다음 달에 틀린 값이 자동으로 채워진다.
   ⚠️ 배우다 실패해도 저장은 성공이다 — 여기서 던지면 장부엔 들어갔는데
   앱은 「실패했어요」를 띄우고, 폴이 한 번 더 눌러 두 번 기록된다. */
function inbox_teach_(p, srcName) {
  try {
    var fill = inbox_fillMap_();
    /* 이미 배운 값 그대로 저장했다면 «쓴 횟수»만 올린다 — 새로 배운 게 아니다.
       그래야 「몇 번 도움이 됐나」가 진짜 숫자가 된다. */
    var had = fill[srcName];
    if (had && String(had.desc || '') === String(p.desc || '').trim() &&
        String(had.cat || '') === String(p.cat || '').trim()) {
      inbox_fillBump_(srcName);
      return null;
    }
    return inbox_learn_(srcName, p.desc, p.cat);
  } catch (e) { return null; }
}

function inboxNo_(p) {
  var sh = inbox_sheet_();
  var rows = inboxRows_(p);
  if (!rows.length) return { ok: false, error: 'bad row' };
  for (var i = 0; i < rows.length; i++) sh.getRange(rows[i], 8).setValue('무시');
  return { ok: true, n: rows.length };
}

/* ───────── 라우팅 (api.js 의 apiRoute_ 에서 호출) ───────── */
function inboxRoute_(api, p) {
  /* ═══ 맥박만 찍는 길 (1.52.0) ═══
     폰이 결제 알림을 «걸러서» 보내기 시작하면, 조용한 오전엔 서버에 아무것도
     안 닿는다. 그런데 맥박 판정은 «낮에 3시간 조용하면 폰이 죽었다»이다 —
     걸러 놓고 그대로 두면 **멀쩡한 폰이 매일 아침 빨간불**이 된다.
     그래서 폰이 두 시간마다 이 길로 한 번씩 두드린다. 시트를 아예 안 열고
     속성 한 줄만 쓴다(그마저 60초 안이면 건너뛴다).
     ⚠️ 이걸로 맥박의 «뜻»도 정확해진다. 예전 맥박은 「아무 알림이나 닿았다」
     였고, 그래서 8/13 에 걸음 수 알림이 초록을 유지해 사고를 덮었다.
     이제는 「플로우가 살아 있다」다. */
  if (api === 'hb') {
    var hk = inbox_key_();
    if (!hk || String(p.k || '') !== hk) return { ok: false, error: 'bad key', code: 403 };
    var w = inbox_who_(p.w);
    inbox_hb_(w, w ? '' : inbox_whoRaw_(p.w));
    return { ok: true, who: w };
  }

  /* 키 인증 — 쓰기 전용 */
  if (api === 'inbox') {
    var key = inbox_key_();
    if (!key || String(p.k || '') !== key) {
      /* 키를 갈고 폰에 안 넣었을 때가 제일 흔하다. 그때 예전엔 폰만
         조용히 실패해서 원인을 찾는 데 하루가 걸렸다. 키 값 자체는
         절대 안 적는다 — 로그도 시트다. */
      inbox_drop_('키오류', String(p.src || p.pkg || ''), inbox_who_(p.w),
                  String(p.raw || p.text || ''));
      return { ok: false, error: 'bad key', code: 403 };
    }
    try { return inboxPut_(p); }
    catch (err) {
      inbox_drop_('오류: ' + String(err && err.message || err),
                  String(p.src || p.pkg || ''), inbox_who_(p.w),
                  String(p.raw || p.text || ''));
      return { ok: false, error: String(err && err.message || err) };
    }
  }
  return null;
}

/* ───────── 파서 튜닝 도구 ─────────
   새 카드사·페이 알림이 쌓이면 문구가 제각각이라 파서를 손봐야 한다.
   그때마다 시트를 눈으로 훑지 않도록 두 함수를 둔다.
     수신함_파서점검()  — 아무것도 안 바꾸고, 지금 파서가 뭘 뽑는지만 로그
     수신함_다시파싱()  — 아직 등록 안 한 행의 D~G 를 지금 파서로 다시 채움
   등록/무시가 끝난 행은 건드리지 않는다. 이미 장부에 반영됐거나
   폴이 판단을 끝낸 행이라, 뒤늦게 값이 바뀌면 오히려 헷갈린다. */

function 수신함_파서점검() {
  var sh = inbox_sheet_();
  var last = sh.getLastRow();
  if (last < 2) return '수신함이 비어 있습니다.';
  var v = sh.getRange(2, 1, last - 1, inbox_ncols_(sh)).getValues();
  var out = [], bad = 0;
  for (var i = 0; i < v.length; i++) {
    var raw = String(v[i][2] || '').trim();
    if (!raw) continue;
    var src = String(v[i][1] || '');
    var who = String(v[i][9] || '').trim();
    var mer = inbox_merchant_(raw);
    var amt = inbox_amt_(raw);
    var pay = inbox_pay_(raw, src, who);
    var cat = inbox_guess_(mer, raw);
    if (!mer || !amt || !pay) bad++;
    out.push([
      (i + 2) + '행',
      '가맹점=' + (mer || '✗'),
      '금액=' + (amt || '✗'),
      '수단=' + (pay || '✗'),
      '소유자=' + (who || '-'),
      '분류=' + (cat || '-'),
      '취소=' + (inbox_isCancel_(raw) ? 'Y' : 'n'),
      '| ' + raw.slice(0, 70)
    ].join(' '));
  }
  var msg = out.join('\n') + '\n\n총 ' + out.length + '건, 덜 읽힌 건 ' + bad + '건';
  Logger.log(msg);
  return msg;
}

function 수신함_다시파싱() {
  var sh = inbox_sheet_();
  var last = sh.getLastRow();
  if (last < 2) return '수신함이 비어 있습니다.';
  var v = sh.getRange(2, 1, last - 1, inbox_ncols_(sh)).getValues();
  var n = 0;
  for (var i = 0; i < v.length; i++) {
    var st = String(v[i][7] || '').trim();
    if (st === '등록' || st === '무시') continue;
    var raw = String(v[i][2] || '').trim();
    if (!raw) continue;
    var src = String(v[i][1] || '');
    /* J열은 폰이 남긴 사실이라 다시파싱해도 건드리지 않는다. 읽기만 한다. */
    var who = String(v[i][9] || '').trim();
    var amt = inbox_amt_(raw);
    var next = amt > 0 ? (inbox_isCancel_(raw) ? '취소보류' : '대기') : '확인필요';
    sh.getRange(i + 2, 5, 1, 4).setValues([[
      inbox_merchant_(raw), amt, inbox_pay_(raw, src, who), next
    ]]);
    n++;
  }
  var msg = n + '행 다시 파싱했습니다.';
  Logger.log(msg);
  return msg;
}
