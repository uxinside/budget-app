/* 우리집 가계부 v2 — 프런트엔드
   백엔드: Apps Script JSON API (?api=boot2|month|tx2|report2|add2|upd|del|waste)
   인증  : Google Identity Services ID 토큰 → 서버에서 tokeninfo 검증 */
(function () {
'use strict';

var EXEC = 'https://script.google.com/macros/s/AKfycbyTjmbMOGKacDaMMhmCRje4iQYvgb7XouOmzpiij62BW8uaZfqu9fa1Q139nz9tdQBbgw/exec';
var CLIENT_ID = '234887197691-1bjbpudf58j29o6onvs3ih0k5og6pco1.apps.googleusercontent.com';
/* 설정 화면에 찍는다. 폰이 새 판을 받았는지 눈으로 확인하려는 것. */
var APP_V = '1.11.8';

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
  who: null,                      /* 보는 대상: null=가구 전체 / '폴' / '아내' / '공동' */
  /* g = 구분(수입·지출·이체…), w = 계좌 소유자. 둘 다 서버가 아니라
     여기서 거른다 — 서버 필터를 쓰면 다시 받아와야 해서, 홈에서 눌렀을 때
     내역이 한 번 비었다가 채워진다. */
  f: { cat: [], pay: [], g: [], w: [], q: '', sq: '지출만' },
  cap: true,                      /* 자본거래(이체·저축·부채상환…) 숨김 */
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
  setToken(res.credential);
  showLogin(false);
  start();
}
function reprompt() {
  if (promptPending || !gisReady) return;
  promptPending = true;
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
var WRITE_API = { add2: 1, upd: 1, del: 1, waste: 1 };
function api(name, params, _try) {
  if (!tokenAlive()) { reprompt(); return Promise.reject(new Error('auth')); }
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
      if (j.code === 401) { clearToken(); reprompt(); throw new Error('auth'); }
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
    if (ST.tab === 'tx') render();
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
  if (ST.tab === 'tx' && t !== 'tx') dueOpen = false;
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
  $('#whonm').textContent = w || WHO_ALL;
  var av = $('#whoav');
  av.textContent = w ? w.slice(0, 1) : '집';
  av.className = 'av' + (w === '아내' ? ' b' : (w === '공동' ? ' c' : ''));
  if (btn) btn.classList.toggle('on', !!w);
}

/* 보는 대상 전환 — 홈·내역·리포트가 모두 이 값을 따른다 */
function switchWho() {
  var names = [];
  ((ST.boot && ST.boot.accounts) || []).forEach(function (a) {
    if (a.owner && names.indexOf(a.owner) < 0) names.push(a.owner);
  });
  if (!names.length) names = ['폴', '아내', '공동'];
  names.sort(function (a, b) {
    var o = { '폴': 0, '아내': 1, '공동': 2 };
    return (o[a] == null ? 9 : o[a]) - (o[b] == null ? 9 : o[b]);
  });
  var opts = [{ label: WHO_ALL, on: !ST.who, run: function () { setWho(null); } }];
  names.forEach(function (n) {
    opts.push({ label: n, on: ST.who === n, run: function () { setWho(n); } });
  });
  sheet('보는 대상', opts);
}
function setWho(w) {
  if (ST.who === w) return;
  ST.who = w;
  LS.set('who', w);
  ST.tx = null;
  paintWho();
  loadMonth(ST.ym);
}
function paintMonthNav() {
  $('#mlabel').textContent = ymLabel(ST.ym);
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
function renderError(msg) {
  $('#screen').innerHTML =
    '<div class="errbox">데이터를 불러오지 못했습니다.<br>' + esc(msg) +
    '<br><button id="retry">다시 시도</button></div>';
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
  lockMode(false);
  document.body.classList.remove('setmode');
  if (ST.tab === 'home') return renderHome();
  if (ST.tab === 'tx') return renderTx();
  if (ST.tab === 'report') return renderReport();
  if (ST.tab === 'settings') return renderSettings();
  return renderSoon();
}

/* ═══════════ 홈 (#1a) ═══════════ */
function renderHome() {
  var M = ST.month;
  if (!M) return;
  var s = $('#screen');
  s.innerHTML = '';
  var wrap = el('div', 'stack');
  var hbc = cardHb();
  if (hbc) wrap.appendChild(hbc);
  if (ST.inbox.length) wrap.appendChild(cardInbox({ limit: 3 }));
  wrap.appendChild(cardPnl(M));
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
var HB_WARN_H = 12;
var HB_MUTE_K = 'hbmute';

function hbGapH() {
  var t = ST.hb && Number(ST.hb['*'] || 0);
  if (!t) return -1;                    /* 아직 한 번도 안 닿음 — 판단 보류 */
  return (Date.now() - t) / 36e5;
}

function cardHb() {
  var h = hbGapH();
  if (h < HB_WARN_H) return null;
  var until = Number(LS.get(HB_MUTE_K) || 0);
  if (until && Date.now() < until) return null;
  var n = h >= 48 ? Math.round(h / 24) + '일째' : Math.round(h) + '시간째';
  var c = el('div', 'card hbwarn');
  c.innerHTML =
    '<div class="l"><b>폰 결제 알림이 ' + n + ' 안 들어와요</b>' +
      '<span>Automate 플로우가 멈췄을 수 있어요. 그동안 쓴 건 수동으로 넣어야 해요.</span></div>' +
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

  m.onclick = function (e) {
    if (e.target === m) return m.remove();
    var b = e.target.closest('button');
    if (b && b.dataset.a === 'x') m.remove();
  };

  api('inboxHealth', {}).then(function (j) {
    var d = j.data || {};
    var hb = d.hb || { by: [] };
    var gap = hb.any ? (Date.now() - hb.any) / 36e5 : -1;
    /* 두 시각을 나란히 놓는 게 이 화면의 전부다.
         맥박은 뛰는데 마지막 결제가 멀다 → 플로우는 산다, 결제만 없다
         맥박 자체가 멀다                → 폰이 죽었다 */
    var verdict = gap < 0
      ? '<div class="nhv wait">폰에서 아직 한 번도 안 닿았어요 · 플로우와 키를 확인해주세요</div>'
      : gap >= HB_WARN_H
        ? '<div class="nhv bad">폰이 ' + Math.round(gap) + '시간째 조용해요 · 플로우가 멈춘 것 같아요</div>'
        : '<div class="nhv ok">폰은 살아 있어요 · 마지막 신호 ' +
          (gap < 1 ? Math.max(1, Math.round(gap * 60)) + '분 전' : Math.round(gap) + '시간 전') + '</div>';

    var body =
      verdict +
      '<div class="nhg"><h5>맥박 — 요청이 닿은 시각</h5>' +
        line('전체', hb.at) +
        hb.by.map(function (x) { return line(x.who, x.at); }).join('') +
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
function cardInbox(opt) {
  opt = opt || {};
  var all = ST.inbox;
  var lim = opt.limit && all.length > opt.limit ? opt.limit : all.length;
  var list = all.slice(0, lim);
  var c = el('div', 'card p18 inbox');
  c.innerHTML =
    '<div class="ih"><b>' + esc(opt.title || '확인할 결제') + '</b><span>' + all.length + '건</span></div>' +
    list.map(function (it) {
      var cancel = it.state === '취소보류';
      return '<div class="irow" data-r="' + it.row + '">' +
        '<div class="l">' +
          '<b><span class="t">' + esc(it.desc || '(가맹점 미확인)') + '</span>' +
            (it.late ? '<i class="lt">지난 알림</i>' : '') + '</b>' +
          '<span>' + esc(inboxDateLabel(it.date)) + (it.pay ? ' · ' + esc(it.pay) : '') +
            (it.cat ? ' · ' + esc(it.cat) : '') + '</span>' +
        '</div>' +
        '<div class="r">' +
          '<em' + (cancel ? ' class="cx"' : '') + '>' + (cancel ? '취소 ' : '') + C(it.amt) + '</em>' +
          '<div class="b">' +
            '<button data-a="no">무시</button>' +
            (cancel ? '' : '<button data-a="ok" class="p">확인</button>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
    (lim < all.length
      ? '<div class="imore">내역 탭에 ' + (all.length - lim) + '건 더 있어요</div>' : '');
  c.onclick = function (e) {
    var b = e.target.closest('button[data-a]');
    if (!b) return;
    var rowEl = b.closest('.irow');
    var row = Number(rowEl && rowEl.dataset.r);
    var it = ST.inbox.filter(function (x) { return x.row === row; })[0];
    if (!it) return;
    if (b.dataset.a === 'ok') return openInboxItem(it);
    b.disabled = true;
    api('inboxNo', { row: row }).then(function () {
      dropInbox(row);
      toast('무시했어요');
      if (ST.tab === 'home') render();
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
  var card = 0, payDay = '';
  cs.forEach(function (x) {
    if (!payDay) payDay = x.pay;
    if (x.pay === payDay) card += x.amt || 0;
  });
  var fx = R.fixedLeft || {};
  var fixed = fx.amt || 0;
  var tot = card + fixed;
  if (!tot) return null;
  var bits = [];
  if (card) bits.push('카드 ' + C(card));
  if (fixed) bits.push('고정 ' + C(fixed) + (fx.n > 1 ? ' (' + fx.n + '건)' : ''));
  return { amt: tot, card: card, fixed: fixed, pay: payDay, sub: bits.join(' · ') };
}

/* 히어로에는 서술형 문장을 두지 않는다.
   "쓰고 남은 비율 -1591104%" 같은 게 나오던 자리다. 숫자는 칸에,
   판정은 배지에 넣으면 줄바꿈이 생길 수 없다. */
function cardPnl(M) {
  var p = M.pnl, up = p.net >= 0;
  var inc = p.income || 0, spd = p.spend || 0;
  /* 수입선을 기준으로 '수입 안에서 쓴 돈' 과 '넘어선 돈' 을 나눈다.
     한 색으로 칠하면 얼마나 넘었는지가 안 보인다. */
  var over = Math.max(0, spd - inc);
  var tot = Math.max(spd, inc) || 1;
  var wIn = clamp(Math.min(spd, inc) / tot * 100, 0, 100);
  var wOv = clamp(over / tot * 100, 0, 100);
  var linePos = clamp(inc / tot * 100, 0, 100);

  /* 배수는 수입이 의미 있는 크기일 때만 쓴다. 공동 계좌만 보면 수입이
     통장 이자 47원뿐이라 "지출 15912배" 가 떴다. 앞서 없앤
     "-1591104%" 와 같은 병이 옷만 바꿔 입은 것이다. */
  var badge = '';
  if (inc <= 0) {
    badge = spd > 0 ? '<span class="bg dn">수입 없음</span>' : '';
  } else if (spd > inc) {
    var x = spd / inc;
    badge = x >= 100
      ? '<span class="bg dn">수입 거의 없음</span>'
      : '<span class="bg dn">지출 ' + (x >= 10 ? Math.round(x) : (Math.round(x * 10) / 10)) + '배</span>';
  } else if (spd > 0) {
    badge = '<span class="bg up">수입의 ' + Math.round(spd / inc * 100) + '%</span>';
  }

  var due = nextDue();
  var pv = (M.pace && M.pace.prevGap) || 0;
  var c = el('div', 'card hero');
  c.innerHTML =
    '<div class="ht"><span class="k">이번 달 손익</span>' + badge +
      '<span class="d">' + Number(M.ym.slice(5, 7)) + '월 ' + M.day + '일까지</span></div>' +
    '<div class="hb"><span class="v' + (up ? '' : ' dn') + '">' + SG(p.net) + '</span>' +
      '<span class="w' + (up ? '' : ' dn') + '">원</span></div>' +
    '<div class="hbar"><div class="t">' +
        '<span style="width:' + wIn.toFixed(1) + '%"></span>' +
        '<span class="ov" style="width:' + wOv.toFixed(1) + '%"></span>' +
      '</div><u style="left:' + linePos.toFixed(1) + '%"></u></div>' +
    '<div class="hlg"><span><i class="in"></i>수입 안</span>' +
      (over ? '<span class="dn"><i class="ov"></i>초과 ' + C(over) + '</span>' : '') +
      '<span class="ln"><i></i>수입선</span></div>' +
    /* 숫자를 누르면 그 유형만 내역에서 본다. 「이 지출이 뭐로 이뤄졌지」 는
       이 카드를 보다가 가장 먼저 드는 질문인데 갈 곳이 없었다. */
    '<div class="h3" id="h3">' +
      '<button data-g="수입"><span class="k">수입</span><span class="n">' + C(inc) + '</span></button>' +
      '<button data-g="지출"><span class="k">지출</span><span class="n">' + C(spd) + '</span></button>' +
      /* 손익 차가 아니라 '지출' 차다. 설계 문구가 "지난달 같은 날보다
         590,178원 더 씀" 이라, 비교 대상이 지출이어야 말이 맞는다. */
      '<div><span class="k">지난달 같은 날</span>' +
        '<span class="n' + (pv > 0 ? ' dn' : '') + '">' + SG(pv) + '</span></div>' +
    '</div>' +
    (due ?
      '<button class="hdue" id="hdue">' +
        '<span class="ic"><svg viewBox="0 0 20 20" fill="none">' +
          '<rect x="3" y="5" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.8"/>' +
          '<path d="M3 8.5h14" stroke="currentColor" stroke-width="1.8"/></svg></span>' +
        '<span class="l"><b>앞으로 나갈 돈</b>' +
          '<em>' + esc(due.sub) + '</em></span>' +
        '<span class="a num">' + C(due.amt) + '<i>원</i></span>' +
        '<span class="ar">›</span>' +
      '</button>' : '');
  return c;
}

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
  /* 지난달은 날짜 수가 달라서 같은 '진행률' 위치로 늘려 맞춘다 */
  var pd = prev.length || 1;
  for (var k = 0; k < span; k++) {
    var f = span === 1 ? 1 : k / (span - 1);
    var pi = Math.max(1, Math.min(pd, Math.round((mode === 'e' ? (k + 1) : f * dim) )));
    prevV.push({ x: f, v: prev[pi - 1] });
  }
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
  var curPts = pts(curV), prevPts = pts(prevV);
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
    (prevPts ? '<polyline points="' + prevPts + '" fill="none" stroke="var(--prev-line)" stroke-width="2" stroke-linejoin="round"/>' : '') +
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
  /* 월초 며칠은 큰 결제 한 건에 크게 흔들린다 — 그걸 문단으로 설명하던
     칸이 있었는데(폴, 2026-08-05) 뺐다. 며칠치인지는 바로 위 「N일치」
     뱃지가 이미 말하고 있어서, 같은 말을 두 번 하고 있었다. */
  var c = el('div', 'card chart');
  c.innerHTML =
    '<div class="ct"><h3>누적 소비 vs 예산 페이스</h3>' +
      '<div class="tog" id="ptog">' +
        '<button data-m="e" class="' + (mode === 'e' ? 'on' : '') + '">경과일</button>' +
        '<button data-m="m" class="' + (mode === 'm' ? 'on' : '') + '">한 달</button>' +
      '</div></div>' +
    '<div class="psub"><span>' +
      (pc.budget ? '예산 ' + C(pc.budget) + '원' + (M.who ? '(가구 전체)' : '') +
                   ' · 하루 ' + C(perDay) + '원' : '예산 미설정') + '</span>' +
      '<em>' + day + '일치</em></div>' +
    '<div style="margin-top:12px">' + paceSvg(M, mode) + '</div>' +
    '<div class="xax">' + paceAxis(M, mode).map(function (t) {
      return '<span>' + t + '</span>'; }).join('') + '</div>' +
    '<div class="lgd">' +
      '<span><i style="background:var(--coral-line)"></i>이번 달</span>' +
      '<span><i style="background:var(--prev-line)"></i>지난달 같은 기간</span>' +
      '<span><i style="background:var(--pace)"></i>페이스</span></div>' +
    '<div class="kpi">' +
      '<div class="' + (gapGood ? 'good' : 'bad') + '"><div class="k">페이스 대비</div>' +
        '<div class="n">' + SG(pc.gap) + '</div></div>' +
      '<div class="' + (pvGood ? 'good' : 'bad') + '"><div class="k">지난달 대비</div>' +
        '<div class="n">' + SG(pc.prevGap) + '</div></div>' +
      '<div><div class="k">이번 주 남음</div><div class="n">' + C(pc.weekAllow) + '</div></div>' +
    '</div>';
  return c;
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
  var fill, red = 0;
  if (!o.budget)      fill = clamp(o.spend / mxs * 100, 2, 100);
  else if (!over)     fill = clamp(o.ratio * 100, 2, 100);
  /* 예산을 넘겼으면 막대를 꽉 채우되 예산 지점에서 끊고 나머지를
     빨갛게 칠한다. 통째로 빨갛던 예전엔 '얼마나' 넘었는지 안 보였다. */
  else { fill = 100 / o.ratio; red = 100 - fill; }
  var pill = '';
  if (over) pill = '<span class="pill over">' + pct(o.ratio) + '%</span>';
  else if (o.delta != null && o.delta >= .3) pill = '<span class="pill up">전월 +' + pct(o.delta) + '%</span>';
  var right = o.budget ? C(o.spend) + ' <em>/ ' + C(o.budget) + '</em>'
                       : C(o.spend) + ' <em>/ —</em>';
  /* 누르면 그 카테고리만 걸린 내역으로 간다 */
  return '<button class="crow" data-cat="' + esc(o.name) + '"><div class="l1">' +
    '<span class="nm">' + esc(o.name) + pill + '</span>' +
    '<span class="amt' + (over ? ' over' : '') + '">' + right + '</span></div>' +
    '<div class="bar"><i style="width:' + fill.toFixed(1) + '%;background:' + col + '"></i>' +
    (red > 0 ? '<b style="left:' + fill.toFixed(1) + '%;width:' + red.toFixed(1) + '%"></b>' : '') +
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
    '<div class="ct"><h3>카테고리 · 예산 대비</h3>' +
      '<div class="tog" id="ctog">' +
        '<button data-m="w" class="' + (wk ? 'on' : '') + '">주</button>' +
        '<button data-m="m" class="' + (wk ? '' : 'on') + '">월</button>' +
      '</div></div>' +
    (head || '') + note +
    '<div class="cats" id="cats">' + (rows ||
      '<div class="empty">' + (wk ? '이 주 지출이 없어요' : '이 달 지출이 없어요') + '</div>') + '</div>';
  return c;
}

function cardPeople(M) {
  var ps = (M.people || []).slice();
  var tot = ps.reduce(function (a, b) { return a + (b.spend || 0); }, 0) || 1;
  var cols = ['var(--mint-bar)', 'var(--sky-bar)', 'oklch(.9 .01 285)'];
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
  var hd = $('#hdue');
  /* 예전엔 리포트로 보냈다. 리포트는 PIN 으로 잠겨 있어서, 「앞으로 나갈 돈」
     을 누르면 PIN 패드가 떴다. 숨길 정보가 아니라 매일 봐야 할 운영 정보다.
     내역 탭으로 보내고 그쪽 섹션을 펼쳐 준다. */
  if (hd) hd.onclick = function () { dueOpen = true; goTab('tx'); };
  /* 앞으로 나갈 돈은 리포트 응답에 들어 있다. 아직이면 받아 놓는다. */
  if (!ST.rep && !repLoading) loadReport(true).then(function () {
    if (ST.tab === 'home') render();
  });

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
  var h3 = $('#h3');
  if (h3) h3.onclick = function (e) {
    var b = e.target.closest('button[data-g]');
    if (!b) return;
    setFilter({ g: [b.dataset.g] });
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
  var head =
    '<div class="stack" style="gap:12px">' +
    '<div class="sum3">' +
      '<div><span class="k">' + (anyF ? '걸러진 지출' : '지출') + '</span>' +
        '<span class="n sp">' + C(vs) + '</span></div>' +
      '<div><span class="k">수입</span><span class="n in">' + C(vi) + '</span></div>' +
      '<div><span class="k">건수</span><span class="n">' + vc + '</span></div>' +
    '</div>' +
    '<div class="fchips" id="fch">' +
      (anyF || !ST.cap ? '<button data-a="all">초기화</button>' : '') +
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
    '</div>' +
    (ST.txErr
      ? '<div class="warnbar"><span>최신 내역을 못 받았어요 · ' + esc(ST.txErr) + '</span>' +
        '<button id="txretry">다시 시도</button></div>' : '') +
    /* 목록 머리줄 하나로 「무엇을 보고 있는지」와 「눌러서 고친다」를 같이 말한다.
       처음엔 자본거래를 뺐다는 걸 한 줄짜리 문장으로 적었는데, 매번 보는
       화면에서 한 행을 통째로 쓸 만큼 중요한 말은 아니었다.
       대신 토글 자체가 상태를 보여주고, 숨긴 건수를 옆에 붙여 둔다 —
       조용히 빼기만 하면 「내역이 사라졌다」로 읽히니까. */
    ((vc || hid) ?
      '<div class="txsec">' +
        '<div class="l"><b>최근 내역</b>' +
          (vc ? '<em>눌러서 고치기</em>' : '') + '</div>' +
        '<button class="captog' + (ST.cap ? '' : ' on') + '" id="captog" ' +
          'aria-pressed="' + (ST.cap ? 'false' : 'true') + '">' +
          '<span class="t">이체 포함</span>' +
          (hid ? '<em>' + hid + '</em>' : '') +
          '<i></i></button>' +
      '</div>' : '');

  var body = days.map(function (d) {
    var tot = d.rows.reduce(function (a, r) { return a + (r.gubun === '지출' ? r.amt : 0); }, 0);
    var rows = d.rows.map(function (r) {
      var cm = catBadge(r.cat);
      var badge = '<div class="bdg" style="background:' + cm.bg + ';color:' + cm.fg + '">' +
        esc(cm.ab) + '</div>';
      return '<button class="trow" data-row="' + r.row + '">' + badge +
        '<div class="mid"><div class="t1">' + esc(r.desc || r.cat) + '</div>' +
        '<div class="t2">' + esc(r.pay || '—') + ' · ' + esc(r.who || '') + '</div></div>' +
        '<span class="amt' + (r.gubun === '수입' ? ' in' : '') + '">' +
        (r.gubun === '수입' ? '+' : '') + C(r.amt) + '</span></button>';
    }).join('');
    return '<div class="dgroup"><div class="dhead">' +
      '<span class="d">' + Number(d.d.slice(5, 7)) + '월 ' + Number(d.d.slice(8, 10)) + '일 <em>' + ymdDow(d.d) + '</em></span>' +
      '<span class="t">' + C(tot) + '</span></div>' + rows + '</div>';
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
  var st = s.querySelector('.stack');
  /* 앞으로 나갈 돈은 리포트 응답에 들어 있다. 내역 탭에서 쓰지만
     서버를 새로 파지 않고 이미 있는 report2 를 재활용한다. */
  if (!ST.rep && !repLoading) loadReport(true).then(function () {
    if (ST.tab === 'tx') render();
  });
  if (st) {
    var dc = cardDueAll();
    if (dc) st.insertBefore(dc, st.firstChild);
    if (ST.inbox.length) st.insertBefore(cardInbox({ title: '입력 대기' }), st.firstChild);
  }
  bindTx();
}

function bindTx() {
  var dh = $('#duehd');
  if (dh) dh.onclick = function () { dueOpen = !dueOpen; render(); };
  var dp = document.querySelector('.duep .due');
  if (dp) dp.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fx) return fixedAdd(b.dataset.fx);
    if (b.dataset.fxoff) return fixedSkip(b.dataset.fxoff, true);
    if (b.dataset.fxon) return fixedSkip(b.dataset.fxon, false);
  };
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

function facet(dim) {
  var map = {}, order = [];
  allRows().forEach(function (r) {
    if (!fPass(r, dim)) return;
    var v = dimVal(dim, r) || '(없음)';
    if (!map[v]) { map[v] = { v: v, n: 0, amt: 0 }; order.push(v); }
    map[v].n++;
    if (r.gubun === '지출') map[v].amt += r.amt || 0;
  });
  var out = order.map(function (v) { return map[v]; });
  if (dim === 'g') {
    return out.sort(function (a, b) {
      var ia = G_ORDER.indexOf(a.v), ib = G_ORDER.indexOf(b.v);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  return out.sort(function (a, b) { return (b.amt - a.amt) || (b.n - a.n); });
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
    if (!g[w]) { g[w] = { who: w, items: [], n: 0 }; order.push(w); }
    g[w].items.push(o);
    g[w].n += o.n;
  });
  var rank = { '공동': 0, '폴': 1, '아내': 2 };
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

  var chip = function (o, dim0) {
    var on = ST.f[key].indexOf(o.v) >= 0;
    /* 카테고리는 금액으로 고르는 게 자연스럽다. 다만 수입 카테고리는
       지출 합계가 0이라 '0' 만 뜨니, 그럴 땐 건수를 보여준다. */
    var sub = ((dim0 === 'cat' || dim0 === 'g' || dim0 === 'w') && o.amt)
      ? C(o.amt) : o.n + '건';
    return '<button class="fc' + (on ? ' on' : '') + (o.n ? '' : ' z') +
      '" data-v="' + esc(o.v) + '"><b>' + esc(o.v) + '</b>' +
      '<em>' + sub + '</em></button>';
  };

  function body() {
    var zeroOpen = sh.dataset.z === '1';
    if (grid) {
      var all = facet(dim);
      var live = all.filter(function (o) { return o.n; });
      var zero = all.filter(function (o) { return !o.n; });
      return '<div class="lsc">' + live.map(function (o) { return chip(o, dim); }).join('') +
        (zeroOpen ? zero.map(function (o) { return chip(o, dim); }).join('') : '') + '</div>' +
        (zero.length && !zeroOpen
          ? '<button class="lsz" data-z="1">이번 달 0건 ' + zero.length + '개 <i>보기</i></button>' : '');
    }
    var gs = payOwners();
    return gs.map(function (g) {
      var sel = g.items.filter(function (o) { return ST.f.pay.indexOf(o.v) >= 0; }).length;
      var allSel = sel && sel === g.items.length;
      return '<div class="lsg"><div class="lsgh">' +
        '<span class="av">' + esc(g.who.slice(0, 1)) + '</span><b>' + esc(g.who) + '</b>' +
        '<em>' + g.n + '건</em>' +
        '<button class="grp" data-g="' + esc(g.who) + '">' +
        (allSel ? '모두 해제' : '모두 선택') + '</button></div>' +
        '<div class="lsc">' + g.items.map(function (o) { return chip(o, 'pay'); }).join('') +
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
   '근로소득(고니)' 는 아내 것이라 폴의 입력 화면에 뜨면 안 된다.
   사람 이름이 아닌 괄호는 그대로 둔다. */
var PERSON_ALIAS = { '폴': ['폴'], '아내': ['아내', '고니'] };
function catForMe(name) {
  var m = String(name || '').match(/\(([^)]+)\)\s*$/);
  if (!m) return true;
  var who = m[1].trim(), all = [];
  Object.keys(PERSON_ALIAS).forEach(function (k) { all = all.concat(PERSON_ALIAS[k]); });
  if (all.indexOf(who) < 0) return true;
  return (PERSON_ALIAS[ST.me] || []).indexOf(who) >= 0;
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
function merchantsFor(cat) {
  var ms = (ST.boot && ST.boot.merchants) || [];
  var f = ms.filter(function (m) { return !cat || m.cat === cat; });
  f.sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
  return f.slice(0, 8);
}

function openInput() {
  ST.form = {
    edit: null, date: todayYmd(), group: '지출', cat: '', merchant: '',
    desc: '', pay: '', amt: 0, memo: '', catOpen: false, payOpen: false
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
    desc: r.desc, pay: r.pay, amt: r.amt, memo: '', catOpen: true, payOpen: true
  };
  navOpen();
  paintInput();
}
/* 폰 알림에서 넘어온 건 — 입력 화면을 그대로 쓰되 값만 채워 연다 */
function openInboxItem(it) {
  if (!it) return;
  ST.form = {
    edit: null, inbox: it.row, raw: it.raw,
    date: it.date || todayYmd(), group: '지출',
    cat: it.cat || '', merchant: it.desc || '', desc: it.desc || '',
    pay: it.pay || '', amt: Number(it.amt) || 0, memo: '',
    catOpen: true, payOpen: true
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

function navOpen() {
  navDepth++;
  try { history.pushState({ hb: navDepth }, ''); } catch (e) {}
}
function navClose() {
  if (navDepth <= 0) return;
  navDepth--;
  navClosing = true;
  try { history.back(); } catch (e) { navClosing = false; }
}
window.addEventListener('popstate', function () {
  if (navClosing) { navClosing = false; return; }   /* 우리가 부른 back — 이미 닫았다 */
  if (navDepth > 0) navDepth--;
  if ($('#modal')) closeInput(true);
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
    : F.inbox ? '결제 확인'
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
  var catChips = function (names, cur) {
    return names.map(function (n) {
      var m = catMeta(n), c = catTone(m), on = n === cur;
      var st = on ? 'background:' + c.fg + m.h + ');color:#fff'
                  : 'background:' + c.bg + m.h + ');color:' + c.fg + m.h + ')';
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
      '<div class="r1"><button class="x" id="ix">✕</button><h2>' + esc(title) + '</h2>' +
        (F.edit ? '<button class="del" id="idel">삭제</button>' : '') +
      '</div>' +
      '<div class="r2">' +
        '<div class="dpick"><button id="dprev">‹</button>' +
          '<span>' + Number(F.date.slice(5, 7)) + '월 ' + Number(F.date.slice(8, 10)) + '일 (' + ymdDow(F.date) + ')</span>' +
          '<button id="dnext">›</button></div>' +
        '<button class="gchip" id="dtoday">오늘</button>' +
        '<button class="gchip' + (F.group === '지출' ? ' on' : '') + '" data-g="지출" style="margin-left:auto">지출</button>' +
        '<button class="gchip' + (F.group === '수입' ? ' on income' : '') + '" data-g="수입">수입</button>' +
        '<button class="gchip' + (F.group === '기타' ? ' on etc' : '') + '" data-g="기타">기타</button>' +
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
function canSave(F) { return !!(F.cat && F.pay && F.amt > 0); }

function bindInput(root) {
  var F = ST.form;
  root.querySelector('#ix').onclick = closeInput;
  root.querySelector('#dprev').onclick = function () { F.date = ymdShift(F.date, -1); paintInput(); };
  root.querySelector('#dnext').onclick = function () { F.date = ymdShift(F.date, 1); paintInput(); };
  root.querySelector('#dtoday').onclick = function () { F.date = todayYmd(); paintInput(); };

  root.querySelector('.r2').addEventListener('click', function (e) {
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

function save() {
  var F = ST.form;
  if (!canSave(F)) return;
  if (!F.nonce) F.nonce = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var p = {
    date: F.date, gubun: gubunOf(F.cat), cat: F.cat,
    desc: F.desc || F.merchant || F.cat, pay: F.pay, amt: F.amt,
    merchant: F.merchant, memo: F.memo, n: F.nonce
  };
  var wasEdit = F.edit, wasInbox = F.inbox;
  var form = F;                      /* 실패하면 이 값 그대로 다시 연다 */

  /* 서버를 기다리지 않는다. 저장은 멱등키가 있어 두 번 가도 한 건이고,
     화면은 아래에서 먼저 맞춰두니 기다릴 이유가 없다. 등록이 굼뜨다는
     얘기의 대부분이 이 왕복 시간이었다. */
  var tmp = wasEdit ? 0 : (TMP_BASE + (++tmpSeq));
  closeInput();
  if (wasInbox) dropInbox(wasInbox);
  if (wasEdit) txUpd(wasEdit, p); else txAdd(tmp, p);
  render();
  toast(wasEdit ? '수정했어요' : C(p.amt) + '원 저장했어요');

  var call = wasEdit
    ? api('upd', { row: wasEdit, date: p.date, gubun: p.gubun, cat: p.cat,
                   desc: p.desc, pay: p.pay, amt: p.amt, merchant: p.merchant })
    : wasInbox
      ? api('inboxOk', { row: wasInbox, date: p.date, gubun: p.gubun, cat: p.cat,
                         desc: p.desc, pay: p.pay, amt: p.amt, merchant: p.merchant })
      : api('add2', p);

  call.then(function (j) {
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

/* ═══════════ 리포트 잠금 ═══════════
   자산·순자산은 어깨너머로 보이면 곤란한 숫자다. 서버는 이미 두
   계정만 통과시키니, 여기서 막을 건 '폰을 남이 들었을 때' 다.
   그래서 화면 단위로 걸고, 잠금이 켜져 있는 동안은 리포트를
   localStorage 에 남기지 않는다. 캐시에 숫자가 그대로 있으면
   PIN 은 눈가림밖에 안 되니까.
   PIN 은 'hb.' 밖에 둔다. 설정의 새로고침이 hb.* 를 통째로
   지우는데, 거기 휩쓸려 잠금이 풀리면 안 된다. */
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

/* '잠금 권유를 한 번 봤다' 도 PIN 과 같은 이유로 'hb.' 밖에 둔다.
   예전엔 hb.lockAsked 였는데, 설정 › 새로고침의 LS.clear() 에 같이
   날아가서 「나중에 하기」로 넘긴 권유 화면이 되살아났다.
   캐시가 아니라 사람이 내린 결정이라 지워지면 안 된다. */
var ASK_K = 'hbnolock';
function lockAsked() {
  try {
    if (localStorage.getItem(ASK_K)) return true;
    if (LS.get('lockAsked')) { localStorage.setItem(ASK_K, '1'); return true; } /* 옛 키 이전 */
  } catch (e) {}
  return false;
}
function lockAskedSet() { try { localStorage.setItem(ASK_K, '1'); } catch (e) {} }

var repUnlocked = false;

/* ───────── 잠금 화면 ─────────
   잠금 화면은 앱 껍데기를 통째로 걷는다. 월 이동 헤더와 탭바가 남아
   있으면 다른 탭으로 빠져나갈 수 있어서 잠금이 잠금이 아니게 된다.
   키패드는 화면 아래에 붙인다 — 가운데 떠 있으면 한 손으로 못 친다. */
function lockMode(on) {
  document.body.classList.toggle('lockmode', !!on);
}

/* 이모지 자물쇠는 기기마다 모양이 달라서 선 아이콘으로 바꿨다 */
var IC_LOCK =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<rect x="4" y="10.5" width="16" height="10.5" rx="3.2" stroke="currentColor" stroke-width="1.9"/>' +
  '<path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
  '<circle cx="12" cy="15.6" r="1.5" fill="currentColor"/></svg>';
var IC_DEL =
  '<svg viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
  '<path d="M9 6h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L3 13l6-7Z" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M12.5 10.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
var IC_CHK =
  '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* PIN 판. 잠금 해제와 설정의 등록·해제가 같이 쓴다. */
function pinPad(host, o) {
  var val = '';
  lockMode(true);
  var keys = '';
  for (var n = 1; n <= 9; n++) keys += '<button data-n="' + n + '">' + n + '</button>';
  /* 좌하단은 비워둔다. 설계상 지문 인증 자리인데 아직 안 붙였다. */
  keys += '<span class="gap"></span>' +
          '<button data-n="0">0</button>' +
          '<button class="ic" data-b="1" aria-label="지우기">' + IC_DEL + '</button>';

  host.innerHTML =
    '<div class="lk">' +
      '<div class="lkt">' +
        (o.back ? '<button class="bk" data-x="back" aria-label="뒤로">‹</button>' : '<span></span>') +
        (o.right || '') +
      '</div>' +
      '<div class="lkm">' +
        (o.icon === false ? '' : '<span class="ico sm">' + IC_LOCK + '</span>') +
        '<div class="ttl"><h4>' + esc(o.title) + '</h4>' +
          '<p class="sub">' + esc(o.desc) + '</p></div>' +
        '<div class="dots"><i></i><i></i><i></i><i></i></div>' +
      '</div>' +
      '<div class="kp">' + keys + '</div>' +
      '<div class="lkf">' + (o.foot || '') + '</div>' +
    '</div>';

  var w = host.querySelector('.lk');
  var dots = w.querySelectorAll('.dots i');
  var sub = w.querySelector('.sub');
  var paint = function () {
    [].forEach.call(dots, function (d, i) { d.classList.toggle('f', i < val.length); });
  };
  var ui = {
    fail: function (m) {
      sub.textContent = m || '';
      w.classList.add('err');
      void w.offsetWidth;
      if (navigator.vibrate) navigator.vibrate(60);
      val = ''; paint();
    },
    ask: function (t, d) {
      w.querySelector('h4').textContent = t;
      sub.textContent = d;
      w.classList.remove('err');
      val = ''; paint();
    }
  };
  w.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x === 'back') return o.back && o.back();
    if (b.dataset.f) return o.foot2 && o.foot2();
    if (b.dataset.b) {
      val = val.slice(0, -1);
      w.classList.remove('err');
      return paint();
    }
    if (!b.dataset.n || val.length >= 4) return;
    val += b.dataset.n;
    w.classList.remove('err');
    paint();
    if (val.length === 4) setTimeout(function () { o.check(val, ui); }, 130);
  };
  paint();
  return ui;
}

/* 5번 틀리면 재로그인으로 넘긴다. 무한정 찔러보게 두지 않는다. */
var PIN_MAX = 5, pinTry = 0;

function renderLock() {
  var me = ST.me || '·';
  pinPad($('#screen'), {
    title: '리포트 잠금 해제',
    desc: '자산·순자산을 보려면 PIN 네 자리를 넣어주세요',
    right: '<span class="who2"><i>' + esc(me.slice(0, 1)) + '</i>' + esc(me) + '</span>',
    foot: '<button data-f="1">PIN을 잊었어요</button>',
    foot2: function () {
      if (!confirm('PIN을 지우고 다시 로그인할까요?\n로그인하면 잠금이 꺼진 상태로 시작합니다.')) return;
      pinClear(); repUnlocked = false; pinTry = 0;
      lockMode(false);
      logout();
    },
    check: function (v, ui) {
      if (pinOk(v)) { pinTry = 0; repUnlocked = true; lockMode(false); render(); return; }
      pinTry++;
      var left = PIN_MAX - pinTry;
      if (left <= 0) {
        pinClear(); repUnlocked = false; pinTry = 0;
        lockMode(false);
        toast('5번 틀려서 다시 로그인해야 해요');
        logout();
        return;
      }
      ui.fail('PIN이 맞지 않아요 · ' + left + '번 더 틀리면 다시 로그인');
    }
  });
}

function lockSetup() {
  var s = $('#screen');
  var done = function () { lockMode(false); render(); };
  if (pinHas()) {
    pinPad(s, {
      title: '리포트 잠금 끄기',
      desc: '지금 쓰는 PIN 네 자리를 넣어주세요',
      icon: false, back: done,
      check: function (v, ui) {
        if (!pinOk(v)) return ui.fail('PIN이 맞지 않아요');
        pinClear(); repUnlocked = false; pinTry = 0;
        done(); toast('리포트 잠금을 껐어요');
      }
    });
    return;
  }
  var first = '';
  pinPad(s, {
    title: '쓸 PIN 네 자리를 정해주세요',
    desc: '1단계 · 다음 화면에서 한 번 더 확인해요',
    icon: false, back: done,
    check: function (v, ui) {
      if (!first) { first = v; return ui.ask('한 번 더 넣어주세요', '2단계 · 방금 정한 네 자리'); }
      if (v !== first) {
        first = '';
        ui.ask('쓸 PIN 네 자리를 정해주세요', '1단계 · 다음 화면에서 한 번 더 확인해요');
        return ui.fail('두 번이 달라요. 처음부터 다시 넣어주세요');
      }
      pinSet(v); repUnlocked = true; pinTry = 0;
      LS.set('rep', null);
      done(); toast('리포트 잠금을 켰어요');
    }
  });
}

/* 잠금이 있는지 모르고 지나치는 게 제일 아깝다. 자산 숫자를 처음
   열 때 한 번만 권하고, 거절하면 두 번 다시 묻지 않는다.
   뒤에 리포트를 흐리게 깔아 "여기 숫자가 있다"를 그림으로 말한다. */
function renderLockIntro() {
  lockMode(true);
  var B = (ST.rep && ST.rep.balance) || {};
  $('#screen').innerHTML =
    '<div class="lk intro">' +
      '<div class="peek">' +
        '<div class="pc big"><span>순자산</span><b class="num">' +
          (B.net != null ? C(B.net) : '000,000,000') + '</b></div>' +
        '<div class="pc"></div><div class="pc"></div>' +
      '</div>' +
      '<div class="lkm">' +
        '<span class="ico">' + IC_LOCK + '</span>' +
        '<div class="ttl"><h4>리포트에 PIN을 걸까요?</h4>' +
          '<p class="sub">자산·부채·순자산 금액이 있는 탭이에요</p></div>' +
        '<div class="why">' +
          '<div><span class="ck">' + IC_CHK + '</span>홈·내역은 그대로 열려요</div>' +
          '<div><span class="ck">' + IC_CHK + '</span>잠금 중엔 리포트 숫자를 기기에 저장하지 않아요</div>' +
        '</div>' +
      '</div>' +
      '<div class="lkb">' +
        '<button class="pri" id="lkyes">PIN 설정하기</button>' +
        '<button id="lkno">나중에 하기</button>' +
      '</div>' +
    '</div>';
  $('#lkyes').onclick = function () { lockAskedSet(); lockSetup(); };
  $('#lkno').onclick = function () {
    lockAskedSet();
    lockMode(false);
    toast('설정 › 리포트 잠금에서 언제든 켤 수 있어요');
    render();
  };
}

/* ═══════════ 리포트 — 재무상태 ═══════════ */
var repAt = 0;
function loadReport(silent) {
  if (repLoading) return repLoading;
  var cr = pinHas() ? null : LS.get('rep');
  if (cr && !ST.rep) { ST.rep = cr; repAt = 0; }
  if (!silent && !ST.rep) renderSkeleton();
  repLoading = api('report2', {}).then(function (j) {
    repLoading = null;
    ST.rep = j.data;
    repAt = Date.now();
    /* 잠금이 켜져 있으면 디스크에 안 남긴다 */
    LS.set('rep', pinHas() ? null : j.data);
    if (ST.tab === 'report') render();
  }).catch(function (e) {
    repLoading = null;
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요.'); return; }
    if (ST.tab === 'report' && !ST.rep) renderError(e.message);
  });
  return repLoading;
}

/* 큰 금액은 만원 단위로 줄여 읽는다. 5억 8천만원짜리 숫자를
   그대로 두면 폰 화면에서 자릿수를 세게 된다. */
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
  if (pinHas() && !repUnlocked) return renderLock();
  /* 잠금 기능이 있는지 모르고 지나치는 게 제일 아깝다. 자산 숫자를
     처음 열 때 한 번만 물어보고, 거절하면 두 번 다시 안 묻는다. */
  if (!pinHas() && !lockAsked()) return renderLockIntro();
  if (!ST.rep) { loadReport(); if (!ST.rep) return; }
  else if (!repLoading && Date.now() - repAt > 60000) loadReport(true);
  var B = (ST.rep && ST.rep.balance) || {};
  var s = $('#screen');
  s.innerHTML = '';
  var wrap = el('div', 'stack');
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
  wrap.appendChild(cardHealth(B));
  /* 「다가오는 카드 결제」는 내역 탭의 '앞으로 나갈 돈' 으로 옮겼다.
     리포트는 지금 얼마 있나(스톡), 저건 앞으로 얼마 나가나(플로우)다. */
  wrap.appendChild(cardRepay(B));
  s.appendChild(wrap);
}

function cardNet(B) {
  var c = el('div', 'card p18 rnet');
  var d = B.prevDelta;
  var dir = d == null ? '' : (d > 0 ? ' up' : (d < 0 ? ' down' : ''));
  c.innerHTML =
    '<div class="ct"><h3>순자산</h3><span class="sub">' +
      esc(B.asOf ? ymLabel(B.asOf) + ' 기준' : '기준월 없음') + '</span></div>' +
    '<div class="big num">' + C(B.net) + '<i>원</i></div>' +
    (d == null ? '' :
      '<div class="dlt' + dir + '">전월 대비 ' + (d > 0 ? '+' : d < 0 ? '−' : '') + C(d) + '원</div>') +
    '<div class="ab">' +
      '<div class="a"><span>자산</span><b class="num">' + W(B.asset) + '</b></div>' +
      '<div class="d"><span>부채</span><b class="num">' + W(B.debt) + '</b></div>' +
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
      tr.length + '개월 ' + (diff >= 0 ? '+' : '−') + W(diff) + '원</span></div>' +
    '<div class="tw">' +
      '<div class="yax"><span>' + W(hi) + '</span><span>' + W(lo) + '</span></div>' +
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
    '<div class="ct"><h3>' + esc(title) + '</h3><span class="sub num">' + W(t) + '원</span></div>' +
    (live.length
      ? '<div class="mixbar">' + live.map(function (o) {
          return '<i style="width:' + (t ? ((o.v / t) * 100).toFixed(2) : 0) +
                 '%;background:' + o.c + '"></i>';
        }).join('') + '</div>' +
        '<div class="mixlist">' + live.map(function (o) {
          return '<div class="mrow">' +
            '<span class="dot" style="background:' + o.c + '"></span>' +
            '<span class="k">' + esc(o.k) + '<em>' + esc(o.hint) + '</em></span>' +
            '<span class="v num">' + C(o.v) + '</span>' +
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
    { k: '부채비율', v: B.debtRatio, fmt: 'pct', good: 'low', line: 0.4,
      hint: '부채 ÷ 자산 · 낮을수록 안전 · 40% 미만 권장' },
    { k: '자기자본비율', v: B.equityRatio, fmt: 'pct', good: 'high', line: 0.6,
      hint: '순자산 ÷ 자산 · 높을수록 안전' },
    { k: '유동비율', v: B.currentRatio, fmt: 'pct', good: 'high', line: 1,
      hint: '유동자산 ÷ 유동부채 · 100% 이상 권장' },
    { k: '현금성 개월수', v: B.cashMonths, fmt: 'mon', good: 'high', line: 3,
      hint: '유동자산 ÷ 월평균 지출 · 3~6개월 권장' }
  ];
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
      return '<div class="hrow">' +
        '<div class="l1"><span class="nm">' + esc(o.k) + '</span>' +
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

/* 카드 대금은 쓴 날이 아니라 결제일에 계좌에서 빠진다. 이 목록은
   그 시차를 눈에 보이게 할 뿐, 계좌 잔액은 손대지 않는다.
   결제일이 같은 카드끼리 묶는다 — 그날 통장에서 빠질 총액이 핵심이다. */
function dueCardsHtml(D, ym) {
  var list = (D && D.cards) || [];
  /* 「앞으로」는 이 달 안에 나갈 돈이다. 다음 달 결제일 묶음은 아직 쌓이는
     중이라 전부 0원인데 자리만 차지했다. 이 달 결제일만 남긴다. */
  if (ym) list = list.filter(function (x) { return String(x.pay || '').slice(0, 7) === ym; });
  if (!list.length) return '';
  var g = [], ix = {};
  list.forEach(function (x) {
    if (!ix[x.pay]) { ix[x.pay] = { pay: x.pay, ym: x.ym, open: x.open, rows: [] }; g.push(ix[x.pay]); }
    ix[x.pay].rows.push(x);
  });
  return g.map(function (o) {
    var tot = o.rows.reduce(function (a, x) { return a + x.amt; }, 0);
    var rows = o.rows.map(function (x) {
      return '<div class="drow"><span class="nm">' + esc(x.name) +
        '<em>' + (x.from ? '→ ' + esc(x.from) : '출금계좌 미지정') + '</em></span>' +
        '<span class="amt num">' + C(x.amt) + '</span></div>';
    }).join('');
    return '<div class="dgrp"><div class="dh">' +
      '<b>' + Number(o.pay.slice(5, 7)) + '월 ' + Number(o.pay.slice(8, 10)) + '일</b>' +
      '<span>' + Number(o.ym.slice(5, 7)) + '월 사용분' +
        (o.open ? ' · 쌓이는 중' : '') + '</span>' +
      '<span class="t num">' + C(tot) + '</span></div>' + rows + '</div>';
  }).join('');
}

/* 고정비 한 줄. 날이 지났는데 아직 장부에 없으면 late — 그게 지금 할 일이다.
   near 는 '금액·결제수단이 같은 지출이 이 달에 이미 있다' 는 뜻이다. 이름이
   달라 자동으로는 못 잡는 경우라, 단정하지 않고 사람이 [무시]로 끝낸다. */
function dueFixHtml(FX) {
  var items = (FX && FX.items) || [];
  if (!items.length) return '';
  var live = items.filter(function (x) { return !x.done && !x.skip; }).length;
  var rows = items.map(function (x) {
    var right;
    if (x.skip)      right = '<button class="undo" data-fxon="' + esc(x.name) + '">되돌리기</button>';
    else if (x.done) right = '<span class="ok">반영됨</span>';
    else right = '<button class="reg" data-fx="' + esc(x.name) + '">등록</button>' +
                 '<button class="ign" data-fxoff="' + esc(x.name) + '" title="이 달은 빼기">✕</button>';
    var note = x.skip ? '무시함' : x.near ? '비슷한 게 있어요' : '';
    return '<div class="fxrow' + (x.done ? ' done' : '') + (x.skip ? ' skip' : '') +
        (x.near ? ' near' : '') + (x.late ? ' late' : '') + '">' +
      '<span class="d">' + x.day + '일' + (x.late ? '<i>지남</i>' : '') + '</span>' +
      '<span class="nm">' + esc(x.name) +
        '<em>' + (note || (x.pay ? esc(x.pay) : '결제수단 미지정')) + '</em></span>' +
      '<span class="amt num">' + C(x.amt) + '</span>' + right + '</div>';
  }).join('');
  return '<div class="dgrp"><div class="dh"><b>고정지출</b>' +
    '<span>남은 ' + live + '건 / 이 달 ' + items.length + '건</span>' +
    '<span class="t num">' + C(FX.amt || 0) + '</span></div>' + rows + '</div>';
}

/* 앞으로 나갈 돈 — 내역 탭 맨 위의 접이식 카드.
   리포트에 있던 걸 옮겨 왔다. 리포트는 PIN 으로 잠겨 있어 홈에서 눌렀을 때
   PIN 패드가 떴고, 성격도 스톡(순자산·부채)이지 플로우가 아니다.
   고정비를 여기서 바로 장부에 넣을 수 있어야 「때가 되면 반영」이 된다. */
var dueOpen = false;

function cardDueAll() {
  var R = ST.rep || {};
  var D = R.cardDue || {}, FX = R.fixedLeft || {};
  var cards = dueCardsHtml(D, FX.ym || ST.ym), fix = dueFixHtml(FX);
  if (!cards && !fix) return null;
  var due = nextDue();
  var amt = due ? due.amt : 0;
  var sub = due ? due.sub : '모두 반영했어요';
  var nLate = ((FX.items) || []).filter(function (x) { return x.late; }).length;

  var c = el('div', 'card p18 duep');
  c.innerHTML =
    '<button class="dhd' + (dueOpen ? ' on' : '') + '" id="duehd">' +
      '<span class="l"><b>앞으로 나갈 돈</b><em>' + esc(sub) +
        (nLate ? ' · <u>' + nLate + '건 밀림</u>' : '') + '</em></span>' +
      '<span class="a num">' + C(amt) + '<i>원</i></span>' +
      '<span class="cv">' + (dueOpen ? '⌃' : '⌄') + '</span>' +
    '</button>' +
    (dueOpen
      ? '<div class="due">' + cards + fix + '</div>' +
        '<div class="dueh">카드 금액은 아직 계좌에서 빠지지 않았습니다. ' +
          '카드사마다 이용기간이 조금씩 달라서 실제 청구액과 다를 수 있어요.</div>'
      : '');
  return c;
}

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
      '<div><span>월 상환액</span><b class="num">' + C(B.repayMonthly) + '</b></div>' +
      '<div><span>향후 12개월</span><b class="num">' + C(B.repay12) + '</b></div>' +
      '<div><span>DSR</span><b class="num' + (dsrOk ? '' : ' no') + '">' +
        (B.dsr == null ? '—' : pct(B.dsr) + '%') + '</b></div>' +
    '</div>' +
    '<div class="rpyh">DSR은 월 상환액 ÷ 월평균 수입입니다. 40%를 넘으면 새 대출이 어려워집니다.</div>';
  return c;
}

/* ═══════════ 설정 ═══════════ */
/* 설정에는 월 개념이 없다. 월 이동 헤더가 남아 있던 건 그냥 잔재다.
   행 6개를 한 카드에 섞어두지 않고 성격별로 세 묶음으로 나눈다. */
function renderSettings() {
  document.body.classList.add('setmode');
  var s = $('#screen');
  var acc = ((ST.boot && ST.boot.accounts) || []).length;
  var me = ST.me || '—';
  var cnt = (ST.tx && ST.tx.sum && ST.tx.sum.count) || 0;
  var grp = function (title, rows, right) {
    return '<div class="sgrp"><div class="sgt">' + esc(title) +
      (right ? '<i>' + right + '</i>' : '') + '</div>' +
      '<div class="card p18 setlist">' + rows + '</div></div>';
  };
  var row = function (k, name, val, cls) {
    return '<button data-k="' + k + '"' + (cls ? ' class="' + cls + '"' : '') + '>' +
      '<span>' + esc(name) + '</span><em>' + esc(val) + '</em></button>';
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
    '<div class="stack">' +
      '<h2 class="sh2">설정</h2>' +
      '<div class="card p18 set-me">' +
        '<span class="av' + (ST.me === '아내' ? ' b' : '') + '">' +
          esc(me.slice(0, 1)) + '</span>' +
        '<div><b>' + esc(me) + '</b>' +
          '<span>' + (cnt ? '이번 달 ' + cnt + '건 기록' : '로그인됨') + '</span></div>' +
      '</div>' +
      grp('보기', row('who', '보는 대상', ST.who || WHO_ALL)) +
      grp('결제 알림',
        row('inbox', '결제 알림 확인', ST.inbox.length ? ST.inbox.length + '건 대기' : '대기 없음')) +
      /* 「알림 연결 확인」과 「버전 확인」이 따로 떨어져 있으면 둘 다
         뜬금없다. 「이 앱이 지금 제대로 돌고 있나」는 하나의 질문이다.
         그리고 사람이 매번 눌러야 하는 확인은 결국 안 하게 되므로,
         앱을 열 때와 한 시간이 지났을 때 스스로 돈다. */
      grp('점검',
        '<button data-k="health" class="ck"><span>알림 연결</span>' +
          '<em class="s ' + hb.cls + '">' + esc(hb.txt) + '</em></button>' +
        /* 알림 표시는 제목 바로 오른쪽 점 하나. 처음엔 줄 왼쪽에 세로
           막대를 그었는데, 무슨 뜻인지 안 읽히고 줄만 어색해졌다
           (폴, 2026-08-05). */
        '<button data-k="ver" class="ck">' +
          '<span>앱 버전' + (updPending() ? '<b class="ndot"></b>' : '') + '</span>' +
          '<em class="s ' + verCls + '">' + esc(verTxt) + '</em></button>',
        (chkBusy
          ? '<button class="busy"><i class="spin"></i>확인 중</button>'
          : '<button data-k="now">' +
            (chkAt ? '마지막 ' + esc(chkAt) : '확인 전') + ' · 지금 확인</button>')) +
      grp('보안·데이터',
        row('lock', '리포트 잠금', pinHas() ? 'PIN 켜짐' : '꺼짐') +
        row('out', '로그아웃', '', 'danger')) +
      '<div class="setfoot">등록된 계좌 ' + acc + '개</div>' +
    '</div>';
  s.querySelector('.stack').onclick = function (e) {
    var b = e.target.closest('button[data-k]');
    if (!b) return;
    var k = b.dataset.k;
    if (k === 'who') return switchWho();
    if (k === 'lock') return lockSetup();
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
  var h = hbGapH();
  if (h < 0) return { cls: 'wait', txt: '아직 신호 없음' };
  if (h >= HB_WARN_H) {
    return { cls: 'bad', txt: (h >= 48 ? Math.round(h / 24) + '일째' : Math.round(h) + '시간째') + ' 조용' };
  }
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
function sheet(title, opts) {
  var m = el('div', 'mask');
  var sh = el('div', 'sheet');
  sh.innerHTML = '<h4>' + esc(title) + '</h4>' +
    opts.map(function (o, i) {
      return '<div class="opt' + (o.on ? ' on' : '') + '" data-i="' + i + '">' + esc(o.label) + '</div>';
    }).join('');
  m.appendChild(sh);
  m.onclick = function (e) {
    if (e.target === m) { m.remove(); return; }
    var o = e.target.closest('.opt');
    if (!o) return;
    m.remove();
    var f = opts[+o.dataset.i].run;
    if (f) f();
  };
  document.body.appendChild(m);
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

  $('#whobtn').onclick = switchWho;

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
});

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  if (ST.form) return;
  if (!tokenAlive()) { reprompt(); return; }
  if (Date.now() - lastLoad < 90000) return;
  if (ST.ym && ST.boot) { refreshAll(); reloadInbox(); }
  /* 폰에서는 앱을 며칠씩 안 닫는다. 돌아올 때마다 한 시간이 지났으면 본다. */
  maybeCheck();
});

})();
