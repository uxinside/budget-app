/* 우리집 가계부 v2 — 프런트엔드
   백엔드: Apps Script JSON API (?api=boot2|month|tx2|report2|add2|upd|del|waste)
   인증  : Google Identity Services ID 토큰 → 서버에서 tokeninfo 검증 */
(function () {
'use strict';

var EXEC = 'https://script.google.com/macros/s/AKfycbyTjmbMOGKacDaMMhmCRje4iQYvgb7XouOmzpiij62BW8uaZfqu9fa1Q139nz9tdQBbgw/exec';
var CLIENT_ID = '234887197691-1bjbpudf58j29o6onvs3ih0k5og6pco1.apps.googleusercontent.com';
/* 설정 화면에 찍는다. 폰이 새 판을 받았는지 눈으로 확인하려는 것. */
var APP_V = '1.39.0';

/* ───────── 유틸 ───────── */
var $ = function (s) { return document.querySelector(s); };
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function C(n) { return Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US'); }
function SG(n) { n = Number(n) || 0; return (n < 0 ? '−' : '+') + C(n); }
function pct(x) { return Math.round((Number(x) || 0) * 100); }
/* 시트의 기준월이 어떤 때는 '2026-08' 글자로, 어떤 때는 날짜 값으로 온다.
   날짜로 오면 'Sat Aug 01 2026 …' 이라, 그대로 잘라 쓰면 NaN 이 찍혔다.
   둘 다 받아 'yyyy-MM' 으로 맞춘다. */
function toYm(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})[-.\/]?(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  /* 'Sat Aug 01 2026 00:00:00 GMT+0900' 같은 모양은 글자에서 바로 읽는다.
     new Date() 로 돌리면 기기 시간대에 따라 한 달 밀린다 —
     KST 자정은 UTC 로는 전날이라 8월이 7월이 된다. */
  var mn = s.match(/([A-Za-z]{3})\s+\d{1,2}\s+(\d{4})/);
  if (mn) {
    var k = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
              .indexOf(mn[1]);
    if (k >= 0) return mn[2] + '-' + ('0' + (k + 1)).slice(-2);
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  return '';
}
function ymLabel(ym) {
  ym = toYm(ym);
  if (!ym) return '—';
  return Number(ym.slice(0, 4)) + '년 ' + Number(ym.slice(5, 7)) + '월';
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
var DOW = ['일', '월', '화', '수', '목', '금', '토'];
function todayYmd() {
  var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function ymdShift(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
  var z = function (x) { return (x < 10 ? '0' : '') + x; };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
function ymdDow(ymd) {
  var p = ymd.split('-');
  return DOW[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
}

/* ───────── 카테고리 배지 ───────── */
/* [약칭, 색상, 톤]
   같은 갈래는 색상을 공유하고 톤(0=진함 1=옅음 2=더 진함)으로만 가른다.
   식비와 외식/배달을 전혀 다른 색으로 두면 목록에서 '먹는 데 쓴 돈'이
   한 덩어리로 안 읽힌다. 색은 갈래를, 톤은 항목을 구분한다. */
var CATMAP = {
  /* 먹거리 */      '식비': ['식비', 145, 0], '외식/배달': ['외식', 145, 1],
  /* 반려 */        '반려동물': ['반려', 105, 0],
  /* 모으기 */      '저축': ['저축', 185, 0], '투자': ['투자', 185, 1],
                    '연금': ['연금', 185, 2],
  /* 이동 */        '교통/차량': ['교통', 230, 0], '여행': ['여행', 230, 1],
  /* 집·살림 */     '주거/관리비': ['주거', 268, 0], '생활용품': ['생활', 268, 1],
                    '통신비': ['통신', 268, 2],
  /* 배움·즐거움 */ '교육/육아': ['교육', 310, 0], '문화/여가': ['문화', 310, 1],
  /* 몸 */          '의료/건강': ['의료', 350, 0], '의류/미용': ['의류', 350, 1],
  /* 갚기 */        '대출이자': ['이자', 25, 0], '대출원금상환': ['상환', 25, 1],
  /* 의무 */        '보험료': ['보험', 68, 0], '세금/공과금': ['세금', 68, 1],
                    '경조사': ['경조', 68, 2],
  /* 그 밖 — 색을 뺀다. 성격이 없는 통이라 색을 주면 오히려 눈에 띈다 */
  '기타지출': ['기타', 285, 3], '계좌이체': ['이체', 285, 4]
};
/* 톤별 색 — bg 는 배지 바탕, fg 는 글자, fill 은 막대.
   3·4번은 무채색이라 색상값을 거의 안 쓴다. */
var CATTONE = [
  { bg: 'oklch(.945 .045 ', fg: 'oklch(.45 .12 ', fill: 'oklch(.80 .075 ' },
  { bg: 'oklch(.965 .028 ', fg: 'oklch(.55 .09 ', fill: 'oklch(.88 .05 ' },
  { bg: 'oklch(.915 .062 ', fg: 'oklch(.38 .13 ', fill: 'oklch(.72 .095 ' },
  { bg: 'oklch(.945 .012 ', fg: 'oklch(.48 .02 ', fill: 'oklch(.82 .014 ' },
  { bg: 'oklch(.968 .008 ', fg: 'oklch(.58 .015 ', fill: 'oklch(.89 .01 ' }
];
function catMeta(name) {
  var m = CATMAP[name];
  if (m) return { ab: m[0], h: m[1], t: m[2] || 0 };
  /* 설정 시트에만 있고 여기 없는 이름은 글자에서 색을 만든다.
     같은 이름이면 늘 같은 색이 나와야 해서 해시를 쓴다. */
  var s = String(name || ''), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  var ab = s.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 2) || '기타';
  return { ab: ab, h: [145, 268, 230, 350, 310, 68, 185, 25, 105, 320][h % 10],
           t: h % 3 };
}
function catTone(m) { return CATTONE[m.t] || CATTONE[0]; }
function catBadge(name) {
  var m = catMeta(name), c = catTone(m);
  return { ab: m.ab, bg: c.bg + m.h + ')', fg: c.fg + m.h + ')' };
}
function catFill(name) {
  var m = catMeta(name);
  return catTone(m).fill + m.h + ')';
}

/* ───────── 상태 ───────── */
var txLoading = null;
var ST = {
  token: null, exp: 0, me: null,
  boot: null, month: null, tx: null, ym: null,
  tab: 'home', paceMode: 'e', catMode: 'm', wkOff: 0,
  who: null,                      /* 보는 대상: null=가구 전체 / 사람 이름 / '공동' */
  /* g = 구분(수입·지출·이체…), w = 계좌 소유자. 둘 다 서버가 아니라
     여기서 거른다 — 서버 필터를 쓰면 다시 받아와야 해서, 홈에서 눌렀을 때
     내역이 한 번 비었다가 채워진다. */
  f: { cat: [], pay: [], g: [], w: [], q: '', sq: '지출만' },
  cap: true,                      /* 자본거래(이체·저축·부채상환…) 숨김 */
  /* 손익 카드 안 「현금 흐름」을 펼쳐 뒀나. ⚠️ 기억해 두지 않으면 홈을
     다시 그릴 때마다 접힌다 — 수신함 하나 확인해도 다시 그려지므로,
     펼쳐 놓고 보던 사람 입장에선 화면이 제멋대로 닫히는 걸로 보인다. */
  cashOpen: false,
  form: null,
  txErr: null,                    /* 마지막 내역 조회 실패 사유 */
  inbox: [],                      /* 폰 결제 알림 중 아직 확인 안 한 건 */
  hb: null,                       /* 폰 맥박 — 알림이 끊겼는지 */
  chk: null,                      /* 점검: { at, ver, err } */
  rep: null                       /* 리포트(재무상태) */
};
var repLoading = null;
var WHO_ALL = '가구 전체';

/* 돈이 실제로 들고 난 것만 '순수 거래'다. 나머지(이체·저축/투자·부채상환·
   차입·투자회수·자본거래)는 내 주머니 안에서 자리만 바꾼 돈이라 내역을
   훑을 때는 잡음이 된다. 시작하기 시트의 정의와 같은 기준. */
var CASH_G = { '수입': 1, '지출': 1 };
function isCap(g) { return !CASH_G[String(g || '').trim()]; }

/* ═══════════ 통장 흐름 ═══════════
   폴 2026-08-08: 「수입이 잡힌 건 알겠고, 카드값이 이체로 빠지는 것도
   알겠고, 지출도 쓴 돈만인 것까지도 알겠는데 남은 돈 계산이 안되네?」

   안 되는 게 아니라 **답한 적이 없다.** 위의 CASH_G 때문에 홈의 손익은
   「이번 달 얼마나 썼나」를 낸다. 통장에서 실제로 돈이 들고 난 것과는
   딱 세 군데서 갈라진다.

     ① 카드로 긁은 것 — 지금 지출로 잡히지만 통장에선 다음 달에 나간다
     ② 카드 대금     — 지금 통장에서 나가지만 이체라 지출이 아니다
     ③ 저축·투자·대출 원리금 — 통장에선 나가는데 지출이 아니다

   그래서 손익과 별개로 「통장 흐름」을 따로 낸다. 같은 거래내역을
   **결제수단 기준으로** 다시 세는 것뿐이라 서버는 안 건드린다.

   ⚠️ 이건 잔액이 아니다. 시작 잔액이 어디에도 없어서(계좌 시트에 잔액
   칸이 없고 자산 시트는 계좌 단위가 아니다) 「이번 달에 들고 난 차액」까지가
   지금 낼 수 있는 전부다. 화면 문구도 「남은 돈」이 아니라 그렇게 쓴다. */

/* 지금 통장에서 바로 빠지는 결제수단인가. 신용카드·간편결제·현금은 아니다 —
   신용카드는 다음 달 대금으로 한꺼번에 빠지고, 현금은 이미 인출 이체로
   한 번 셌으니 여기서 또 세면 두 번이다. 체크카드는 즉시 빠지므로 통장이다. */
var BANK_T = /입출금|예금|수시|체크/;
var CARD_T = /카드/;

/* 결제수단 이름 → 계좌 시트의 그 줄. 모르는 이름이면 null. */
function accOf(pay) {
  var n = String(pay || '').trim();
  if (!n) return null;
  var acc = (ST.boot && ST.boot.accounts) || [];
  for (var i = 0; i < acc.length; i++) if (acc[i].name === n) return acc[i];
  return null;
}
function isBankPay(pay) {
  var a = accOf(pay);
  return !!a && BANK_T.test(a.type || '');
}
/* 글 안에 우리 계좌 이름이 있나. 꼬리표 「(아내)」는 떼고 본다 —
   알림 문구엔 「우리카드값」처럼 꼬리표 없이 적히는 쪽이 흔하다.
   긴 이름이 이긴다: 「토스뱅크」와 「토스」가 둘 다 있으면 앞의 것.
   kind 는 'move'(그냥 옮긴 것) 또는 'card'(카드 대금). skip 은 결제수단 자기 자신 —
   「토스부부 → 카카오뱅크」에서 토스부부까지 잡으면 늘 자기를 찾는다.

   ⚠️ 'move' 는 **입출금끼리만**이다. 저축·청약으로 보낸 건 돈은 우리 것이지만
   이 달에 쓸 수 있는 돈에서는 빠진 것이라 「나간 돈」이 맞다. 구분을
   「저축/투자」로 넣었을 때와 「이체」로 넣었을 때 답이 달라지면 안 된다. */
function accKind(a, kind) {
  var t = String((a && a.type) || '');
  if (kind === 'card') return CARD_T.test(t) && !/체크/.test(t);
  return /입출금/.test(t) && !CARD_T.test(t);
}
function accHit(text, kind, skip) {
  var s = String(text || ''), best = '', bestLen = -1;
  var acc = (ST.boot && ST.boot.accounts) || [];
  for (var i = 0; i < acc.length; i++) {
    var a = acc[i];
    if (a.name === skip || !accKind(a, kind)) continue;
    var b = String(a.name).replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (b && s.indexOf(b) >= 0 && b.length > bestLen) { best = a.name; bestLen = b.length; }
  }
  return best;
}

/* 통장에서 나가는가(-1) 들어오는가(+1). 자본거래는 부호를 모르니 뺀다. */
var CASH_DIR = { '수입': 1, '차입': 1, '투자회수': 1,
                 '지출': -1, '이체': -1, '저축/투자': -1, '부채상환': -1 };

function cashFlow(T) {
  if (!T || !T.days) return null;
  var o = { inc: 0, out: 0, net: 0, n: 0,
            innerN: 0, inner: 0, unknownN: 0, unknown: 0, capN: 0,
            b: { spend: 0, card: 0, save: 0, debt: 0, send: 0, sendN: 0 } };
  T.days.forEach(function (d) {
    (d.rows || []).forEach(function (r) {
      var g = String(r.gubun || '').trim(), amt = Number(r.amt) || 0;
      var dir = CASH_DIR[g];
      if (dir === undefined) { o.capN++; return; }          /* 자본거래 */
      if (!isBankPay(r.pay)) {
        /* 계좌 시트에 없는 결제수단은 통장인지 카드인지 알 길이 없다.
           조용히 빼면 합이 왜 안 맞는지 알 수 없으니 세어서 화면에 적는다. */
        if (!accOf(r.pay)) { o.unknownN++; o.unknown += amt; }
        return;                                              /* 카드·간편결제 = 다음 달 */
      }
      if (g === '이체') {
        /* 내 통장끼리 옮긴 것은 나간 게 아니다. 상대가 카드면 대금이라 나간 것. */
        if (accHit(r.desc, 'move', r.pay)) { o.inner += amt; o.innerN++; return; }
        if (accHit(r.desc, 'card', r.pay)) o.b.card += amt;
        else {
          /* ⚠️ 받는 곳을 못 찾았다. 밖으로 나간 걸 수도 있고(전세금 송금),
             내 통장끼리 옮긴 건데 **내용에 계좌 이름이 없어서** 못 알아본
             걸 수도 있다. 둘을 여기서 가릴 방법이 없다 — 나간 것으로 세되
             건수와 금액을 남겨서 화면에서 사람이 확인하게 한다.
             (폴 2026-08-09: 「자체 이체면 그냥 0인게 맞잖아」 — 맞습니다.
             자체 이체로 **알아보기만 하면** 이미 0으로 뺍니다.) */
          o.b.send += amt; o.b.sendN++;
        }
        o.out += amt; o.net -= amt; o.n++;
        return;
      }
      o.n++;
      if (dir > 0) { o.inc += amt; o.net += amt; return; }
      o.out += amt; o.net -= amt;
      if (g === '지출') o.b.spend += amt;
      else if (g === '저축/투자') o.b.save += amt;
      else if (g === '부채상환') o.b.debt += amt;
    });
  });
  return o;
}

/* 필터를 통째로 갈아끼울 때 쓴다. 홈에서 무언가를 누르면 그 조건 하나만
   남아야 한다 — 이전 조건이 섞여 있으면 왜 이것만 보이는지 알 수 없다. */
function setFilter(o) {
  ST.f = { cat: o.cat || [], pay: o.pay || [], g: o.g || [], w: o.w || [],
           q: o.q || '', sq: ST.f.sq };
  /* 이체를 보러 온 거면 숨김을 자동으로 푼다. 안 그러면 눌러도 0건이다. */
  if ((o.g || []).some(isCap)) ST.cap = false;
}

/* ───────── 인증 ───────── */
function jwtExp(t) {
  try {
    var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (p.exp || 0) * 1000;
  } catch (e) { return 0; }
}
/* 토큰은 localStorage 에 둔다. sessionStorage 는 앱을 닫으면 지워져서
   다시 열 때마다 로그인 화면이 떴다. 키 접두사가 'hb.' 가 아니므로
   LS.clear()(새로고침)로는 지워지지 않고, 로그아웃에서만 지운다. */
var TOK_KEY = 'hbtok';
function setToken(t) {
  ST.token = t; ST.exp = jwtExp(t);
  try { localStorage.setItem(TOK_KEY, t); } catch (e) {}
}
function clearToken() {
  ST.token = null; ST.exp = 0;
  try { localStorage.removeItem(TOK_KEY); } catch (e) {}
  try { sessionStorage.removeItem('idt'); } catch (e) {}
}
function loadToken() {
  var t = null;
  try { t = localStorage.getItem(TOK_KEY); } catch (e) {}
  if (!t) { try { t = sessionStorage.getItem('idt'); } catch (e) {} }
  if (t && jwtExp(t) - Date.now() > 60000) { ST.token = t; ST.exp = jwtExp(t); return true; }
  return false;
}
function tokenAlive() { return !!ST.token && ST.exp - Date.now() > 60000; }

/* ═══════════ 세션이 자꾸 끊기던 것 (1.22.0) ═══════════
   폴 2026-08-08: 「조금만 있다 앱을 켜면 무조건 세션 로그인 창이 떠서
   굉장히 불편하다.」

   원인은 **구글 ID 토큰의 수명이 딱 한 시간**이라는 것이다. 예전 코드는
     ① 토큰이 **죽고 나서야** 다시 받으려 하고,
     ② 그 사이 요청 하나가 실패하면 **곧바로 로그인 화면**을 띄우고,
     ③ 조용히 다시 받아오는 데 성공해도 **실패한 요청을 다시 보내지 않았다.**
   그래서 한 시간에 한 번씩, 화면에 이미 데이터가 떠 있는데도 로그인 창이
   덮었다.

   고친 방향은 셋이다.
     ① **미리 받는다** — 10분 남으면 조용히 갱신한다. 앱을 열 때, 앞으로
        올 때, 그리고 5분마다 본다.
     ② **기다린다** — 토큰이 없으면 로그인 화면을 띄우는 대신 갱신을 걸고
        요청을 **그 갱신에 태운다.** 여러 요청이 하나의 갱신을 같이 기다린다.
     ③ **정말 안 될 때만 보여준다** — 갱신이 AUTH_WAIT 안에 안 끝나면
        그때 로그인 화면. 그 전까지는 보고 있던 화면 그대로다.

   ⚠️ 구글 One Tap 은 사용자가 여러 번 닫으면 한동안 안 뜬다(쿨다운).
   그래서 「갱신은 늘 성공한다」고 가정하면 안 된다 — 실패 경로가 반드시
   있어야 하고, 그게 로그인 화면이다. */
var TOK_EARLY = 10 * 60000;      /* 이만큼 남으면 미리 갱신 */
var AUTH_WAIT = 9000;            /* 갱신을 이만큼 기다렸다가 포기 */
var TOK_TICK = 5 * 60000;        /* 미리 갱신을 살피는 주기 */

function tokenSoon() { return !ST.token || ST.exp - Date.now() < TOK_EARLY; }

var authWait = null, authWaiters = [];
/* 갱신이 끝나면(성공이든 실패든) 기다리던 요청을 전부 깨운다 */
function authDone() {
  var w = authWaiters; authWaiters = []; authWait = null;
  var ok = tokenAlive();
  w.forEach(function (f) { try { f(ok); } catch (e) {} });
}
/* 토큰이 살아 있으면 즉시, 아니면 갱신을 걸고 그 하나를 같이 기다린다. */
function ensureToken() {
  if (tokenAlive()) return Promise.resolve(true);
  if (authWait) return authWait;
  authWait = new Promise(function (resolve) {
    authWaiters.push(resolve);
    reprompt();
    setTimeout(function () { if (authWait) authDone(); }, AUTH_WAIT);
  });
  return authWait;
}
/* 아직 여유가 있을 때 조용히 미리 받아 둔다. 기다리지 않는다 —
   실패해도 지금 화면은 멀쩡하고, 정말 필요해지면 ensureToken 이 다시 건다. */
function renewSoon() {
  if (!gisReady || authWait) return;
  if (!tokenSoon()) return;
  reprompt();
}

var gisReady = false, promptPending = false;
function initGIS() {
  if (gisReady || !window.google || !google.accounts || !google.accounts.id) return;
  gisReady = true;
  google.accounts.id.initialize({
    client_id: CLIENT_ID, callback: onCredential,
    auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true
  });
  var box = $('#gbtn');
  if (box) {
    box.innerHTML = '';
    google.accounts.id.renderButton(box, {
      theme: 'outline', size: 'large', shape: 'pill',
      text: 'signin_with', locale: 'ko', width: 260
    });
  }
  if (!tokenAlive()) google.accounts.id.prompt();
}
var autoT = null;
function onCredential(res) {
  promptPending = false;
  clearTimeout(autoT);
  if (!res || !res.credential) return;
  var had = !!ST.boot;              /* 이미 쓰고 있던 중인가 */
  setToken(res.credential);
  showLogin(false);
  /* ⚠️ 갱신일 때 start() 를 다시 부르면 안 된다. 화면이 통째로 처음부터
     다시 그려져서, 보고 있던 자리가 사라진다. 기다리던 요청만 깨운다. */
  if (had) { authDone(); return; }
  authDone();
  start();
}
var promptT = null;
function reprompt() {
  if (promptPending || !gisReady) return;
  promptPending = true;
  /* ⚠️ FedCM 을 쓰면 알림 콜백이 안 올 때가 있다. 그러면 promptPending 이
     영원히 true 로 남아 **그 뒤 갱신이 통째로 막힌다** — 한 번 어긋나면
     로그인 창밖에 길이 없어진다. 시간으로도 반드시 푼다. */
  clearTimeout(promptT);
  promptT = setTimeout(function () { promptPending = false; }, AUTH_WAIT + 1000);
  /* disableAutoSelect() 를 부르면 다음부터 자동 로그인이 영구히 꺼진다.
     여기서는 토큰만 만료된 것이므로 조용히 다시 받아온다. */
  try { google.accounts.id.prompt(function () { promptPending = false; }); }
  catch (e) { promptPending = false; }
}
/* 이 화면을 보는 사람은 사실상 늘 같은 두 명이다. 마지막에 들어온
   사람을 기억해 두고 이름을 불러준다. 구글 계정 선택 자체는 GIS 가
   쥐고 있어서 우리가 계정을 골라 넣어줄 수는 없다 — 설계 3c 의
   "폴로 로그인" 버튼은 그래서 못 만든다. */
function showLogin(on, msg) {
  $('#login').hidden = !on;
  $('#app').hidden = on;
  $('#tb').hidden = on;
  var e = $('#lerr');
  if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
  if (!on) return;

  var last = LS.get('lastMe');
  var sub = $('#lgsub'), note = $('#lgnote'), ver = $('#lgver');
  if (sub && last && last.name) {
    var w = last.at ? new Date(last.at) : null;
    sub.innerHTML = '<b>다시 오셨네요, ' + esc(last.name) + '님</b>' +
      (w ? '<span>마지막 기록 ' + (w.getMonth() + 1) + '월 ' + w.getDate() + '일</span>' : '');
    sub.className = 'back';
  } else if (sub) {
    sub.innerHTML = '한 달 손익 · 예산 페이스 · 누가 얼마나 썼는지<br>부부가 같은 숫자를 봅니다';
    sub.className = '';
  }
  if (note) note.textContent = '가족 계정 2명만 들어올 수 있어요';
  if (ver) ver.textContent = APP_V;
  var h = $('#lghelp');
  if (h) h.open = !!msg;      /* 막혔을 때만 도움말을 펴 둔다 */
}

/* ───────── 로컬 캐시 ───────── */
var LS = {
  get: function (k) {
    try { var v = localStorage.getItem('hb.' + k); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  },
  set: function (k, v) {
    try { localStorage.setItem('hb.' + k, JSON.stringify(v)); } catch (e) {}
  },
  /* 보는 대상이 다르면 다른 캐시다 */
  mk: function (kind, ym) { return kind + '.' + ym + '.' + (ST.who || 'all'); },
  clear: function () {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('hb.') === 0) ks.push(k);
      }
      ks.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }
};

/* ───────── API ───────── */
/* 쓰기 요청은 재시도하면 안 된다. add2는 행이 늘고, del은 행 번호가 밀려
   엉뚱한 행을 지운다. 재시도는 읽기 전용에만 적용한다. */
var WRITE_API = { add2: 1, upd: 1, del: 1, waste: 1, budgetSet: 1 };
function api(name, params, _try) {
  /* ⚠️ 예전엔 여기서 바로 reject('auth') 했고, 그걸 받은 화면들이 곧바로
     로그인 창을 띄웠다. 이제는 **갱신을 기다렸다가 그대로 이어서 보낸다.**
     정말 안 되면 그때 'auth' 로 떨어지고, 그때만 로그인 창이 뜬다. */
  if (!tokenAlive()) {
    return ensureToken().then(function (ok) {
      if (!ok) throw new Error('auth');
      return api(name, params, _try);
    });
  }
  _try = _try || 0;
  var isWrite = !!WRITE_API[name];
  var u = new URL(EXEC);
  u.searchParams.set('api', name);
  u.searchParams.set('t', ST.token);
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  });
  if (_try) u.searchParams.set('_r', _try);

  var ctl = window.AbortController ? new AbortController() : null;
  /* 읽기 15초. 저장 직후 재조회는 서버 캐시가 비워진 참이라 4,000행
     집계를 처음부터 다시 계산한다. 8초로는 자주 모자랐다. */
  var tm = setTimeout(function () { if (ctl) ctl.abort(); }, isWrite ? 20000 : 15000);

  function again(why) {
    if (isWrite || _try >= 2) throw new Error(why);
    return new Promise(function (res) { setTimeout(res, 500 * (_try + 1)); })
      .then(function () { return api(name, params, _try + 1); });
  }

  return fetch(u.toString(), { method: 'GET', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
    .then(function (r) { clearTimeout(tm); return r.text(); })
    .then(function (txt) {
      var j = null;
      try { j = JSON.parse(txt); } catch (e) {}
      if (!j) return again('서버가 응답하지 않아요. 잠시 후 다시 시도해주세요.');
      /* 401 은 두 가지다 — 토큰이 죽었거나, 등록 안 된 계정이거나.
         구분할 방법이 없으니 **한 번만** 새로 받아 다시 보내 본다.
         또 401 이면 그건 계정 문제다 (무한히 돌면 안 된다).
         ⚠️ 쓰기는 다시 보내지 않는다 — 서버가 이미 처리했을 수 있다. */
      if (j.code === 401) {
        clearToken();
        if (isWrite || _try >= 1) throw new Error('auth');
        return ensureToken().then(function (ok) {
          if (!ok) throw new Error('auth');
          return api(name, params, _try + 1);
        });
      }
      if (!j.ok) throw new Error(j.error || 'API 오류');
      return j;
    }, function (e) {
      clearTimeout(tm);
      return again('네트워크 오류: ' + (e && e.message || e));
    });
}

/* ───────── 부팅 ───────── */
function start() {
  showLogin(false);

  /* 캐시가 있으면 먼저 그린다 (stale-while-revalidate) */
  if (ST.who === null) { var w = LS.get('who'); if (w) ST.who = w; }
  var tb = LS.get('tab');
  if (tb && ['home', 'tx', 'report', 'settings'].indexOf(tb) >= 0) { ST.tab = tb; paintTabs(); }
  var cm = LS.get('catMode');
  if (cm === 'w' || cm === 'm') ST.catMode = cm;
  var pm = LS.get('paceMode');
  if (pm === 'e' || pm === 'm') ST.paceMode = pm;
  var cp = LS.get('cap');
  if (cp === 0 || cp === 1) ST.cap = !!cp;
  /* 점검 결과는 새로고침(LS.clear)에도 안 지워질 만큼 중요하진 않다.
     지워지면 다음 maybeCheck() 가 곧 다시 채운다. */
  var ck = LS.get('chk');
  if (ck && ck.at) ST.chk = ck;
  var cb = LS.get('boot');
  var ci = LS.get('inbox');
  if (ci && ci.length) ST.inbox = ci;
  var painted = false;
  if (cb && cb.boot) {
    ST.boot = cb.boot; ST.me = cb.me;
    ST.ym = ST.ym || (cb.boot.months || [])[0] || todayYmd().slice(0, 7);
    var cm = LS.get(LS.mk('m', ST.ym));
    if (cm) {
      ST.month = cm;
      paintWho(); paintMonthNav();
      ST.tx = LS.get(LS.mk('t', ST.ym)); txAt = 0;
      render();
      restoreForm();
      painted = true;
    }
  }
  if (!painted) renderSkeleton();

  return api('init', { ym: ST.ym || todayYmd().slice(0, 7), who: ST.who }).then(function (j) {
    ST.boot = j.data.boot; ST.me = j.me;
    /* 다음에 로그인 화면을 보면 이름을 불러주려고 기억해 둔다 */
    if (j.me) LS.set('lastMe', { name: j.me, at: Date.now() });
    var ms = ST.boot.months || [];
    ST.ym = ST.ym || ms[0] || todayYmd().slice(0, 7);
    ST.month = j.data.month;
    setInbox((j.data.inbox && j.data.inbox.items) || []);
    ST.hb = j.data.hb || null;
    LS.set('boot', { boot: ST.boot, me: ST.me });
    LS.set(LS.mk('m', ST.ym), ST.month);
    paintWho(); paintMonthNav();
    render();
    lastLoad = Date.now();
    /* 탭을 누를 때마다 기다리는 게 답답하다는 얘기가 있었다.
       첫 화면은 이미 그렸으니, 나머지는 뒤에서 미리 받아둔다. */
    restoreForm();
    loadTx(true);
    loadReport(true);
    /* 목표 화면은 열 때마다 기다렸다. 여기서 미리 받아 둔다 (폴 2026-08-09). */
    budPrefetch();
    maybeCheck();          /* 앱을 열 때 한 번 — 사람이 안 눌러도 알게 */
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '로그인이 필요합니다. 등록된 계정으로 다시 시도해주세요.'); return; }
    if (!painted) renderError(e.message);
  });
}
function loadMonth(ym) {
  ST.ym = ym; ST.tx = null;
  paintMonthNav();
  var cm = LS.get(LS.mk('m', ym));
  if (cm) { ST.month = cm; ST.tx = LS.get(LS.mk('t', ym)); txAt = 0; render(); }
  else renderSkeleton();
  var wantWho = ST.who;
  return api('month', { ym: ym, who: wantWho }).then(function (j) {
    if (ST.ym !== ym || ST.who !== wantWho) return;
    ST.month = j.data;
    LS.set(LS.mk('m', ym), j.data);
    render();
    loadTx(true);          /* 달을 바꿔도 내역은 미리 받아둔다 */
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요. 다시 로그인해주세요.'); return; }
    renderError(e.message);
  });
}
/* 화면에서 내역을 고칠 때마다 올라간다. 요청을 보낸 시점과 응답이
   온 시점의 값이 다르면, 그 사이 내가 고친 게 있다는 뜻이다. */
var txEpoch = 0;
/* 마지막으로 서버에서 내역을 받은 시각. 로컬 캐시로 그린 건
   0 으로 둬서, 화면에 나오는 즉시 다시 받게 한다. */
var txAt = 0;
/* 지금 날아가 있는 tx2 요청이 어느 (달, 사람) 것인지.
   보는 대상을 바꾸면 옛 요청은 응답이 와도 버려지는데, 그동안
   loadTx 가 '이미 요청 중' 이라며 새 요청을 안 보내서 화면이
   옛 목록에 멈춰 있었다. */
var txWant = '';
/* 서버가 보낸 '사전 + 번호' 를 원래 모양으로 편다. 응답 크기를
   줄이려고 접은 것이라, 화면 코드는 예전 모양 그대로 쓴다.
   v 가 없으면 옛 형식(로컬 캐시에 남은 것)이니 그냥 돌려준다. */
function txExpand(j) {
  if (!j || j.v !== 2) return j;
  var G = j.G || [], C = j.C || [], P = j.P || [], W = j.W || [], D = j.D || [];
  return {
    sum: j.sum || { spend: 0, income: 0, count: 0 },
    days: (j.days || []).map(function (d) {
      return {
        d: d.d,
        rows: (d.r || []).map(function (r) {
          return { row: r[0], gubun: G[r[1]] || '', cat: C[r[2]] || '',
                   pay: P[r[3]] || '', who: W[r[4]] || '',
                   amt: r[5] || 0, desc: D[r[6]] || '' };
        })
      };
    })
  };
}

function loadTx(silent, force) {
  /* 날아가 있는 요청은 그것이 '지금 보려는 달·사람' 의 것일 때만
     재사용한다. 저장 직후 재조회는 force 로 새로 보낸다 — 탭을 열 때
     시작된 옛 요청을 물려받으면 방금 저장한 건이 빠진 응답을 받는다. */
  var key = (ST.ym || '') + '|' + (ST.who || '');
  if (txLoading && !force && txWant === key) return txLoading;
  if (!silent) renderSkeleton();
  var want = ST.ym, wantWho = ST.who, e0 = txEpoch;
  var pr = api('tx2', { ym: want, who: wantWho }).then(function (j) {
    if (txLoading === pr) { txLoading = null; txWant = ''; }
    if (ST.ym !== want || ST.who !== wantWho) return;
    /* 요청 중에 화면에서 고친 게 있으면 덮어쓰지 않는다.
       서버가 아직 그 변경을 모르는 응답일 수 있다. */
    if (txEpoch !== e0) return;
    ST.tx = txExpand(j.data);
    ST.txErr = null;
    txAt = Date.now();
    LS.set(LS.mk('t', want), ST.tx);
    /* 홈도 다시 그린다 — 통장 흐름 카드가 이 응답으로 만들어진다.
       예전엔 내역 탭만 갱신해서, 홈에서 기다려도 카드가 안 나타났다. */
    if (ST.tab === 'tx' || ST.tab === 'home') render();
  }).catch(function (e) {
    if (txLoading === pr) { txLoading = null; txWant = ''; }
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요.'); return; }
    /* 캐시가 있으면 옛 목록이라도 보여주되, 최신이 아니라는 걸
       화면에 남긴다. 예전엔 조용히 넘어가서 왜 안 바뀌는지
       알 방법이 없었다. */
    ST.txErr = e.message || '알 수 없는 오류';
    if (ST.tab === 'tx') { if (ST.tx) render(); else renderError(ST.txErr); }
  });
  txLoading = pr; txWant = key;
  return pr;
}
var lastLoad = 0;
function refreshAll(retried) {
  var want = ST.ym, wantWho = ST.who;
  return api('month', { ym: want, who: wantWho }).then(function (j) {
    if (ST.ym !== want || ST.who !== wantWho) return;
    ST.month = j.data;
    LS.set(LS.mk('m', want), j.data);
    return loadTx(true, true);
  }).then(function () { lastLoad = Date.now(); render(); })
  .catch(function (e) {
    /* 조용히 삼키면 안 된다. 저장은 됐는데 화면만 옛날 값인 상태로
       남아서, 시트에는 있는데 앱에는 없는 것처럼 보였다.
       화면은 아래 낙관적 반영으로 이미 맞춰져 있으니, 여기서는
       합계가 아직 옛날 값일 수 있다는 것만 알리고 다음에 다시 받는다. */
    if (e && e.message === 'auth') return;
    lastLoad = 0;
    if (retried) { toast('합계 갱신이 늦어요. 잠시 후 다시 받아올게요'); return; }
    /* 첫 시도는 서버 캐시가 막 비워져 느리다. 한 번 더 부르면
       그때는 데워진 캐시를 타서 대개 성공한다. */
    return new Promise(function (r) { setTimeout(r, 2500); })
      .then(function () { return refreshAll(true); });
  });
}

/* ───────── 낙관적 반영 ─────────
   저장 직후 서버를 다시 부르면, 캐시가 막 비워진 참이라 집계를
   처음부터 다시 계산한다. 이게 읽기 제한시간(8초)을 넘기면
   화면이 갱신되지 않았다. 그래서 방금 넣은 건은 서버 응답을
   기다리지 않고 목록에 먼저 꽂는다. */
function ownerOf(pay) {
  var a = ((ST.boot && ST.boot.accounts) || []).filter(function (x) { return x.name === pay; })[0];
  return (a && a.owner) || '공동';
}
function txSum(delta, gubun, amt) {
  var sum = ST.tx.sum || (ST.tx.sum = { spend: 0, income: 0, count: 0 });
  sum.count += delta;
  if (gubun === '지출') sum.spend += delta * amt;
  else if (gubun === '수입') sum.income += delta * amt;
}
function txFind(row) {
  var days = (ST.tx && ST.tx.days) || [];
  for (var i = 0; i < days.length; i++) {
    for (var j = 0; j < days[i].rows.length; j++) {
      if (days[i].rows[j].row === row) return { day: days[i], i: j, r: days[i].rows[j] };
    }
  }
  return null;
}
function txAdd(row, p) {
  if (!ST.tx || !row) return;
  if (String(p.date).slice(0, 7) !== ST.ym) return;   /* 다른 달 건은 지금 목록과 무관 */
  var who = ownerOf(p.pay);
  if (ST.who && who !== ST.who) return;               /* 보는 대상이 다르면 안 보이는 게 맞다 */
  var r = { row: row, gubun: p.gubun, cat: p.cat, desc: p.desc, pay: p.pay,
            who: who, amt: Number(p.amt) || 0, waste: false };
  var days = ST.tx.days || (ST.tx.days = []);
  var d = null;
  for (var i = 0; i < days.length; i++) if (days[i].d === p.date) d = days[i];
  if (!d) {
    d = { d: p.date, total: 0, rows: [] };
    days.push(d);
    days.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  }
  d.rows.unshift(r);
  if (r.gubun === '지출') d.total += r.amt;
  txSum(1, r.gubun, r.amt);
  txEpoch++;
  LS.set(LS.mk('t', ST.ym), ST.tx);
}
function txUpd(row, p) {
  var f = txFind(row);
  if (!f) return;
  txSum(-1, f.r.gubun, f.r.amt);
  if (f.r.gubun === '지출') f.day.total -= f.r.amt;
  f.r.gubun = p.gubun; f.r.cat = p.cat; f.r.desc = p.desc;
  f.r.pay = p.pay; f.r.amt = Number(p.amt) || 0; f.r.who = ownerOf(p.pay);
  txSum(1, f.r.gubun, f.r.amt);
  if (f.r.gubun === '지출') f.day.total += f.r.amt;
  /* 날짜를 옮겼으면 이 목록에서 빼고 서버 응답을 기다린다 */
  if (p.date && p.date !== f.day.d) txDel(row);
  txEpoch++;
  LS.set(LS.mk('t', ST.ym), ST.tx);
}
function txDel(row) {
  var f = txFind(row);
  if (!f) return;
  txSum(-1, f.r.gubun, f.r.amt);
  if (f.r.gubun === '지출') f.day.total -= f.r.amt;
  f.day.rows.splice(f.i, 1);
  if (!f.day.rows.length) {
    ST.tx.days = ST.tx.days.filter(function (x) { return x !== f.day; });
  }
  txEpoch++;
  LS.set(LS.mk('t', ST.ym), ST.tx);
}

/* 보던 탭을 기억한다. 새로고침하면 늘 홈으로 튕기던 걸 막는다. */
function paintTabs() {
  [].forEach.call(document.querySelectorAll('#tb button[data-tab]'), function (x) {
    var on = x.dataset.tab === ST.tab;
    var label = (x.textContent || '').trim();
    x.classList.toggle('on', on);
    /* 새 버전이 있으면 설정 탭에 점 하나. 홈에 배너를 하나 더 세우기엔
       홈이 이미 빽빽하고, 점이면 글자를 안 늘리고도 눈에 띈다.
       점은 텍스트가 없어서 다음 paint 때 label 에 섞이지 않는다. */
    var dot = (x.dataset.tab === 'settings' && updPending()) ? '<b class="tdot"></b>' : '';
    x.innerHTML = (on ? '<span>' + label + '</span>' : label) + dot;
  });
}

/* 문서 자체가 스크롤한다(#app 은 min-height 만 잡는다). */
function toTop(smooth) {
  try { window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }); }
  catch (e) { window.scrollTo(0, 0); }
}

/* 탭 이동은 한 군데로 모은다. 예전엔 설정 화면이 탭바 DOM 을 직접
   만지는 코드를 따로 갖고 있었다.

   탭을 옮기면 항상 맨 위에서 시작한다. 홈에서 카테고리를 눌러 내역으로
   갈 때 이전 스크롤 위치가 남아 있어, 걸러진 몇 건이 화면 밖에 있고
   빈 화면만 보이는 일이 있었다. */
function goTab(t) {
  /* 「앞으로 나갈 돈」은 펼쳐 두면 내역 목록을 화면 밖으로 밀어낸다.
     지금 확인할 것이지 계속 펼쳐 두고 볼 것이 아니라, 내역을 떠날 때
     접어 둔다(폴 결정, 2026-08-05). 홈에서 그 카드를 눌러 들어오는
     경우는 여기서 안 걸린다 — 그때 ST.tab 은 아직 'home' 이다. */
  ST.tab = t;
  LS.set('tab', t);
  paintTabs();
  render();
  toTop();
}

/* ───────── 헤더 ───────── */
function paintWho() {
  var w = ST.who;
  var btn = $('#whobtn');
  /* ⚠️ 헤더에서는 「전체」로 줄인다 (디자인 7a). 「가구 전체」는 설정·바텀시트처럼
     **고르는 자리**에 그대로 둔다 — 거기선 무엇의 전체인지 밝혀야 한다. */
  $('#whonm').textContent = w || '전체';
  var av = $('#whoav');
  av.textContent = w ? w.slice(0, 1) : '집';
  av.className = 'av' + whoCls(w);
  if (btn) btn.classList.toggle('on', !!w);
}

/* 보는 대상 전환 — 홈·내역·리포트가 모두 이 값을 따른다 */
function switchWho() {
  var names = [];
  ((ST.boot && ST.boot.accounts) || []).forEach(function (a) {
    if (a.owner && names.indexOf(a.owner) < 0) names.push(a.owner);
  });
  if (!names.length) names = whoOpts().length ? whoOpts() : ['공동'];
  names.sort(function (a, b) {
    var o = {}; ((ST.boot || {}).people || []).forEach(function (n, i) { o[n] = i; });
    o['공동'] = 9;
    return (o[a] == null ? 9 : o[a]) - (o[b] == null ? 9 : o[b]);
  });
  /* ⚠️ 부제가 이 시트의 핵심입니다 — 「고미」를 고르면 **고미 것 + 공동**이 보입니다.
     이름만 적혀 있으면 「고미 것만」으로 읽혀서, 공동 지출이 사라진 줄 압니다. */
  var opts = [{ label: WHO_ALL, av: '가구', sub: names.join(' + '),
                on: !ST.who, run: function () { setWho(null); } }];
  names.forEach(function (n) {
    opts.push({ label: n, av: n.slice(0, 2),
                sub: n === '공동' ? '공동 계좌만' : '내 것 + 공동',
                on: ST.who === n, run: function () { setWho(n); } });
  });
  sheet('누구 걸 볼까요', opts, '바꾸면 홈·내역·리포트가 한꺼번에 따라갑니다.');
}
function setWho(w) {
  if (ST.who === w) return;
  ST.who = w;
  LS.set('who', w);
  ST.tx = null;
  paintWho();
  loadMonth(ST.ym);
}
/* 헤더의 달 이름 — 올해면 「8월」, 아니면 「2025년 8월」 (디자인 7a).
   ⚠️ 해를 **늘** 지우면 안 된다. 12월에 지난해 8월을 열어 놓고 「8월」만 보면
   올해 8월로 읽는다 — 다른 해일 때만 해를 붙인다. */
function ymHead(ym) {
  ym = toYm(ym);
  if (!ym) return '—';
  if (Number(ym.slice(0, 4)) === new Date().getFullYear()) return Number(ym.slice(5, 7)) + '월';
  return ymLabel(ym);
}
function paintMonthNav() {
  $('#mlabel').textContent = ymHead(ST.ym);
  var ms = (ST.boot && ST.boot.months) || [];
  var i = ms.indexOf(ST.ym);
  $('#mprev').disabled = !(i >= 0 && i < ms.length - 1);
  $('#mnext').disabled = !(i > 0);
}

/* ───────── 스켈레톤 / 에러 / 토스트 ───────── */
function renderSkeleton() {
  $('#screen').innerHTML =
    '<div class="stack">' +
    '<div class="sk-card"><div class="sk" style="width:40%;height:14px"></div>' +
    '<div class="sk" style="width:70%;height:38px"></div>' +
    '<div class="sk" style="width:55%;height:12px"></div>' +
    '<div class="sk" style="height:10px;margin-top:8px"></div></div>' +
    '<div class="sk-card"><div class="sk" style="width:50%;height:14px"></div>' +
    '<div class="sk" style="height:128px"></div></div>' +
    '<div class="sk-card"><div class="sk" style="width:45%;height:14px"></div>' +
    '<div class="sk" style="height:7px"></div><div class="sk" style="height:7px"></div>' +
    '<div class="sk" style="height:7px"></div></div>' +
    '</div>';
}
/* ⚠️ 1.39.0 · 디자인 7e — 「무엇이 안 됐나」는 **맨 위 띠**로, 「어떻게 하나」는
   화면 가운데로 나눕니다. 예전엔 분홍 상자 하나에 둘 다 들어 있어서, 큰 오류가
   나도 작은 상자 하나만 뜨고 아래가 통째로 비었습니다.
   ⚠️ 서버가 준 말(`msg`)을 지우지 않습니다 — 「시트를 열지 못했습니다」 같은 한 줄이
   폴이 어디를 봐야 하는지 아는 유일한 단서입니다. */
function renderError(msg) {
  $('#screen').innerHTML =
    '<div class="ebar"><i>!</i><span><b>서버에 닿지 못했습니다</b>' +
      (msg ? '<em>' + esc(msg) + '</em>' : '') + '</span></div>' +
    '<div class="ezone">' +
      '<p>잠시 뒤 다시 해 보세요. 저장해 둔 게 있으면 그걸 먼저 보여드립니다.</p>' +
      '<button id="retry">다시 시도</button>' +
    '</div>';
  var b = $('#retry');
  if (b) b.onclick = function () { start(); };
}
var toastT = null;
function toast(msg) {
  var old = document.querySelector('.toast');
  if (old) old.remove();
  var t = el('div', 'toast', esc(msg));
  document.body.appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(function () { if (t.parentNode) t.remove(); }, 2200);
}

/* ───────── 라우팅 ───────── */
function render() {
  document.body.classList.remove('setmode');
  /* ⚠️ 「앞으로 나갈 돈」은 탭이 아니라 **덮개 화면**이다 (디자인 6c).
     탭바는 그대로 두고 뒤로가기로 닫힌다. */
  document.body.classList.toggle('duemode', !!ST.due);
  if (ST.due) { renderDue(); mkPaint(); return; }
  if (ST.tab === 'home') renderHome();
  else if (ST.tab === 'tx') renderTx();
  else if (ST.tab === 'report') renderReport();
  else if (ST.tab === 'settings') renderSettings();
  else renderSoon();
  /* ⚠️ 그린 뒤에 가림 상태를 **한 곳에서** 입힌다. 화면마다 부르면 빼먹는
     자리가 생기고, 그 화면만 금액이 드러난 채 남는다. */
  mkPaint();
}

/* ═══════════ 홈 (#1a) ═══════════ */
function renderHome() {
  var M = ST.month;
  if (!M) return;
  var s = $('#screen');
  s.innerHTML = '';
  /* ⚠️ 히어로는 **stack 밖**이다. 좌우 여백 없이 헤더 바로 밑에 붙어야
     어두운 면이 한 덩어리로 읽힌다 (디자인 리뉴얼의 첫 번째 규칙). */
  s.appendChild(cardPnl(M));
  var dr = rowDue();
  if (dr) s.appendChild(dr);
  s.insertAdjacentHTML('beforeend', '<div class="band"></div>');
  var wrap = el('div', 'stack');
  wrap.insertAdjacentHTML('beforeend', mkBarHtml('home'));
  var hbc = cardHb();
  if (hbc) wrap.appendChild(hbc);
  /* 알림 끊김 > 수신함 대기 > 목표 미설정 순. 앞의 둘은 「오늘 당장」이고
     목표는 「이 달 안에」다. 급한 것부터 위에. */
  if (ST.inbox.length) wrap.appendChild(cardInbox({ limit: 3 }));
  var bsc = cardBudSet();
  if (bsc) wrap.appendChild(bsc);
  /* 손익 → 페이스 → 카테고리 → 사람.
     ⚠️ 1.24.0 에 순서가 바뀌었다. 폴: 「나는 페이스 보는 것도 좋아서 위로
     올라갔으면 좋겠거든.」 「이번 달 얼마나 벌고 썼나」 다음에 「그래서
     페이스는 어떤가」가 오는 게 읽는 순서로도 자연스럽다.
     현금 흐름은 별도 카드였다가 **손익 카드 안으로 접혀 들어갔다** —
     큰 숫자 둘이 나란히 서 있는 게 헷갈림의 원인이었다. */
  /* 손익과 잔액이 **한 카드**에 있다 (1.30.0). 통장 갈래는 거래내역 한 줄 한 줄을
     봐야 나오므로(month 응답엔 없다) 내역을 뒤에서 받아온다 — 오기 전에는
     그 자리에 스켈레톤이 서 있다. */
  if (!ST.tx && !txLoading) loadTx(true);
  wrap.appendChild(cardPace(M));
  wrap.appendChild(cardCats(M));
  wrap.appendChild(cardPeople(M));
  s.appendChild(wrap);
  bindHome();
}

/* ═══════════ 폰 맥박 ═══════════
   8/5 현대카드 건 — 15:49 이후로 폰에서 아무것도 안 들어오는 상태가
   네 시간 가까이 이어졌는데, 앱은 「조용히 아무 일도 안 일어난」 화면을
   그대로 보여줬다. 결제가 없어서 조용한 것과 폰이 죽어서 조용한 것은
   화면상 똑같이 생겼다. 그걸 가르는 게 맥박이다.

   맥박은 결제 알림이 아니라 '요청이 서버에 닿은 시각'이다. 플로우가
   살아 있으면 카톡 같은 비결제 알림으로도 뛴다. 그래서 결제가 하나도
   없던 한가한 날에는 안 울린다. */
/* ⚠️ 문턱이 12시간 하나뿐이라 **8시간 52분짜리 사고를 놓쳤습니다** (2026-08-08).
   Automate 가 03:00 에 죽고 11:52 에 살아났는데, 그 사이 11:33·11:46 결제 두 건이
   떴습니다. Automate 는 **새로 뜨는** 알림만 잡으므로 이미 떠 있던 그 둘은
   재개된 뒤에도 안 옵니다 — 아침 반나절 지출이 통째로 사라졌고, 배너는
   12시간에 못 미쳐서 조용했습니다.

   그래서 문턱을 둘로 나눕니다:
     · **낮에 3시간** 조용하면 이상하다 (밥 먹고 커피 마시는 시간대다)
     · 밤낮 통틀어 **12시간**이면 무조건 이상하다

   ⚠️ 「지금이 낮인가」로 재면 안 됩니다. 밤새 조용한 건 정상인데, 아침 9시가
   되는 순간 11시간짜리 밤 공백이 낮 기준에 걸려 **매일 아침 배너가 뜹니다.**
   마지막 수신 이후 흐른 시간 중 **낮에 해당하는 만큼만** 셉니다. */
var HB_WARN_H = 12;              /* 밤낮 통틀어 */
var HB_WARN_DAY_H = 3;           /* 낮에만 */
var HB_DAY_FROM = 9, HB_DAY_TO = 22;
var HB_MUTE_K = 'hbmute';

function hbIsDay(d) { var h = d.getHours(); return h >= HB_DAY_FROM && h < HB_DAY_TO; }

/* 마지막 수신 이후 흐른 h 시간 중 낮에 해당하는 시간. 5분씩 훑는다 —
   토막이 클수록 문턱을 일찍 넘는다(15분으로 재보니 7분 일찍 걸렸다).
   한 달치라도 8,640번이면 끝나고, 오차는 5분 아래다. */
function hbDayGap(h, now) {
  if (!(h > 0)) return 0;
  var end = (now || new Date()).getTime();
  var span = Math.min(h, 24 * 30) * 36e5;
  var step = 5 * 6e4, day = 0;
  for (var t = end - span + step / 2; t < end; t += step) {
    if (hbIsDay(new Date(t))) day += step;
  }
  return day / 36e5;
}

/* 끊긴 걸로 볼 것인가. 두 문턱 중 하나만 넘어도 사고다. */
function hbIsBad(h, now) {
  if (!(h > 0)) return false;
  return h >= HB_WARN_H || hbDayGap(h, now) >= HB_WARN_DAY_H;
}

function hbGapH() {
  var t = ST.hb && Number(ST.hb['*'] || 0);
  if (!t) return -1;                    /* 아직 한 번도 안 닿음 — 판단 보류 */
  return (Date.now() - t) / 36e5;
}

/* ⚠️ 전체(*)만 보면 두 사람이 쓰는 순간 이 기능이 무의미해진다.
   한쪽 폰이 죽어도 다른 쪽이 보내는 동안 `*` 는 계속 싱싱해서
   홈 배너도 설정 줄도 계속 「정상」이라고 말한다. 폴 혼자 쓸 때는
   안 드러났고, 아내에게 넘기기 직전에 실측으로 잡았다 (2026-08-06).
   그래서 판정은 사람마다 따로 한다. */
function hbPeople() {
  var hb = ST.hb || {};
  var names = ((ST.boot && ST.boot.people) || []).slice();
  if (!names.length) {                  /* 옛 캐시라 명단이 없으면 맥박에 있는 사람만 */
    Object.keys(hb).forEach(function (k) {
      if (k !== '*' && k !== '?') names.push(k);
    });
  }
  /* 이름을 안 싣고 보내는 폰도 드러낸다 — 플로우에서 w 가 빠진 것이다 */
  if (hb['?'] && names.indexOf('(이름 없음)') < 0) names.push('(이름 없음)');
  return names.map(function (n) {
    var t = Number(hb[n === '(이름 없음)' ? '?' : n] || 0);
    return { who: n, t: t, h: t ? (Date.now() - t) / 36e5 : -1 };
  });
}

/* bad  = 보내다가 끊긴 사람 (진짜 사고)
   none = 아직 한 번도 안 보낸 사람 (설치 전이거나 아이폰 — 야단칠 일은 아니다) */
function hbWorst() {
  var bad = null, none = [];
  hbPeople().forEach(function (p) {
    if (p.h < 0) { none.push(p.who); return; }
    if (hbIsBad(p.h) && (!bad || p.h > bad.h)) bad = p;
  });
  return { bad: bad, none: none };
}
function hbDur(h) {
  return (h >= 48 ? Math.round(h / 24) + '일째' : Math.round(h) + '시간째');
}

/* 홈 화면에 설치된 앱으로 열었나(브라우저 탭이 아니라).
   ⚠️ 이걸 「폰인가」로 착각하면 안 된다. 데스크톱에 설치해도 참이다.
   여기서 재는 건 **「지금 이 사람이 이걸 앱으로 쓰고 있나」** 뿐이다. */
function isApp() {
  try {
    if (window.navigator && window.navigator.standalone) return true;   /* iOS */
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch (e) { return false; }
}

function cardHb() {
  /* ⚠️ 맥박 배너는 **설치된 앱에서만** 띄운다 (1.25.0).
     폴 2026-08-08: 「화면 보려고 웹브라우저에서도 띄워놨더니 알림 4시간
     안들어왔다고 떴어. ㅋ」

     확인해 보니 **브라우저가 원인이 아니었다.** 앱은 맥박을 한 번도 안 보내고
     (`INBOX_HB` 는 폰 Automate 플로우만 갱신한다), 4시간 공백은 진짜였다.
     문제는 **데스크톱에서는 그 배너로 할 수 있는 게 없다**는 것이다 —
     Automate 를 되살리는 건 폰에서 하는 일이다. 책상에서 화면만 보는데
     빨간 배너가 뜨면 그건 알림이 아니라 소음이다.

     ⚠️ **정보를 없애는 게 아니라 자리를 옮기는 것이다.** 브라우저에서도
     설정 › 점검 › 알림 연결 확인에서는 그대로 보인다. 조용히 숨기기만 하면
     「왜 아무도 안 알려줬지」가 된다. */
  if (!isApp()) return null;
  /* 한 번도 안 보낸 사람(none)으로는 배너를 띄우지 않는다. 아직 안
     깔았거나 아이폰일 수 있어서, 매일 홈에서 야단치면 안 된다.
     보내다가 끊긴 사람만 사고다. */
  var w = hbWorst();
  if (!w.bad) return null;
  var until = Number(LS.get(HB_MUTE_K) || 0);
  if (until && Date.now() < until) return null;
  var n = hbDur(w.bad.h);
  var c = el('div', 'card hbwarn');
  c.innerHTML =
    '<div class="l"><b>' + esc(w.bad.who) + ' 폰에서 알림이 ' + n + ' 안 들어와요</b>' +
      /* ⚠️ 「곧 들어오겠지」라고 기다리게 두면 안 된다. Automate 는 **새로 뜨는**
         알림만 잡아서, 플로우가 되살아나도 그 사이 알림은 영영 안 온다. */
      '<span>Automate 플로우가 멈췄을 수 있어요. 다시 살아나도 <b>그 사이 알림은 ' +
        '안 들어옵니다</b> — 그동안 쓴 건 직접 넣어주세요.</span></div>' +
    '<div class="b"><button data-a="h">확인하기</button>' +
      '<button data-a="m">반나절 숨기기</button></div>';
  c.onclick = function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    if (b.dataset.a === 'm') {
      LS.set(HB_MUTE_K, Date.now() + 12 * 36e5);
      return render();
    }
    showHealth();
  };
  return c;
}

/* ───────── 「이 달 목표를 아직 안 정했어요」 배너 (1.18.0) ─────────
   폴: 「진입점이 너무 제한적이다. 나 아니면 찾기 힘들 것 같아.」
   버튼을 늘리는 것만으로는 **찾아갈 생각을 한 사람**만 찾습니다.
   달이 바뀌면 앱이 먼저 말을 겁니다.

   ⚠️ `budChanged` 로 판단하면 안 됩니다. 그건 「예산 시트와 다른가」라서,
   7월에 바꾼 값이 8월로 이어지기만 해도 켜져 있습니다. 서버가 따로 주는
   `setThis`(적용월이 딱 이 달인 줄이 있나)를 봅니다.

   ⭐ 서버가 아직 옛 판이면 `setThis` 가 아예 없습니다. 그때는 **안 띄웁니다** —
   모르는 걸 「안 정했다」고 단정하면 매일 거짓말하는 배너가 됩니다. */
/* 목표 화면 입구를 한 곳에서 물린다 — 페이스 카드 · 카테고리 카드 헤더 · 배너.
   ⚠️ `$('button[data-a="bud"]')` 는 **첫 하나만** 잡는다. 입구를 늘려놓고 이걸
   그대로 두면 나머지는 눌러도 아무 일 없는 버튼이 된다.
   ⚠️ showBudget 를 그대로 넘기면 클릭 Event 가 첫 인자(ym0)로 들어간다. */
function bindBudEntries(root) {
  var r = root || document;
  Array.prototype.forEach.call(
    r.querySelectorAll('button[data-a="bud"]'),
    function (b) { b.onclick = function () { showBudget(); }; });
}

var BUDSET_MUTE_K = 'budSetMute';
function budSetDue() {
  var M = ST.month || {}, B = M.budget;
  if (!B || typeof B.setThis !== 'boolean') return null;   /* 옛 서버 — 모른다 */
  if (B.setThis) return null;
  /* 지나간 달을 보고 있을 땐 안 띄웁니다. 이제 와서 못 바꾸는 달입니다. */
  if ((M.ym || ST.ym) !== todayYmd().slice(0, 7)) return null;
  if (LS.get(BUDSET_MUTE_K) === (M.ym || ST.ym)) return null;
  return { ym: M.ym || ST.ym, src: prevYmOf(M.ym || ST.ym) };
}
function prevYmOf(ym) {
  var y = Number(String(ym).slice(0, 4)), m = Number(String(ym).slice(5, 7));
  if (!(y > 0) || !(m >= 1 && m <= 12)) return '';
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return y + '-' + (m < 10 ? '0' : '') + m;
}
function cardBudSet() {
  var d = budSetDue();
  if (!d) return null;
  var c = el('div', 'card budwarn');
  c.innerHTML =
    '<div class="l"><b>' + esc(ymLabel(d.ym)) + ' 목표를 아직 안 정했어요</b>' +
      '<span>지난달 목표가 그대로 쓰이고 있어요. ' +
        esc(ymLabel(d.src)) + '에 실제로 쓴 돈으로 다시 짤 수 있어요.</span></div>' +
    '<div class="b"><button data-a="bud">목표 짜기</button>' +
      '<button data-a="m">이 달은 숨기기</button></div>';
  /* ⚠️ 「목표 짜기」는 여기서 안 엽니다 — `bindBudEntries` 가 물립니다.
     양쪽에서 다 열면 화면이 두 번 뜹니다. 여기선 숨기기만. */
  c.onclick = function (e) {
    var b = e.target.closest('button[data-a="m"]');
    if (!b) return;
    LS.set(BUDSET_MUTE_K, d.ym);
    render();
  };
  return c;
}

/* ───────── 알림 연결 확인 ─────────
   설정에 버튼은 있었는데 이 함수가 없어서 누르면 그냥 아무 일도 안 났다.
   (1.11.1 까지 ReferenceError) 폰이 살아 있는지 확인할 유일한 창구다. */
function showHealth() {
  var m = el('div', 'mask');
  var sh = el('div', 'nhs');
  m.appendChild(sh);
  var draw = function (inner) { sh.innerHTML = inner; };

  var line = function (k, v, cls) {
    return '<div class="nhr' + (cls ? ' ' + cls : '') + '">' +
      '<span class="k">' + esc(k) + '</span>' +
      '<span class="v">' + esc(v || '—') + '</span></div>';
  };
  draw('<div class="nhh"><b>알림 연결 확인</b><button class="x" data-a="x">닫기</button></div>' +
       '<div class="nhb"><div class="ld">확인 중…</div></div>');
  document.body.appendChild(m);
  navOpen(function () { m.remove(); });

  var shut = function () { m.remove(); navClose(); };
  m.onclick = function (e) {
    if (e.target === m) return shut();
    var b = e.target.closest('button');
    if (b && b.dataset.a === 'x') shut();
  };

  api('inboxHealth', {}).then(function (j) {
    var d = j.data || {};
    var hb = d.hb || { by: [] };
    var gap = hb.any ? (Date.now() - hb.any) / 36e5 : -1;
    /* 두 시각을 나란히 놓는 게 이 화면의 전부다.
         맥박은 뛰는데 마지막 결제가 멀다 → 플로우는 산다, 결제만 없다
         맥박 자체가 멀다                → 폰이 죽었다
       판정은 사람마다 한다. 전체(*)로 재면 한쪽이 죽어도 다른 쪽 덕에
       계속 초록이라, 설정 줄과 이 화면이 서로 다른 말을 하게 된다. */
    /* ⚠️ 「모르는 이름」 줄은 사람 명단에 넣으면 안 된다. 넣으면
       「모르는 이름: 아내 폰이 3시간 조용해요」 같은 판정이 나온다.
       그건 폰이 죽은 게 아니라 이름이 안 맞는 것이라 고칠 곳이 다르다. */
    var seen = {}, hbBad = [];
    (hb.by || []).forEach(function (x) {
      if (x.bad) { hbBad.push(x); return; }
      seen[x.who] = Number(x.t) || 0;
    });
    var roster = ((ST.boot && ST.boot.people) || []).slice();
    Object.keys(seen).forEach(function (k) { if (roster.indexOf(k) < 0) roster.push(k); });
    var hbad = null, hnone = [];
    roster.forEach(function (n) {
      var t = seen[n] || 0;
      if (!t) { hnone.push(n); return; }
      var g = (Date.now() - t) / 36e5;
      /* ⚠️ 홈 배너와 **같은 규칙**을 써야 한다. 여기만 12시간으로 두면
         배너는 「끊겼어요」, 이 화면은 「살아 있어요」라고 말한다. */
      if (hbIsBad(g) && (!hbad || g > hbad.g)) hbad = { who: n, g: g };
    });
    var verdict = hbad
      ? '<div class="nhv bad">' + esc(hbad.who) + ' 폰이 ' + hbDur(hbad.g) +
        ' 조용해요 · 플로우가 멈춘 것 같아요</div>'
      : hnone.length
        ? '<div class="nhv wait">' + esc(hnone.join('·')) +
          ' 폰에서 아직 한 번도 안 닿았어요 · 플로우와 키를 확인해주세요</div>'
        : gap < 0
          ? '<div class="nhv wait">폰에서 아직 한 번도 안 닿았어요 · 플로우와 키를 확인해주세요</div>'
          : '<div class="nhv ok">폰이 다 살아 있어요 · 마지막 신호 ' +
            (gap < 1 ? Math.max(1, Math.round(gap * 60)) + '분 전' : Math.round(gap) + '시간 전') + '</div>';

    /* 폰은 살아서 보내는데 이름이 목록에 없어 버려지는 상태.
       조용히 「폰 미상」으로만 쌓여서 2026-08-08 에 사흘을 못 봤다. */
    var whoWarn = hbBad.length
      ? '<div class="nhv wait">폰이 보낸 이름을 못 알아들었어요 — ' +
        esc(hbBad.map(function (x) { return x.who.replace('모르는 이름: ', ''); }).join(' · ')) +
        '<br>설정 시트 사용자 목록에 없는 이름이에요. 폰 플로우의 <b>w</b> 를 고치거나 ' +
        '애칭으로 이어주세요.</div>'
      : '';

    var body =
      verdict + whoWarn +
      '<div class="nhg"><h5>맥박 — 요청이 닿은 시각</h5>' +
        line('전체', hb.at) +
        hb.by.map(function (x) { return line(x.who, x.at, x.bad ? 'bad' : ''); }).join('') +
        /* 안 보낸 사람도 줄로 남긴다. 목록에 없으면 '없다'가 안 읽힌다 */
        hnone.map(function (n) { return line(n, '아직 없음', 'bad'); }).join('') +
      '</div>' +
      '<div class="nhg"><h5>수신함 — 결제로 담긴 것</h5>' +
        line('마지막', d.last) +
        line('최근 7일', (d.total7 || 0) + '건') +
        (d.by || []).map(function (x) {
          return line(x.who, x.last + ' · 7일 ' + x.n7 + '건'); }).join('') +
      '</div>' +
      '<div class="nhg"><h5>앱별 마지막 수신</h5>' +
        ((d.srcs || []).length
          ? (d.srcs || []).map(function (x) {
              return line(x.src, x.last + ' · ' + x.n7 + '건'); }).join('')
          : '<div class="nhz">아직 없어요</div>') +
      '</div>' +
      '<div class="nhg"><h5>버려진 요청</h5>' +
        '<div class="nhn">폰은 보냈는데 수신함에 안 담긴 것들이에요. ' +
          '「키오류」가 보이면 폰의 키를 다시 넣어야 해요.</div>' +
        ((d.drops || []).length
          ? (d.drops || []).map(function (x) {
              return '<div class="nhd"><span class="t">' + esc(x.at) + '</span>' +
                '<span class="r ' + (x.res === '키오류' ? 'bad' : '') + '">' + esc(x.res) + '</span>' +
                '<span class="w">' + esc(x.raw) + '</span></div>'; }).join('')
          : '<div class="nhz">없어요 — 보낸 건 전부 담겼어요</div>') +
      '</div>';
    draw('<div class="nhh"><b>알림 연결 확인</b><button class="x" data-a="x">닫기</button></div>' +
         '<div class="nhb">' + body + '</div>');
  }).catch(function (e) {
    draw('<div class="nhh"><b>알림 연결 확인</b><button class="x" data-a="x">닫기</button></div>' +
         '<div class="nhb"><div class="nhv bad">확인 실패 — ' +
         esc((e && e.message) || '다시 시도해주세요') + '</div></div>');
  });
}

/* ═══════════ 수신함 (폰 결제 알림) ═══════════ */
function setInbox(items) {
  ST.inbox = items || [];
  LS.set('inbox', ST.inbox);
}
function dropInbox(row) {
  ST.inbox = ST.inbox.filter(function (x) { return x.row !== row; });
  LS.set('inbox', ST.inbox);
}
function reloadInbox() {
  return api('inboxList', {}).then(function (j) {
    setInbox((j.data && j.data.items) || []);
    /* 맥박도 같이 갱신한다. 안 그러면 앱을 오래 켜둔 채로 시간만 흘러
       살아 있는 폰을 두고 배너가 뜬다. */
    if (j.data && j.data.hb) ST.hb = j.data.hb;
    if (ST.tab === 'home') render();
  }).catch(function () {});
}
function inboxDateLabel(ymd) {
  if (!ymd || ymd.length < 10) return '';
  return Number(ymd.slice(5, 7)) + '/' + Number(ymd.slice(8, 10));
}

/* ───────── 「누구 폰에서 온 알림인가」 ─────────
   폴 2026-08-07: 「알림이 누구 폰에서 왔는지도 표시되어야 할 것 같아.
   조금만 밀리면 서로 모르고 미루게 될 것 같네.」

   맞는 지적입니다. 확인 안 한 알림이 쌓이는 이유는 어렵거나 귀찮아서가
   아니라 **내 것인지 몰라서**입니다. 주인이 안 보이면 둘 다 상대 것이라고
   짐작하고 넘어갑니다. 그래서 줄마다 주인을 박고, 카드 머리에는 사람별로
   몇 건인지 나눠 적습니다 — 「고니 2건」이 보여야 고니가 집어갑니다.

   ⚠️ 첫 글자 아바타는 못 씁니다. 고미·고니가 둘 다 「고」입니다. 이름 전체. */
function inboxWhoTag(w) {
  if (!w) return '<i class="wt x">폰 미상</i>';
  return '<i class="wt' + whoCls(w) + '">' + esc(w) + ' 폰</i>';
}
/* 카드 머리의 건수. 주인이 한 사람뿐이면 「3건」이 더 읽기 쉽다 — 나누지 않는다. */
function inboxWhoCount(all) {
  var n = {}, order = [];
  all.forEach(function (x) {
    var w = x.who || '';
    if (!(w in n)) { n[w] = 0; order.push(w); }
    n[w]++;
  });
  if (order.length < 2) return all.length + '건';
  var ppl = ((ST.boot || {}).people) || [];
  order.sort(function (a, b) {
    var ia = ppl.indexOf(a), ib = ppl.indexOf(b);
    return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
  });
  return order.map(function (w) { return (w || '미상') + ' ' + n[w]; }).join(' · ');
}
/* ═══════════ 입력 대기 묶기 (1.21.0) ═══════════
   폴 2026-08-08: 오락실에서 500원짜리 결제 **열 건**이 입력 대기에 쌓였다.
   확인을 열 번 눌러야 했다.

   ⚠️ 1.20.0 에서 묶기를 **내역에만** 넣은 게 잘못이었다. 성가신 건
   「다 넣고 나서 줄이 열 개 보이는 것」이 아니라 **「확인을 열 번 누르는 것」**이다.
   일이 실제로 쌓이는 자리에 있어야 한다.

   묶는 기준은 내역과 같다 — 같은 날·같은 가게·같은 결제수단, 3건부터.
   취소보류는 절대 안 묶는다 (버튼이 다르고, 섞이면 취소가 묻힌다). */
function inboxGroups(list) {
  var out = [], by = {};
  list.forEach(function (it) {
    var k = it.state === '취소보류'
      ? 'x' + it.row
      : (it.desc || '') + '|' + (it.pay || '') + '|' + (it.date || '');
    var g = by[k];
    if (!g) { g = by[k] = { id: 'i' + it.row, items: [] }; out.push(g); }
    g.items.push(it);
  });
  out.forEach(function (g) {
    g.amt = g.items.reduce(function (a, x) { return a + (Number(x.amt) || 0); }, 0);
    g.rows = g.items.map(function (x) { return x.row; }).join(',');
  });
  return out;
}

function cardInbox(opt) {
  opt = opt || {};
  var all = ST.inbox;
  var lim = opt.limit && all.length > opt.limit ? opt.limit : all.length;
  var list = all.slice(0, lim);
  var one = function (it, sub) {
    var cancel = it.state === '취소보류';
    return '<div class="irow' + (sub ? ' sub' : '') + '" data-r="' + it.row + '">' +
      '<div class="l">' +
        '<b><span class="t">' + esc(it.desc || '(가맹점 미확인)') + '</span>' +
          (it.late ? '<i class="lt">지난 알림</i>' : '') + '</b>' +
        /* 딱지는 절대 안 줄이고, 뒤의 설명만 잘린다. 주인이 제일 중요하다. */
        '<span>' + inboxWhoTag(it.who) + '<i class="mt">' + esc(inboxDateLabel(it.date)) +
          (it.pay ? ' · ' + esc(it.pay) : '') +
          (it.cat ? ' · ' + esc(it.cat) : '') + '</i></span>' +
      '</div>' +
      '<div class="r">' +
        /* ⚠️ 나갈 돈이라 마이너스 부호를 붙인다 (디자인). 취소된 건은 부호를
           안 붙인다 — 안 나갈 돈이라 「−」가 거짓말이 된다. */
        '<em' + (cancel ? ' class="cx"' : '') + '>' +
          (cancel ? '취소 ' + C(it.amt) : '\u2212' + C(it.amt)) + '</em>' +
        '<div class="b">' +
          '<button data-a="no">무시</button>' +
          (cancel ? '' : '<button data-a="ok" class="p">확인</button>') +
        '</div>' +
      '</div>' +
    '</div>';
  };
  var c = el('div', 'card p18 inbox');
  c.innerHTML =
    /* ⚠️ 「내역 탭에 N건 더」를 제목 줄 오른쪽으로 올린다 (디자인 6a).
       목록 아래 한 줄로 두면 그 줄이 마지막 거래처럼 읽힌다. */
    '<div class="ih"><b>' + esc(opt.title || '확인할 결제') + '</b>' +
      '<span>' + esc(inboxWhoCount(all)) + '</span>' +
      (lim < all.length
        ? '<span class="more">내역 탭에 ' + (all.length - lim) + '건 더</span>' : '') +
    '</div>' +
    inboxGroups(list).map(function (g) {
      if (g.items.length < MERGE_MIN) return g.items.map(function (x) { return one(x); }).join('');
      var it = g.items[0], open = grpOpen[g.id];
      /* ⚠️ 버튼 셋을 낱건처럼 오른쪽에 붙이면 360px 에서 가게 이름 칸이
         0 으로 눌려 글자가 통째로 사라진다 (실측). 버튼은 아랫줄에 따로. */
      return '<div class="igrp' + (open ? ' on' : '') + '" data-ig="' + esc(g.id) + '">' +
        '<div class="irow ghd">' +
          '<div class="l">' +
            '<b><span class="t">' + esc(it.desc || '(가맹점 미확인)') + '</span>' +
              '<i class="gx">×' + g.items.length + '</i></b>' +
            '<span>' + inboxWhoTag(it.who) + '<i class="mt">' + esc(inboxDateLabel(it.date)) +
              (it.pay ? ' · ' + esc(it.pay) : '') +
              (it.cat ? ' · ' + esc(it.cat) : '') + '</i></span>' +
          '</div>' +
          '<div class="r"><em>\u2212' + C(g.amt) + '</em></div>' +
        '</div>' +
        '<div class="gact" data-rows="' + esc(g.rows) + '">' +
          '<button data-a="no">모두 무시</button>' +
          '<button data-a="ok" class="p">한 줄로 확인</button>' +
          '<button data-a="ex" class="ex">' + (open ? '접기' : '따로 보기') + '</button>' +
        '</div>' +
        (open ? '<div class="isub">' + g.items.map(function (x) { return one(x, 1); }).join('') + '</div>' : '') +
      '</div>';
    }).join('') +
    '';
  c.onclick = function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    /* 묶음 버튼줄(.gact)은 .irow 밖에 있다 — 줄 번호를 든 놈을 직접 찾는다 */
    var rowEl = b.closest('[data-rows],[data-r]');
    if (!rowEl) return;

    if (b.dataset.a === 'ex') {
      var gEl = rowEl.closest('.igrp');
      if (!gEl) return;
      grpOpen[gEl.dataset.ig] = !grpOpen[gEl.dataset.ig];
      return render();
    }

    /* 묶음 줄이면 data-rows, 낱건이면 data-r. 둘 다 여러 줄로 다룬다 —
       서버도 어느 쪽이든 같은 길로 처리한다. */
    var csv = rowEl.dataset.rows || rowEl.dataset.r || '';
    var rows = csv.split(',').map(Number).filter(function (n) { return n > 1; });
    var items = rows.map(function (n) {
      return ST.inbox.filter(function (x) { return x.row === n; })[0];
    }).filter(Boolean);
    /* ⚠️ 그새 목록이 바뀌었으면(다른 기기에서 처리) 손대지 않는다.
       하나라도 없으면 묶음 전체를 멈춘다 — 반쪽만 넣으면 더 나쁘다. */
    if (!rows.length || items.length !== rows.length) {
      reloadInbox();
      return toast('목록이 바뀌었어요 — 다시 눌러주세요');
    }

    if (b.dataset.a === 'ok') return openInboxItem(items);

    b.disabled = true;
    api('inboxNo', { rows: rows.join(',') }).then(function () {
      rows.forEach(dropInbox);
      toast(rows.length > 1 ? rows.length + '건 무시했어요' : '무시했어요');
      render();
    }).catch(function () { b.disabled = false; toast('실패했어요'); });
  };
  return c;
}

/* 앞으로 나갈 돈 = 다음 카드 결제 + 이번 달 남은 고정지출.
   리포트에서 이미 받아둔 값을 홈에서 재활용한다.
   카드는 가장 가까운 결제일 하나만 본다 — 그다음 달치는 아직 쌓이는
   중이라 "앞으로 나갈 돈" 으로 부르기엔 확정도가 다르다. */
function nextDue() {
  var R = ST.rep || {};
  var cs = (R.cardDue || {}).cards || [];
  /* ⚠️ **이미 나간 대금을 먼저 걷어낸 뒤에** 가장 가까운 결제일을 고른다 (1.25.0).
     폴: 「아내 카드값은 이미 나갔는데 앞으로 나갈 금액으로 표시돼 있어.」

     순서가 중요하다. 예전 코드는 첫 카드의 결제일을 `payDay` 로 못박고 그
     날짜 것만 더했다. 여기서 걸러내기만 하고 순서를 안 바꾸면, **그 날짜
     카드가 전부 이미 나갔을 때 합이 0 이 되면서 그 뒤 결제일은 통째로
     무시된다** — 「앞으로 나갈 돈 0원」이 되는데 실제로는 남아 있다. */
  var open2 = cs.filter(function (x) { return !x.paid; });
  var card = 0, payDay = '';
  open2.forEach(function (x) {
    if (!payDay || x.pay < payDay) payDay = x.pay;
  });
  open2.forEach(function (x) { if (x.pay === payDay) card += x.amt || 0; });
  var fx = R.fixedLeft || {};
  var fixed = fx.amt || 0;
  var tot = card + fixed;
  if (!tot) return null;
  /* ⚠️ 부제는 **건수 하나**입니다 (폴 2026-08-09: 「타이틀 옆에 건수만 표시해」).
     예전엔 「카드 1,400,000 (8/25) · 고정비 10건」이었는데, 큰 숫자가 바로 옆에
     또 있어서 같은 말을 두 번 했습니다. 갈래별 금액·결제일은 **누르면** 내역
     패널에 다 있습니다 — 여기서 다시 적을 이유가 없습니다.
     ⚠️ 홈과 내역이 **같은 값**을 씁니다. 두 곳에서 따로 세면 어긋납니다. */
  var cardN = 0;
  open2.forEach(function (x) { if (x.pay === payDay && x.amt > 0) cardN++; });
  var dueN = cardN + (fx.n || 0);

  /* ═══ 앞으로 나갈 돈은 한 덩어리가 아니다 (1.24.0) ═══
     폴 2026-08-08: 「앞으로 나갈 돈도 일부는 지출, 일부는 현금 흐름에
     포함된 개념이라 이 부분도 구분지어서 분리해주는 게 나을까?」 — 맞다.
     한 숫자로 뭉쳐 있으면 이게 손익 얘기인지 통장 얘기인지 알 수 없다.

       ① 카드값        통장에서만 나감. 지출은 **긁은 달에 이미 잡혔다**
       ② 고정비 · 지출  앞으로 지출로도 잡히고 통장에서도 나간다
       ③ 고정비 · 자본  통장에선 나가는데 지출로는 **영영 안 잡힌다**
                        (주담대 원리금·청약 같은 것)

     ③ 이 폴이 짚은 자리다. 서버는 안 건드려도 된다 — 대분류→구분 표가
     이미 `boot.cats` 에 있고 `fixedLeft.items[].cat` 도 넘어온다.

     ⚠️ 합계 판정은 **서버(`apiFixedLeft_`)와 같은 기준**이어야 한다.
     `!done && !skip` — near 는 확정이 아니라 합계에 남긴다. 여기서 다르게
     세면 세 줄의 합이 위의 큰 숫자와 안 맞는다. */
  var gub = {};
  ((ST.boot && ST.boot.cats) || []).forEach(function (c) { gub[c.name] = c.gubun; });
  /* ⚠️ 1.31.0 — 자본 갈래를 **저축과 빚 갚기로 가른다** (폴 2026-08-09:
     「저축, 빚 갚기는 서로 다른 성격이므로 분리 표시」). 맞습니다 — 저축은
     내 돈이 자리를 옮기는 것이고, 빚 갚기는 남의 돈을 돌려주는 것입니다.
     둘 다 지출로는 안 잡히지만 그 뒤에 남는 게 다릅니다. */
  var SAVE_G = { '저축/투자': 1, '투자회수': 1 };
  var DEBT_G = { '부채상환': 1, '차입': 1 };
  var fxSpend = 0, fxSpendN = 0, fxSave = 0, fxSaveN = 0, fxDebt = 0, fxDebtN = 0;
  (fx.items || []).forEach(function (it) {
    if (it.done || it.skip) return;
    var g = gub[it.cat];
    /* 대분류를 못 찾으면 지출로 본다 — 고정비는 대부분 지출이고,
       모르는 걸 「저축」쪽에 넣으면 지출을 과소평가한다. */
    if (SAVE_G[g]) { fxSave += it.amt || 0; fxSaveN++; }
    else if (DEBT_G[g]) { fxDebt += it.amt || 0; fxDebtN++; }
    else { fxSpend += it.amt || 0; fxSpendN++; }
  });
  var fxCap = fxSave + fxDebt, fxCapN = fxSaveN + fxDebtN;

  /* ⚠️⚠️ 1.34.0 · 실제로 났던 어긋남 — 위 한 줄은 서버가 준 `fixedLeft.amt`(**처리된
     것까지 포함**)를 쓰고, 갈래 넷은 `done`·`skip` 을 빼고 셌습니다. 고정 지출을
     하나 등록하면 그때부터 **한 줄과 갈래 합이 달라집니다**(스텁에서 17,000 차이로
     드러남). 이미 등록했거나 이 달은 빼기로 한 건 **앞으로 안 나갑니다** — 한 줄도
     빼는 게 맞습니다.
     ⚠️ 항목이 안 오는 옛 서버에서는 서버 값을 그대로 씁니다. 모르는 걸 0 으로
     덮으면 「앞으로 나갈 돈 없음」이 되어 더 나쁩니다. */
  if ((fx.items || []).length) {
    fixed = fxSpend + fxCap;
    tot = card + fixed;
    dueN = cardN + fxSpendN + fxCapN;
  }

  /* 제일 가까운 결제일의 청구월이 아직 안 끝났으면 금액이 더 오른다.
     합에는 그대로 넣되(과소평가가 더 나쁘다) 「쌓이는 중」이라고 적는다. */
  var open = false;
  open2.forEach(function (x) { if (x.pay === payDay && x.open) open = true; });

  /* ⚠️ 1.34.0 · 디자인 7a — 날짜가 지났는데 아직 안 나간 고정 지출이 있으면
     **그것만** 부제에 적고 빨강으로 칠한다. 건수만 적으면 「7건」과 「7건 중 2건은
     이미 밀렸다」가 같은 글자가 된다 — 급한 쪽이 안 보인다. */
  var lateN = 0;
  (fx.items || []).forEach(function (it) { if (!it.done && !it.skip && it.late) lateN++; });

  return { amt: tot, card: card, fixed: fixed, pay: payDay, n: dueN,
           sub: lateN ? '밀린 고정 지출 ' + lateN + '건' : (dueN ? dueN + '건' : ''),
           late: !!lateN,
           cardOpen: open, paidN: cs.length - open2.length,
           fxSpend: fxSpend, fxSpendN: fxSpendN, fxCap: fxCap, fxCapN: fxCapN,
           fxSave: fxSave, fxSaveN: fxSaveN, fxDebt: fxDebt, fxDebtN: fxDebtN };
}

/* 히어로에는 서술형 문장을 두지 않는다.
   "쓰고 남은 비율 -1591104%" 같은 게 나오던 자리다. 숫자는 칸에,
   판정은 배지에 넣으면 줄바꿈이 생길 수 없다. */
/* 펼침 상태는 로컬에 저장한다. 안 그러면 수신함 하나만 확인해도 홈이 다시
   그려지면서 접힌다 — 보던 사람에겐 화면이 제멋대로 닫히는 걸로 보인다. */
/* ⚠️ 1.32.0 — 「자세히」 접기가 없어졌습니다. 근거 줄이 어두운 면 안에 10.5px 로
   들어가면서 접을 만큼 길지 않습니다. 남아 있던 `pnlOpen` 키는 이제 아무도
   안 읽습니다 — 로컬에 남아 있어도 화면을 안 바꿉니다. */

function cardPnl(M) {
  var p = M.pnl, up = p.net >= 0;
  var inc = p.income || 0, spd = p.spend || 0;

  /* 배수는 수입이 의미 있는 크기일 때만 쓴다. 공동 계좌만 보면 수입이
     통장 이자 47원뿐이라 "지출 15912배" 가 떴다. */
  var badge = '';
  if (inc <= 0) {
    badge = spd > 0 ? '수입 없음' : '';
  } else if (spd > inc) {
    var x = spd / inc;
    badge = x >= 100 ? '수입 거의 없음'
      : '지출 ' + (x >= 10 ? Math.round(x) : (Math.round(x * 10) / 10)) + '배';
  } else if (spd > 0) {
    badge = '수입의 ' + Math.round(spd / inc * 100) + '%';
  }

  /* ═══ 1.32.0 · Slate 히어로 ═══
     두 숫자를 **어두운 면 안**에 넣는다. 헤더와 한 덩어리가 되어 화면 꼭대기에
     붙고, 그 아래부터 흰 면이 시작한다 (디자인 리뉴얼 6a).

     ⚠️ 근거 줄이 **늘 보인다.** 「자세히」 접기가 없어졌다 — 어두운 면 안에
     10.5px 로 압축해 넣으니 접을 만큼 길지 않다.
     ⚠️ 마이너스는 빨강 + `−`. 다만 **이체 · 저축은 중립색**이다 (폴 2026-08-09)
     — 내 돈이 자리를 옮긴 것까지 빨강이면 저축이 손해로 읽힌다.
     ⚠️ 큰 숫자는 Archivo, 줄 숫자는 Space Grotesk. 둘 다 우측 정렬. */
  var f = cashFlow(ST.tx);
  var chk = f ? f.b.spend : 0;
  var cred = Math.max(0, spd - chk);
  var move = f ? (f.b.send + f.b.save + f.b.debt) : 0;

  /* 한 줄. sign: '' 중립 · '-' 빨강 마이너스. g 를 주면 눌러서 내역으로. */
  function hrow(label, amt, sign, g, mask, sub) {
    var n = '<em class="' + (sign === '-' ? 'mn' : '') + (mask ? mkCls('m', 'home') : '') +
      '">' + (sign === '-' ? '\u2212' : '') + C(amt) + '</em>';
    var t = '<span>' + esc(label) + '</span>' + n;
    var cls = sub ? ' class="hs"' : '';
    return g ? '<button' + cls + ' data-g="' + esc(g) + '">' + t + '</button>'
             : '<div' + cls + '>' + t + '</div>';
  }

  var c = el('div', 'hero2');
  c.innerHTML =
    '<div class="hcol">' +
      /* ⚠️ 라벨 → 숫자 → **캡션** 순이다 (디자인 6a). 1.31.0 에 캡션을 라벨 줄로
         올렸던 건 옛 배치에서 숫자가 잘렸기 때문인데, 여기선 숫자가 우측 정렬이라
         그럴 이유가 없다. 캡션은 숫자 **아래** 우측 정렬. */
      '<div class="hk">손익</div>' +
      '<b class="hv' + (up ? '' : ' dn') + mkCls('h', 'home') + '">' + SG(p.net) + '</b>' +
      /* ⚠️ 캡션이 없어도 **자리는 남긴다.** 한쪽에만 캡션이 있으면 두 칸의 줄이
         세로로 어긋나서 「수입 ↔ 들어온 돈」을 나란히 못 읽는다. */
      '<span class="hcap">' + (badge ? esc(badge) : '\u00a0') + '</span>' +
      '<div class="hrows">' +
        hrow('수입', inc, '', '수입', 1) +
        hrow('지출', spd, '') +
        (f ? '<div class="hin">' + hrow('체크', chk, '', '', 0, 1) +
                                   hrow('신용', cred, '', '', 0, 1) + '</div>' : '') +
      '</div>' +
    '</div>' +
    '<i class="hsep"></i>' +
    (f
      ? '<div class="hcol">' +
          '<div class="hk">현금 흐름</div>' +
          '<b class="hv' + (f.net >= 0 ? '' : ' dn') + mkCls('h', 'home') + '">' +
            SG(f.net) + '</b>' +
          /* 통장 기준 전월 대비가 없어서 여기 적을 말이 없다. 자리만 남긴다. */
          '<span class="hcap">\u00a0</span>' +
          '<div class="hrows">' +
            hrow('들어온 돈', f.inc, '', '수입|차입|투자회수', 1) +
            (chk ? hrow('체크카드', chk, '-') : '') +
            (f.b.card ? hrow('지난달 카드값', f.b.card, '-', '이체') : '') +
            /* ⚠️ 이체·저축만 중립. 부호도 안 붙인다 — 손해가 아니다. */
            (move ? hrow('이체 · 저축', move, '', '이체|저축/투자|부채상환') : '') +
          '</div>' +
        '</div>'
      /* 내역이 아직 안 왔다. 자리를 미리 잡아 둔다 — 오는 순간 생기면 아래가 밀린다. */
      : '<div class="hcol"><div class="hk">현금 흐름</div>' +
          '<b class="hv"><i class="skel b"></i></b>' +
          '<span class="hcap">\u00a0</span>' +
          '<div class="hrows"><div><span>&nbsp;</span><em>&nbsp;</em></div></div></div>');
  return c;
}

/* 「앞으로 나갈 돈」 — 히어로 바로 아래 흰 면의 한 줄. 누르면 전용 화면으로. */
function rowDue() {
  var due = nextDue();
  var h = dueRowHtml(due);
  if (!h) return null;
  var d = el('div', 'duerow');
  d.innerHTML = h;
  return d;
}

/* ═══════════ 앞으로 나갈 돈 — 홈 인라인 패널 (1.27.0 · 디자인 PART 2 / 10c) ═══════════
   별도 화면이 아니라 **홈에서 그 자리에 펼쳐지는 한 덩어리**입니다. 요약·카드값·
   고정 지출 전체가 하나의 collapse 단위라, 머리를 누르면 통째로 접혀 한 줄로 돌아갑니다.

   ⚠️ 1.25.0 에 세 갈래를 내역 탭으로 옮겼던 걸 되돌립니다. 그때 판단(「궁금할 때
   보는 것」)은 **한 줄로 접히지 않던 상태**에서는 맞았습니다. 접히면 홈에 있어도
   평소엔 한 줄이고, 볼 때 탭을 옮길 필요가 없습니다. */
/* ⚠️ 1.34.0 — 접이식 패널이 전용 화면(6c)이 되면서 `DUE_K`/`dueOpenGet` 이
   없어졌습니다. 접을 게 없습니다. */
var dueDoneOpen = false;                            /* 「처리됨」은 세션 동안만 */

/* 지난 달을 보고 있나. 앞으로 나갈 돈은 **이번 달에만** 뜻이 있다. */
function isPastMonth() {
  var now = new Date();
  var cur = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
  return !!(ST.ym && ST.ym < cur);
}

/* ⚠️⚠️ 1.34.0 — 내역 탭의 접이식 패널을 통째로 걷었습니다. 지운 것:
   `cardDueAll` · `dueBarHtml`(3분할 막대) · `dueCardSecHtml` · `dueFixSecHtml` ·
   홈의 `dueDtlHtml`. 전용 화면(6c)이 같은 일을 합니다.
   남겨두면 **같은 목록이 두 곳에** 있게 되고, 한쪽만 고치는 사고가 납니다 —
   이미 한 번 겪은 자리입니다(1.32.0 의 17,000 어긋남).
   패널이 지키던 규칙은 새 화면으로 옮겼습니다:
     · 3분할 → `dueSegHtml` (갈래 넷, 합이 위 한 줄과 같다)
     · 처리됨 · 되돌리기 → `dueHandledHtml`
     · 날짜 그룹 머리 · 일괄 등록 없음 · 출금계좌 미지정 한 마디 → `dueDays`/`renderDue`
     · 청구 0원 카드 한 줄 → `renderDue` 의 `.dzero` */
function dueRowHtml(due) {
  var loading = !ST.rep;
  /* 지난 달엔 「앞으로」가 없다. 블록 전체를 숨긴다. */
  if (isPastMonth()) return '';
  if (!due && !loading) return '';
  var ic = '<span class="ic"><svg viewBox="0 0 20 20" fill="none">' +
    '<rect x="3" y="5" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M3 8.5h14" stroke="currentColor" stroke-width="1.8"/></svg></span>';
  if (loading) {
    /* 한 줄짜리라 리포트가 와도 높이가 그대로다 — 아래가 안 밀린다. */
    return '<div class="hdue ld">' + ic +
      '<span class="l"><b>앞으로 나갈 돈</b><em>불러오는 중</em></span>' +
      '<span class="a"><i class="skel"></i></span>' +
    '</div>';
  }
  /* ⚠️ 홈은 **금액 한 줄까지**다 (폴 2026-08-09: 「홈이 너무 복잡해.
     금액만 보여줘. 나머지는 내역으로 가서 펼쳐지도록.」).
     1.28.1 에는 막대·범례까지 남겨 뒀는데, 세 줄을 더 먹으면서 홈이 다시
     길어졌다. 갈래별 금액은 **누르면 내역에서 다 보인다.** */
  return '<button class="hdue go" id="hdue">' + ic +
    '<span class="l"><b>앞으로 나갈 돈</b><em' + (due.late ? ' class="late"' : '') + '>' +
      esc(due.sub) + '</em></span>' +
    /* ⚠️ 단위를 안 적는다 (폴 2026-08-09). 이 카드의 다른 숫자는 다 안 적는데
       여기만 「원」이 붙어 있어서, 이 숫자만 다른 종류처럼 보였다. */
    '<span class="a num">' + C(due.amt) + '</span>' +
    '<span class="cv">›</span>' +
  '</button>';
}

/* ═══════════ 앞으로 나갈 돈 — 전용 화면 (1.34.0 · 디자인 6c) ═══════════
   폴 2026-08-09 결정: **「통장 잔액 / 월말에 남는 돈」 블록은 뺀다.** 시작 잔액이
   어디에도 없어서 낼 수 없는 숫자다 — 계좌 시트에 잔액 칸이 아예 없다.
   ⚠️ 등록·무시 버튼은 **여기** 있다. 디자인엔 없지만 장부에 넣는 유일한 입구라
   없애면 고정 지출을 손으로 넣을 길이 사라진다.
   ⚠️ 갈래 합 검산(네 줄의 합 = 위 한 줄)이 1.32.0 에서 홈과 함께 빠졌다.
   이 화면의 시험(`duescrtest`)이 되살린다. */
function openDue() { ST.due = true; navOpen(closeDue); render(); toTop(); }
function closeDue() { ST.due = false; render(); }

/* 날짜별로 묶는다. 카드값은 결제일에, 고정 지출은 그 날에. */
function dueDays() {
  var R = ST.rep || {}, out = {}, today = new Date();
  var cs = ((R.cardDue || {}).cards || []).filter(function (x) { return !x.paid && x.amt > 0; });
  cs.forEach(function (x) {
    if (!x.pay) return;
    (out[x.pay] = out[x.pay] || []).push(
      /* ⚠️ 출금계좌가 없으면 **부제에 한 마디**로 끝낸다. 경고 배너를 따로 붙이지
         않는다(1.27.0 패널의 규칙 · 화면이 바뀌어도 규칙은 같다). 예전 패널은
         「출금계좌 지정」 버튼을 뒀는데 **누를 곳이 없었다** — 앱에 그 설정 화면이
         없고 계좌 시트에서 온다. 죽은 버튼을 옮겨 심지 않는다. */
      { k: 'card', nm: x.name + ' 카드값', cat: '카드',
        sub: (x.ym ? Number(x.ym.slice(5, 7)) + '월 사용분' : '') +
        (x.from ? ' · ' + x.from : ' · 출금계좌 미지정'), amt: x.amt });
  });
  var fx = R.fixedLeft || {};
  (fx.items || []).forEach(function (it) {
    if (it.done || it.skip) return;
    var d = ymOf(ST.ym) + '-' + String(it.day).padStart(2, '0');
    (out[d] = out[d] || []).push(
      /* ⚠️ 부제를 「고정 지출」로 못박지 않는다 — 저축·빚 갚기도 여기 섞여 있다.
         카테고리를 그대로 적으면 그 줄이 어느 갈래인지 위 네 줄과 이어진다. */
      { k: 'fx', nm: it.name, cat: it.cat,
        sub: (it.cat || '고정 지출') + (it.pay ? ' · ' + it.pay : ' · 결제수단 미지정'),
        amt: it.amt, late: it.late, fx: it.name });
  });
  return Object.keys(out).sort().map(function (d) {
    var t = 0; out[d].forEach(function (x) { t += x.amt || 0; });
    return { d: d, rows: out[d], sum: t };
  });
}
function ymOf(ym) { return ym || todayYmd().slice(0, 7); }

/* 등록·무시·되돌리기는 **한 함수**로 받는다. 두 곳에서 따로 부르면
   한쪽만 고치는 사고가 난다. */
function bindDueActs(root) {
  root.onclick = function (e) {
    var b = e.target.closest('button[data-fx],button[data-fxoff],button[data-fxon]');
    if (!b) return;
    if (b.dataset.fx) return fixedAdd(b.dataset.fx);
    if (b.dataset.fxoff) return fixedSkip(b.dataset.fxoff, true);
    /* ⚠️ 되돌리기. 이 한 줄이 없으면 잘못 누른 ✕ 를 되살릴 길이 없다. */
    if (b.dataset.fxon) return fixedSkip(b.dataset.fxon, false);
  };
}

/* 갈래 넷 — 어두운 면의 큰 숫자 바로 아래. 디자인의 「통장 잔액 / 월말에 남는
   돈」 자리다. 그 두 줄은 못 낸다(시작 잔액이 없다 · 폴 2026-08-09 결정).
   ⚠️ 대신 **합이 위 한 줄과 같은** 네 줄을 넣는다. 어긋나면 눈으로 보인다 —
   1.32.0~1.33.0 사이 17,000 이 어긋난 채 지나간 게 이 검산이 화면에서
   사라져서였다. 0 인 갈래는 줄을 안 그린다(합은 그대로다).
   ⚠️ 저축과 빚 갚기를 **가른다** (폴 2026-08-09: 「서로 다른 성격이므로 분리」). */
function dueSegHtml(due) {
  if (!due) return '';
  var seg = [['카드값', due.card], ['고정 지출', due.fxSpend],
             ['저축', due.fxSave], ['빚 갚기', due.fxDebt]]
    .filter(function (x) { return x[1] > 0; });
  if (seg.length < 2) return '';
  return '<div class="dseg">' + seg.map(function (x) {
    return '<div><span>' + esc(x[0]) + '</span>' +
      '<em class="' + mkCls('m', 'tx') + '">' + C(x[1]) + '</em></div>';
  }).join('') + '</div>';
}

/* 처리됨 접이식 꼬리. 디자인엔 없다. 그래도 남기는 이유가 둘이다:
   ① ✕(이 달은 빼기)를 **되돌리는 유일한 입구**다.
   ② 이미 나간 카드값이 **어디로 갔는지** 여기서 답한다.
   ⚠️ ②가 없으면 폴이 겪은 것의 뒤집힌 짝이 난다. 처음엔 「아내 카드값은 이미
   나갔는데 앞으로 나갈 금액으로 표시돼 있어」였고, 목록에서 그냥 지우면 이번엔
   「분명 있었는데 왜 없어졌지」가 된다. 위 목록에선 빼되 여기에 남긴다. */
function dueHandledHtml() {
  var items = ((ST.rep || {}).fixedLeft || {}).items || [];
  var hd = items.filter(function (x) { return x.done || x.skip; })
    .map(function (x) {
      return { nm: x.name, amt: x.amt, skip: x.skip, fx: x.name,
               tag: x.skip ? '' : '반영됨' };
    });
  /* 이미 나간 카드값. 되돌릴 게 아니라 **알려줄** 것이다 — 버튼을 안 붙인다. */
  var paid = (((ST.rep || {}).cardDue || {}).cards || [])
    .filter(function (x) { return x.paid; });
  paid.forEach(function (x) {
    hd.push({ nm: x.name + ' 카드값', amt: x.paidAmt || x.amt, tag: '나갔어요' });
  });
  if (!hd.length) return '';
  var doneN = 0, skipN = 0;
  hd.forEach(function (x) { if (x.skip) skipN++; else doneN++; });
  return '<button class="dhand2" id="dhand">처리됨' +
      '<em>끝난 ' + doneN + ' · 무시 ' + skipN + '</em>' +
      '<span class="cv">' + (dueDoneOpen ? '⌃' : '⌄') + '</span></button>' +
    (dueDoneOpen
      ? hd.map(function (x) {
          return '<div class="dhrow' + (x.skip ? ' skip' : '') + '">' +
            '<span class="nm">' + esc(x.nm) + '</span>' +
            '<span class="amt' + mkCls('m', 'tx') + '">' + C(x.amt) + '</span>' +
            (x.skip
              ? '<button class="undo" data-fxon="' + esc(x.fx) + '">되돌리기</button>'
              : '<span class="ok">' + esc(x.tag) + '</span>') +
          '</div>';
        }).join('')
      : '');
}

function renderDue() {
  var s = $('#screen');
  var due = nextDue();
  var days = dueDays();
  var big = days.reduce(function (a, o) { return a + o.sum; }, 0);
  var mx = days.reduce(function (a, o) { return Math.max(a, o.sum); }, 0);
  var t0 = new Date(); t0.setHours(0, 0, 0, 0);
  var zero = (((ST.rep || {}).cardDue || {}).cards || [])
    .filter(function (x) { return !x.paid && !(x.amt > 0); })
    .map(function (x) { return x.name; });

  s.innerHTML =
    '<div class="dscr">' +
      '<div class="dhero">' +
        '<div class="dtop"><button class="bk" id="dback">‹</button>' +
          '<b>앞으로 나갈 돈</b><span class="mchip">' +
          (ST.ym ? Number(ST.ym.slice(5, 7)) + '월' : '') + '</span></div>' +
        '<div class="dnum"><span>남은 예정 지출</span>' +
          '<b class="' + mkCls('h', 'tx') + '">' + C(big) + '</b></div>' +
        dueSegHtml(due) +
      '</div>' +
      (due && due.cardOpen
        ? '<div class="dwarn"><i>!</i><span>가장 가까운 카드값은 <b>아직 쌓이는 중</b>이에요. ' +
          '결제일까지 더 오를 수 있어요.</span></div>' : '') +
      days.map(function (o) {
        var dd = Math.round((new Date(o.d + 'T00:00:00') - t0) / 864e5);
        var big2 = o.sum === mx && days.length > 1;
        return '<div class="dday2"><b>' + Number(o.d.slice(5, 7)) + '월 ' +
            Number(o.d.slice(8, 10)) + '일</b>' +
          '<span class="dd' + (big2 ? ' hot' : '') + '">' +
            (big2 ? '가장 큰 날' : (dd >= 0 ? 'D-' + dd : '지남')) + '</span></div>' +
          o.rows.map(function (x) {
            /* ⚠️ 빈 색칠 사각형은 「아이콘이 안 뜬 것」으로 읽힌다 — 실제로 그렇게
               보였다. 내역 목록과 **같은 카테고리 배지**를 쓴다. 두 화면에서 같은
               항목이 같은 딱지를 달고 나오는 게 맞다. */
            var cm = catBadge(x.cat);
            return '<div class="drow2' + (x.late ? ' late' : '') + '">' +
              '<i class="ic" style="background:' + cm.bg + ';color:' + cm.fg + '">' +
                esc(cm.ab) + '</i>' +
              '<span class="l"><b>' + esc(x.nm) + '</b><em>' + esc(x.sub) + '</em></span>' +
              '<span class="a' + mkCls('m', 'tx') + '">\u2212' + C(x.amt) + '</span>' +
              (x.fx ? '<span class="b">' +
                 '<button class="reg" data-fx="' + esc(x.fx) + '">등록</button>' +
                 '<button class="ign" data-fxoff="' + esc(x.fx) + '" title="이 달은 빼기">✕</button>' +
               '</span>' : '') +
            '</div>';
          }).join('');
      }).join('') +
      (days.length ? '' : '<div class="dnone2">앞으로 나갈 돈이 없어요</div>') +
      /* 청구가 0원인 카드도 「왜 안 보이지」가 안 되게 한 줄 적는다. */
      (zero.length
        ? '<div class="dzero">' + esc(zero.join('·')) + '는 이번 달 결제 없음</div>' : '') +
      dueHandledHtml() +
      '<div class="dfn2">카드사마다 이용기간이 달라 실제 청구액과 다를 수 있어요.</div>' +
    '</div>';

  var bk = $('#dback');
  if (bk) bk.onclick = function () { history.back(); };
  var dh = $('#dhand');
  if (dh) dh.onclick = function () { dueDoneOpen = !dueDoneOpen; renderDue(); };
  bindDueActs(s);
}

/* ⚠️ 1.34.0 — 내역 탭의 접이식 패널(`cardDueAll`)을 지웠습니다. 전용 화면(6c)이
   같은 일을 하고, 남겨두면 같은 목록이 두 곳에 있게 됩니다 — 한쪽만 고치는
   사고가 이미 한 번 났던 자리입니다. `dueOpenGet`/`DUE_K` 도 같이 걷었습니다. */


/* 페이스 차트.
   mode 'e' = 경과일만(1일~오늘), 'm' = 한 달(1일~말일).
   기본이 '한 달' 이었던 게 문제였다 — 5일치 선을 31일 폭에 그리면
   왼쪽 끝에 뭉쳐서 아무것도 안 보인다. 이제 경과일이 기본이다. */
function paceSvg(M, mode) {
  var pc = M.pace, dim = M.dim, day = M.day;
  var W = 340, top = 8, bot = 120, L = 4, R = 4, IW = W - L - R;
  var cur = pc.cur || [], prev = pc.prev || [], B = pc.budget || 0;
  var span = mode === 'e' ? Math.max(1, day) : dim;   /* 가로축이 덮는 일수 */
  var curV = [], prevV = [];
  for (var i = 0; i < span; i++) {
    curV.push({ x: span === 1 ? 1 : i / (span - 1), v: i < day ? cur[i] : null });
  }
  /* 지난달은 날짜 수가 달라서 같은 '진행률' 위치로 늘려 맞춘다.
     ⚠️ 늘릴 때 곱하는 건 **지난달 날수(pd)** 다. 이번 달 날수(dim)를 곱하면
     31일 달에서 30일 달을 볼 때 끝이 잘리고 중간이 미묘하게 밀린다. */
  var pd = prev.length || 1;
  for (var k = 0; k < span; k++) {
    var f = span === 1 ? 1 : k / (span - 1);
    var pi = Math.max(1, Math.min(pd, Math.round(mode === 'e' ? (k + 1) : f * pd)));
    prevV.push({ x: f, v: prev[pi - 1] });
  }
  /* 「한 달」 모드에서 지난달은 **말일까지 전부** 그린다. 그런데 이번 달 선은
     오늘에서 끊긴다. 그대로 두면 7일치 빨간 토막 옆에 31일치 회색 선이 서서
     「이번 달은 엄청 적게 썼다」로 읽힌다 — 폴이 「그래프 왜이래」 라고 한 게 이것.
     그래서 **오늘까지와 그 뒤를 나눠 그린다.** 진한 데까지가 같은 기간이다.
     (경과일 모드는 애초에 같은 기간만 그리므로 나눌 게 없다.) */
  var cutI = mode === 'e' ? prevV.length : Math.max(1, Math.min(span, Math.round((day - 1) / Math.max(1, dim - 1) * (span - 1)) + 1));
  /* 예산선은 한 달을 꽉 채웠을 때가 100%. 경과일 모드면 그 구간만 그린다 */
  var paceEnd = B * (mode === 'e' ? span / dim : 1);
  var mx = paceEnd;
  curV.concat(prevV).forEach(function (o) { if (o.v != null && o.v > mx) mx = o.v; });
  if (!mx) mx = 1;
  var X = function (f) { return L + f * IW; };
  var Y = function (v) { return bot - (v / mx) * (bot - top); };
  var pts = function (arr) {
    return arr.filter(function (o) { return o.v != null; })
              .map(function (o) { return X(o.x).toFixed(1) + ',' + Y(o.v).toFixed(1); }).join(' ');
  };
  var curPts = pts(curV);
  var prevPts = pts(prevV.slice(0, cutI));                 /* 같은 기간 — 진하게 */
  var prevRest = pts(prevV.slice(Math.max(0, cutI - 1)));  /* 그 뒤 — 옅게. 한 점 겹쳐 이어붙인다 */
  var prevMark = prevV[cutI - 1];                          /* 같은 기간이 끝나는 자리 */
  var lastC = curV.filter(function (o) { return o.v != null; }).pop();
  var area = '';
  if (curPts && lastC) {
    area = '<polygon points="' + X(curV[0].x).toFixed(1) + ',' + bot + ' ' + curPts + ' ' +
           X(lastC.x).toFixed(1) + ',' + bot + '" fill="oklch(.86 .06 25/.28)"></polygon>';
  }
  return '<svg viewBox="0 0 ' + W + ' 128" width="100%" height="128" preserveAspectRatio="none">' +
    '<line x1="0" y1="' + top + '" x2="' + W + '" y2="' + top + '" stroke="var(--grid)" stroke-width="1"/>' +
    '<line x1="0" y1="68" x2="' + W + '" y2="68" stroke="var(--grid)" stroke-width="1"/>' +
    '<line x1="0" y1="' + bot + '" x2="' + W + '" y2="' + bot + '" stroke="var(--grid2)" stroke-width="1"/>' +
    (B ? '<line x1="' + L + '" y1="' + bot + '" x2="' + (W - R) + '" y2="' + Y(paceEnd).toFixed(1) +
         '" stroke="var(--pace)" stroke-width="2.5" stroke-dasharray="6 5"/>' : '') +
    (mode !== 'e' && prevRest
      ? '<polyline points="' + prevRest + '" fill="none" stroke="var(--prev-line)" ' +
        'stroke-width="2" stroke-linejoin="round" opacity=".3"/>' : '') +
    (prevPts ? '<polyline points="' + prevPts + '" fill="none" stroke="var(--prev-line)" stroke-width="2" stroke-linejoin="round"/>' : '') +
    /* 같은 기간이 어디서 끝나는지 점으로 못 박는다. 빨간 점과 세로로 나란히 서서
       「지난달 대비」 숫자가 어느 두 점의 차이인지 눈으로 보인다. */
    (mode !== 'e' && prevMark && prevMark.v != null
      ? '<circle cx="' + X(prevMark.x).toFixed(1) + '" cy="' + Y(prevMark.v).toFixed(1) +
        '" r="3.5" fill="var(--prev-line)" stroke="#fff" stroke-width="2"/>' : '') +
    area +
    (curPts ? '<polyline points="' + curPts + '" fill="none" stroke="var(--coral-line)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' : '') +
    (lastC ? '<circle cx="' + X(lastC.x).toFixed(1) + '" cy="' + Y(lastC.v).toFixed(1) +
             '" r="4.5" fill="var(--coral-line)" stroke="#fff" stroke-width="2"/>' : '') +
    '</svg>';
}

/* 경과일 모드의 x축 눈금. 날이 적으면 전부 적고, 많아지면 솎는다. */
function paceAxis(M, mode) {
  var dim = M.dim, day = Math.max(1, M.day);
  if (mode !== 'e') return ['1일', '8일', '16일', '24일', dim + '일'];
  if (day <= 7) {
    var a = [];
    for (var i = 1; i <= day; i++) a.push(i + '일');
    return a;
  }
  var step = Math.ceil(day / 5), out = [];
  for (var d = 1; d <= day; d += step) out.push(d + '일');
  if (out[out.length - 1] !== day + '일') out.push(day + '일');
  return out;
}

function cardPace(M) {
  var pc = M.pace, dim = M.dim, day = Math.max(1, M.day);
  var mode = ST.paceMode === 'm' ? 'm' : 'e';
  var gapGood = pc.gap <= 0, pvGood = pc.prevGap <= 0;
  var perDay = pc.budget ? Math.round(pc.budget / dim) : 0;
  /* 예산 − 오늘까지 쓴 돈. 서버가 주는 값이 아니라 **화면에 이미 그린 곡선의
     마지막 점**에서 낸다 — 그래야 그래프와 숫자가 어긋날 수가 없다. */
  var budLeft = (pc.budget || 0) - ((pc.cur || [])[day - 1] || 0);
  /* 월초 며칠은 큰 결제 한 건에 크게 흔들린다 — 그걸 문단으로 설명하던
     칸이 있었는데(폴, 2026-08-05) 뺐다. 며칠치인지는 바로 위 「N일치」
     뱃지가 이미 말하고 있어서, 같은 말을 두 번 하고 있었다. */
  var c = el('div', 'card chart');
  c.innerHTML =
    /* ⚠️ 제목은 「페이스」 한 낱말이다 (디자인 6a). 「누적 소비 vs 예산 페이스」는
       제목이 아니라 설명이었다 — 카드가 하는 일은 옆의 목표 금액이 말한다. */
    '<div class="ct"><h3>페이스</h3>' +
      '<div class="tog" id="ptog">' +
        '<button data-m="e" class="' + (mode === 'e' ? 'on' : '') + '">경과일</button>' +
        '<button data-m="m" class="' + (mode === 'm' ? 'on' : '') + '">한 달</button>' +
      '</div></div>' +
    /* ⚠️ 목표 수정 입구를 걷어냈습니다 (폴 2026-08-09: 「목표 수정 버튼은
       지워도 돼」). 연필·「바꿈」 배지가 이 줄을 버튼처럼 보이게 만들었는데,
       여기서 봐야 하는 건 **지금 얼마 쓰고 있나**지 목표를 고치는 게 아닙니다.
       고치는 길은 설정 › 월별 목표 금액에 그대로 있습니다. */
    '<div class="psub"><span class="bud">' +
      (pc.budget ? '목표 ' + C(pc.budget) + (M.who ? ' (가구 전체)' : '') +
                   ' · 하루 ' + C(perDay) : '예산 미설정') +
      '</span><em>' + day + '일치</em></div>' +
    '<div style="margin-top:12px">' + paceSvg(M, mode) + '</div>' +
    '<div class="xax">' + paceAxis(M, mode).map(function (t) {
      return '<span>' + t + '</span>'; }).join('') + '</div>' +
    /* ⚠️ 범례가 거짓말을 하고 있었다. 「한 달」 모드의 회색선은 **지난달 전체**인데
       언제나 「지난달 같은 기간」이라고 적혀 있었다. 7일치와 31일치를 나란히 놓고
       같은 기간이라고 부른 것이다. 모드에 따라 문구를 바꾼다. */
    '<div class="lgd">' +
      '<span><i style="background:var(--coral-line)"></i>이번 달</span>' +
      '<span><i style="background:var(--prev-line)"></i>' +
        (mode === 'e' ? '지난달 같은 기간' : '지난달 (진한 데까지가 같은 기간)') + '</span>' +
      '<span><i style="background:var(--pace)"></i>페이스</span></div>' +
    '<div class="kpi">' +
      '<div class="' + (gapGood ? 'good' : 'bad') + '"><div class="k">페이스 대비</div>' +
        '<div class="n">' + SG(pc.gap) + '</div></div>' +
      '<div class="' + (pvGood ? 'good' : 'bad') + '"><div class="k">지난달 대비</div>' +
        '<div class="n">' + SG(pc.prevGap) + '</div></div>' +
      /* ⚠️ 「이번 주 남음」을 걷어냅니다 (폴 2026-08-09). 서버의 `weekAllow` 는
         **남은 예산 ÷ 남은 날 × 7** 이라 오늘이 며칠이냐에 따라 크게 흔들렸고,
         「이번 주」가 달력의 주가 아니라 오늘부터 7일이라 이름이 거짓말이었습니다.
         대신 **이번 달 남은 예산**을 그대로 적습니다 — 계산이 없어 안 흔들립니다.
         ⚠️ 예산을 넘겼으면 **음수를 그대로 보여줍니다.** 0 으로 막으면
         「딱 맞췄다」로 읽힙니다. */
      (pc.budget
        ? '<div class="' + (budLeft >= 0 ? 'good' : 'bad') + '">' +
            '<div class="k">이번 달 남은 예산</div>' +
            /* ⚠️ 남은 돈에 「+」를 붙이면 늘어난 것처럼 읽힌다. 모자랄 때만
               부호를 적는다 — 그때는 부호가 진짜 정보다. */
            '<div class="n">' + (budLeft < 0 ? SG(budLeft) : C(budLeft)) + '</div></div>'
        : '<div><div class="k">이번 달 남은 예산</div>' +
            '<div class="n">예산 미설정</div></div>') +
    '</div>';
  return c;
}

/* ═══════════ 월별 목표 금액 ═══════════
   폴 2026-08-07: 「이직하면서 월 소득이 감소했는데 목표 금액은 높았을 때
   기준이어서, 이달의 목표액을 변경할 수 있도록 하면 좋을 것 같아.」
   폴 2026-08-07 (1.17.0): 「카테고리별 목표 금액을 지난달 기준으로 잡아줘.
   그리고 월별 목표 금액 작성 화면도 따로 있어야 할 것 같아. 디폴트는 지난달
   목표 금액으로 두고 직접 수정할 수 있도록.」

   총액 칸은 **몰이꾼**입니다. 총액을 바꾸면 카테고리가 비율대로 따라 움직이고,
   카테고리를 직접 고치면 총액은 그냥 그 합이 됩니다. 총액을 따로 저장하지
   않으므로 「총액과 카테고리 합이 다르다」는 상태가 **아예 생기지 않습니다.**
   바꾼 값은 서버의 「예산변경」 시트에 이 달과 함께 쌓입니다 — 다음 달에도
   그대로 이어지고, 지난 달을 열면 그때 기준으로 보입니다. */
function numIn(s) { return Math.max(0, Number(String(s || '').replace(/[^\d]/g, '')) || 0); }

/* 합계를 want 로 맞추되 비율은 지킨다. 만원 단위로 떨어뜨리고,
   ⚠️ 나눗셈 나머지는 **제일 큰 칸**에 몰아준다. 715만을 넣었는데 합이
   7,149,000 으로 나오면 그 순간부터 이 화면을 못 믿게 된다. */
function scaleBudget(items, want) {
  var sum = 0, big = 0;
  items.forEach(function (o, i) { sum += o.a; if (o.a > items[big].a) big = i; });
  if (!sum || !(want > 0)) return items.map(function (o) { return { c: o.c, a: 0 }; });
  var r = want / sum;
  var out = items.map(function (o) {
    return { c: o.c, a: Math.max(0, Math.round(o.a * r / 10000) * 10000) };
  });
  var got = 0;
  out.forEach(function (o) { got += o.a; });
  out[big].a = Math.max(0, out[big].a + (want - got));
  return out;
}

/* 목표액의 재료. month 응답이 원본이고, 서버가 아직 옛 판이면 boot 으로 연다
   (그때는 「원래 얼마였는지」를 알 수 없어 지금 값이 곧 원래 값이다). */
function budSource() {
  var M = ST.month || {}, BG = M.budget;
  if (BG && BG.order && BG.order.length) {
    return { ym: M.ym || ST.ym, order: BG.order.slice(),
             eff: BG.eff || {}, base: BG.base || {}, live: true };
  }
  var b = ((ST.boot || {}).budget) || {};
  var by = b.byCat || {};
  return { ym: M.ym || ST.ym, order: (b.order || Object.keys(by)).slice(),
           eff: by, base: b.base || by, live: false };
}

/* ⭐ 디폴트는 서버가 이미 「지난달 목표」로 줍니다 — 예산변경 시트를 누적해서
   덮기 때문에, 7월에 바꾼 값이 8월에도 그대로 옵니다. 화면이 새로 하는 일은 셋:
     ① 이번 달 / 다음 달을 골라서 짠다 (지난 달은 없다 — 이미 본 숫자가 달라진다)
     ② 지난달에 **실제로 쓴 돈**을 칸마다 회색으로 보여준다
     ③ 그 실적을 한 번에, 또는 칸 하나씩 목표로 가져온다

   ⚠️ 「지난달」이라고만 적지 않고 **어느 달인지 이름을 박습니다.** 다음 달을
   짤 때 실적은 「직전 달」이 아니라 마지막으로 끝난 달이기 때문입니다.
   범례가 거짓말하던 페이스 차트를 두 번 만들지 않습니다. */
/* ───────── 목표 금액 미리 받기 ─────────
   폴 2026-08-09: 「목표 금액 불러오는 것도 느린데 앱 로딩할 때 미리 불러오도록.」
   예전엔 화면을 열 때마다 `budgetPlan` 을 기다렸고, 그 사이 「불러오는 중…」만
   떴습니다. 앱이 뜰 때 뒤에서 받아 두고, 화면은 **캐시로 즉시** 연 뒤
   최신을 다시 받아 덮습니다.

   ⚠️ 캐시로 열어 놓고 뒤늦게 온 응답으로 덮으면 **사람이 고치던 값이 날아갑니다.**
   고친 게 있으면(dirty) 안 덮습니다 — 「안 저장한 걸 조용히 버리지 않는다」.
   ⚠️ 목표를 저장하면 캐시를 버립니다. 안 그러면 다음에 옛 값으로 열립니다. */
var budCache = {};
var budPreBusy = false;
function budPrefetch() {
  if (budPreBusy || budCache['']) return;
  budPreBusy = true;
  api('budgetPlan', {}).then(function (r) {
    budCache[''] = r.data || {};
  }).catch(function () {
    /* 조용히 넘어간다 — 미리 받기가 실패해도 화면을 열면 그때 다시 받는다. */
  }).then(function () { budPreBusy = false; });
}
function budCacheClear() { budCache = {}; }

function showBudget(ym0) {
  var m = el('div', 'mask');
  var sh = el('div', 'nhs');
  m.appendChild(sh);
  document.body.appendChild(m);
  navOpen(function () { m.remove(); });

  var P = null, ym = '', items = [], start = [];
  var saving = false, busy = true, err = '';
  var shut = function () { if (!saving) { m.remove(); navClose(); } };

  function sum() { var t = 0; items.forEach(function (o) { t += o.a; }); return t; }
  function dirty() { return items.some(function (o, i) { return o.a !== start[i]; }); }
  function src() { return (P && P.srcSpend) || {}; }
  function base() { return (P && P.base) || {}; }
  function moLabel(y) { return y ? Number(y.slice(5, 7)) + '월' : ''; }

  function seat(p) {
    P = p; ym = p.ym || '';
    items = (p.order || []).map(function (c) {
      return { c: c, a: Math.round((p.eff || {})[c] || 0) };
    });
    start = items.map(function (o) { return o.a; });
  }

  function load(y) {
    var key = y || '';
    err = '';
    if (budCache[key]) { seat(budCache[key]); busy = false; }   /* 미리 받아 둔 것 */
    else busy = true;
    draw();
    return api('budgetPlan', y ? { ym: y } : {}).then(function (r) {
      budCache[key] = r.data || {};
      /* ⚠️ 고치던 게 있으면 안 덮는다. 캐시로 열어 둔 사이에 손을 댔을 수 있다. */
      if (!(P && dirty())) seat(r.data || {});
      busy = false; draw();
    }).catch(function (e) {
      if (P) { busy = false; return draw(); }   /* 캐시로 이미 열려 있으면 그대로 둔다 */
      /* 서버가 아직 옛 판이면 이번 달만이라도 엽니다. **읽기엔 대비책을 둘 수
         있습니다 — 쓰기와 달리.** (1.12.0 에서 배운 것) 이때는 달 전환도
         실적도 없으니 화면에서 아예 안 보여줍니다. 없는 걸 회색으로 그려두면
         눌러도 아무 일이 안 일어나는 버튼이 됩니다. */
      var S = budSource();
      if (S.order.length) {
        seat({ ym: S.ym, curYm: S.ym, nextYm: '', editable: true,
               order: S.order, eff: S.eff, base: S.base,
               srcYm: '', srcSpend: {}, srcTotal: 0 });
        busy = false; draw(); return;
      }
      busy = false;
      err = (e && e.message) || '목표를 못 받았어요';
      draw();
    });
  }

  function go(y) {
    if (!y || y === ym || busy) return;
    /* 안 저장한 걸 조용히 버리지 않습니다. */
    if (dirty()) return toast('먼저 저장하거나 「되돌리기」를 눌러주세요');
    load(y);
  }

  function draw() {
    if (busy) {
      sh.innerHTML = head() +
        '<div class="nhb bud"><div class="budwait"><i class="spin"></i>불러오는 중…</div></div>';
      return;
    }
    if (err) {
      sh.innerHTML = head() +
        '<div class="nhb bud"><div class="budwait">' + esc(err) + '</div>' +
        '<div class="budq"><button data-a="retry">다시 시도</button></div></div>';
      return;
    }
    var t = sum(), b0t = 0;
    P.order.forEach(function (c) { b0t += base()[c] || 0; });
    var d = t - b0t, st = P.srcTotal || 0;

    sh.innerHTML = head() +
      '<div class="nhb bud">' +
        (P.nextYm
          ? '<div class="budm">' + [[P.curYm, '이번 달'], [P.nextYm, '다음 달']].map(function (o) {
              return '<button data-ym="' + o[0] + '"' + (o[0] === ym ? ' class="on"' : '') + '>' +
                o[1] + '<em>' + esc(ymLabel(o[0])) + '</em></button>';
            }).join('') + '</div>'
          : '') +
        '<div class="budt"><label>총액</label>' +
          '<input id="budtot" inputmode="numeric" value="' + C(t) + '"><span>원</span></div>' +
        '<div class="budd">' + esc(ymLabel(ym)) + '부터 적용됩니다' +
          (b0t ? ' · 예산 시트 ' + C(b0t) + '원' : '') +
          (b0t && d
            ? ' <b class="' + (d < 0 ? 'dn' : 'up') + '">' + (d > 0 ? '+' : '−') +
              C(Math.abs(d)) +
              ' (' + (d > 0 ? '+' : '−') + Math.round(Math.abs(d) / b0t * 100) + '%)</b>'
            : '') +
        '</div>' +
        (st
          ? '<button class="budsrc" data-a="fill">' + esc(ymLabel(P.srcYm)) +
            ' 실적으로 채우기<em>' + C(st) + '원</em></button>'
          : '') +
        '<div class="budq">' +
          '<button data-s="10">10% 줄이기</button>' +
          '<button data-s="20">20% 줄이기</button>' +
          '<button data-a="base">예산 시트</button>' +
          '<button data-a="undo"' + (dirty() ? '' : ' disabled') + '>되돌리기</button>' +
        '</div>' +
        '<div class="budh">총액을 바꾸면 아래가 비율대로 따라 움직입니다. ' +
          '카테고리를 직접 고쳐도 되고, 그때 총액은 아래 합이 됩니다.' +
          (st ? '<br>회색 숫자는 ' + esc(ymLabel(P.srcYm)) +
                '에 실제로 쓴 돈입니다 — 눌러서 그 칸만 가져올 수 있습니다.' : '') +
        '</div>' +
        '<div class="budl">' + items.map(function (o, i) {
          var b0 = base()[o.c] || 0, sv = src()[o.c] || 0;
          return '<div class="budr">' +
            '<div class="c"><span class="n">' + esc(o.c) + '</span>' +
              (sv ? '<button class="pv" data-fill="' + i + '">' +
                    moLabel(P.srcYm) + ' ' + C(sv) + '</button>' : '') +
            '</div>' +
            (o.a !== b0 && b0 ? '<em>' + C(b0) + '</em>' : '') +
            '<input data-i="' + i + '" inputmode="numeric"' +
              (o.a !== b0 ? ' class="ch"' : '') + ' value="' + C(o.a) + '"></div>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="budf">' +
        '<button data-a="x">취소</button>' +
        '<button data-a="save" class="p"' + (dirty() && !saving ? '' : ' disabled') + '>' +
          (saving ? '저장 중…' : '저장') + '</button></div>';
  }
  function head() {
    return '<div class="nhh"><b>월별 목표 금액</b>' +
      '<button class="x" data-a="x">닫기</button></div>';
  }

  /* ⚠️ input 마다 다시 그리면 글자를 한 자 칠 때마다 포커스가 날아간다.
     change(칸을 떠날 때·엔터) 에서만 다시 그린다. */
  sh.addEventListener('change', function (e) {
    if (busy || err) return;
    var el2 = e.target;
    if (el2.id === 'budtot') {
      /* ⚠️ 0 이나 글자를 넣었다고 스무 칸을 전부 0 으로 만들면 안 된다.
         한 번 0 이 되면 비율이 사라져서 총액으로는 되돌릴 수도 없다.
         그냥 무시하고 다시 그린다 — 칸이 원래 값으로 돌아온다.
         정말 0 으로 두고 싶으면 그 줄을 직접 0 으로 고치면 된다. */
      var w = numIn(el2.value);
      if (w > 0) items = scaleBudget(items, w);
      return draw();
    }
    if (el2.dataset && el2.dataset.i != null) {
      items[Number(el2.dataset.i)].a = numIn(el2.value);
      return draw();
    }
  });
  m.onclick = function (e) {
    if (e.target === m) return shut();
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.dataset.a;
    if (a === 'x') return shut();
    if (a === 'retry') return load(ym || ym0);
    if (b.dataset.ym) return go(b.dataset.ym);
    if (busy || err || saving) return;

    if (b.dataset.fill != null) {
      var i = Number(b.dataset.fill);
      items[i].a = src()[items[i].c] || 0;
      return draw();
    }
    if (a === 'fill') {
      /* ⭐ 실적이 없는 칸은 **0 으로** 둡니다. 옛 목표를 남겨두면 버튼에 적힌
         금액과 총액이 안 맞아서, 「실적으로 채우기」가 고장 난 것처럼 보입니다.
         지난달에 안 쓴 카테고리의 목표가 0 인 건 틀린 말도 아닙니다 —
         필요하면 그 칸만 직접 고치면 됩니다. */
      items = items.map(function (o) { return { c: o.c, a: src()[o.c] || 0 }; });
      return draw();
    }
    if (a === 'undo') {
      items = start.map(function (v, i2) { return { c: items[i2].c, a: v }; });
      return draw();
    }
    if (a === 'base') {
      items = P.order.map(function (c) { return { c: c, a: Math.round(base()[c] || 0) }; });
      return draw();
    }
    if (b.dataset.s != null) {
      var p = Number(b.dataset.s);
      items = scaleBudget(items, Math.round(sum() * (100 - p) / 100 / 10000) * 10000);
      return draw();
    }
    if (a === 'save') {
      if (!dirty()) return;
      saving = true; draw();
      var sy = ym;
      api('budgetSet', { ym: sy, items: JSON.stringify(items) }).then(function () {
        saving = false;
        budCacheClear();
        m.remove(); navClose();
        toast(ymLabel(sy) + ' 목표액을 바꿨어요');
        /* 서버 캐시가 올라갔으니 보고 있던 달을 다시 받는다.
           ⚠️ 다음 달을 짠 거라면 이번 달 화면은 안 바뀌는 게 맞다. */
        return loadMonth(ST.ym);
      }).catch(function (e2) {
        saving = false; draw();
        toast('저장하지 못했어요 — ' + ((e2 && e2.message) || '다시 시도해주세요'));
      });
    }
  };
  load(ym0);
}

/* ───────── 날짜 셈 ─────────
   'YYYY-MM-DD' 를 new Date() 에 그대로 넣으면 UTC 자정으로 읽혀서
   기기 시간대에 따라 하루가 밀린다. 조각을 떼서 로컬 날짜로 만든다. */
function ymdDate(s) {
  return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}
function dateYmd(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
         '-' + ('0' + d.getDate()).slice(-2);
}
/* 주는 월요일에 시작한다 */
function weekStart(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function daysInMonth(ym) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); }

/* 보고 있는 달에서 몇째 주를 볼지. 이번 달이면 오늘이 낀 주,
   지난 달이면 그 달 마지막 날이 낀 주가 기준이고 ST.wkOff 로 옮긴다. */
function curWeek() {
  var ym = ST.ym || '', now = new Date();
  var curYm = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
  var base = ym === curYm ? now : new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0);
  var s = addDays(weekStart(base), ST.wkOff * 7);
  return { s: s, e: addDays(s, 6) };
}
/* 그 주가 이 달과 하루라도 겹치는지 — 화살표를 어디서 멈출지 정한다 */
function weekHitsMonth(off) {
  var save = ST.wkOff; ST.wkOff = off;
  var w = curWeek(); ST.wkOff = save;
  var ym = ST.ym;
  for (var i = 0; i < 7; i++) if (dateYmd(addDays(w.s, i)).slice(0, 7) === ym) return true;
  return false;
}

/* 주간 예산은 월 예산을 그 주가 이 달에 걸친 날 수만큼 잘라 쓴다.
   4.33 으로 나누면 달 첫 주·마지막 주가 늘 초과로 나온다. */
function weekCats(M) {
  var w = curWeek(), ym = ST.ym;
  var s = dateYmd(w.s), e = dateYmd(w.e);
  var inMonth = 0;
  for (var i = 0; i < 7; i++) if (dateYmd(addDays(w.s, i)).slice(0, 7) === ym) inMonth++;
  var share = inMonth / daysInMonth(ym);
  var byCat = ((ST.boot && ST.boot.budget) || {}).byCat || {};
  var spend = {};
  ((ST.tx && ST.tx.days) || []).forEach(function (d) {
    if (d.d < s || d.d > e) return;
    d.rows.forEach(function (r) {
      if (r.gubun !== '지출' || !r.cat) return;
      spend[r.cat] = (spend[r.cat] || 0) + (r.amt || 0);
    });
  });
  /* 지출이 있었던 카테고리만 본다. 안 쓴 예산까지 줄줄이 세우면
     '무엇이 넘었나' 가 안 보인다. */
  var out = Object.keys(spend).map(function (k) {
    var b = Math.round((byCat[k] || 0) * share);
    return { name: k, spend: spend[k], budget: b,
             ratio: b ? spend[k] / b : null, over: b ? Math.max(0, spend[k] - b) : 0 };
  });
  out.sort(function (a, b) { return (b.over - a.over) || (b.spend - a.spend); });
  return { rows: out, s: w.s, e: w.e, days: inMonth };
}

function catRow(o, mxs) {
  var over = o.ratio != null && o.ratio > 1;
  var col = o.budget ? catFill(o.name) : 'oklch(.88 .01 285)';
  /* ⚠️ 막대의 자는 **언제나 예산**이다. 100% = 예산.

     예전엔 넘긴 줄만 자를 바꿔 달았다 — 막대 전체를 「지출액」으로 놓고
     예산 지점(100/ratio)에서 끊었다. 그래서 120% 인 줄의 보라가 83% 밖에
     안 차서, 95% 쓴 줄(보라 95%)보다 **덜 찬 것처럼** 보였다.
     더 많이 쓴 줄이 더 비어 보이는 자였다 (폴 지적 2026-08-06).

     이제 넘긴 줄은 보라가 꽉 차고, 넘긴 만큼이 오른쪽 끝에서 빨갛게
     덮인다. 120% 면 오른쪽 20% 가 빨갛다 — 「예산의 20% 를 넘었다」가
     그대로 길이로 읽힌다. 줄끼리 비교도 된다.

     예산이 없는 줄만 다른 자를 쓴다(그 달 최대 지출 기준). 비교할
     예산이 없으니 어쩔 수 없고, 그건 오른쪽에 「/ —」로 적어 둔다. */
  var fill, red = 0;
  if (!o.budget) fill = clamp(o.spend / mxs * 100, 2, 100);
  else {
    fill = clamp(o.ratio * 100, 2, 100);          /* 넘겨도 100 에서 잘린다 */
    if (over) red = clamp((o.ratio - 1) * 100, 2, 100);
  }
  var pill = '';
  if (over) pill = '<span class="pill over">' + pct(o.ratio) + '%</span>';
  else if (o.delta != null && o.delta >= .3) pill = '<span class="pill up">전월 +' + pct(o.delta) + '%</span>';
  var right = o.budget ? C(o.spend) + ' <em>/ ' + C(o.budget) + '</em>'
                       : C(o.spend) + ' <em>/ —</em>';
  /* 누르면 그 카테고리만 걸린 내역으로 간다 */
  /* ⚠️ 이름 앞 점도 막대와 **같은 색**이다. 색은 점·막대에만 — 숫자엔 안 쓴다.
     ⚠️ CSS 변수 대신 `<i>` 로 그린다. `--dot` 같은 인라인 변수를 쓰면
     check.py 가 「정의 없는 CSS 변수」로 잡는다(그리고 그 경고가 맞다 —
     :root 에 없는 변수는 어디서 오는지 코드를 열어봐야 안다). */
  return '<button class="crow" data-cat="' + esc(o.name) + '"><div class="l1">' +
    '<span class="nm"><i class="dot" style="background:' + col + '"></i>' +
      esc(o.name) + pill + '</span>' +
    '<span class="amt' + (over ? ' over' : '') + '">' + right + '</span></div>' +
    '<div class="bar"><i style="width:' + fill.toFixed(1) + '%;background:' + col + '"></i>' +
    (red > 0 ? '<b style="width:' + red.toFixed(1) + '%"></b>' : '') +
    '</div></button>';
}

function cardCats(M) {
  var wk = ST.catMode === 'w';
  var W = wk ? weekCats(M) : null;
  var all = wk ? W.rows : (M.cats || []);
  var mxs = all.reduce(function (a, b) { return Math.max(a, b.spend || 0); }, 1);
  var rows = all.map(function (o) { return catRow(o, mxs); }).join('');

  var head, note = '';
  if (wk) {
    var lb = function (d) { return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; };
    var nOver = all.filter(function (o) { return o.over > 0; }).length;
    var sOver = all.reduce(function (a, o) { return a + o.over; }, 0);
    head = '<div class="wknav" id="wknav">' +
      '<button data-d="-1"' + (weekHitsMonth(ST.wkOff - 1) ? '' : ' disabled') + '>‹</button>' +
      '<span>' + lb(W.s) + ' ~ ' + lb(W.e) + '</span>' +
      '<button data-d="1"' + (weekHitsMonth(ST.wkOff + 1) ? '' : ' disabled') + '>›</button></div>';
    note = '<div class="wkn">' +
      (nOver ? '<b>' + nOver + '개 카테고리</b>가 주 예산을 넘었어요 · 합계 ' + C(sOver) + '원 초과'
             : '주 예산을 넘긴 카테고리가 없어요') +
      '<em>주 예산 = 월 예산 × 이 주의 ' + W.days + '일 ÷ ' + daysInMonth(ST.ym) + '일</em></div>';
  }

  var c = el('div', 'card p18');
  c.innerHTML =
    /* 목표를 고치러 가는 두 번째 입구. 줄마다 「/ 예산」이 적혀 있는데
       고칠 길이 없었다 — 폴: 「진입점이 너무 제한적이다. 나 아니면 찾기
       힘들 것 같아.」 예산 숫자를 보고 있는 자리에 두는 게 맞다. */
    '<div class="ct"><h3>카테고리 · 예산 대비</h3>' +
      '<div class="ctr">' +
        '<button class="budlink" data-a="bud">목표 ✎</button>' +
        '<div class="tog" id="ctog">' +
          '<button data-m="w" class="' + (wk ? 'on' : '') + '">주</button>' +
          '<button data-m="m" class="' + (wk ? '' : 'on') + '">월</button>' +
        '</div>' +
      '</div></div>' +
    (head || '') + note +
    '<div class="cats" id="cats">' + (rows ||
      '<div class="empty">' + (wk ? '이 주 지출이 없어요' : '이 달 지출이 없어요') + '</div>') + '</div>';
  return c;
}

function cardPeople(M) {
  var ps = (M.people || []).slice();
  var tot = ps.reduce(function (a, b) { return a + (b.spend || 0); }, 0) || 1;
  /* ⚠️ 1.32.0 — 사람 구분은 **색이 아니라 명도 3단**이다 (디자인 리뉴얼).
     카테고리 색과 섞으면 「고미 = 식비」처럼 읽힌다. */
  var cols = ['var(--who1)', 'var(--who2)', 'var(--who3)'];
  var segs = ps.map(function (p, i) {
    var w = p.spend / tot * 100;
    return '<div style="' + (i === ps.length - 1 ? 'flex:1' : 'width:' + w.toFixed(1) + '%') +
           ';background:' + cols[i] + '"></div>';
  }).join('');
  /* 이름을 누르면 그 사람 계좌 건만 내역에서 본다. 막대만 보고
     「누가 뭘 썼는데?」 로 넘어갈 길이 없었다. */
  var lbl = ps.map(function (p, i) {
    return '<button class="p' + i + '" data-w="' + esc(p.name) + '">' +
      esc(p.name) + ' ' + C(p.spend) + '</button>';
  }).join('');
  var c = el('div', 'card p18');
  /* 기준일은 맨 위 손익 카드가 이미 말하고 있다. 한 화면에 같은 날짜를
     두 번 적을 이유가 없다(폴, 2026-08-05). */
  c.innerHTML =
    '<div class="ct"><h3>누가 얼마나 썼나</h3></div>' +
    '<div class="pbar">' + segs + '</div>' +
    '<div class="plg" id="plg">' + lbl + '</div>';
  return c;
}

function bindHome() {
  /* 앞으로 나갈 돈 — **그 자리에서** 펼친다 (1.27.0).
     예전엔 리포트로 보냈다가(PIN 패드가 떴다) 내역 탭으로 보냈는데,
     탭을 옮기는 것 자체가 군더더기였다. 접힘 상태는 로컬에 저장한다. */
  /* ⚠️ 홈에서는 **펼치지 않고 내역으로 보낸다.** 목록·등록 버튼은 내역 한 곳에만
     둡니다 — 두 곳에 두면 한쪽만 고치는 사고가 납니다.
     넘어갈 때 패널을 펴 둔다: 보러 갔는데 접혀 있으면 한 번 더 눌러야 한다. */
  var goDue = function () { openDue(); };
  var hd = $('#hdue');
  if (hd) hd.onclick = goDue;

  /* 앞으로 나갈 돈은 리포트 응답에 들어 있다. 없으면 받고, 오래됐으면 다시 받는다.
     `!ST.rep` 만 보면 **localStorage 에 남은 어제치가 있을 때 영원히 안 받는다.**
     다시 그리는 건 loadReport 가 알아서 한다. */
  repRefresh();

  var cs = $('#cats');
  if (cs) cs.onclick = function (e) {
    var b = e.target.closest('button[data-cat]');
    if (!b) return;
    /* 주간을 보고 있어도 내역은 그 달 전체로 거른다. ST.f 에 날짜 범위가
       없어서 주 단위로 맞추려면 필터 구조부터 손봐야 한다.
       폴 결정(2026-08-05) — 달 기준으로 통일. */
    setFilter({ cat: [b.dataset.cat] });
    goTab('tx');
  };
  /* 계산서의 각 줄 → 그 유형만 내역에서. 「지난달 카드값 1,755,130 이 뭐지」가
     이 카드를 보다가 바로 드는 질문이라 갈 곳을 준다.
     ⚠️ 줄이 계산서·두 갈래 **세 군데**에 흩어져 있다. 카드 하나에 한 번만 물린다 —
     `querySelector` 로 하나만 잡으면 나머지는 눌러도 아무 일이 없다. */
  /* 목록의 각 줄 → 그 유형만 내역에서. 「지난달 카드값 1,755,130 이 뭐지」가
     이 카드를 보다가 바로 드는 질문이라 갈 곳을 준다.
     ⚠️ 목록이 **두 칸에 하나씩** 있다. `#dtl` 하나만 잡으면 오른쪽 칸은
     눌러도 아무 일이 없다 — 카드 하나에 위임으로 받는다. */
  var tw = $('.hero2');
  if (tw) tw.onclick = function (e) {
    var b = e.target.closest('.hrows button[data-g]');
    if (!b) return;
    setFilter({ g: b.dataset.g.split('|') });
    goTab('tx');
  };
  var pl = $('#plg');
  if (pl) pl.onclick = function (e) {
    var b = e.target.closest('button[data-w]');
    if (!b) return;
    setFilter({ w: [b.dataset.w] });
    goTab('tx');
  };
  var ct = $('#ctog');
  if (ct) ct.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    ST.catMode = b.dataset.m; ST.wkOff = 0;
    LS.set('catMode', ST.catMode);
    /* 주간은 내역에서 계산한다. 아직 안 받았으면 받아 놓고 다시 그린다. */
    if (ST.catMode === 'w' && !ST.tx) loadTx(true).then(function () { render(); });
    render();
  };
  var wn = $('#wknav');
  if (wn) wn.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    ST.wkOff += +b.dataset.d; render();
  };
  var t = $('#ptog');
  if (t) t.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    ST.paceMode = b.dataset.m; LS.set('paceMode', ST.paceMode); render();
  };
  bindBudEntries();
}

/* ═══════════ 내역 (#1c) ═══════════ */
/* 낭비 표시는 걷어냈다. 무엇이 낭비인지는 사람마다 달라서
   앱이 후보를 골라주면 오히려 틀린 신호가 됐다. 시트의 낭비
   칸과 서버 API 는 그대로 두었으니 되살리려면 화면만 붙이면 된다. */

/* ───────── 필터 판정 (한 곳) ─────────
   같은 조건이 passFilter·facet·capHidden 세 곳에 흩어져 있었다.
   유형(g)·사람(w) 을 붙일 때 세 곳을 다 고쳐야 했고, 한 곳만 빠뜨리면
   목록과 칩 건수가 조용히 어긋난다. 차원은 표로 두고 판정은 여기서만 한다.

   except = 이번 판정에서 뺄 칸. 패싯을 셀 때 자기 칸을 빼는 데 쓴다 —
   자기까지 걸러버리면 고르는 순간 다른 선택지가 전부 0건이 된다. */
var F_DIMS = [
  { key: 'cat', of: function (r) { return r.cat; } },
  { key: 'pay', of: function (r) { return r.pay; } },
  { key: 'g',   of: function (r) { return r.gubun; } },
  { key: 'w',   of: function (r) { return r.who; } }
];

function fPass(r, except) {
  var f = ST.f;
  for (var i = 0; i < F_DIMS.length; i++) {
    var d = F_DIMS[i];
    if (d.key === except) continue;
    if (f[d.key].length && f[d.key].indexOf(d.of(r)) < 0) return false;
  }
  if (f.q && !matchQ(r, f.q)) return false;
  /* 자본거래 숨김. 유형을 콕 집어 고른 경우엔 그 선택이 우선이고,
     유형 칸을 고르는 중(except==='g')일 때도 적용하지 않는다 —
     안 그러면 숨겨진 유형이 목록에 안 떠서 고를 수가 없다.
     숨긴 건수를 셀 때(except==='cap')도 빼야 한다. */
  if (except !== 'g' && except !== 'cap' &&
      ST.cap && !f.g.length && isCap(r.gubun)) return false;
  return true;
}

function passFilter(r) { return fPass(r, null); }

/* 자본거래 숨김 때문에 안 보이고 있는 건수. 숨겼다는 사실을 화면에
   적어두지 않으면 '내역이 사라졌다' 로 읽힌다. */
function capHidden() {
  if (!ST.cap || ST.f.g.length) return 0;
  var n = 0;
  allRows().forEach(function (r) {
    if (isCap(r.gubun) && fPass(r, 'cap')) n++;
  });
  return n;
}

/* ═══════════ 같은 가게 반복 결제 묶기 ═══════════
   폴 2026-08-08: 「오락실 같은데서 소액 결제를 반복해서 하면 내역에 건이
   많이 쌓이는 게 별로거든.」

   같은 날·같은 내용·같은 결제수단이 세 건 이상이면 한 줄로 접는다.
   두 건은 안 접는다 — 두 줄 그대로가 오히려 읽기 쉽다(폴 선택).

   ⚠️ 접는 건 화면일 뿐 장부는 그대로다. 진짜 합치는 건 펼친 뒤
   「한 줄로 합치기」를 눌렀을 때만, 서버가 원본을 묶음로그에 남기고 한다. */
var MERGE_MIN = 3;
var grpOpen = {};

function txGroups(rows) {
  var out = [], by = {};
  rows.forEach(function (r) {
    var k = String(r.desc || '') + ' ' + String(r.pay || '') + ' ' + String(r.gubun || '');
    var g = by[k];
    if (!g) { g = by[k] = { k: k, rows: [] }; out.push(g); }
    g.rows.push(r);
  });
  /* 묶음의 자리는 그 안에서 가장 나중에 넣은 줄을 따른다 — 안 묶었을 때와
     같은 자리에 있어야 「어디 갔지」가 안 생긴다. */
  out.forEach(function (g) {
    g.top = g.rows.reduce(function (a, r) { return Math.max(a, r.row || 0); }, 0);
    g.id = 'g' + g.top;
    g.amt = g.rows.reduce(function (a, r) { return a + (Number(r.amt) || 0); }, 0);
  });
  out.sort(function (a, b) { return b.top - a.top; });
  return out;
}

function renderTx() {
  var s = $('#screen');
  if (!ST.tx) { renderSkeleton(); if (!txLoading) loadTx(); return; }
  /* 캐시가 있으면 여기서 끝내던 게 문제였다. 앱을 껐다 켜도 내역 탭은
     서버를 아예 다시 안 불러서, 로컬에 남은 옛 목록이 계속 보였다.
     이제는 캐시로 즉시 그리되 뒤에서 최신을 받아온다. */
  if (!txLoading && Date.now() - txAt > 60000) loadTx(true);
  var T = ST.tx, f = ST.f;
  var anyF = f.cat.length || f.pay.length || f.g.length || f.w.length || f.q;

  /* 같은 날 안에서는 나중에 넣은 게 위로. 시트 행 번호가 곧 등록 순서다. */
  var days = (T.days || []).map(function (d) {
    var rows = d.rows.filter(passFilter).slice()
      .sort(function (a, b) { return (b.row || 0) - (a.row || 0); });
    return { d: d.d, rows: rows };
  }).filter(function (d) { return d.rows.length; });

  var vs = 0, vi = 0, vc = 0;
  days.forEach(function (d) {
    d.rows.forEach(function (r) {
      vc++;
      if (r.gubun === '지출') vs += r.amt; else if (r.gubun === '수입') vi += r.amt;
    });
  });

  var hid = capHidden();
  /* ═══ 1.34.0 · Slate 7a ═══
     ⚠️ 세 값(지출·수입·건수)을 **어두운 면에 올려 필터보다 위**에 둡니다. 헤더와
     이어져 한 덩어리로 읽혀야 하므로 좌우 여백이 헤더와 같은 20px 이어야 합니다.
     ⚠️ 카드·그림자를 다시 넣지 마세요. 구획은 8px 띠와 1px 선으로만 합니다. */
  var col = function (k, n, mask) {
    return '<div class="c"><span class="k">' + esc(k) + '</span>' +
      '<span class="n' + (mask ? mkCls('m', 'tx') : '') + '">' + n + '</span></div>';
  };
  var head =
    '<div class="txsum">' +
      col(anyF ? '걸러진 지출' : '지출', C(vs)) + '<i></i>' +
      col('수입', C(vi), 1) + '<i></i>' +
      col('건수', String(vc)) +
    '</div>' +
    '<div class="txwrap">' +
    /* ⚠️ 「초기화」는 **맨 뒤**에 빨강으로. 앞에 두면 필터를 고르러 온 손이 먼저
       닿습니다 — 지우는 버튼이 고르는 버튼보다 앞에 설 이유가 없습니다(디자인 7a). */
    '<div class="fchips" id="fch">' +
      '<button data-a="g" class="' + (f.g.length ? 'on' : '') + '">' +
        (f.g.length === 1 ? esc(f.g[0]) : '유형' + (f.g.length ? ' ' + f.g.length : '')) + '</button>' +
      '<button data-a="cat" class="' + (f.cat.length ? 'on' : '') + '">카테고리' + (f.cat.length ? ' ' + f.cat.length : '') + '</button>' +
      '<button data-a="pay" class="' + (f.pay.length ? 'on' : '') + '">결제수단' + (f.pay.length ? ' ' + f.pay.length : '') + '</button>' +
      '<button data-a="w" class="' + (f.w.length ? 'on' : '') + '">' +
        (f.w.length === 1 ? esc(f.w[0]) : '사람' + (f.w.length ? ' ' + f.w.length : '')) + '</button>' +
      /* 「보는 대상」은 앱 전체 범위라 성격이 다르다. 걸려 있을 때만 띄운다 —
         안 그러면 바로 옆 「사람」 칩과 같은 것으로 읽혀서 둘 다 헷갈린다.
         꺼져 있을 때 바꾸는 길은 헤더 아바타와 설정에 그대로 있다. */
      (ST.who ? '<button data-a="who" class="on">' + esc(ST.who) + ' 계좌만</button>' : '') +
      '<button data-a="q" class="' + (f.q ? 'on' : '') + '">' + (f.q ? '“' + esc(f.q) + '”' : '검색') + '</button>' +
      (anyF || !ST.cap ? '<button data-a="all" class="w">초기화</button>' : '') +
    '</div>' +
    (ST.txErr
      ? '<div class="warnbar"><span>최신 내역을 못 받았어요 · ' + esc(ST.txErr) + '</span>' +
        '<button id="txretry">다시 시도</button></div>' : '') +
    /* 앞으로 나갈 돈 — 목록과 등록은 전용 화면(6c) 한 곳에만 있습니다.
       ⚠️ 1.34.0 — 접이식 패널을 그 화면이 받았습니다. 내역엔 한 줄 요약만 남습니다.
       ⚠️ 홈과 **같은 껍데기**(.duerow)를 씌웁니다. 안 씌우면 여백과 글자 크기가
       두 화면에서 달라지는데, 같은 줄이 다르게 보이면 다른 것으로 읽힙니다. */
    (function () {
      var h = dueRowHtml(nextDue());
      return h ? '<div class="duerow">' + h + '</div>' : '';
    })() +
    /* ⚠️ 토글 이름을 **켜진 쪽 기준**으로 바꿉니다 (디자인 7a). 예전엔 「이체 포함」
       이라 적고 `ST.cap`(순수 거래만)이 **참일 때 꺼진 것처럼** 보였습니다 —
       스위치가 켜졌는데 이름은 반대를 가리키는 꼴이라 매번 한 번씩 더 생각해야
       했습니다. 이제 켜짐 = 순수 거래 = `ST.cap` 입니다.
       ⚠️ 숨긴 건수는 그대로 옆에 붙입니다. 조용히 빼기만 하면
       「내역이 사라졌다」로 읽힙니다. */
    ((vc || hid) ?
      '<div class="txsec">' +
        '<div class="l"><b>순수 거래</b><em>이체·저축 제외' +
          (hid ? ' ' + hid + '건' : '') + '</em></div>' +
        '<button class="captog' + (ST.cap ? ' on' : '') + '" id="captog" ' +
          'aria-pressed="' + (ST.cap ? 'true' : 'false') + '" aria-label="순수 거래만 보기">' +
          '<i></i></button>' +
      '</div>' : '');

  var body = days.map(function (d) {
    var tot = d.rows.reduce(function (a, r) { return a + (r.gubun === '지출' ? r.amt : 0); }, 0);
    /* ⚠️ 1.34.0 · 부호와 색 (Slate 규칙)
         지출        −  빨강
         수입        +  초록
         이체·저축·부채상환·차입·투자회수  부호 없음 · 중립색
       ⚠️ **중립이 핵심입니다.** 저축을 빨강 −로 칠하면 내 돈이 자리를 옮긴 걸
       손해로 읽습니다 (폴 2026-08-09). 예전엔 지출도 부호가 없어서 지출과
       이체가 같은 검정으로 나란히 섰습니다 — 그게 더 헷갈렸습니다. */
    var amtHtml = function (r, amt) {
      var g = r.gubun, cls = '', sg = '';
      if (g === '수입') { cls = ' in' + mkCls('l', 'tx'); sg = '+'; }
      else if (g === '지출') { cls = ' out'; sg = '−'; }
      else cls = ' nt';                                   /* 이체·저축·부채상환 … */
      return '<span class="amt' + cls + '">' + sg + C(amt) + '</span>';
    };
    var one = function (r) {
      var cm = catBadge(r.cat);
      var badge = '<div class="bdg" style="background:' + cm.bg + ';color:' + cm.fg + '">' +
        esc(cm.ab) + '</div>';
      return '<button class="trow" data-row="' + r.row + '">' + badge +
        '<div class="mid"><div class="t1">' + esc(r.desc || r.cat) + '</div>' +
        '<div class="t2">' + esc(r.pay || '—') + ' · ' + esc(r.who || '') + '</div></div>' +
        /* ⚠️ 수입 거래만 가린다. 지출은 그대로 보인다(완료 기준). */
        amtHtml(r, r.amt) + '</button>';
    };
    var rows = txGroups(d.rows).map(function (g) {
      if (g.rows.length < MERGE_MIN) return g.rows.map(one).join('');
      var r0 = g.rows[0], cm = catBadge(r0.cat), open = grpOpen[g.id];
      var badge = '<div class="bdg" style="background:' + cm.bg + ';color:' + cm.fg + '">' +
        esc(cm.ab) + '</div>';
      /* 접힌 줄은 「고치기」가 아니라 「펼치기」다. 겉모습이 같으면 눌렀을 때
         고치기 화면이 뜰 거라고 읽힌다 — ×5 딱지와 화살표로 갈라 놓는다. */
      return '<div class="tgrp' + (open ? ' on' : '') + '">' +
        '<button class="trow grp" data-grp="' + esc(g.id) + '">' + badge +
          '<div class="mid"><div class="t1">' + esc(r0.desc || r0.cat) +
            '<b class="gx">×' + g.rows.length + '</b></div>' +
          '<div class="t2">' + esc(r0.pay || '—') + ' · ' + esc(r0.who || '') + '</div></div>' +
          amtHtml(r0, g.amt) +
          '<i class="gc"></i></button>' +
        (open
          ? '<div class="gsub">' + g.rows.map(one).join('') +
            '<button class="gmg" data-mg="' + esc(g.rows.map(function (r) { return r.row; }).join(',')) + '">' +
            '한 줄로 합치기</button></div>'
          : '') +
      '</div>';
    }).join('');
    /* ⚠️ 날짜 옆 숫자는 **그날 쓴 돈**이다. 수입만 있는 날은 0 이 되는데,
       그 「0」이 「이 날 아무 일도 없었다」로 읽힌다 — 바로 아래 급여 줄이
       있는데도. 0 이면 아예 안 적는다. */
    return '<div class="dgroup"><div class="dhead">' +
      '<span class="d">' + Number(d.d.slice(5, 7)) + '월 ' + Number(d.d.slice(8, 10)) + '일 <em>' + ymdDow(d.d) + '</em></span>' +
      '<span class="t">' + (tot ? C(tot) : '') + '</span></div>' + rows + '</div>';
  }).join('');

  /* 비어 있을 때 왜 비었는지 말해준다. 사람 필터가 걸려 있으면
     '내역이 없다' 가 아니라 '이 사람 것이 없다' 가 맞는 말이다. */
  var emptyMsg = anyF ? '조건에 맞는 내역이 없어요'
    : hid ? '순수 거래는 없고 자본거래만 ' + hid + '건 있어요' +
            '<div class="ebtn"><button id="capon2">전부 보기</button></div>'
    : ST.who ? esc(ST.who) + ' 소유 계좌 내역이 없어요' +
               '<div class="ebtn"><button id="whoall">가구 전체로 보기</button></div>'
    : '이 달 내역이 없어요';
  s.innerHTML = head + (body || '<div class="empty">' + emptyMsg + '</div>') + '</div>';
  /* 아직 장부에 안 넣은 알림을 맨 위에 모아 둔다. 며칠 지나서
     한꺼번에 처리할 때 내역과 같은 화면에서 보는 게 편하다. */
  var st = s.querySelector('.txwrap');
  /* 앞으로 나갈 돈은 리포트 응답에 들어 있다. 내역 탭에서 쓰지만
     서버를 새로 파지 않고 이미 있는 report2 를 재활용한다.
     오래됐으면 다시 받는다 — 캐시만 믿으면 어제치가 그대로 보인다. */
  repRefresh();
  if (st) {
    if (ST.inbox.length) st.insertBefore(cardInbox({ title: '입력 대기' }), st.firstChild);
  }
  bindTx();
}

function bindTx() {
  /* ⚠️ 1.34.0 — 접이식 패널이 없어졌습니다. 한 줄 요약은 눌러서 전용 화면(6c)으로. */
  var td = $('#hdue');
  if (td) td.onclick = function () { openDue(); };

  var rt = $('#txretry');
  if (rt) rt.onclick = function () { ST.txErr = null; render(); loadTx(false, true); };
  var wa = $('#whoall');
  if (wa) wa.onclick = function () { setWho(null); };
  var setCap = function (on) { ST.cap = on; LS.set('cap', on ? 1 : 0); render(); };
  var ct2 = $('#captog'); if (ct2) ct2.onclick = function () { setCap(!ST.cap); };
  var c2 = $('#capon2'); if (c2) c2.onclick = function () { setCap(false); };
  var fc = $('#fch');
  if (fc) fc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.dataset.a;
    if (a === 'all') {
      ST.f = { cat: [], pay: [], g: [], w: [], q: '', sq: ST.f.sq };
      ST.cap = true; LS.set('cap', 1);
      return render();
    }
    if (a === 'cat' || a === 'pay' || a === 'g' || a === 'w') return lowSheet(a);
    if (a === 'who') return switchWho();
    if (a === 'q') return searchSheet();
  };

  /* 길게 누르기(낭비 표시)를 걷어내서 그냥 누르면 고치기다. */
  $('#screen').addEventListener('click', function (e) {
    /* ⚠️ 합치기 버튼이 .trow 안에 있는 건 아니지만, 순서를 뒤집으면
       접힌 줄(.trow.grp)이 data-row 가 없어 findRow(NaN) 으로 샌다. */
    var mg = e.target.closest('[data-mg]');
    if (mg) return askMerge(mg.dataset.mg);
    var gb = e.target.closest('[data-grp]');
    if (gb) {
      var id = gb.dataset.grp;
      grpOpen[id] = !grpOpen[id];
      return render();
    }
    var b = e.target.closest('.trow');
    if (!b) return;
    var r = findRow(+b.dataset.row);
    if (r) openEdit(r);
  });
}
function allRows() {
  var out = [];
  ((ST.tx && ST.tx.days) || []).forEach(function (d) { out = out.concat(d.rows); });
  return out;
}
function findRow(n) {
  var f = allRows().filter(function (r) { return r.row === n; });
  return f[0] || null;
}
function uniq(a) {
  var s = {}, o = [];
  a.forEach(function (x) { x = String(x || '').trim(); if (x && !s[x]) { s[x] = 1; o.push(x); } });
  return o.sort();
}
/* ───────── 필터 시트 ───────── */
/* ───────── 필터 시트 ─────────
   화면 절반만 덮는 '낮은 시트'. 뒤 목록이 실시간으로 걸러진다.
   예전엔 화면을 다 덮는 시트에서 [적용]을 눌러야 결과를 봤다.
   무엇을 고를지 판단하려면 고르면서 결과가 보여야 한다. */

/* 이 칸을 뺀 나머지 조건만 적용한 건수·금액. 흔히 말하는 패싯이다.
   자기 자신까지 걸러버리면 고르는 순간 다른 선택지가 0건이 된다. */
function dimVal(dim, r) {
  return dim === 'cat' ? r.cat : dim === 'pay' ? r.pay
       : dim === 'g' ? r.gubun : r.who;
}
/* 유형 칸은 큰 갈래라 금액순으로 섞이면 오히려 못 찾는다. 늘 같은 자리. */
var G_ORDER = ['지출', '수입', '이체', '저축/투자', '부채상환', '차입', '투자회수', '자본거래'];

/* 거르기 칩에 붙는 숫자.

   ⚠️ 예전엔 **지출 금액만** 셌다. 그래서 수입 카테고리(기타수입·금융소득)는
   합이 0 이라 슬그머니 「4건」으로 바뀌었다. 폴 지적(2026-08-07):
   「건수일거면 다 건수던가. 어떤건 금액이고 어떤건 건수인 기준이 뭐야?」
   — 규칙이 화면에 안 보이면 그건 규칙이 아니라 사고다.

   이제 **언제나 금액**을 보여준다. 방향이 섞이지 않게 셋으로 나눠 담는다.
     amt  나간 돈 (지출)
     inc  들어온 돈 (수입) — 표시할 땐 `+` 를 붙여 방향을 알린다
     mv   그 밖 (이체·저축/투자) — 방향이 없으니 그대로
   한 칩에 지출이 있으면 지출이 대표값이다. 「사람」 칩이 지출과 수입을
   더해버리면 아무 뜻도 없는 숫자가 되기 때문이다. */
function facet(dim) {
  var map = {}, order = [];
  allRows().forEach(function (r) {
    if (!fPass(r, dim)) return;
    var v = dimVal(dim, r) || '(없음)';
    if (!map[v]) { map[v] = { v: v, n: 0, amt: 0, inc: 0, mv: 0 }; order.push(v); }
    map[v].n++;
    var a = r.amt || 0;
    if (r.gubun === '지출') map[v].amt += a;
    else if (r.gubun === '수입') map[v].inc += a;
    else map[v].mv += a;
  });
  var out = order.map(function (v) { return map[v]; });
  if (dim === 'g') {
    return out.sort(function (a, b) {
      var ia = G_ORDER.indexOf(a.v), ib = G_ORDER.indexOf(b.v);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  /* 지출이 있는 칩이 먼저, 그 안에서 큰 순. 그래야 「이 달 어디에 썼나」가
     맨 위에 온다 — 수입 금액이 커서 지출을 밀어내면 쓸모가 없다. */
  return out.sort(function (a, b) {
    return (b.amt - a.amt) || ((b.inc + b.mv) - (a.inc + a.mv)) || (b.n - a.n);
  });
}

/* 칩에 찍을 한 줄. 금액이 하나도 없을 때만 건수로 내려간다 —
   0원짜리 행만 있는 칩을 「0」으로 띄우면 안 걸린 것처럼 보인다. */
function facetSub(o) {
  if (o.amt) return C(o.amt);
  if (o.inc) return '+' + C(o.inc);
  if (o.mv) return C(o.mv);
  return o.n + '건';
}

function matchQ(r, q) {
  q = String(q).toLowerCase();
  return (r.desc + ' ' + r.cat + ' ' + r.pay).toLowerCase().indexOf(q) >= 0;
}

/* 지금 조건으로 몇 건이 남는지 */
function hitCount() {
  var n = 0;
  allRows().forEach(function (r) { if (passFilter(r)) n++; });
  return n;
}

/* 결제수단을 소유자로 묶는다. "내 카드만 보기" 가 이 앱에서 제일
   자주 하는 질문인데, 예전엔 평면 목록에서 여섯 개를 일일이 눌러야 했다. */
function payOwners() {
  var own = {};
  (((ST.boot || {}).accounts) || []).forEach(function (a) {
    own[a.name] = a.owner || '공동';
  });
  var g = {}, order = [];
  facet('pay').forEach(function (o) {
    var w = own[o.v] || '공동';
    if (!g[w]) { g[w] = { who: w, items: [], n: 0, amt: 0, inc: 0, mv: 0 }; order.push(w); }
    g[w].items.push(o);
    g[w].n += o.n;
    g[w].amt += o.amt; g[w].inc += o.inc; g[w].mv += o.mv;   /* 머리줄도 금액으로 */
  });
  var rank = { '공동': 0 };
  ((ST.boot || {}).people || []).forEach(function (n, i) { rank[n] = i + 1; });
  return order.map(function (w) { return g[w]; })
              .sort(function (a, b) {
                return (rank[a.who] == null ? 9 : rank[a.who]) -
                       (rank[b.who] == null ? 9 : rank[b.who]);
              });
}

var LOW_T = {
  cat: ['카테고리', '여러 개 고를 수 있어요'],
  pay: ['결제수단', '소유자로 한 번에'],
  g:   ['유형', '지출·수입·이체 같은 큰 갈래'],
  w:   ['사람', '결제수단 소유자 기준']
};

function lowSheet(dim) {
  var key = dim;
  var grid = dim !== 'pay';        /* 결제수단만 소유자로 묶어서 보여준다 */
  var m = el('div', 'mask low');
  var sh = el('div', 'lows');
  m.appendChild(sh);

  var chip = function (o) {
    var on = ST.f[key].indexOf(o.v) >= 0;
    /* 어느 칸이든 같은 규칙 — 금액. 없을 때만 건수 (facetSub 주석 참고). */
    return '<button class="fc' + (on ? ' on' : '') + (o.n ? '' : ' z') +
      '" data-v="' + esc(o.v) + '"><b>' + esc(o.v) + '</b>' +
      '<em>' + facetSub(o) + '</em></button>';
  };

  function body() {
    var zeroOpen = sh.dataset.z === '1';
    if (grid) {
      var all = facet(dim);
      var live = all.filter(function (o) { return o.n; });
      var zero = all.filter(function (o) { return !o.n; });
      return '<div class="lsc">' + live.map(function (o) { return chip(o); }).join('') +
        (zeroOpen ? zero.map(function (o) { return chip(o); }).join('') : '') + '</div>' +
        (zero.length && !zeroOpen
          ? '<button class="lsz" data-z="1">이번 달 0건 ' + zero.length + '개 <i>보기</i></button>' : '');
    }
    var gs = payOwners();
    return gs.map(function (g) {
      var sel = g.items.filter(function (o) { return ST.f.pay.indexOf(o.v) >= 0; }).length;
      var allSel = sel && sel === g.items.length;
      return '<div class="lsg"><div class="lsgh">' +
        '<span class="av">' + esc(g.who.slice(0, 1)) + '</span><b>' + esc(g.who) + '</b>' +
        '<em>' + facetSub(g) + '</em>' +
        '<button class="grp" data-g="' + esc(g.who) + '">' +
        (allSel ? '모두 해제' : '모두 선택') + '</button></div>' +
        '<div class="lsc">' + g.items.map(function (o) { return chip(o); }).join('') +
        '</div></div>';
    }).join('');
  }

  function paint() {
    var n = hitCount(), cnt = ST.f[key].length;
    var t = LOW_T[dim] || ['거르기', ''];
    sh.innerHTML =
      '<div class="lsh"><b>' + esc(t[0]) + '</b>' +
        '<span>' + esc(t[1]) + '</span>' +
        (cnt ? '<button class="rst">초기화</button>' : '') + '</div>' +
      '<div class="lsb">' + body() + '</div>' +
      '<div class="lsf"><em>고르는 즉시 뒤 목록이 걸러져요</em>' +
        '<button class="go">' + n + '건 보기</button></div>';
  }
  paint();

  sh.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('go')) { m.remove(); return; }
    if (b.classList.contains('rst')) { ST.f[key] = []; render(); paint(); return; }
    if (b.dataset.z) { sh.dataset.z = '1'; paint(); return; }
    if (b.dataset.g) {
      var g = payOwners().filter(function (x) { return x.who === b.dataset.g; })[0];
      if (!g) return;
      var names = g.items.map(function (o) { return o.v; });
      var allSel = names.every(function (v) { return ST.f.pay.indexOf(v) >= 0; });
      if (allSel) {
        ST.f.pay = ST.f.pay.filter(function (v) { return names.indexOf(v) < 0; });
      } else {
        names.forEach(function (v) { if (ST.f.pay.indexOf(v) < 0) ST.f.pay.push(v); });
      }
      render(); paint(); return;
    }
    if (b.dataset.v != null) {
      var v = b.dataset.v, i = ST.f[key].indexOf(v);
      if (i >= 0) ST.f[key].splice(i, 1); else ST.f[key].push(v);
      render(); paint(); return;
    }
  };
  m.onclick = function (e) { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

/* ───────── 검색 ─────────
   시트를 버리고 전체 화면. 검색은 결과를 보면서 다듬는 작업인데,
   예전엔 키보드가 올라오면 필드 한 줄만 남고 결과가 안 보였다. */
var SRCH_K = 'srch';
function recentQ() { return LS.get(SRCH_K) || []; }
function pushQ(q) {
  if (!q) return;
  var a = recentQ().filter(function (x) { return x !== q; });
  a.unshift(q);
  LS.set(SRCH_K, a.slice(0, 6));
}
function hi(text, q) {
  var t = String(text || '');
  if (!q) return esc(t);
  var i = t.toLowerCase().indexOf(String(q).toLowerCase());
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' +
         esc(t.slice(i + q.length));
}

function searchSheet() {
  var q = ST.f.q || '';
  var scope = ST.f.sq || '지출만';
  var host = el('div', 'srchw');
  document.body.appendChild(host);
  var close = function () { host.remove(); render(); };

  function results() {
    if (!q) {
      var rc = recentQ();
      return rc.length
        ? '<div class="rq"><b>최근 검색어</b>' + rc.map(function (x) {
            return '<button data-q="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>'
        : '<div class="empty">가게 이름이나 카테고리를 넣어보세요</div>';
    }
    var hits = [], sum = 0, months = {};
    ((ST.tx && ST.tx.days) || []).forEach(function (d) {
      d.rows.forEach(function (r) {
        if (!matchQ(r, q)) return;
        if (scope === '지출만' && r.gubun !== '지출') return;
        hits.push({ d: d.d, r: r });
        if (r.gubun === '지출') { sum += r.amt || 0; months[d.d.slice(0, 7)] = 1; }
      });
    });
    if (!hits.length) return '<div class="empty">“' + esc(q) + '” 에 맞는 내역이 없어요</div>';
    var mn = Math.max(1, Object.keys(months).length);
    var byDay = {}, order = [];
    hits.forEach(function (h) {
      if (!byDay[h.d]) { byDay[h.d] = []; order.push(h.d); }
      byDay[h.d].push(h.r);
    });
    return '<div class="ssum">' +
        '<div><span>“' + esc(q) + '” 합계</span><b class="num">' + C(sum) + '</b></div>' +
        '<div><span>건수</span><b class="num">' + hits.length + '</b></div>' +
        '<div><span>월평균</span><b class="num">' + C(Math.round(sum / mn)) + '</b></div>' +
      '</div>' +
      order.map(function (d) {
        var tot = byDay[d].reduce(function (a, r) {
          return a + (r.gubun === '지출' ? r.amt : 0); }, 0);
        return '<div class="dgroup"><div class="dhead">' +
          '<span class="d">' + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8, 10)) +
          '일 <em>' + ymdDow(d) + '</em></span>' +
          '<span class="t">' + C(tot) + '</span></div>' +
          byDay[d].map(function (r) {
            var cm = catBadge(r.cat);
            return '<button class="trow" data-row="' + r.row + '">' +
              '<div class="bdg" style="background:' + cm.bg + ';color:' + cm.fg + '">' +
              esc(cm.ab) + '</div><div class="mid">' +
              '<div class="t1">' + hi(r.desc || r.cat, q) + '</div>' +
              '<div class="t2">' + esc(r.cat) + ' · ' + esc(r.pay || '—') +
              ' · ' + esc(r.who || '') + '</div></div>' +
              '<span class="amt' + (r.gubun === '수입' ? ' in' : '') + '">' +
              (r.gubun === '수입' ? '+' : '') + C(r.amt) + '</span></button>';
          }).join('') + '</div>';
      }).join('');
  }

  function paint(keepFocus) {
    host.innerHTML =
      '<div class="sbar"><button class="bk">‹</button>' +
        '<div class="sin"><input id="sq" placeholder="내용 · 카테고리 · 결제수단" value="' +
          esc(q) + '">' + (q ? '<button class="clr">✕</button>' : '') + '</div></div>' +
      '<div class="schip">' +
        ['지출만', '전체'].map(function (t) {
          return '<button data-s="' + t + '" class="' + (scope === t ? 'on' : '') + '">' +
            t + '</button>'; }).join('') +
      '</div>' +
      '<div class="sres">' + results() + '</div>';
    var inp = $('#sq');
    inp.oninput = function () { q = inp.value.trim(); ST.f.q = q; paint(true); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') { pushQ(q); inp.blur(); } };
    if (keepFocus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
  paint(false);
  $('#sq').focus();

  host.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('bk')) { pushQ(q); return close(); }
    if (b.classList.contains('clr')) { q = ''; ST.f.q = ''; return paint(true); }
    if (b.dataset.s) { scope = b.dataset.s; ST.f.sq = scope; return paint(false); }
    if (b.dataset.q) { q = b.dataset.q; ST.f.q = q; return paint(false); }
    var t = e.target.closest('.trow');
    if (t) {
      pushQ(q);
      var r = findRow(+t.dataset.row);
      host.remove();
      if (r) openEdit(r); else render();
    }
  };
}

/* ═══════════ 입력 / 수정 (#1d) ═══════════ */
/* 카테고리 이름 끝의 (이름) 은 그 사람 전용이라는 표시다.
   한 사람이 애칭으로도 불리면 이름 → 별칭 표가 필요하다.

   예전엔 이 표에 실제 애칭이 그대로 박혀 있었다. 저장소가 Public 이라
   2026-08-06 에 지우고, 사람 명단은 서버(`boot.people`)에서 받아 쓴다.
   애칭은 서버가 `boot.alias` 로 내려주면 얹는다.

   ⚠️ 서버가 아직 `alias` 를 안 보낸다. 그동안은 애칭이 붙은 카테고리가
      두 사람 모두에게 보인다 — 숨김이 안 될 뿐 오작동은 아니다.
      api.js 를 다음에 손볼 때 같이 내려보낸다. */
function personAlias() {
  var out = {};
  ((ST.boot && ST.boot.people) || []).forEach(function (n) { out[n] = [n]; });
  var a = (ST.boot && ST.boot.alias) || null;
  if (a) Object.keys(a).forEach(function (k) {
    out[k] = (out[k] || [k]).concat(a[k] || []);
  });
  return out;
}
function catForMe(name) {
  var m = String(name || '').match(/\(([^)]+)\)\s*$/);
  if (!m) return true;
  var who = m[1].trim(), P = personAlias(), all = [];
  Object.keys(P).forEach(function (k) { all = all.concat(P[k]); });
  if (all.indexOf(who) < 0) return true;
  return (P[ST.me] || []).indexOf(who) >= 0;
}

/* 자주 쓰는 카테고리를 위로 올린다. 두 가지를 더한다.
   - 이 달 실제 거래 건수 (내역에서 센다)
   - 앱에서 직접 고른 횟수 (기기에 쌓는다. 내 입력 습관이라 가중치를 준다)
   둘 다 없으면 설정 시트에 적힌 순서를 그대로 쓴다. */
function catRank() {
  var r = {};
  ((ST.tx && ST.tx.days) || []).forEach(function (d) {
    (d.rows || []).forEach(function (x) { if (x.cat) r[x.cat] = (r[x.cat] || 0) + 1; });
  });
  var p = LS.get('catpick') || {};
  Object.keys(p).forEach(function (k) { r[k] = (r[k] || 0) + p[k] * 2; });
  return r;
}
function bumpCat(name) {
  if (!name) return;
  var p = LS.get('catpick') || {};
  p[name] = (p[name] || 0) + 1;
  LS.set('catpick', p);
}
function catsByGroup(g) {
  var cs = (ST.boot && ST.boot.cats) || [];
  var out = [];
  cs.forEach(function (c, i) {
    var ok = g === '지출' ? c.gubun === '지출'
           : g === '수입' ? c.gubun === '수입'
           : (c.gubun !== '지출' && c.gubun !== '수입');
    if (ok && catForMe(c.name)) out.push({ c: c, i: i });
  });
  var r = catRank();
  out.sort(function (a, b) {
    var d = (r[b.c.name] || 0) - (r[a.c.name] || 0);
    return d || (a.i - b.i);       /* 같은 빈도면 시트 순서 */
  });
  return out.map(function (x) { return x.c; });
}
function gubunOf(catName) {
  var cs = (ST.boot && ST.boot.cats) || [];
  for (var i = 0; i < cs.length; i++) if (cs[i].name === catName) return cs[i].gubun;
  return '지출';
}
function payList() {
  var acc = (ST.boot && ST.boot.accounts) || [];
  var mine = [], comm = [], other = [];
  acc.forEach(function (a) {
    if (a.owner === '공동') comm.push(a.name);
    else if (a.owner === ST.me) mine.push(a.name);
    else other.push(a.name);
  });
  return { comm: comm, mine: mine, other: other };
}
/* 「누가 썼나」 선택지 — 서버가 설정 시트 F5~ 를 그대로 내려준다(폴·아내·공동).
   옛 배포에는 whoOpts 가 없으니 people 로 떨어지고, 그것도 없으면 아무것도
   안 그린다 — 서버가 모르는 이름을 앱이 지어내면 저장할 때 걸러진다. */
/* 두 번째 사람(색이 다른 쪽). 이름을 코드에 박지 않으려고 자리로 집는다. */
function people2() { return (((ST.boot || {}).people) || [])[1] || ''; }

/* 사람 색은 이름이 아니라 **자리**로 정한다. 이름이 바뀌어도 안 깨진다.
   ⚠️ 색만으로는 부족하다. 「고미」와 「고니」는 **첫 글자가 같습니다.**
   그래서 동그라미 한 글자짜리 아바타로는 둘을 구분할 수 없습니다 —
   사람 이름을 보여줘야 하는 자리에서는 **이름을 통째로** 씁니다. */
function whoCls(w) { return w === people2() ? ' b' : (w === '공동' ? ' c' : ''); }

function whoOpts() {
  var b = ST.boot || {};
  var o = b.whoOpts || b.people || [];
  return o.filter(function (x) { return x; });
}

function merchantsFor(cat) {
  var ms = (ST.boot && ST.boot.merchants) || [];
  var f = ms.filter(function (m) { return !cat || m.cat === cat; });
  f.sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
  return f.slice(0, 8);
}

function openInput() {
  ST.form = {
    edit: null, date: todayYmd(), group: '지출', cat: '', merchant: '',
    desc: '', pay: '', amt: 0, memo: '', catOpen: false, payOpen: false,
    /* 직접 입력은 폰이 없으니 로그인한 사람이 기본값이다 */
    who: ST.me || ''
  };
  navOpen();
  paintInput();
}
function openEdit(r) {
  if (!r) return;
  if (isTmp(r.row)) { toast('저장 중이에요. 잠시만요'); return; }
  var g = r.gubun === '수입' ? '수입' : (r.gubun === '지출' ? '지출' : '기타');
  var d = null;
  ((ST.tx && ST.tx.days) || []).forEach(function (x) {
    x.rows.forEach(function (y) { if (y.row === r.row) d = x.d; });
  });
  ST.form = {
    edit: r.row, date: d || todayYmd(), group: g, cat: r.cat, merchant: r.merchant || '',
    desc: r.desc, pay: r.pay, amt: r.amt, memo: '', catOpen: true, payOpen: true,
    /* 지금 누구 지출로 잡혀 있는지를 그대로 보여준다(F열이 비었으면 계좌 소유자) */
    who: r.who || ''
  };
  navOpen();
  paintInput();
}
/* 폰 알림에서 넘어온 건 — 입력 화면을 그대로 쓰되 값만 채워 연다 */
/* 낱건 하나든 묶음이든 받는다. 묶음이면 금액은 합계, 수신함 줄은 전부
   들고 간다 — 저장할 때 열 줄이 같은 한 거래를 가리키게 된다. */
function openInboxItem(arg) {
  var items = Object.prototype.toString.call(arg) === '[object Array]' ? arg : [arg];
  items = items.filter(Boolean);
  if (!items.length) return;
  var it = items[0];
  var amt = items.reduce(function (a, x) { return a + (Number(x.amt) || 0); }, 0);
  ST.form = {
    edit: null,
    inbox: items.map(function (x) { return x.row; }).join(','),
    inboxN: items.length,
    raw: it.raw,
    date: it.date || todayYmd(), group: '지출',
    cat: it.cat || '', merchant: it.desc || '', desc: it.desc || '',
    pay: it.pay || '', amt: amt, memo: '',
    catOpen: true, payOpen: true,
    /* 기본값은 핸드폰 소유자(수신함 J열) — 폴 결정 2026-08-06.
       아내가 폴 카드로 긁으면 알림은 폴 폰에 뜨니 여기가 「폴」로 잡히고,
       손으로 「아내」로 바꾸는 게 이 기능의 목적이다. */
    who: it.who || ST.me || ''
  };
  navOpen();
  paintInput();
}
/* ───────── 뒤로가기로 입력창 닫기 ─────────
   닫기 버튼이 왼쪽 위에만 있어서, 한 손으로 쓸 때 손가락이 화면을
   가로질러야 했다. 안드로이드 뒤로가기가 자연스러운 자리다.

   입력창을 열 때 히스토리에 한 층을 밀어 넣고, 빠질 때 창을 닫는다.
   X 버튼으로 닫을 때는 우리가 직접 back 을 부르는데, 그때도 popstate 가
   오므로 두 번 닫지 않도록 표시를 둔다. 창이 안 열려 있으면 아무것도
   밀어 넣지 않으니 평소 뒤로가기는 예전과 똑같다(앱을 나간다). */
var navDepth = 0, navClosing = false;
/* 백버튼으로 닫을 것들. 예전엔 입력창만 챙겼는데, 시트·알림 연결 덮개·
   PIN 권유 화면에서 백버튼을 누르면 그것들이 아니라 앱이 통째로 닫혔다
   (2026-08-06 아내 인계 전 점검에서 실측). 무엇을 닫을지는 연 쪽이
   알려준다 — 여기서 화면 종류를 다 알 필요가 없다. */
var navFns = [];

function navOpen(close) {
  navDepth++;
  navFns.push(close || null);
  try { history.pushState({ hb: navDepth }, ''); } catch (e) {}
}
function navClose() {
  if (navDepth <= 0) return;
  navDepth--;
  navFns.pop();
  navClosing = true;
  try { history.back(); } catch (e) { navClosing = false; }
}
window.addEventListener('popstate', function () {
  if (navClosing) { navClosing = false; return; }   /* 우리가 부른 back — 이미 닫았다 */
  if (navDepth > 0) navDepth--;
  var f = navFns.pop();
  if (f) { try { f(); } catch (e) {} return; }
  if ($('#modal')) closeInput(true);            /* close 를 안 준 옛 호출 = 입력창 */
});

function closeInput(fromBack) {
  var m = $('#modal');
  if (m) m.remove();
  ST.form = null;
  LS.set('form', null);
  if (!fromBack) navClose();
}
/* 입력하다 다른 앱으로 넘어가면 안드로이드가 이 화면을 통째로 내린다.
   돌아오면 페이지가 처음부터 다시 뜨니 입력창도 사라졌다. visibilitychange
   로는 못 막는다 — 이미 죽은 뒤라서. 그래서 적는 족족 기기에 남겨두고
   다시 열릴 때 되살린다. */
function keepForm() {
  if (!ST.form) return;
  LS.set('form', { f: ST.form, at: Date.now() });
}
var formRestored = false;
function restoreForm() {
  if (formRestored) return;
  formRestored = true;
  var sf = LS.get('form');
  if (!sf || !sf.f) return;
  if (Date.now() - (sf.at || 0) > 30 * 60 * 1000) { LS.set('form', null); return; }
  var f = sf.f;
  /* 아무것도 안 적은 빈 창까지 되살리면 성가시다 */
  if (!f.cat && !f.amt && !f.desc && !f.merchant && !f.pay) { LS.set('form', null); return; }
  ST.form = f;
  navOpen();
  paintInput();
}

function paintInput() {
  var F = ST.form;
  if (!F) return;
  var old = $('#modal');
  var keepScroll = 0;
  if (old) {
    var ob = old.querySelector('.ibody');
    if (ob) keepScroll = ob.scrollTop;
    old.remove();
  }
  var root = el('div', 'full');
  root.id = 'modal';

  var title = F.edit ? '내역 수정'
    /* 묶음이면 건수를 제목에 박는다 — 5,000원이 어디서 나온 숫자인지
       화면 어디에도 안 적히면 「내가 500원 짜리를 눌렀는데?」가 된다. */
    : F.inbox ? (F.inboxN > 1 ? '결제 ' + F.inboxN + '건 확인' : '결제 확인')
    : (F.group === '수입' ? '수입 입력' : F.group === '지출' ? '지출 입력' : '기타 입력');
  var cats = catsByGroup(F.group);
  var catLim = F.catOpen ? cats.length : Math.min(11, cats.length);
  var pl = payList();
  var pays = pl.comm.concat(pl.mine);
  var payLim = F.payOpen ? pays.length : Math.min(8, pays.length);
  var mers = merchantsFor(F.cat);

  var chips = function (arr, cur, act, extra) {
    return arr.map(function (n) {
      return '<button data-' + act + '="' + esc(n) + '" class="' + (n === cur ? 'on ' + (extra || '') : '') + '">' + esc(n) + '</button>';
    }).join('');
  };
  /* 카테고리 칩은 눌러야만 색이 붙었다. 그래서 스무 개가 전부 같은
     회색이라 눈으로 갈래를 못 갈랐다. 내역 배지와 같은 색을 미리 입힌다.
     고른 칸은 같은 색상의 진한 쪽으로 뒤집어서 선택이 확실히 보이게 한다. */
  /* ⚠️ 1.36.0 · Slate 7c — 안 고른 칩은 **테두리만**, 고른 칩만 채웁니다.
     예전엔 스무 개가 전부 옅게 채워져 있어서 「무엇을 골랐는지」가 안 보였습니다.
     색은 그대로 카테고리 색을 씁니다 — 테두리에 쓰면 갈래는 여전히 눈에 들어오고,
     채운 칸 하나만 튑니다. */
  /* 날짜 알약 — 두 자리(제목 줄 · 아랫줄)에서 같은 걸 그린다. 한 함수로 둔다. */
  var dpickHtml = function (F) {
    return '<div class="dpick"><button id="dprev">‹</button>' +
      '<button id="dtoday">' + Number(F.date.slice(5, 7)) + '월 ' +
        Number(F.date.slice(8, 10)) + '일 ' + ymdDow(F.date) + '</button>' +
      '<button id="dnext">›</button></div>';
  };
  var catChips = function (names, cur) {
    return names.map(function (n) {
      var m = catMeta(n), c = catTone(m), on = n === cur;
      var st = on ? 'background:' + c.fg + m.h + ');color:var(--on-ink);' +
                    'border-color:' + c.fg + m.h + ')'
                  : 'color:' + c.fg + m.h + ');border-color:' + c.fill + m.h + ')';
      return '<button data-cat="' + esc(n) + '" class="cc' + (on ? ' on' : '') +
             '" style="' + st + '">' + esc(n) + '</button>';
    }).join('');
  };

  root.innerHTML =
    '<div class="ihd">' +
      /* 오른쪽 위에 로그인한 사람 아바타를 띄우고 있었는데, 이 화면에서
         「누가 넣는가」는 이미 정해져 있어 물어볼 것도 바꿀 것도 없었다.
         고칠 때 정작 손이 가는 [삭제] 를 그 자리에 둔다(폴, 2026-08-05).
         맨 아래에 있던 「이 내역 삭제」 줄은 뺐다 — 같은 일을 하는 버튼이
         한 화면에 둘이면 어느 쪽이 진짜인지 헷갈린다. */
      /* 날짜는 **제목 줄 오른쪽** 알약 하나로 (디자인 7c). 「오늘」은 그 알약 안에서
         가운데를 눌러 돌아옵니다 — 칩을 하나 더 세우면 줄이 두 겹이 됩니다.
         ⚠️ 고칠 때는 [삭제]가 그 자리를 쓰므로, 날짜는 아랫줄로 내려갑니다. */
      '<div class="r1"><button class="x" id="ix">✕</button><h2>' + esc(title) + '</h2>' +
        (F.edit ? '<button class="del" id="idel">삭제</button>' : dpickHtml(F)) +
      '</div>' +
      (F.edit ? '<div class="r2">' + dpickHtml(F) + '</div>' : '') +
      /* 지출·수입·기타 — 폭이 같은 세 칸. 고른 칸만 흰 면으로 뒤집는다. */
      '<div class="gseg">' +
        '<button class="gchip' + (F.group === '지출' ? ' on' : '') + '" data-g="지출">지출</button>' +
        '<button class="gchip' + (F.group === '수입' ? ' on' : '') + '" data-g="수입">수입</button>' +
        '<button class="gchip' + (F.group === '기타' ? ' on' : '') + '" data-g="기타">기타</button>' +
      '</div>' +
    '</div>' +
    '<div class="ibody">' +
      (F.raw ? '<div class="rawbox"><span>받은 알림</span>' + esc(F.raw) + '</div>' : '') +
      '<div class="sec"><div class="sh"><b><i>1</i> · 카테고리</b><span>' + cats.length + '개</span></div>' +
        '<div class="chips" id="cchips">' + catChips(cats.slice(0, catLim).map(function (c) { return c.name; }), F.cat) +
        (cats.length > catLim ? '<button class="more" data-more="cat">+' + (cats.length - catLim) + '</button>' : '') +
        '</div></div>' +
      (mers.length ? '<div class="sec"><div class="sh"><b><i>2</i> · 어디에</b><span>자주 쓴 순</span></div>' +
        '<div class="chips" id="mchips">' + chips(mers.map(function (m) { return m.name; }), F.merchant, 'mer', 'mer') +
        '</div></div>' : '') +
      '<div class="sec"><div class="sh"><b><i>' + (mers.length ? 3 : 2) + '</i> · 내용</b>' +
        '<span>' + (F.merchant ? '사용처에서 자동 입력' : '직접 입력') + '</span></div>' +
        '<input class="tin" id="idesc" placeholder="내용" value="' + esc(F.desc) + '"></div>' +
      '<div class="sec"><div class="sh"><b><i>' + (mers.length ? 4 : 3) + '</i> · 결제수단</b>' +
        '<span>공동 ' + pl.comm.length + ' · 개인 ' + pl.mine.length + '</span></div>' +
        '<div class="chips" id="pchips">' + chips(pays.slice(0, payLim), F.pay, 'pay', 'pay') +
        (pays.length > payLim ? '<button class="more" data-more="pay">+' + (pays.length - payLim) + '</button>' : '') +
        '</div></div>' +
      whoSecHtml(F, mers.length ? 5 : 4) +
    '</div>' +
    '<div class="pad">' +
      '<div class="amtbox"><span class="k">금액</span><div class="v">' +
        '<b id="iamt">' + C(F.amt) + '</b><i></i><span>원</span></div></div>' +
      '<div class="quick" id="iq">' +
        '<button data-q="1000">+1천</button><button data-q="10000">+1만</button>' +
        '<button data-q="50000">+5만</button><button data-q="x2">×2</button>' +
        '<button data-q="clr">지움</button></div>' +
      '<div class="keys" id="ikeys">' +
        '<button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button>' +
        '<button class="del" data-k="del">⌫</button>' +
        '<button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button>' +
        '<button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button>' +
        '<button class="save" data-k="save"' + (canSave(F) ? '' : ' disabled') + '>' + (F.edit ? '수정' : '저장') + '</button>' +
        '<button data-k="000">000</button><button data-k="0">0</button><button data-k="00">00</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);
  var nb = root.querySelector('.ibody');
  if (nb && keepScroll) nb.scrollTop = keepScroll;
  bindInput(root);
  keepForm();
}
/* 「누가 썼나」 칸.

   왜 필요한가 — 사람별 집계는 결제수단의 소유자로 갈린다. 그래서 아내가
   폴 카드로 긁으면 누가 등록하든 폴 지출이 됐다. 폴 지적 2026-08-06.

   기본값은 결제수단 소유자와 같을 때가 대부분이라, 그때는 조용히 둔다 —
   바꿀 게 없는데 매번 눈에 걸리면 성가시다. 소유자와 다르게 골랐을 때만
   「계좌는 ○○, 쓴 사람은 △△」라고 한 줄 덧붙여 이유를 보인다. */
function whoSecHtml(F, n) {
  var opts = whoOpts();
  if (opts.length < 2) return '';
  var own = payOwner(F.pay);
  var cur = F.who || '';
  var note = (own && cur && cur !== own)
    ? '<span>계좌는 ' + esc(own) + ' · 쓴 사람은 ' + esc(cur) + '</span>'
    : '<span>기본은 계좌 주인</span>';
  return '<div class="sec"><div class="sh"><b><i>' + n + '</i> · 누가 썼나</b>' + note + '</div>' +
    '<div class="chips who" id="wchips">' +
      opts.map(function (x) {
        return '<button data-who="' + esc(x) + '" class="' + (x === cur ? 'on' : '') + '">' +
               esc(x) + '</button>';
      }).join('') +
    '</div></div>';
}

/* 결제수단의 소유자 — boot.accounts 에 있다. 모르면 빈 문자열. */
function payOwner(pay) {
  if (!pay) return '';
  var a = ((ST.boot && ST.boot.accounts) || []).filter(function (x) { return x.name === pay; })[0];
  return a ? (a.owner || '') : '';
}

function canSave(F) { return !!(F.cat && F.pay && F.amt > 0); }

function bindInput(root) {
  var F = ST.form;
  root.querySelector('#ix').onclick = closeInput;
  root.querySelector('#dprev').onclick = function () { F.date = ymdShift(F.date, -1); paintInput(); };
  root.querySelector('#dnext').onclick = function () { F.date = ymdShift(F.date, 1); paintInput(); };
  root.querySelector('#dtoday').onclick = function () { F.date = todayYmd(); paintInput(); };

  /* ⚠️ 1.36.0 — 종류 칩이 `.r2` 에서 `.gseg` 로 옮겨갔습니다. 예전 이름을 그대로
     두면 `querySelector` 가 null 을 주고 **화면 전체가 죽습니다**(addEventListener
     of null). 고치는 화면에서만 `.r2` 가 남아 있어서 평소엔 안 걸렸습니다. */
  root.querySelector('.gseg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-g]');
    if (!b) return;
    F.group = b.dataset.g; F.cat = ''; F.merchant = ''; paintInput();
  });

  var cc = root.querySelector('#cchips');
  if (cc) cc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.more) { F.catOpen = true; return paintInput(); }
    F.cat = b.dataset.cat === F.cat ? '' : b.dataset.cat;
    if (F.cat) bumpCat(F.cat);
    F.merchant = '';
    paintInput();
    if (F.cat && !F.pay) {
      var m2 = $('#modal'), pcs = m2 && m2.querySelector('#pchips');
      if (pcs) pcs.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  var mc = root.querySelector('#mchips');
  if (mc) mc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var n = b.dataset.mer;
    if (F.merchant === n) { F.merchant = ''; return paintInput(); }
    F.merchant = n;
    var ms = (ST.boot.merchants || []).filter(function (x) { return x.name === n; });
    if (ms[0] && !F.desc) F.desc = ms[0].memo || n;
    else if (ms[0]) F.desc = ms[0].memo || n;
    paintInput();
  };
  var pc = root.querySelector('#pchips');
  if (pc) pc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.more) { F.payOpen = true; return paintInput(); }
    F.pay = b.dataset.pay === F.pay ? '' : b.dataset.pay;
    paintInput();
  };
  var wc = root.querySelector('#wchips');
  if (wc) wc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    /* 같은 걸 다시 누르면 비운다 = 「계좌 주인대로」로 되돌린다.
       서버는 빈 값을 받으면 F열을 지우고 소유자 기준으로 돌아간다. */
    F.who = b.dataset.who === F.who ? '' : b.dataset.who;
    paintInput();
  };
  var di = root.querySelector('#idesc');
  di.oninput = function () { F.desc = di.value; keepForm(); };

  root.querySelector('#iq').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var q = b.dataset.q;
    if (q === 'x2') F.amt = F.amt * 2;
    else if (q === 'clr') F.amt = 0;
    else F.amt = F.amt + Number(q);
    syncAmt(root);
  };
  root.querySelector('#ikeys').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var k = b.dataset.k;
    if (k === 'del') F.amt = Math.floor(F.amt / 10);
    else if (k === 'save') return save();
    else {
      var s = String(F.amt) + k;
      if (s.length > 12) return;
      F.amt = Number(s);
    }
    syncAmt(root);
  };
  var del = root.querySelector('#idel');
  if (del) del.onclick = function () {
    if (!confirm('이 내역을 삭제할까요?')) return;
    var delRow = F.edit;
    closeInput();
    txDel(delRow);
    render();
    toast('삭제했어요');
    api('del', { row: delRow })
      .then(function () { refreshAll(); })
      .catch(function (e) {
        if (e && e.message === 'auth') return;
        toast('삭제 실패 — 되돌립니다');
        refreshAll();          /* 서버 값으로 되돌린다 */
      });
  };
}
function syncAmt(root) {
  var F = ST.form;
  root.querySelector('#iamt').textContent = C(F.amt);
  root.querySelector('[data-k="save"]').disabled = !canSave(F);
  keepForm();      /* 금액은 다시 그리지 않고 고치므로 여기서도 남긴다 */
}

/* 아직 서버 행 번호를 모르는 줄에 붙이는 임시 번호.
   실제 시트 행보다 훨씬 커서, 목록에서 맨 위에 오고 헷갈릴 일도 없다. */
var TMP_BASE = 900000000, tmpSeq = 0;
function isTmp(row) { return row >= TMP_BASE; }

/* ═══════════ 카드값을 지출로 넣으려 할 때 ═══════════
   폴 2026-08-08: 「아내가 우리카드값을 기타로 등록했어.」

   카드로 긁은 건 이미 각 건이 지출로 들어가 있다. 대금까지 지출로 넣으면
   같은 돈을 두 번 센다(8월 지출이 1,255,130원 부풀어 있었다).

   ⚠️ **아주 막지는 않는다.** 카드사로 나가는 돈이 전부 대금은 아니다 —
   연회비·이자·수수료는 진짜 지출이다. 막기만 하면 「왜 저장이 안 되지」
   하다가 엉뚱한 카테고리로 우회하게 된다. 그래서 고르게 한다.
   ⚠️ 결제수단이 **카드**인 건(=물건을 산 것)은 서버가 아예 안 걸러서
   여기까지 오지도 않는다. 이번 달에 그 카드로 뭘 사든 안 막힌다. */
function askCardBill(card, form) {
  var m = el('div', 'mask');
  var sh = el('div', 'nhs');
  m.appendChild(sh);
  document.body.appendChild(m);
  navOpen(function () { m.remove(); });
  var shut = function () { m.remove(); navClose(); };

  sh.innerHTML =
    '<div class="nhh"><b>' + esc(card) + ' 대금 같아요</b>' +
      '<button class="x" data-a="x">닫기</button></div>' +
    /* ⚠️ 클래스는 app.css 에 있는 것만 쓴다. 설치 안내 페이지의 .note·.warn 을
       그대로 가져다 쓰면 아무 서식 없는 글자로 나온다 (check.py 가 잡아줬다). */
    '<div class="nhb">' +
      '<div class="warnbar"><span><b>' + esc(card) + '</b> 로 긁은 건 ' +
        '<b>이미 각각 지출로</b> 들어가 있어요. 대금까지 지출로 넣으면 ' +
        '같은 돈을 두 번 세게 됩니다.</span></div>' +
    '</div>' +
    '<div class="budf" style="flex-direction:column">' +
      '<button data-a="tr" class="p">이체로 넣기 (권장)</button>' +
      '<button data-a="fx">연회비·이자예요 · 그대로 지출로</button>' +
    '</div>';

  m.onclick = function (e) {
    if (e.target === m) return shut();
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    var a = b.dataset.a;
    if (a === 'x') { shut(); ST.form = form; return paintInput(); }
    /* 어느 쪽이든 **폼을 다시 열고 저장은 사람이 누른다.**
       조용히 저장해 버리면 무엇이 들어갔는지 못 보고 지나간다. */
    ST.form = form;
    if (a === 'tr') { form.cat = '계좌이체'; form.cardBillForce = 0; }
    else { form.cardBillForce = 1; }
    shut();
    paintInput();
    toast(a === 'tr' ? '이체로 바꿨어요 — 저장을 눌러주세요'
                     : '이번 한 번만 지출로 — 저장을 눌러주세요');
  };
}

/* 「한 줄로 합치기」 확인.
   폴 선택(2026-08-08): 화면에서만 접는 게 아니라 **시트 원본도** 한 줄로.
   장부에서 줄이 사라지는 일이라 반드시 묻고, 되돌릴 수 있다는 것도 적는다 —
   서버가 지우기 전에 원본을 「묶음로그」 시트에 통째로 옮겨 적는다. */
var mergeBusy = false;
function askMerge(csv) {
  var ids = String(csv || '').split(',').filter(Boolean);
  var list = ids.map(function (x) { return findRow(+x); }).filter(Boolean);
  /* 목록이 그새 바뀌었으면(다른 기기에서 지웠다든가) 합치면 안 된다 */
  if (list.length !== ids.length || list.length < 2) {
    loadTx(false, true);
    return toast('내역이 바뀌었어요 — 다시 눌러주세요');
  }
  var r0 = list[0];
  var total = list.reduce(function (a, r) { return a + (Number(r.amt) || 0); }, 0);

  var m = el('div', 'mask');
  var sh = el('div', 'nhs');
  m.appendChild(sh);
  document.body.appendChild(m);
  navOpen(function () { m.remove(); });
  var shut = function () { m.remove(); navClose(); };

  sh.innerHTML =
    '<div class="nhh"><b>' + esc(r0.desc || r0.cat) + ' ' + list.length + '건</b>' +
      '<button class="x" data-a="x">닫기</button></div>' +
    '<div class="nhb">' +
      '<div class="warnbar"><span>장부에서 <b>' + list.length + '줄이 1줄로</b> 바뀌고 ' +
        '금액은 <b>' + C(total) + '원</b>이 됩니다. 합계는 안 달라져요.<br>' +
        '원본은 <b>묶음로그</b> 시트에 그대로 남으니 나중에 되돌릴 수 있어요.</span></div>' +
    '</div>' +
    '<div class="budf" style="flex-direction:column">' +
      '<button data-a="go" class="p">한 줄로 합치기</button>' +
      '<button data-a="x">그냥 둘게요</button>' +
    '</div>';

  m.onclick = function (e) {
    if (e.target === m) return shut();
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    if (b.dataset.a === 'x') return shut();
    if (mergeBusy) return;
    mergeBusy = true;
    shut();
    toast('합치는 중이에요…');
    api('merge', { rows: ids.join(',') }).then(function (j) {
      mergeBusy = false;
      var d = (j && j.data) || {};
      if (d.ok === false) return toast(d.error || '합치지 못했어요');
      toast(list.length + '건을 한 줄로 합쳤어요');
      /* ⚠️ 행을 지우면 그 아래 번호가 전부 밀린다. 화면이 들고 있는 row 는
         이 순간 전부 옛 번호라, 낙관적 반영을 하면 안 되고 다시 받아야 한다. */
      grpOpen = {};
      loadTx(false, true);
      refreshAll();
    }).catch(function (err) {
      mergeBusy = false;
      toast(err.message === 'auth' ? '세션이 만료됐어요' : (err.message || '합치지 못했어요'));
    });
  };
}

function save() {
  var F = ST.form;
  if (!canSave(F)) return;
  if (!F.nonce) F.nonce = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var p = {
    date: F.date, gubun: gubunOf(F.cat), cat: F.cat,
    desc: F.desc || F.merchant || F.cat, pay: F.pay, amt: F.amt,
    merchant: F.merchant, memo: F.memo, who: F.who || '', n: F.nonce
  };
  /* 「연회비예요」를 눌렀을 때만 한 번 통과시킨다. 폼에 붙여두면
     그 뒤 저장까지 계속 뚫려서 규칙이 있으나 마나가 된다. */
  if (F.cardBillForce) { p.force = 1; F.cardBillForce = 0; }
  var wasEdit = F.edit, wasInbox = F.inbox, wasInboxN = F.inboxN || 0;
  var form = F;                      /* 실패하면 이 값 그대로 다시 연다 */

  /* 서버를 기다리지 않는다. 저장은 멱등키가 있어 두 번 가도 한 건이고,
     화면은 아래에서 먼저 맞춰두니 기다릴 이유가 없다. 등록이 굼뜨다는
     얘기의 대부분이 이 왕복 시간이었다. */
  var tmp = wasEdit ? 0 : (TMP_BASE + (++tmpSeq));
  closeInput();
  /* wasInbox 는 이제 「4276」 또는 「4276,4277,…」 이다 (묶음 확인 · 1.21.0) */
  if (wasInbox) String(wasInbox).split(',').forEach(function (r) { dropInbox(Number(r)); });
  if (wasEdit) txUpd(wasEdit, p); else txAdd(tmp, p);
  render();
  toast(wasEdit ? '수정했어요'
      : (wasInboxN > 1 ? wasInboxN + '건을 ' : '') + C(p.amt) + '원 저장했어요');

  var call = wasEdit
    ? api('upd', { row: wasEdit, date: p.date, gubun: p.gubun, cat: p.cat,
                   desc: p.desc, pay: p.pay, amt: p.amt, merchant: p.merchant,
                   who: p.who })
    : wasInbox
      ? api('inboxOk', { rows: String(wasInbox), date: p.date, gubun: p.gubun, cat: p.cat,
                         desc: p.desc, pay: p.pay, amt: p.amt, merchant: p.merchant,
                         who: p.who })
      : api('add2', p);

  call.then(function (j) {
    /* ⚠️ 서버가 카드값이라 거절하면 **겉껍데기는 ok** 다(`{ok:true,data:{ok:false}}`).
       여기서 안 걸러내면 화면엔 저장된 것처럼 남고 장부엔 없다 — 제일 나쁜 모양. */
    var d = (j && j.data) || {};
    if (d.ok === false && d.cardBill) {
      if (tmp) txDel(tmp);
      render();
      refreshAll();                 /* 수신함에서 지웠던 줄을 되살린다 */
      return askCardBill(d.cardBill, form);
    }
    var real = (j && j.data && j.data.row) || 0;
    if (tmp && real) {
      var f = txFind(tmp);           /* 임시 번호를 진짜 행 번호로 갈아끼운다 */
      if (f) { f.r.row = real; LS.set(LS.mk('t', ST.ym), ST.tx); if (ST.tab === 'tx') render(); }
    }
    refreshAll();
  }).catch(function (e) {
    if (e && e.message === 'auth') return;
    if (tmp) txDel(tmp);
    render();
    /* 실패했으면 없던 일로 하고 입력창을 값 그대로 다시 연다.
       저장된 줄 알고 넘어가는 게 제일 나쁘다. */
    ST.form = form;
    paintInput();
    toast('저장 실패 — 다시 시도해주세요');
  });
}

/* ═══════════ 금액 가리기 (디자인 PART 3 · 11a~11d) ═══════════

   1.19.0 부터 있던 **리포트 전체 화면 PIN 잠금을 걷어냅니다.** 페이지를 통째로
   덮으면 어떤 항목이 있는지조차 못 봅니다 — 옆 사람 눈을 막자고 주인까지 못
   보게 만든 셈이었습니다. 게다가 잠금이 켜져 있으면 리포트를 캐시에 안 남겨서
   탭을 열 때마다 처음부터 받아야 했습니다.

   바꾼 뒤: **구조 · 라벨 · 비율 · 그래프는 그대로 두고 금액만 가립니다.**
     · 가릴 땐 **인증 없이 즉시** — 급할 때 한 손으로 눌러야 합니다
     · 볼 때만 PIN 네 자리. 생체 인증은 안 씁니다

   ⚠️ **이건 표시 설정이지 접근 제어가 아닙니다.** 폰을 남이 들고 앱을 열면
   가릴 곳 밖의 숫자는 그대로 보입니다. 막으려는 건 「어깨 너머 시선」입니다.
   목적이 그거라면 캐시를 버릴 이유도 없어서, 리포트 캐시를 되살렸습니다.

   ⚠️ **가릴지 말지를 그리는 시점에 확정하지 않습니다.** 마크업에는 「가릴 수
   있는 자리」라는 표시(`mk`)만 붙이고, 실제로 가릴지는 `body.mkon` 클래스 하나가
   정합니다. 그래야 풀고 잠글 때 **다시 그리지 않고** 120ms 로 넘어갑니다 —
   다시 그리면 숫자가 튀어나오고 스크롤 자리도 잃습니다. */

/* PIN 은 'hb.' 밖에 둔다. 설정의 새로고침이 hb.* 를 통째로 지우는데,
   거기 휩쓸려 잠금이 풀리면 안 된다. */
var PIN_K = 'hbpin';
function pinGet() { try { return localStorage.getItem(PIN_K) || ''; } catch (e) { return ''; } }
function pinHas() { return !!pinGet(); }
/* 네 자리는 어차피 만 가지라 어떤 해시를 써도 뚫린다.
   저장된 값이 눈에 그대로 읽히지만 않게 하는 정도다. */
function pinHash(v) {
  var h = 5381;
  for (var i = 0; i < v.length; i++) h = ((h * 33) ^ v.charCodeAt(i)) >>> 0;
  return String(h);
}
function pinSet(v) { try { localStorage.setItem(PIN_K, pinHash(v)); } catch (e) {} }
function pinClear() { try { localStorage.removeItem(PIN_K); } catch (e) {} }
function pinOk(v) { return pinHas() && pinHash(v) === pinGet(); }

/* 설정도 같은 이유로 'hb.' 밖에. 사람이 내린 결정이지 캐시가 아니다. */
var MASK_K = 'hbmask';
var MASK_DEF = { on: 0, rep: 1, home: 1, tx: 1, back: '10m' };
function mkCfg() {
  var o = {}, k, raw = null;
  for (k in MASK_DEF) o[k] = MASK_DEF[k];
  try { raw = localStorage.getItem(MASK_K); } catch (e) {}
  /* ⚠️ 옛 「리포트 잠금」을 켜 두셨던 분의 결정을 **조용히 버리지 않는다.**
     설정이 아직 한 번도 저장된 적이 없는데 PIN 이 있으면, 그건 「리포트 숫자를
     가리고 싶다」고 이미 말한 것이다. 그대로 켜진 것으로 잇는다 —
     안 그러면 앱을 올리는 순간 자산이 통째로 드러난다. */
  if (raw == null) { o.on = pinHas() ? 1 : 0; return o; }
  try {
    var v = JSON.parse(raw || '{}');
    for (k in MASK_DEF) if (v[k] !== undefined && v[k] !== null) o[k] = v[k];
  } catch (e) {}
  return o;
}
function mkCfgSet(patch) {
  var o = mkCfg(), k;
  for (k in patch) o[k] = patch[k];
  try { localStorage.setItem(MASK_K, JSON.stringify(o)); } catch (e) {}
  return o;
}
/* ⚠️ PIN 이 없으면 가리기도 없다 — 풀 방법이 없는 가림은 고장이지 기능이 아니다. */
function mkOn() { return !!(mkCfg().on && pinHas()); }

var MK_MIN = 10 * 60000;
var mkTill = 0;              /* 0 = 가림 · -1 = 직접 끌 때까지 · 그 밖 = 시각 */
var mkTimer = null;

function mkShown() {
  if (!mkTill) return false;
  if (mkTill < 0) return true;
  if (Date.now() >= mkTill) { mkTill = 0; return false; }
  return true;
}
function mkHidden() { return mkOn() && !mkShown(); }

/* 그리는 시점에 정하는 건 **범위**뿐이다. 가림 여부는 body 클래스가 정한다.
   size: h 히어로 · m 중간 · l 목록 · s 문장 속 · x 축 라벨 */
function mkCls(size, where) {
  return (mkOn() && mkCfg()[where]) ? ' mk mk' + size : '';
}
function mkR(size) { return mkCls(size, 'rep'); }

/* 문장 속 금액. esc() 를 지나야 하므로 자리표를 심어 두고 뒤에서 바꾼다.
   ⚠️ 자리표를 안 쓰고 태그를 그대로 넣으면 esc() 가 글자로 만들어 버린다. */
function mkAmt(txt) { return '⟪' + txt + '⟫'; }
function mkFill(html, where) {
  var cls = mkCls('s', where || 'rep');
  return String(html).replace(/⟪(.+?)⟫/g, function (_, v) {
    return '<span class="num' + cls + '">' + v + '</span>';
  });
}

var IC_EYE =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
  '<path d="M1.8 10S4.9 4.6 10 4.6 18.2 10 18.2 10 15.1 15.4 10 15.4 1.8 10 1.8 10Z" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>';
var IC_EYEOFF =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
  '<path d="M7.4 5.2A7.8 7.8 0 0 1 10 4.6c5.1 0 8.2 5.4 8.2 5.4a15 15 0 0 1-2.6 3.2M4.6 6.6A15 15 0 0 0 1.8 10s3.1 5.4 8.2 5.4c1 0 1.9-.2 2.7-.5" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="m3.2 3.2 13.6 13.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
var IC_DEL =
  '<svg viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
  '<path d="M9 6h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L3 13l6-7Z" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M12.5 10.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
var IC_CHK =
  '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* 남은 시간은 「10분 뒤」일 때만. 다른 두 방식엔 셀 시간이 없다. */
function mkLeft() {
  if (!(mkTill > 0)) return '';
  var s = Math.max(0, Math.ceil((mkTill - Date.now()) / 1000));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
/* ⚠️ 1.33.0 — 가리기 단추가 **헤더로** 갔습니다 (디자인: 홈·내역·리포트의
   같은 자리·같은 크기). 화면마다 카드 위에 줄을 하나씩 얹던 걸 걷어냈습니다.
   그래서 이 함수는 이제 빈 문자열만 돌려줍니다 — 부르는 쪽을 한꺼번에 지우면
   화면 셋을 동시에 건드려야 해서, 자리만 비워 두고 헤더가 대신합니다. */
function mkBarHtml(where) { return ''; }
/* 이 화면에서 가릴 게 있나 — 헤더 아이콘을 띄울지 정한다 */
function mkHere() {
  var w = ST.tab === 'report' ? 'rep' : ST.tab === 'tx' ? 'tx' : ST.tab === 'home' ? 'home' : '';
  return !!(w && mkOn() && mkCfg()[w]);
}
/* 가림/보임을 클래스 하나로 넘긴다. 다시 그리지 않으니 스크롤도 안 튄다. */
function mkPaint() {
  var hid = mkHidden();
  document.body.classList.toggle('mkon', hid);
  var b = document.getElementById('mkbtn');
  if (b) {
    /* ⚠️ 꺼짐 = 아이콘만(28 원형), 켜짐 = 아이콘 + 남은 시간이 붙어 알약이 늘어난다.
       글자(「금액 보기」)는 안 적는다 — 헤더에 들어가면서 자리가 없어졌다. */
    b.hidden = !mkHere();
    b.className = 'mkic' + (hid ? ' off' : '');
    b.innerHTML = hid
      ? IC_EYEOFF
      : IC_EYE + (mkTill > 0 ? '<em class="num">' + mkLeft() + '</em>' : '');
  }
  if (mkShown() && mkTill > 0) {
    if (!mkTimer) mkTimer = setInterval(mkPaint, 1000);
  } else if (mkTimer) { clearInterval(mkTimer); mkTimer = null; }
}
function mkReveal() {
  mkTill = mkCfg().back === '10m' ? Date.now() + MK_MIN : -1;
  mkPaint();
}
function mkHide() { mkTill = 0; mkPaint(); }
/* 설정이 바뀌면 표시 자리 자체가 달라지므로 이때는 다시 그린다. */
function mkApply() { mkTill = 0; render(); mkPaint(); }

/* ───────── PIN 바텀시트 (11b) ─────────
   ⚠️ 전체 화면을 덮지 않는다. 뒤 화면이 딤 너머로 보여야 **무엇을 열려는지**
   알 수 있다. 시트 밖을 누르거나 아래로 밀면 취소 — 취소 버튼은 따로 안 둔다. */
var PIN_MAX = 5, pinTry = 0, pinWait = 0;

function pinFoot() {
  var b = mkCfg().back;
  if (b === 'app') return '앱을 나가면 다시 가려집니다';
  if (b === 'manual') return '직접 끌 때까지 보입니다';
  return '10분 동안 앱 전체 금액이 보입니다';
}

function pinSheet(o) {
  o = o || {};
  var m = el('div', 'mask');
  var sh = el('div', 'sheet pinsh');
  var keys = '';
  for (var n = 1; n <= 9; n++) keys += '<button type="button" data-n="' + n + '">' + n + '</button>';
  /* 좌하단은 **빈 칸**이다. 생체 인증을 안 쓰기로 했으니 자리만 비워 둔다 —
     뭔가를 채우면 그게 눌리는 것처럼 보인다. */
  keys += '<span class="gap"></span>' +
          '<button type="button" data-n="0">0</button>' +
          '<button type="button" class="ic" data-b="1" aria-label="지우기">' + IC_DEL + '</button>';
  sh.innerHTML =
    '<i class="grab"></i>' +
    '<h4>' + esc(o.title || '금액 보기') + '</h4>' +
    '<p class="pdesc">' + esc(o.desc || 'PIN 4자리를 입력하세요') + '</p>' +
    '<div class="dots"><i></i><i></i><i></i><i></i></div>' +
    '<div class="kp">' + keys + '</div>' +
    '<div class="pfn">' + esc(o.foot === undefined ? pinFoot() : o.foot) + '</div>';
  m.appendChild(sh);
  document.body.appendChild(m);
  var done = function () { m.remove(); navClose(); };
  navOpen(function () { m.remove(); });

  var val = '';
  var dots = sh.querySelectorAll('.dots i');
  var sub = sh.querySelector('.pdesc');
  var paint = function () {
    [].forEach.call(dots, function (d, i) { d.classList.toggle('f', i < val.length); });
  };
  var ui = {
    close: done,
    fail: function (msg) {
      sub.textContent = msg || 'PIN이 달라요';
      sh.classList.add('err');
      if (navigator.vibrate) navigator.vibrate(60);
      val = ''; paint();
      setTimeout(function () { sh.classList.remove('err'); }, 340);
    },
    ask: function (t, d) {
      sh.querySelector('h4').textContent = t;
      sub.textContent = d;
      sh.classList.remove('err');
      val = ''; paint();
    }
  };
  m.onclick = function (e) {
    if (e.target === m) return done();
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.b) { val = val.slice(0, -1); sh.classList.remove('err'); return paint(); }
    if (!b.dataset.n || val.length >= 4) return;
    val += b.dataset.n;
    sh.classList.remove('err');
    paint();
    if (val.length === 4) setTimeout(function () { o.check(val, ui); }, 130);
  };
  paint();
  return ui;
}

/* 금액 보기 — 여기만 PIN 을 묻는다. */
function pinAsk() {
  if (pinWait > Date.now()) {
    toast('' + Math.ceil((pinWait - Date.now()) / 1000) + '초 뒤에 다시 해주세요');
    return;
  }
  pinSheet({
    check: function (v, ui) {
      if (pinOk(v)) { pinTry = 0; ui.close(); mkReveal(); return; }
      pinTry++;
      /* ⚠️ 5번 틀려도 **로그아웃시키지 않는다.** 옛 잠금은 그렇게 했는데,
         이건 접근 제어가 아니라 표시 설정이라 그 대가가 과하다. 30초 쉰다. */
      if (pinTry >= PIN_MAX) {
        pinTry = 0; pinWait = Date.now() + 30000;
        ui.close(); toast('5번 틀렸어요 · 30초 뒤에 다시 해주세요');
        return;
      }
      ui.fail('PIN이 달라요 · ' + (PIN_MAX - pinTry) + '번 남음');
    }
  });
}

/* 새 PIN 정하기 — 두 번 받아 맞춘다.
   ⚠️ 끝난 뒤 할 일은 **인자가 아니라 o.done** 으로 받는다. 콜백을 그냥 매개변수로
   받으면 check.py 가 「정의 없는 함수 호출」로 잡는다 — 우회하지 말고 pinSheet 과
   같은 모양(o.check)으로 맞춘다. */
function pinNew(o) {
  o = o || {};
  var first = '';
  pinSheet({
    title: '쓸 PIN 네 자리를 정해주세요',
    desc: '다음 화면에서 한 번 더 확인해요',
    foot: '금액을 볼 때만 물어봅니다',
    check: function (v, ui) {
      if (!first) { first = v; return ui.ask('한 번 더 넣어주세요', '방금 정한 네 자리'); }
      if (v !== first) {
        first = '';
        ui.ask('쓸 PIN 네 자리를 정해주세요', '다음 화면에서 한 번 더 확인해요');
        return ui.fail('두 번이 달라요. 처음부터 다시 넣어주세요');
      }
      pinSet(v); pinTry = 0;
      ui.close();
      if (o.done) o.done();
    }
  });
}

/* 지금 PIN 을 확인한 뒤에만 할 수 있는 일들 (끄기 · 바꾸기). */
function pinVerify(o) {
  pinSheet({
    title: o.title, desc: '지금 쓰는 PIN 네 자리를 넣어주세요', foot: '',
    check: function (v, ui) {
      if (!pinOk(v)) return ui.fail('PIN이 달라요');
      ui.close();
      if (o.done) o.done();
    }
  });
}

/* ═══════════ 리포트 — 재무상태 ═══════════ */
var repAt = 0;
/* 리포트가 없거나 낡았으면 받아 온다. 홈·내역·리포트 세 화면이 같은 응답을
   쓰므로 부르는 자리마다 조건을 따로 쓰면 어긋난다. 한 군데로 모은다. */
function repRefresh() {
  if (repLoading) return;
  if (!ST.rep || Date.now() - repAt > 60000) loadReport(true);
}

function loadReport(silent) {
  if (repLoading) return repLoading;
  var cr = LS.get('rep');
  if (cr && !ST.rep) { ST.rep = cr; repAt = 0; }
  if (!silent && !ST.rep) renderSkeleton();
  repLoading = api('report2', {}).then(function (j) {
    repLoading = null;
    ST.rep = j.data;
    repAt = Date.now();
    /* 잠금이 켜져 있으면 디스크에 안 남긴다 */
    /* ⚠️ 옛 잠금은 PIN 이 켜져 있으면 캐시를 안 남겼다. 지금은 접근 제어가
       아니라 표시 설정이라(위 「금액 가리기」 머리말) 남긴다 — 캐시를 버리면
       리포트가 매번 느려지는데, 그 대가로 얻는 게 이 목적엔 없다. */
    LS.set('rep', j.data);
    /* ⚠️ 예전엔 `if (ST.tab === 'report') render()` 였다. 리포트 응답은
       홈(「앞으로 나갈 돈」 히어로)과 내역(카드 결제·고정지출)에서도 쓰는데,
       그 두 화면은 새 응답이 와도 **다시 안 그렸다.** 그래서 localStorage 에
       남은 **어제치 리포트**가 계속 보였다.

       폴이 청약저축을 장부에 넣었는데도 「앞으로 나갈 돈」에 [등록] 이 그대로
       떠 있던 게 이것이다 (2026-08-07). 서버는 「반영됨」으로 주고 있었고
       화면만 안 바뀌었다. 서버를 아무리 고쳐도 안 보이는 종류의 버그다. */
    if (ST.tab === 'report' || ST.tab === 'home' || ST.tab === 'tx') render();
  }).catch(function (e) {
    repLoading = null;
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요.'); return; }
    if (ST.tab === 'report' && !ST.rep) renderError(e.message);
  });
  return repLoading;
}

/* 큰 금액은 만원 단위로 줄여 읽는다. 5억 8천만원짜리 숫자를
   그대로 두면 폰 화면에서 자릿수를 세게 된다. */
/* 문장 속 금액 — 가릴 수 있게 자리표를 씌운 W(). */
function WM(n) { return mkAmt(W(n)); }
function W(n) {
  var v = Math.round(Math.abs(Number(n) || 0));
  if (v >= 100000000) {
    var eok = Math.floor(v / 100000000);
    var man = Math.round((v % 100000000) / 10000);
    return eok + '억' + (man ? ' ' + C(man) + '만' : '');
  }
  if (v >= 10000) return C(Math.round(v / 10000)) + '만';
  return C(v);
}
function ymLabel2(m) {
  m = toYm(m);
  if (!m) return '';
  return Number(m.slice(5, 7)) + '월';
}

function renderReport() {
  if (!ST.rep) { loadReport(); if (!ST.rep) return; }
  else if (!repLoading && Date.now() - repAt > 60000) loadReport(true);
  var B = (ST.rep && ST.rep.balance) || {};
  var s = $('#screen');
  s.innerHTML = '';
  var wrap = el('div', 'stack');
  /* ⚠️ 낡은 화면은 빈 화면보다 나쁩니다 — 멀쩡해 보이니까요.
     재무상태표 C3(기준월)이 자산 시트보다 뒤처지면 제일 위에서 말합니다. */
  wrap.insertAdjacentHTML('beforeend', mkBarHtml('rep'));
  var st = bsStale(B);
  if (st) {
    var sb = el('div', 'card p18 stale');
    sb.innerHTML = st.kind === 'ym'
      ? '<b>이 숫자들은 ' + esc(ymLabel(st.now)) + ' 것입니다</b>' +
        '<span>자산 시트엔 ' + esc(ymLabel(st.latest)) + ' 까지 들어와 있어요. ' +
        '시트를 한 번 열면 저절로 맞춰집니다 — 안 되면 ' +
        '<b>가계부 › 재무상태표 기준월 최신으로</b>.</span>'
      : '<b>' + esc(ymLabel(st.thisYm)) + ' 자산·부채를 아직 안 적었어요</b>' +
        '<span>지금 보이는 건 ' + esc(ymLabel(st.now)) + ' 숫자입니다. 시트에서 ' +
        '<b>가계부 › 이번 달 자산·부채 줄 만들기</b> 를 누르면 지난달 줄이 복사됩니다 — ' +
        '평가액·잔액만 이번 달 값으로 고쳐 주세요.</span>';
    wrap.appendChild(sb);
  }
  wrap.appendChild(cardNet(B));
  wrap.appendChild(cardTrend(B));
  wrap.appendChild(cardMix('자산 구성', [
    { k: '유동자산', v: B.liquid, hint: '바로 쓸 수 있는 돈', c: 'var(--mint-fill)' },
    { k: '투자자산', v: B.invest, hint: '주식·펀드·코인·연금', c: 'var(--sky-fill)' },
    { k: '실물자산', v: B.real, hint: '부동산·자동차', c: 'var(--butter-fill)' },
    { k: '기타자산', v: B.etc, hint: '위 분류에 없는 항목', c: 'oklch(.88 .01 285)' }
  ], B.asset));
  wrap.appendChild(cardMix('부채 구성', [
    { k: '유동부채', v: B.curDebt, hint: '만기 1년 이내', c: 'var(--coral-bar)' },
    { k: '비유동부채', v: B.longDebt, hint: '만기 1년 초과', c: 'var(--coral-pale)' }
  ], B.debt));
  /* 처방이 먼저, 점수가 나중. 「그래서 뭘 하면 되나」를 보러 오는 화면이다. */
  var hp = cardHealthPlan(B);
  if (hp) wrap.appendChild(hp);
  wrap.appendChild(cardHealth(B));
  /* 「다가오는 카드 결제」는 내역 탭의 '앞으로 나갈 돈' 으로 옮겼다.
     리포트는 지금 얼마 있나(스톡), 저건 앞으로 얼마 나가나(플로우)다. */
  wrap.appendChild(cardRepay(B));
  s.appendChild(wrap);
}

/* ═══ 순자산 — 헤더에서 이어지는 어두운 면 (1.37.0 · 디자인 6b) ═══
   ⚠️ 카드가 아니라 **면**이다. 홈의 히어로와 같은 자리·같은 여백이어야
   화면을 옮겨 다녀도 같은 앱으로 읽힌다. */
function cardNet(B) {
  var c = el('div', 'rhero');
  var d = B.prevDelta;
  var dir = d == null ? '' : (d > 0 ? ' up' : (d < 0 ? ' down' : ''));
  c.innerHTML =
    /* 라벨과 큰 숫자는 **한 줄**이다 (6c 의 `.dnum` 과 같은 규칙).
       기준월 칩만 그 위에 오른쪽으로 붙는다 — 「언제 것인가」는 숫자보다
       먼저 알아야 하는데, 줄을 하나 더 먹을 만큼 큰 말은 아니다. */
    '<div class="rtop"><span class="mchip">' +
      esc(B.asOf ? ymLabel(B.asOf) + ' 기준' : '기준월 없음') + '</span></div>' +
    '<div class="rnum"><span>순자산</span>' +
      '<b class="num' + mkR('h') + '">' + C(B.net) + '</b></div>' +
    /* ⚠️ 배지 문구는 남기고 **금액만** 가린다. 「전월 대비」가 통째로 사라지면
       늘었는지 줄었는지조차 안 보인다 — 그건 가리는 게 아니라 지우는 것이다. */
    (d == null ? '' :
      '<div class="rdlt' + dir + '">전월 대비 <span class="num' + mkR('s') + '">' +
        (d > 0 ? '+' : d < 0 ? '−' : '') + C(d) + '</span></div>') +
    /* 자산·부채는 **가운데 1px 세로선** 하나로 가른다 (홈 히어로와 같은 규칙).
       예전엔 파랑·빨강 알약 두 개였는데, Slate 에서 그 색은 부호다 —
       부채가 늘 빨강이면 「빚이 있다」가 늘 나쁜 일로 읽힌다. */
    '<div class="rab">' +
      '<div class="c"><span>자산</span><b class="num' + mkR('m') + '">' + W(B.asset) + '</b></div>' +
      '<i></i>' +
      '<div class="c"><span>부채</span><b class="num' + mkR('m') + '">' + W(B.debt) + '</b></div>' +
    '</div>';
  return c;
}

/* 순자산만 그린다. 자산(5.8억)까지 한 축에 얹으면 순자산 변동
   800만원이 선 두께에 묻혀서 아무것도 안 보인다. 대신 세로축을
   0 이 아니라 최근 범위로 잡고, 위아래 끝값을 눈금으로 적어
   "0부터가 아니다" 를 숨기지 않는다. */
function trendSvg(tr, lo, hi) {
  var W2 = 340, top = 12, bot = 96, L = 6, R = 6, IW = W2 - L - R;
  var n = tr.length, span = hi - lo || 1;
  var X = function (i) { return n < 2 ? L + IW / 2 : L + (i / (n - 1)) * IW; };
  var Y = function (v) { return bot - (((Number(v) || 0) - lo) / span) * (bot - top); };
  var pts = tr.map(function (o, i) { return X(i).toFixed(1) + ',' + Y(o.net).toFixed(1); }).join(' ');
  var last = tr[n - 1];
  var dots = tr.map(function (o, i) {
    var real = o.kind === '실측';
    return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(o.net).toFixed(1) +
      '" r="' + (real ? 4.5 : 2.6) + '" fill="' + (real ? 'var(--mint-ink)' : '#fff') +
      '" stroke="var(--mint-ink)" stroke-width="' + (real ? 2 : 1.6) + '"/>';
  }).join('');
  return '<svg viewBox="0 0 ' + W2 + ' 106" width="100%" height="106" preserveAspectRatio="none">' +
    '<line x1="0" y1="' + top + '" x2="' + W2 + '" y2="' + top + '" stroke="var(--grid)" stroke-width="1"/>' +
    '<line x1="0" y1="' + ((top + bot) / 2) + '" x2="' + W2 + '" y2="' + ((top + bot) / 2) +
      '" stroke="var(--grid)" stroke-width="1" stroke-dasharray="3 4"/>' +
    '<line x1="0" y1="' + bot + '" x2="' + W2 + '" y2="' + bot + '" stroke="var(--grid2)" stroke-width="1"/>' +
    '<polygon points="' + X(0).toFixed(1) + ',' + bot + ' ' + pts + ' ' +
      X(n - 1).toFixed(1) + ',' + bot + '" fill="oklch(.82 .07 165/.18)"></polygon>' +
    '<polyline points="' + pts + '" fill="none" stroke="var(--mint-ink)" stroke-width="2.5" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' + dots +
    '</svg>';
}

function cardTrend(B) {
  var tr = (B.trend || []).slice();
  var c = el('div', 'card chart rtrend');
  if (tr.length < 2) {
    c.innerHTML = '<div class="ct"><h3>순자산 추이</h3></div>' +
      '<div class="empty">아직 비교할 달이 없어요</div>';
    return c;
  }
  var vals = tr.map(function (o) { return Number(o.net) || 0; });
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  var pad = Math.max((mx - mn) * 0.35, Math.abs(mx) * 0.004, 1);
  var lo = mn - pad, hi = mx + pad;
  var first = vals[0], last = vals[vals.length - 1];
  var diff = last - first;
  var est = tr.filter(function (o) { return o.kind !== '실측'; }).length;
  c.innerHTML =
    '<div class="ct"><h3>순자산 추이</h3>' +
      '<span class="sub' + (diff > 0 ? ' up' : diff < 0 ? ' down' : '') + '">' +
      tr.length + '개월 <span class="num' + mkR('s') + '">' +
      (diff >= 0 ? '+' : '−') + W(diff) + '</span>원</span></div>' +
    /* ⚠️ 가리는 건 **세로축 금액 라벨**뿐이다. 곡선과 점은 그대로 둔다 —
       「늘고 있나」는 금액이 아니라 모양이고, 그건 가릴 이유가 없다. */
    '<div class="tw">' +
      '<div class="yax"><span class="yv' + mkR('x') + '">' + W(hi) + '</span>' +
        '<span class="yv' + mkR('x') + '">' + W(lo) + '</span></div>' +
      trendSvg(tr, lo, hi) +
    '</div>' +
    '<div class="xax">' + tr.map(function (o) {
      return '<span>' + esc(ymLabel2(o.m)) + '</span>';
    }).join('') + '</div>' +
    '<div class="lg">세로축은 0이 아니라 최근 범위입니다' +
      (est ? '<em>속 빈 점 ' + est + '개는 역산 추정치</em>' : '') + '</div>';
  return c;
}

function cardMix(title, items, total) {
  var t = Number(total) || items.reduce(function (a, b) { return a + (Number(b.v) || 0); }, 0);
  var live = items.filter(function (o) { return (Number(o.v) || 0) > 0; });
  var c = el('div', 'card p18');
  c.innerHTML =
    '<div class="ct"><h3>' + esc(title) + '</h3><span class="sub"><span class="num' +
      mkR('m') + '">' + W(t) + '</span>원</span></div>' +
    (live.length
      ? '<div class="mixbar">' + live.map(function (o) {
          return '<i style="width:' + (t ? ((o.v / t) * 100).toFixed(2) : 0) +
                 '%;background:' + o.c + '"></i>';
        }).join('') + '</div>' +
        '<div class="mixlist">' + live.map(function (o) {
          return '<div class="mrow">' +
            '<span class="dot" style="background:' + o.c + '"></span>' +
            '<span class="k">' + esc(o.k) + '<em>' + esc(o.hint) + '</em></span>' +
            '<span class="v num' + mkR('l') + '">' + C(o.v) + '</span>' +
            /* ⚠️ 비율(%)은 안 가린다. 구성이 어떻게 생겼는지는 남겨야 한다 —
               그게 이 화면의 뜻이고, 금액 없이도 읽힌다. */
            '<span class="p num">' + (t ? Math.round(o.v / t * 100) : 0) + '%</span>' +
          '</div>';
        }).join('') + '</div>'
      : '<div class="empty">잡힌 금액이 없어요</div>');
  return c;
}

/* 지표마다 좋은 방향이 반대다. 부채비율은 낮을수록, 유동비율은
   높을수록 좋다. good 에 방향을 넣고 판정은 한 곳에서 한다. */
function healthRows(B) {
  return [
    /* ⚠️ hint 에 「40% 미만 권장」처럼 권장선을 또 적지 말 것.
       바로 뒤에 '· 권장 40%' 가 자동으로 붙어서 두 번 나온다. */
    { k: '부채비율', v: B.debtRatio, fmt: 'pct', good: 'low', line: 0.4,
      hint: '부채 ÷ 자산 · 낮을수록 안전' },
    { k: '자기자본비율', v: B.equityRatio, fmt: 'pct', good: 'high', line: 0.6,
      hint: '순자산 ÷ 자산 · 높을수록 안전' },
    { k: '유동비율', v: B.currentRatio, fmt: 'pct', good: 'high', line: 1,
      hint: '유동자산 ÷ 유동부채 · 높을수록 안전' },
    { k: '현금성 개월수', v: B.cashMonths, fmt: 'mon', good: 'high', line: 3,
      hint: '유동자산 ÷ 월평균 지출 · 6개월이면 넉넉' }
  ];
}
/* ───────── 건전성: 「그래서 뭘 하면 되는가」 ─────────
   폴 2026-08-07: 「어느 부분을 어떻게 해야 건전성이 양호할 수 있을지
   알려주면 좋을 것 같아.」

   점수만 띄우는 화면은 아무것도 안 바꿉니다. 매달 「나쁨」을 확인만 하게
   되니까요. 그래서 지표마다 **얼마가 모자란지**와 **지금 속도면 언제 닿는지**를
   같이 적습니다.

   ⚠️ 권장선은 일반 기준 그대로 둡니다(폴 결정 2026-08-07). 주담대가 있는
   집에서 부채비율 40%·유동비율 100%는 사실상 못 닿는 목표지만, 기준을 몰래
   낮추면 그건 더 이상 기준이 아닙니다. 대신 **왜 높게 나오는지**를 붙입니다. */

/* 지금 순자산이 느는 속도(월). 자산추이 구간의 기울기다.
   ⚠️ 마지막 두 점만 보면 한 달 튐에 통째로 휘둘린다. 처음과 끝을 개월수로 나눈다.
   줄고 있으면 null — 「언제 닿는지」를 낼 수 없다. 지어내지 않는다. */
function netSpeed(B) {
  var t = (B.trend || []).filter(function (x) { return x && x.net != null; });
  if (t.length < 2) return null;
  var v = (t[t.length - 1].net - t[0].net) / (t.length - 1);
  return v > 0 ? v : null;
}
/* 그 속도를 잰 구간이 실측인가 추정인가.
   ⚠️ 자산추이는 Phase0 에서 **역산한 추정치**가 대부분입니다(2026-08 만 실측).
   숨기고 「약 3.3년」이라고만 적으면 없는 정확도를 파는 것입니다.
   실측이 쌓이면 이 꼬리표는 저절로 사라집니다. */
function speedIsEst(B) {
  var t = ((B || {}).trend || []).filter(function (x) { return x && x.net != null; });
  if (t.length < 2) return false;
  return t.some(function (x) { return String(x.kind || '').trim() !== '실측'; });
}
/* 화면이 낡았나. 두 가지로 낡는다 — 그리고 **둘 다 겉으론 멀쩡해 보인다.**
     'ym'   기준월(C3)만 뒤처짐 — 자산 시트엔 새 달이 들어왔는데 안 가리키고 있다
     'data' 자산 시트 자체가 이번 달로 안 왔다 ← 이쪽이 훨씬 흔하다

   ⚠️ 'data' 를 안 보면 아무것도 못 잡습니다. `월스냅샷()` 은 자산·부채 시트를
   **읽기만** 합니다 — 새 달 줄은 사람이 만듭니다(자산 시트 2행의 규칙).
   폴이 그걸 안 하면 asOf 도 asOfLatest 도 지난달이라 'ym' 판정은 조용합니다. */
function bsStale(B, todayYm) {
  var a = String((B || {}).asOf || '').trim();
  var l = String((B || {}).asOfLatest || '').trim();
  var ok = function (s) { return /^\d{4}-\d{2}$/.test(s); };
  if (!ok(a)) return null;
  if (ok(l) && l > a) return { kind: 'ym', now: a, latest: l };
  var t = todayYm || (todayYmd() || '').slice(0, 7);
  /* 최신 자료가 이번 달보다 뒤면 이번 달 자산·부채를 아직 안 적은 것이다.
     ⚠️ 지난 달을 일부러 보고 있을 때는 안 띄운다(asOf 가 이번 달 이후). */
  if (ok(t) && ok(l) && l < t && a <= l) return { kind: 'data', now: a, thisYm: t };
  return null;
}
/* need 원을 월 speed 로 채우면 얼마나 걸리나. 딱지에 넣을 짧은 말.
   속도를 낼 수 없으면 빈 문자열 — 지어내지 않는다. */
function tillShort(need, speed) {
  if (!(speed > 0) || !(need > 0)) return '';
  var mo = Math.ceil(need / speed);
  if (mo > 600) return '지금 속도로는 사실상 안 닿음';
  return '약 ' + (mo >= 24 ? (Math.round(mo / 12 * 10) / 10) + '년' : mo + '개월');
}
/* 전월 대비. 자산추이에는 자산·부채·순자산만 있어서 이 둘만 낼 수 있다.
   유동자산 이력이 없으니 유동비율·현금성은 안 낸다 — 지어내면 그때부터
   화면 전체를 못 믿게 된다. */
function healthPrev(o, B) {
  var t = B.trend || [];
  if (t.length < 2) return null;
  var p = t[t.length - 2];
  if (!p || !p.asset) return null;
  if (o.k === '부채비율') return o.v - (p.debt / p.asset);
  if (o.k === '자기자본비율') return o.v - (p.net / p.asset);
  return null;
}
/* ───────── 종합 진단 ─────────
   폴 2026-08-07: 「항목마다 각각 금액을 계산·추천해주고 있어서 혼란스럽거든.
   별도 영역으로 빼서 종합 진단해서 총 얼마를 모아야 되고, 어떻게 하는 게
   효과적인지를 제공해주면 정말 좋을 것 같아.」

   ⚠️ 지표마다 금액을 따로 적은 게 왜 나빴나 — **더하면 안 되는 숫자들**이었습니다.
   현금성 3개월에 필요한 995만원은 유동비율 100%에 필요한 5,673만원 **안에 이미
   들어 있습니다.** 둘 다 「유동자산을 더 모아라」는 같은 말이니까요. 그걸 나란히
   놓으면 사람은 6,668만원이 필요하다고 읽습니다. 그래서 한 줄로 합칩니다:

       필요한 유동자산 = max(3개월치 지출, 유동부채)
       모아야 할 돈    = 그것 − 지금 유동자산

   부채비율은 **모아서 해결되는 게 아닙니다.** 원금이 줄면서 시간이 해결합니다.
   그래서 「모아야 할 돈」에 안 넣고 따로 적습니다. 자기자본비율은 부채비율의
   뒷면(둘을 더하면 늘 100%)이라 애초에 한 항목입니다 — 넷처럼 보이지만 셋입니다. */
function healthPlan(B) {
  var rows = healthRows(B).filter(function (o) { return o.v != null; });
  if (!rows.length) return null;
  var R = {};
  rows.forEach(function (o) { R[o.k] = o; });
  var isOk = function (o) { return o.good === 'low' ? o.v <= o.line : o.v >= o.line; };
  var okCnt = rows.filter(isOk).length;

  var liq = B.liquid || 0, cd = B.curDebt || 0;
  var cm = R['현금성 개월수'], cr = R['유동비율'], dr = R['부채비율'];
  /* 월평균지출은 역산한다: 개월수 = 유동자산 ÷ 월평균지출 */
  var mSpend = (cm && cm.v > 0) ? liq / cm.v : 0;
  var wantCash = mSpend ? cm.line * mSpend : 0;      /* 3개월치 */
  var wantCur = cr ? cd : 0;                          /* 유동부채만큼 */
  var want = Math.max(wantCash, wantCur);
  var need = Math.max(0, want - liq);                 /* ← 하나로 합친 목표 */
  var needCash = Math.max(0, wantCash - liq);
  var sp = netSpeed(B), steps = [];

  /* ① 곧 만기가 오는 빚. 이게 유동비율의 정체다.
     ⚠️ 예전엔 「만기를 확인해 보세요, 분류가 잘못됐을 수 있습니다」라고 적었다.
     시트를 안 보고 한 추측이었고 **틀렸다** — 부채 시트엔 만기일(H열)이 이미 있었고,
     토스뱅크대환은 정말 1년 안에 온다. 유동비율 16.7% 는 계산 착오가 아니라
     진짜 상황이었다. 이제 시트가 말하는 대로 적는다. */
  var ds = (B.dueSoon || []).filter(function (x) { return x && x.amt > 0; });
  if (cr && !isOk(cr) && cd > 0) {
    var big = ds.slice().sort(function (a, b) { return b.amt - a.amt; })[0];
    if (big) {
      var mo = Math.max(0, Math.round(big.days / 30.4 * 10) / 10);
      steps.push({
        cost: big.due + ' · ' + (big.days < 0 ? '이미 지남' : mo + '개월 뒤'), eff: 1,
        t: big.name + ' ' + WM(big.amt) + '원을 어떻게 할지 정하세요',
        d: (/이자만/.test(big.memo || '')
             ? '메모에 「' + big.memo + '」라고 돼 있습니다 — 원금을 안 갚고 있으니 만기에 ' +
               WM(big.amt) + '원이 **통째로** 옵니다. ' : '') +
           '갚을지·연장할지·다른 대출로 갈아탈지를 미리 정해두면 그때 급하게 고르지 않아도 됩니다. ' +
           '유동비율이 낮은 건 계산 착오가 아니라 이 빚 때문입니다.'
      });
    } else {
      steps.push({
        cost: '0원 · 지금', eff: 1,
        t: '유동부채 ' + WM(cd) + '원의 만기를 부채 시트에 적어 주세요',
        d: '만기일(H열)이 있어야 「언제 얼마가 오는지」를 말씀드릴 수 있습니다. ' +
           '만기가 1년 넘게 남은 대출이 유동부채에 섞여 있다면 그것도 여기서 드러납니다.'
      });
    }
  }
  /* ② 현금성 3개월 — 모으는 일 중 제일 먼저. 이게 얇으면 결국 빚을 낸다. */
  if (cm && !isOk(cm) && needCash > 0) {
    var t2 = tillShort(needCash, sp);
    steps.push({
      cost: WM(needCash) + '원' + (t2 ? ' · ' + t2 : ''), eff: 2,
      t: '먼저 ' + cm.line + '개월치 생활비를 쌓으세요',
      d: '월평균 지출이 ' + WM(mSpend) + '원이라 ' + cm.line + '개월치는 ' +
         WM(cm.line * mSpend) + '원입니다. 지금 ' + WM(liq) + '원이 있으니 ' +
         WM(needCash) + '원이 모자랍니다. 갑자기 돈 쓸 일이 생겼을 때 빚을 안 내게 되는 최소선입니다.'
    });
  }
  /* ③ 유동비율 — ②의 금액을 포함한 누적치다. 별개의 돈이 아니다. */
  if (cr && !isOk(cr) && need > needCash) {
    var t3 = tillShort(need, sp);
    steps.push({
      cost: WM(need) + '원' + (t3 ? ' · ' + t3 : ''), eff: 3,
      t: '그다음 유동비율 100%',
      d: '위 ' + WM(needCash) + '원을 **포함한** 누적 금액입니다 — 따로 더 모으는 돈이 아닙니다. ' +
         '유동부채를 그만큼 줄여도 같은 효과입니다.'
    });
  }
  /* ④ 부채비율 — 모으는 게 아니라 시간이 해결한다. 할 일이 없다는 것도 답이다. */
  if (dr && !isOk(dr)) {
    var repay = (B.debt - dr.line * B.asset) / (1 - dr.line);
    var t4 = tillShort(repay, B.repayMonthly);
    steps.push({
      cost: '이미 진행 중', eff: 4, done: true,
      t: '부채비율은 원금상환이 해결합니다',
      d: '지금 ' + pct(dr.line) + '% 가 되려면 부채를 ' + WM(repay) + '원 더 갚아야 하지만, ' +
         '주담대가 있는 집은 이 수치가 높은 게 정상입니다.' +
         (B.repayMonthly > 0
           ? ' 매달 ' + WM(B.repayMonthly) + '원씩 원금이 줄고 있어 이 속도면 ' +
             (t4 || '오래') + ' 걸립니다.' : '') +
         ' 따로 하실 일은 없습니다 — 자기자본비율은 이것의 뒷면이라 같이 좋아집니다.'
    });
  }

  return { okCnt: okCnt, total: rows.length, need: need, needCash: needCash,
           want: want, mSpend: mSpend, speed: sp, est: speedIsEst(B), steps: steps,
           byCash: (cr && !isOk(cr)) || (cm && !isOk(cm)) };
}

function cardHealthPlan(B) {
  var P = healthPlan(B);
  if (!P) return null;
  var c = el('div', 'card p18 hplan');
  var head;
  if (!P.steps.length) {
    head = '<div class="hpz">네 지표가 모두 권장선 안입니다. 지금 하시는 대로 두세요.</div>';
  } else if (P.need > 0) {
    head =
      '<div class="hpk">모아야 할 돈</div>' +
      '<div class="hpv num' + mkR('h') + '">' + W(P.need) + '<i>원</i></div>' +
      '<div class="hpd">유동자산 기준입니다. <b>이 한 금액으로 유동비율과 현금성이 같이 해결됩니다</b> — ' +
        '두 지표에 필요한 돈은 따로가 아니라 겹칩니다.' +
        (P.speed ? ' 지금 순자산 느는 속도(월 ' + WM(P.speed) + '원)면 약 ' +
          (function () {
            var mo = Math.ceil(P.need / P.speed);
            return mo >= 24 ? (Math.round(mo / 12 * 10) / 10) + '년' : mo + '개월';
          })() + '.' : '') +
      '</div>' +
      /* 「약 N개월」의 근거를 밝힌다. 지어낸 정확도를 팔지 않는다. */
      (P.speed && P.est
        ? '<div class="hpe">「약 …」은 자산추이의 순자산 기울기로 잰 값입니다. ' +
          '지금 그 구간은 대부분 <b>역산한 추정치</b>라 참고용입니다 — 매달 실측이 한 줄씩 ' +
          '쌓이면 정확해집니다.</div>'
        : '');
  } else {
    head = '<div class="hpz">더 모을 돈은 없습니다. 남은 건 시간이 해결합니다.</div>';
  }
  c.innerHTML =
    '<div class="ct"><h3>종합 진단</h3><span class="sub">' +
      P.total + '개 중 ' + P.okCnt + '개 양호</span></div>' +
    mkFill(head) +
    (P.steps.length
      ? '<div class="hpl">' + P.steps.map(function (s, i) {
          return '<div class="hps' + (s.done ? ' done' : '') + '">' +
            '<span class="n">' + (i + 1) + '</span>' +
            '<div class="b"><div class="t">' + mkFill(esc(s.t)) +
              '<em>' + mkFill(esc(s.cost)) + '</em></div>' +
              /* 「포함한」 처럼 오해를 끊는 낱말만 굵게. 그 외엔 안 쓴다. */
              '<div class="d">' + mkFill(esc(s.d)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</div>' +
            '</div></div>';
        }).join('') + '</div>'
      : '');
  return c;
}

function cardHealth(B) {
  var rows = healthRows(B).filter(function (o) { return o.v != null; });
  var c = el('div', 'card p18');
  c.innerHTML =
    '<div class="ct"><h3>건전성</h3><span class="sub">빨간 칸이 권장선과의 차이예요</span></div>' +
    '<div class="hlt">' + rows.map(function (o) {
      var ok = o.good === 'low' ? o.v <= o.line : o.v >= o.line;
      var val = o.fmt === 'pct' ? pct(o.v) + '%' : (Math.round(o.v * 10) / 10) + '개월';
      var lim = o.fmt === 'pct' ? pct(o.line) + '%' : o.line + '개월';
      /* 막대는 값을 그대로 그린다. 권장선(흰 눈금)이 60% 지점에 오도록
         자만 맞춘다. 그리고 권장선까지 모자란 만큼, 또는 권장선을 넘긴
         만큼을 빨갛게 칠한다. '빨간 칸이 있으면 나쁘다' 로 읽히니까
         부채비율만 거꾸로 그리는 꼼수가 더는 필요 없다. */
      var w = clamp((o.v / (o.line || 1)) * 60, 0, 100);
      var barW, gapL, gapW;
      if (o.good === 'low') {
        /* 넘긴 만큼이 빨강 — 막대 오른쪽에 덧붙는다 */
        barW = Math.min(w, 60);
        gapL = 60; gapW = Math.max(0, w - 60);
      } else {
        /* 모자란 만큼이 빨강 — 막대 끝부터 권장선까지 */
        barW = w;
        gapL = w; gapW = Math.max(0, 60 - w);
      }
      /* 전월 대비. 좋은 방향으로 움직였으면 초록. 낼 수 없으면 안 낸다. */
      var dv = healthPrev(o, B), dl = '';
      if (dv != null && Math.abs(dv) >= 0.001) {
        var better = o.good === 'low' ? dv < 0 : dv > 0;
        dl = '<span class="dl' + (better ? ' up' : ' dn') + '">전월 ' +
          (dv > 0 ? '+' : '−') + (Math.round(Math.abs(dv) * 1000) / 10) + '%p</span>';
      }
      /* ⚠️ 여기에 「이렇게 하세요」를 줄마다 붙이지 마세요. 2026-08-07 에 그렇게 했다가
         폴이 「항목마다 각각 금액을 계산·추천해서 혼란스럽다」고 했습니다. 지표별 금액은
         서로 겹쳐서 더하면 안 되는 숫자들입니다. 처방은 위의 **종합 진단 카드 한 곳**에만. */
      return '<div class="hrow">' +
        '<div class="l1"><span class="nm">' + esc(o.k) + '</span>' + dl +
          '<span class="vv' + (ok ? ' ok' : ' no') + ' num">' + val + '</span></div>' +
        '<div class="hbar"><i style="width:' + barW.toFixed(1) + '%"></i>' +
          (gapW > 0.4 ? '<b style="left:' + gapL.toFixed(1) + '%;width:' +
            gapW.toFixed(1) + '%"></b>' : '') +
          '<u style="left:60%"></u></div>' +
        '<div class="hh">' + esc(o.hint) + ' · 권장 ' + lim + '</div>' +
      '</div>';
    }).join('') + '</div>';
  return c;
}

/* ⚠️ 내역 탭의 「앞으로 나갈 돈」 카드(`cardDueAll`·`dueCardsHtml`·`dueFixHtml`·
   `dueSplitHtml`)는 1.27.0 에 걷어냈습니다. 같은 내용이 **홈 인라인 패널**로
   옮겨갔고, 두 곳에 두면 한쪽만 고치는 사고가 납니다.
   등록·무시 동작(`fixedAdd`/`fixedSkip`)은 그대로 홈에서 씁니다. */

/* 고정비를 장부에 넣는다. 장부에 쓰는 동작이라 넣기 전에 무엇이 들어가는지
   그대로 보여주고 한 번 물어본다. 되돌리려면 내역에서 지워야 한다. */
function fixedAdd(name) {
  var FX = (ST.rep || {}).fixedLeft || {};
  var it = (FX.items || []).filter(function (x) { return x.name === name; })[0];
  if (!it || it.done) return;
  var ym = FX.ym || ST.ym;
  var d = Math.min(it.day, daysInMonth(ym));
  var date = ym + '-' + (d < 10 ? '0' + d : String(d));
  var cat = it.cat || '기타지출';
  if (!confirm('아래 내용으로 장부에 넣을까요?\n\n' +
      date + '\n' + it.name + ' · ' + cat + '\n' +
      (it.pay || '결제수단 미지정') + '\n' + C(it.amt) + '원' +
      (it.cat ? '' : '\n\n(고정비 시트에 대분류가 비어 있어 기타지출로 넣습니다)'))) return;

  it.done = true; it.late = false; it.near = false;   /* 화면부터 맞춘다 */
  fixedRetot(FX);
  render();
  toast(C(it.amt) + '원 넣었어요');

  api('add2', {
    date: date, gubun: '지출', cat: cat, desc: it.name,
    pay: it.pay || '', amt: it.amt, fixed: 1, merchant: it.name,
    /* 멱등키에 시각을 넣는다. 달·이름만 쓰면 15분 캐시가 재시도를 삼켜서,
       한 번 실패한 뒤 다시 눌러도 조용히 아무 일도 안 일어난다. */
    n: 'fx.' + ym + '.' + it.name + '.' + Date.now()
  }).then(function () {
    refreshAll();
    /* 서버가 거래내역을 다시 보고 done 을 매기게 한다. 화면은 이미
       맞춰 놨지만, 시트가 진실이라 한 번 되받아 확인해 둔다. */
    loadReport(true);
  }).catch(function (e) {
    /* auth 라고 조용히 넘기면 안 된다. 예전엔 여기서 return 해버려서
       화면은 「반영됨」인데 장부엔 없는 상태가 만들어졌고, 나중에
       리포트를 다시 받으면 [등록]으로 되돌아왔다. 실패는 반드시 보인다. */
    it.done = false; fixedRetot(FX); render();
    toast(e && e.message === 'auth'
      ? '로그인이 풀려 저장을 못 했어요 · 다시 로그인한 뒤 눌러주세요'
      : '저장 실패 — ' + ((e && e.message) || '다시 시도해주세요'));
  });
}

/* 합계·건수는 done·skip 을 뺀 나머지다. 세 군데서 같은 계산을 하고 있었다. */
function fixedRetot(FX) {
  var items = FX.items || [];
  FX.amt = items.reduce(function (a, x) { return a + (x.done || x.skip ? 0 : x.amt); }, 0);
  FX.n = items.filter(function (x) { return !x.done && !x.skip; }).length;
}

/* 이 달엔 안 나가는 항목을 손으로 뺀다. 되돌릴 수 있게 목록에는 남긴다.
   자동 판정이 못 잡는 경우(이름이 아주 다르거나, 올해만 건너뛰는 건)를
   사람이 끝낼 수 있어야 목록이 계속 지저분해지지 않는다. */
function fixedSkip(name, on) {
  var FX = (ST.rep || {}).fixedLeft || {};
  var it = (FX.items || []).filter(function (x) { return x.name === name; })[0];
  if (!it) return;
  var ym = FX.ym || ST.ym;
  it.skip = !!on;
  if (on) { it.late = false; it.near = false; }
  fixedRetot(FX);
  render();
  api('fxSkip', { ym: ym, name: name, on: on ? 1 : 0 })
    .then(function () { loadReport(true); })
    .catch(function (e) {
      it.skip = !on; fixedRetot(FX); render();
      toast('바꾸지 못했어요 — ' + ((e && e.message) || '다시 시도해주세요'));
    });
}

function cardRepay(B) {
  var c = el('div', 'card p18');
  var dsrOk = B.dsr == null || B.dsr <= 0.4;
  c.innerHTML =
    '<div class="ct"><h3>상환 부담</h3><span class="sub">원리금 기준</span></div>' +
    '<div class="rpy">' +
      '<div><span>월 상환액</span><b class="num' + mkR('l') + '">' + C(B.repayMonthly) + '</b></div>' +
      '<div><span>향후 12개월</span><b class="num' + mkR('l') + '">' + C(B.repay12) + '</b></div>' +
      '<div><span>DSR</span><b class="num' + (dsrOk ? '' : ' no') + '">' +
        (B.dsr == null ? '—' : pct(B.dsr) + '%') + '</b></div>' +
    '</div>' +
    '<div class="rpyh">DSR은 월 상환액 ÷ 월평균 수입입니다. 40%를 넘으면 새 대출이 어려워집니다.</div>';
  return c;
}

/* ═══════════ 설정 ═══════════ */
/* 설정에는 월 개념이 없다. 월 이동 헤더가 남아 있던 건 그냥 잔재다.
   행 6개를 한 카드에 섞어두지 않고 성격별로 세 묶음으로 나눈다. */
/* ───────── 설정 · 금액 가리기 (11c) ─────────
   ⚠️ 잠금 화면 설정이 아니라 **표시 설정**이라 「보안」이 아니라 「표시」에 둔다.
   여기 있는 걸 「앱 잠그기」로 읽으면 기대가 어긋난다. */
var MK_WHERE = [
  ['rep', '리포트', '전체 금액'],
  ['home', '홈', '수입만'],
  ['tx', '내역', '수입 거래만']
];
var MK_BACK = [['app', '앱 나가면'], ['10m', '10분 뒤'], ['manual', '직접 끌 때']];

function maskGrpHtml() {
  var m = mkCfg(), on = mkOn();
  var body =
    '<button data-k="mkon" class="swrow">' +
      '<span>금액 가리기<em>항목과 비율은 그대로 보여요</em></span>' +
      '<i class="sw' + (on ? ' on' : '') + '" aria-hidden="true"></i></button>';
  if (on) {
    body +=
      /* ⚠️ 1.35.0 — 「PIN + ●●●●」 두 줄이던 걸 **한 줄**로 (디자인 7b).
         점 네 개는 「네 자리」라는 정보를 주는데, 그건 눌러서 바꿀 때 어차피 보인다. */
      '<button data-k="mkpin" class="srow">' +
        '<span>PIN 변경</span><em>설정됨<i>›</i></em></button>' +
      /* ⚠️ 1.35.0 — 체크 목록에서 **칩**으로 (디자인 7b). 고른 것만 보라로 찹니다.
         ⚠️ 「최소 한 곳은 남습니다」를 적어 둡니다 — 마지막 하나를 끄려 하면
         막히는데, 왜 안 꺼지는지 화면에 안 적혀 있으면 고장으로 읽힙니다. */
      '<div class="mkgrid chips"><b>가릴 곳</b>' +
        MK_WHERE.map(function (w) {
          /* 칩 하나에 「어디를 · 무엇을」이 다 들어가야 한다. 「리포트」만 적으면
             리포트가 통째로 가려지는 줄 안다 — 가리는 건 금액뿐이다. */
          return '<button data-k="mkw" data-w="' + w[0] + '" class="' +
            (m[w[0]] ? 'on' : '') + '"><span>' + esc(w[1] + ' ' + w[2]) + '</span>' +
            '<em>' + esc(w[2]) + '</em><i class="ck">' + IC_CHK + '</i></button>';
        }).join('') +
        '<span class="mkn">최소 한 곳은 남습니다. ' +
          '항목 이름·비율·그래프는 가려도 남습니다.</span>' +
      '</div>' +
      '<div class="mkgrid"><b>다시 가리기</b><div class="segs">' +
        MK_BACK.map(function (x) {
          return '<button data-k="mkb" data-b="' + x[0] + '" class="' +
            (m.back === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</button>';
        }).join('') +
      '</div>' +
      (m.back === '10m'
        ? '<span class="mkn">화면을 끄거나 앱을 최근 목록에 두고 나가도 시간은 계속 흐릅니다.</span>'
        : '') +
      '</div>';
  }
  return '<div class="sgh">표시</div><div class="mkset">' + body + '</div>';
}

/* ⚠️ **끄는 것도 PIN 을 묻는다.** 끄면 금액이 드러나니까 — 「가릴 땐 인증 없이」는
   가리는 쪽 얘기지 푸는 쪽 얘기가 아니다. */
function maskTap(k, b) {
  var m = mkCfg();
  if (k === 'mkon') {
    if (mkOn()) return pinVerify({ title: '금액 가리기 끄기', done: function () {
      mkCfgSet({ on: 0 }); mkApply(); toast('금액 가리기를 껐어요');
    } });
    if (pinHas()) { mkCfgSet({ on: 1 }); mkApply(); return toast('금액 가리기를 켰어요'); }
    return pinNew({ done: function () {
      mkCfgSet({ on: 1 }); mkApply(); toast('금액 가리기를 켰어요');
    } });
  }
  if (k === 'mkpin') return pinVerify({ title: 'PIN 바꾸기', done: function () {
    pinNew({ done: function () { toast('PIN을 바꿨어요'); } });
  } });
  if (k === 'mkw') {
    var w = b.dataset.w;
    /* 세 곳을 다 끄면 켜 둔 의미가 없다. 마지막 하나는 못 끄게 막는다. */
    var live = MK_WHERE.filter(function (x) { return m[x[0]]; });
    if (m[w] && live.length <= 1) return toast('한 곳은 남겨두세요');
    var pat = {}; pat[w] = m[w] ? 0 : 1;
    mkCfgSet(pat); mkApply();
    return;
  }
  if (k === 'mkb') { mkCfgSet({ back: b.dataset.b }); mkApply(); return; }
}

function renderSettings() {
  document.body.classList.add('setmode');
  var s = $('#screen');
  var acc = ((ST.boot && ST.boot.accounts) || []).length;
  var me = ST.me || '—';
  var cnt = (ST.tx && ST.tx.sum && ST.tx.sum.count) || 0;
  /* ═══ 1.35.0 · Slate 7b ═══
     카드를 걷고 **띠 머리 + 1px 선**으로만 나눕니다. 그룹 머리(`.sgh`)는 8px 띠와
     같은 면색이라 목록이 그룹마다 한 번씩 숨을 쉽니다.
     ⚠️ 누르는 방식(`data-k`)은 하나도 안 바꿉니다 — 겉만 옮깁니다. */
  var grp = function (title, rows, right) {
    return '<div class="sgh">' + esc(title) +
      (right ? '<i>' + right + '</i>' : '') + '</div>' + rows;
  };
  var row = function (k, name, val, cls) {
    return '<button class="srow' + (cls ? ' ' + cls : '') + '" data-k="' + esc(k) + '">' +
      '<span>' + esc(name) + '</span><em>' + esc(val) + '<i>›</i></em></button>';
  };
  var hb = hbLine();
  var c = ST.chk || {};
  var chkAt = c.at ? ago(c.at) : '';
  var verTxt, verCls;
  if (updPending())      { verTxt = APP_V + ' · 새 ' + c.ver + ' 있음'; verCls = 'hotv'; }
  else if (c.err)        { verTxt = APP_V + ' · ' + c.err;              verCls = 'wait'; }
  else if (c.ver)        { verTxt = APP_V + ' · 최신';                  verCls = 'ok'; }
  else                   { verTxt = APP_V + ' · 확인 전';               verCls = 'wait'; }
  s.innerHTML =
    /* 어두운 면 — 헤더에서 이어진다. 제목과 프로필이 한 덩어리다. */
    '<div class="sethd">' +
      '<b class="st">설정</b>' +
      '<button class="setme" data-k="who">' +
        '<span class="av">' + esc(me.slice(0, 1)) + '</span>' +
        '<span class="l"><b>' + esc(me) + '</b><em>' +
          (ST.who ? esc(ST.who) + ' 계좌만 보는 중' : '가구 전체를 보는 중') +
        '</em></span><span class="cv">›</span>' +
      '</button>' +
    '</div>' +
    '<div class="setwrap">' +
      grp('보기',
        row('who', '보는 대상', ST.who || WHO_ALL) +
        row('bud', '월별 목표 금액',
          ((ST.month || {}).pace || {}).budget
            ? C(ST.month.pace.budget) +
              (ST.month.pace.budChanged ? ' · 바꿈' : '')
            : '—')) +
      grp('결제 알림',
        row('inbox', '결제 알림 확인',
          ST.inbox.length ? inboxWhoCount(ST.inbox) + ' 대기' : '대기 없음')) +
      /* 「알림 연결 확인」과 「버전 확인」이 따로 떨어져 있으면 둘 다
         뜬금없다. 「이 앱이 지금 제대로 돌고 있나」는 하나의 질문이다.
         그리고 사람이 매번 눌러야 하는 확인은 결국 안 하게 되므로,
         앱을 열 때와 한 시간이 지났을 때 스스로 돈다. */
      grp('점검',
        '<button class="srow" data-k="health"><span>알림 연결</span>' +
          '<em class="s ' + hb.cls + '">' + esc(hb.txt) + '<i>›</i></em></button>' +
        /* 알림 표시는 제목 바로 오른쪽 점 하나. 처음엔 줄 왼쪽에 세로
           막대를 그었는데, 무슨 뜻인지 안 읽히고 줄만 어색해졌다
           (폴, 2026-08-05). */
        '<button class="srow" data-k="ver">' +
          '<span>앱 버전' + (updPending() ? '<b class="ndot"></b>' : '') + '</span>' +
          '<em class="s ' + verCls + '">' + esc(verTxt) + '<i>›</i></em></button>',
        (chkBusy
          ? '<button class="busy"><i class="spin"></i>확인 중</button>'
          : '<button data-k="now">' +
            (chkAt ? '마지막 ' + esc(chkAt) : '확인 전') + ' · 지금 확인</button>')) +
      maskGrpHtml() +
      grp('보안·데이터',
        row('out', '로그아웃', '', 'danger')) +
      /* 버전은 맨 아래 한 줄 (디자인 7b). 계좌 수는 「이 앱이 뭘 보고 있나」라
         같이 둔다 — 따로 한 줄을 더 쓸 만큼의 말은 아니다. */
      '<div class="setfoot">v' + APP_V + ' · 등록된 계좌 ' + acc + '개</div>' +
    '</div>';
  /* ⚠️ 프로필 줄은 어두운 면(`.sethd`) 안이라 `.setwrap` 위임이 안 닿는다.
     입구를 늘렸으면 이벤트도 전부 다시 물려야 한다 — 화면 두 곳을 **한 함수**로
     받는다. 따로 쓰면 한쪽만 고치는 사고가 난다. */
  var tap = function (e) {
    var b = e.target.closest('button[data-k]');
    if (!b) return;
    var k = b.dataset.k;
    if (k.indexOf('mk') === 0) return maskTap(k, b);
    if (k === 'who') return switchWho();
    if (k === 'bud') return showBudget();
    if (k === 'health') return showHealth();
    if (k === 'inbox') {
      toast('확인 중…');
      return reloadInbox().then(function () {
        if (!ST.inbox.length) return toast('대기 중인 결제 알림이 없어요');
        goTab('home');
      });
    }
    if (k === 'ver') return updPending() ? offerUpdate() : checkNow();
    if (k === 'now') return checkNow();
    if (k === 'out') return logout();
  };
  s.querySelector('.setwrap').onclick = tap;
  s.querySelector('.sethd').onclick = tap;
}

/* ═══════════ 점검 ═══════════
   폰이 알림을 잘 보내는지(맥박)와 앱이 최신인지(버전)를 한 묶음으로 본다.
   따로 떨어져 있으면 「버전 확인」 한 줄만 덩그러니 남아 뜬금없다.

   그리고 사람이 매번 눌러야 하는 확인은 결국 안 하게 된다. 앱을 열 때와
   한 시간이 지났을 때 조용히 스스로 돌고, 마지막으로 본 시각을 적어 둔다. */
var CHK_EVERY = 3600000;          /* 1시간 */
var chkRunning = null;            /* 지금 도는 확인 (겹쳐 부르는 걸 막는다) */
var chkBusy = false;              /* 사람이 눌러서 도는 중 — 버튼만 돌린다 */

/* 서버에 올라간 sw.js 를 캐시 없이 직접 읽어 버전만 본다.
   registration.update() 만으로는 「새 게 있었는지」를 알 수 없다 —
   조용히 설치하고 끝나서 사람에게 해줄 말이 안 남는다. */
function runCheck() {
  if (chkRunning) return chkRunning;
  chkRunning = fetch('./sw.js?cb=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r || !r.ok) throw new Error('bad'); return r.text(); })
    .then(function (t) {
      var m = t.match(/var V = 'hb-([^']+)'/);
      ST.chk = { at: Date.now(), ver: m ? m[1] : '', err: m ? '' : '버전을 못 읽었어요' };
    })
    .catch(function () {
      /* 실패해도 옛 결과는 남긴다 — 지웠다가 다음 확인까지 「모름」이 된다 */
      ST.chk = { at: Date.now(), ver: (ST.chk && ST.chk.ver) || '', err: '확인 실패' };
    })
    .then(function () {
      LS.set('chk', ST.chk);
      chkRunning = null;
      paintTabs();
      if (ST.tab === 'settings') render();
      return ST.chk;
    });
  return chkRunning;
}

/* 앱을 열 때와 한 시간이 지났을 때만. 화면을 오갈 때마다 부르면 낭비다. */
function maybeCheck() {
  if (Date.now() - ((ST.chk && ST.chk.at) || 0) > CHK_EVERY) runCheck();
}

/* 자리마다 숫자로 견준다. 문자열로 !== 만 보다가 「1.11.7 · 새 1.11.6 있음」
   이라는 거꾸로 된 안내가 떴다(폴 스크린샷, 2026-08-05).
   서버가 낮게 나오는 건 배포가 아직 다 안 퍼졌을 때다. 그때 할 말은
   「업데이트하세요」가 아니라 「최신이에요」다 — 내 것이 더 새것이니까.
   문자열 비교는 1.9.0 vs 1.11.0 에서도 틀린다('9' > '1'). */
function verCmp(a, b) {
  var x = String(a || '').split('.'), y = String(b || '').split('.');
  for (var i = 0; i < 3; i++) {
    var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

function updPending() {
  return !!(ST.chk && ST.chk.ver && verCmp(APP_V, ST.chk.ver) < 0);
}

/* 사람이 직접 누른 경우 — 결과를 반드시 말로 돌려준다.
   아무 일도 안 일어나면 먹통으로 읽힌다. */
/* 처음엔 캐시를 비우고 start() 를 다시 돌렸다. 그러면 화면이 통째로
   스켈레톤으로 뒤집힌다 — 버튼 하나 누른 값으로는 너무 큰 반응이다.
   보던 화면은 그대로 두고 버튼만 돌린다. 데이터는 refreshAll 이 뒤에서
   받아 조용히 갈아끼운다(stale-while-revalidate). */
function checkNow() {
  if (chkBusy) return Promise.resolve();
  chkBusy = true;
  if (ST.tab === 'settings') render();      /* 버튼이 도는 상태로 */
  chkRunning = null;                        /* 눌렀으면 캐시 말고 새로 */

  var jobs = [runCheck()];
  if (ST.ym && ST.boot) {
    jobs.push(Promise.resolve(refreshAll()).catch(function () {}));
    jobs.push(Promise.resolve(reloadInbox()).catch(function () {}));
  }
  return Promise.all(jobs).then(function () {
    chkBusy = false;
    /* 리포트는 지금 안 보고 있으니 지워만 둔다 — 리포트 탭에 가면 다시 받는다.
       괜히 지금 받아오면 안 볼 화면 때문에 확인이 느려진다. */
    ST.rep = null;
    var c = ST.chk || {};
    if (ST.tab === 'settings') render();
    if (c.err) return toast(c.err + ' — 인터넷 연결을 확인해주세요');
    if (updPending()) return offerUpdate();
    toast('최신이에요 · ' + APP_V);
  });
}

function offerUpdate() {
  sheet('새 버전 ' + ST.chk.ver + ' 이 있어요', [
    { label: '지금 업데이트', run: applyUpdate },
    { label: '나중에' }
  ]);
}

/* 캐시를 비우고 서비스워커를 새로 받은 다음 다시 연다. 캐시를 안 비우면
   옛 셸이 그대로 다시 뜬다. 여기까지 왔으면 sw.js 를 이미 받아왔으니
   네트워크는 살아 있다 — 캐시를 비워도 갇히지 않는다. */
function applyUpdate() {
  toast('새 버전을 받는 중…');
  var done = function () {
    var cp = (window.caches && caches.keys)
      ? caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        }).catch(function () {})
      : Promise.resolve();
    cp.then(function () {
      LS.set('form', null);
      location.reload();
    });
  };
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration()
      .then(function (reg) { return reg && reg.update ? reg.update() : null; })
      .then(done, done);
  } else done();
}

/* 「12분 전」 처럼. 점검 줄과 마지막 확인 시각에 같이 쓴다. */
function ago(ms) {
  if (!ms) return '';
  var s = Math.max(0, Date.now() - ms), m = Math.round(s / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  var h = Math.round(m / 60);
  if (h < 24) return h + '시간 전';
  return Math.round(h / 24) + '일 전';
}

/* 알림 연결 한 줄 요약 — 홈 배너와 같은 기준(12시간)을 쓴다 */
function hbLine() {
  var w = hbWorst();
  if (w.bad) return { cls: 'bad', txt: w.bad.who + ' ' + hbDur(w.bad.h) + ' 조용' };
  /* 끊긴 사람은 없지만 아직 안 붙은 사람이 있으면 그걸 말해준다.
     이게 미해결 ⑲(아내 폰이 이름을 싣는가)의 답이 나오는 자리다. */
  if (w.none.length) {
    var h = hbGapH();
    return { cls: 'wait',
             txt: w.none.join('·') + ' 아직 신호 없음' + (h < 0 ? '' : ' · 나머지 정상') };
  }
  var g = hbGapH();
  if (g < 0) return { cls: 'wait', txt: '아직 신호 없음' };
  return { cls: 'ok', txt: '정상 · ' + ago(ST.hb['*']) };
}

function logout() {
  clearToken();
  LS.clear();
  ST.who = null;
  ST.boot = null; ST.month = null; ST.tx = null;
  if (gisReady) google.accounts.id.disableAutoSelect();
  showLogin(true);
}

/* ───────── 아직 없는 탭 ───────── */
var SOON = {};
function renderSoon() {
  var s = SOON[ST.tab] || ['—', ''];
  $('#screen').innerHTML =
    '<div class="soon"><b>' + esc(s[0]) + '</b>' + esc(s[1]) + '<br>다음 단계에서 붙습니다.</div>';
}

/* ───────── 시트(단순) ───────── */
/* opts[i] = { label, on, run, av, sub, foot }
   ⚠️ 1.38.0 · 디자인 7d — 아바타(av)·부제(sub)·꼬리말(foot)은 **있을 때만** 그린다.
   없는 시트에 빈 동그라미가 서면 「뭔가 안 뜬 것」으로 읽힌다. */
function sheet(title, opts, foot) {
  var m = el('div', 'mask');
  var sh = el('div', 'sheet');
  sh.innerHTML = '<h4>' + esc(title) + '</h4>' +
    opts.map(function (o, i) {
      return '<div class="opt' + (o.on ? ' on' : '') + '" data-i="' + i + '">' +
        (o.av ? '<span class="av' + (o.on ? ' on' : '') + '">' + esc(o.av) + '</span>' : '') +
        '<span class="l"><b>' + esc(o.label) + '</b>' +
          (o.sub ? '<em>' + esc(o.sub) + '</em>' : '') + '</span>' +
        '<i class="ck"></i></div>';
    }).join('') +
    (foot ? '<div class="sfoot">' + esc(foot) + '</div>' : '');
  m.appendChild(sh);
  var done = function () { m.remove(); navClose(); };
  m.onclick = function (e) {
    if (e.target === m) { done(); return; }
    var o = e.target.closest('.opt');
    if (!o) return;
    done();
    var f = opts[+o.dataset.i].run;
    if (f) f();
  };
  document.body.appendChild(m);
  navOpen(function () { m.remove(); });
}

/* ───────── 이벤트 ───────── */
function shiftMonth(dir) {
  var ms = (ST.boot && ST.boot.months) || [];
  var i = ms.indexOf(ST.ym);
  if (i < 0) return;
  var j = i + (dir < 0 ? 1 : -1);
  if (j < 0 || j >= ms.length) return;
  ST.wkOff = 0;
  loadMonth(ms[j]);
}

document.addEventListener('DOMContentLoaded', function () {
  $('#mprev').onclick = function () { shiftMonth(-1); };
  $('#mnext').onclick = function () { shiftMonth(1); };

  /* 널 가드 — 앞쪽 비슷한 자리에는 다 있는데 여기만 없었다.
     HTML 에서 이 버튼 하나만 빼면 TypeError 로 아래 바인딩이 통째로
     죽는다. showHealth 부재(⑰)와 같은 종류의 사고다. (미해결 ④) */
  var wb = $('#whobtn');
  if (wb) wb.onclick = switchWho;

  $('#tb').onclick = function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    /* 보고 있는 탭을 또 누르면 맨 위로. 긴 목록에서 위로 올라가려고
       손가락을 여러 번 쓸어올리는 게 성가시다. 다시 그리지는 않는다 —
       스크롤만 올라가야 읽던 자리가 통째로 바뀌지 않는다. */
    if (b.dataset.tab === ST.tab) return toTop(true);
    goTab(b.dataset.tab);
  };
  $('#fab').onclick = function () {
    if (!ST.boot) return toast('불러오는 중이에요');
    openInput();
  };

  var tries = 0;
  var iv = setInterval(function () {
    if (window.google && google.accounts && google.accounts.id) { clearInterval(iv); initGIS(); }
    else if (++tries > 100) { clearInterval(iv); showLogin(true, '구글 로그인 스크립트를 불러오지 못했습니다.'); }
  }, 100);

  if (loadToken()) { showLogin(false); start(); }
  else {
    /* 구글이 조용히 자격증명을 내주는 동안은 로그인 화면을 띄우지 않는다.
       성공하면 화면 전환 없이 바로 들어가고, 실패했을 때만 보여준다. */
    showLogin(false);
    renderSkeleton();
    autoT = setTimeout(function () { if (!tokenAlive()) showLogin(true); }, 3500);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  /* 켜 둔 채로 한 시간이 지나도 안 끊기게. 폰에서는 앱을 며칠씩 안 닫는다. */
  setInterval(renewSoon, TOK_TICK);
});

/* 「금액 보기 / 금액 가리기」 단추는 홈·내역·리포트 세 화면에 같은 모양으로
   뜬다. 화면마다 따로 물리면 한 곳을 빼먹는다 — 문서 한 곳에서 받는다. */
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('#mkbtn');
  if (!b) return;
  e.preventDefault();
  if (mkHidden()) pinAsk(); else mkHide();
});

document.addEventListener('visibilitychange', function () {
  /* 「앱 나가면」은 **나갈 때** 판정해야 한다. 돌아올 때 재면 그 사이 스크린샷·
     앱 전환 화면에 금액이 그대로 남는다. */
  if (document.visibilityState !== 'visible') {
    if (mkCfg().back === 'app') mkHide();
    return;
  }
  mkPaint();
  if (ST.form) return;
  /* 앞으로 올 때 토큰이 얼마 안 남았으면 **미리** 받아 둔다. 죽은 뒤에
     받으려 하면 그 사이 요청 하나가 로그인 창을 띄운다. 기다리지 않는다 —
     아래 새로고침은 그대로 돌고, 필요하면 api() 가 알아서 기다린다. */
  renewSoon();
  if (Date.now() - lastLoad < 90000) return;
  if (ST.ym && ST.boot) { refreshAll(); reloadInbox(); }
  /* 폰에서는 앱을 며칠씩 안 닫는다. 돌아올 때마다 한 시간이 지났으면 본다. */
  maybeCheck();
});

})();
