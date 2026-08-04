/* 우리집 가계부 v2 — 프런트엔드
   백엔드: Apps Script JSON API (?api=boot2|month|tx2|report2|add2|upd|del|waste)
   인증  : Google Identity Services ID 토큰 → 서버에서 tokeninfo 검증 */
(function () {
'use strict';

var EXEC = 'https://script.google.com/macros/s/AKfycbyTjmbMOGKacDaMMhmCRje4iQYvgb7XouOmzpiij62BW8uaZfqu9fa1Q139nz9tdQBbgw/exec';
var CLIENT_ID = '234887197691-1bjbpudf58j29o6onvs3ih0k5og6pco1.apps.googleusercontent.com';

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
function ymLabel(ym) {
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
  tab: 'home', paceMode: 'd', catsOpen: false,
  who: null,                      /* 보는 대상: null=가구 전체 / '폴' / '아내' / '공동' */
  f: { cat: [], pay: [], waste: false, q: '' },
  form: null,
  inbox: [],                      /* 폰 결제 알림 중 아직 확인 안 한 건 */
  rep: null                       /* 리포트(재무상태) */
};
var repLoading = null;
var WHO_ALL = '가구 전체';

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
function showLogin(on, msg) {
  $('#login').hidden = !on;
  $('#app').hidden = on;
  $('#tb').hidden = on;
  var e = $('#lerr');
  if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
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
  var tm = setTimeout(function () { if (ctl) ctl.abort(); }, isWrite ? 20000 : 8000);

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
      ST.tx = LS.get(LS.mk('t', ST.ym));
      render();
      painted = true;
    }
  }
  if (!painted) renderSkeleton();

  return api('init', { ym: ST.ym || todayYmd().slice(0, 7), who: ST.who }).then(function (j) {
    ST.boot = j.data.boot; ST.me = j.me;
    var ms = ST.boot.months || [];
    ST.ym = ST.ym || ms[0] || todayYmd().slice(0, 7);
    ST.month = j.data.month;
    setInbox((j.data.inbox && j.data.inbox.items) || []);
    LS.set('boot', { boot: ST.boot, me: ST.me });
    LS.set(LS.mk('m', ST.ym), ST.month);
    paintWho(); paintMonthNav();
    render();
    lastLoad = Date.now();
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '로그인이 필요합니다. 등록된 계정으로 다시 시도해주세요.'); return; }
    if (!painted) renderError(e.message);
  });
}
function loadMonth(ym) {
  ST.ym = ym; ST.tx = null;
  paintMonthNav();
  var cm = LS.get(LS.mk('m', ym));
  if (cm) { ST.month = cm; ST.tx = LS.get(LS.mk('t', ym)); render(); }
  else renderSkeleton();
  var wantWho = ST.who;
  return api('month', { ym: ym, who: wantWho }).then(function (j) {
    if (ST.ym !== ym || ST.who !== wantWho) return;
    ST.month = j.data;
    LS.set(LS.mk('m', ym), j.data);
    render();
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요. 다시 로그인해주세요.'); return; }
    renderError(e.message);
  });
}
function loadTx(silent) {
  if (txLoading) return txLoading;
  if (!silent) renderSkeleton();
  var want = ST.ym, wantWho = ST.who;
  txLoading = api('tx2', { ym: want, who: wantWho }).then(function (j) {
    txLoading = null;
    if (ST.ym !== want || ST.who !== wantWho) return;
    ST.tx = j.data;
    LS.set(LS.mk('t', want), j.data);
    if (ST.tab === 'tx') render();
  }).catch(function (e) {
    txLoading = null;
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요.'); return; }
    if (ST.tab === 'tx') renderError(e.message);
  });
  return txLoading;
}
var lastLoad = 0;
function refreshAll() {
  var want = ST.ym, wantWho = ST.who;
  return api('month', { ym: want, who: wantWho }).then(function (j) {
    if (ST.ym !== want || ST.who !== wantWho) return;
    ST.month = j.data;
    LS.set(LS.mk('m', want), j.data);
    return loadTx(true);
  }).then(function () { lastLoad = Date.now(); render(); })
  .catch(function (e) {
    /* 조용히 삼키면 안 된다. 저장은 됐는데 화면만 옛날 값인 상태로
       남아서, 시트에는 있는데 앱에는 없는 것처럼 보였다.
       화면은 아래 낙관적 반영으로 이미 맞춰져 있으니, 여기서는
       합계가 아직 옛날 값일 수 있다는 것만 알리고 다음에 다시 받는다. */
    if (e && e.message === 'auth') return;
    lastLoad = 0;
    toast('합계 갱신이 늦어요. 잠시 후 다시 받아올게요');
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
  LS.set(LS.mk('t', ST.ym), ST.tx);
}

/* 보던 탭을 기억한다. 새로고침하면 늘 홈으로 튕기던 걸 막는다. */
function paintTabs() {
  [].forEach.call(document.querySelectorAll('#tb button[data-tab]'), function (x) {
    var on = x.dataset.tab === ST.tab;
    var label = (x.textContent || '').trim();
    x.classList.toggle('on', on);
    x.innerHTML = on ? '<span>' + label + '</span>' : label;
  });
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
  ST.tx = null; ST.catsOpen = false;
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
  if (ST.inbox.length) wrap.appendChild(cardInbox({ limit: 3 }));
  wrap.appendChild(cardPnl(M));
  wrap.appendChild(cardPace(M));
  wrap.appendChild(cardCats(M));
  wrap.appendChild(cardPeople(M));
  s.appendChild(wrap);
  bindHome();
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

function cardPnl(M) {
  var p = M.pnl, up = p.net >= 0;
  var inc = p.income || 0;
  var wv = inc > 0 ? clamp(p.variable / inc * 100, 0, 100) : (p.spend > 0 ? 100 : 0);
  var wf = inc > 0 ? clamp(p.fixed / inc * 100, 0, 100 - wv) : 0;
  var sr = p.savingRate == null ? null : pct(p.savingRate);
  var sub = (sr == null ? '수입 없음' : '저축률 ' + sr + '%') +
            ' · 지난달보다 ' + SG(p.prevDelta) + '원';
  var c = el('div', 'card');
  c.innerHTML =
    '<div class="pnl-top"><span class="lb">이번 달 예상 손익</span>' +
      '<span class="tag ' + (up ? 'up' : 'dn') + '">' + (up ? '흑자' : '적자') + '</span></div>' +
    '<div class="pnl-big"><span class="v' + (up ? '' : ' dn') + '">' + SG(p.net) + '</span>' +
      '<span class="w' + (up ? '' : ' dn') + '">원</span></div>' +
    '<div class="pnl-sub">' + esc(sub) + '</div>' +
    '<div class="seg">' +
      '<div style="width:' + wv.toFixed(1) + '%;background:var(--coral-pale)"></div>' +
      '<div style="width:' + wf.toFixed(1) + '%;background:var(--butter-pale)"></div>' +
      '<div style="flex:1;background:var(--mint-pale)"></div></div>' +
    '<div class="trio">' +
      '<div><span class="k">수입</span><span class="n">' + C(p.income) + '</span></div>' +
      '<div><span class="k">지출 (' + M.day + '일)</span><span class="n">' + C(p.spend) + '</span></div>' +
      '<div><span class="k">고정지출</span><span class="n">' + C(p.fixed) + '</span></div>' +
    '</div>';
  return c;
}

function paceSvg(M, mode) {
  var pc = M.pace, dim = M.dim, day = M.day;
  var W = 340, top = 8, bot = 120, L = 4, R = 4, IW = W - L - R;
  var cur = pc.cur || [], prev = pc.prev || [], B = pc.budget || 0;
  var curV = [], prevV = [];
  if (mode === 'w') {
    var marks = [0];
    for (var d = 7; d < dim; d += 7) marks.push(d);
    marks.push(dim);
    if (day < dim && marks.indexOf(day) < 0) { marks.push(day); marks.sort(function (a, b) { return a - b; }); }
    var pd0 = prev.length || dim;
    marks.forEach(function (d) {
      curV.push({ x: d / dim, v: d === 0 ? 0 : (d <= day ? cur[d - 1] : null) });
      var pi = Math.max(1, Math.min(pd0, Math.round(d / dim * pd0)));
      prevV.push({ x: d / dim, v: d === 0 ? 0 : prev[pi - 1] });
    });
  } else {
    for (var i = 0; i < dim; i++) curV.push({ x: (i + 1) / dim, v: cur[i] });
    var pd = prev.length || 1;
    for (var k = 0; k < pd; k++) prevV.push({ x: (k + 1) / pd, v: prev[k] });
  }
  var mx = B;
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
    (B ? '<line x1="' + L + '" y1="' + bot + '" x2="' + (W - R) + '" y2="' + Y(B).toFixed(1) +
         '" stroke="var(--pace)" stroke-width="2.5" stroke-dasharray="6 5"/>' : '') +
    (prevPts ? '<polyline points="' + prevPts + '" fill="none" stroke="var(--prev-line)" stroke-width="2" stroke-linejoin="round"/>' : '') +
    area +
    (curPts ? '<polyline points="' + curPts + '" fill="none" stroke="var(--coral-line)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' : '') +
    (lastC ? '<circle cx="' + X(lastC.x).toFixed(1) + '" cy="' + Y(lastC.v).toFixed(1) +
             '" r="4.5" fill="var(--coral-line)" stroke="#fff" stroke-width="2"/>' : '') +
    '</svg>';
}

function cardPace(M) {
  var pc = M.pace, dim = M.dim, mode = ST.paceMode;
  var axis = ['1일', '8일', '16일', '24일', dim + '일'];
  var gapGood = pc.gap <= 0, pvGood = pc.prevGap <= 0;
  var c = el('div', 'card chart');
  c.innerHTML =
    '<div class="ct"><h3>누적 소비 vs 예산 페이스</h3>' +
      '<div class="tog" id="ptog">' +
        '<button data-m="d" class="' + (mode === 'd' ? 'on' : '') + '">일별</button>' +
        '<button data-m="w" class="' + (mode === 'w' ? 'on' : '') + '">주별</button>' +
      '</div></div>' +
    '<div class="ct" style="margin-top:4px"><span class="sub">' +
      (pc.budget ? '예산 ' + C(pc.budget) + '원' + (M.who ? '(가구 전체)' : '') + ' · ' : '예산 미설정 · ') +
      Number(M.ym.slice(5, 7)) + '월 ' + M.day + '일까지</span></div>' +
    '<div style="margin-top:12px">' + paceSvg(M, mode) + '</div>' +
    '<div class="xax">' + axis.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' +
    '<div class="lgd">' +
      '<span><i style="background:var(--coral-line)"></i>이번 달</span>' +
      '<span><i style="background:var(--prev-line)"></i>지난달</span>' +
      '<span><i style="background:var(--pace)"></i>예산 페이스</span></div>' +
    '<div class="kpi">' +
      '<div class="' + (gapGood ? 'good' : 'bad') + '"><div class="k">페이스</div>' +
        '<div class="n">' + SG(pc.gap) + '</div></div>' +
      '<div class="' + (pvGood ? 'good' : 'bad') + '"><div class="k">지난달 대비</div>' +
        '<div class="n">' + SG(pc.prevGap) + '</div></div>' +
      '<div><div class="k">이번 주 가능</div><div class="n">' + C(pc.weekAllow) + '</div></div>' +
    '</div>';
  return c;
}

function cardCats(M) {
  var all = M.cats || [];
  var lim = ST.catsOpen ? all.length : Math.min(6, all.length);
  var mxs = all.reduce(function (a, b) { return Math.max(a, b.spend || 0); }, 1);
  var rows = all.slice(0, lim).map(function (o) {
    var over = o.ratio != null && o.ratio > 1;
    var w = o.budget ? clamp(o.ratio * 100, 2, 100) : clamp(o.spend / mxs * 100, 2, 100);
    var col = over ? 'var(--coral-bar)' : (o.budget ? catFill(o.name) : 'oklch(.88 .01 285)');
    var pill = '';
    if (over) pill = '<span class="pill over">' + pct(o.ratio) + '%</span>';
    else if (o.delta != null && o.delta >= .3) pill = '<span class="pill up">전월 +' + pct(o.delta) + '%</span>';
    var right = o.budget ? C(o.spend) + ' <em>/ ' + C(o.budget) + '</em>' : C(o.spend) + ' <em>/ —</em>';
    return '<div class="crow"><div class="l1">' +
      '<span class="nm">' + esc(o.name) + pill + '</span>' +
      '<span class="amt' + (over ? ' over' : '') + '">' + right + '</span></div>' +
      '<div class="bar"><i style="width:' + w.toFixed(1) + '%;background:' + col + '"></i></div></div>';
  }).join('');
  var c = el('div', 'card p18');
  c.innerHTML =
    '<div class="ct"><h3>카테고리 · 예산 대비</h3>' +
      '<span class="sub">' + lim + ' / ' + all.length + '개 표시</span></div>' +
    '<div class="cats">' + (rows || '<div class="empty">이 달 지출이 없어요</div>') + '</div>' +
    (all.length > 6
      ? '<div class="more" id="catmore">' + (ST.catsOpen ? '접기' : '나머지 ' + (all.length - 6) + '개 카테고리 보기') + '</div>'
      : '');
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
  var lbl = ps.map(function (p, i) {
    return '<span class="p' + i + '">' + esc(p.name) + ' ' + C(p.spend) + '</span>';
  }).join('');
  var c = el('div', 'card p18');
  c.innerHTML =
    '<div class="ct"><h3>누가 얼마나 썼나</h3>' +
      '<span class="sub">' + Number(M.ym.slice(5, 7)) + '월 ' + M.day + '일까지</span></div>' +
    '<div class="pbar">' + segs + '</div>' +
    '<div class="plg">' + lbl + '</div>';
  return c;
}

function bindHome() {
  var t = $('#ptog');
  if (t) t.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    ST.paceMode = b.dataset.m; render();
  };
  var m = $('#catmore');
  if (m) m.onclick = function () { ST.catsOpen = !ST.catsOpen; render(); };
}

/* ═══════════ 내역 (#1c) ═══════════ */
/* 낭비 후보: 예산 초과 카테고리에서 금액 상위 3건 */
function suggestSet() {
  var set = {};
  if (!ST.month || !ST.tx) return set;
  var over = {};
  (ST.month.cats || []).forEach(function (c) { if (c.ratio != null && c.ratio > 1) over[c.name] = []; });
  if (!Object.keys(over).length) return set;
  (ST.tx.days || []).forEach(function (d) {
    d.rows.forEach(function (r) {
      if (r.gubun === '지출' && over[r.cat]) over[r.cat].push(r);
    });
  });
  Object.keys(over).forEach(function (k) {
    over[k].sort(function (a, b) { return b.amt - a.amt; });
    over[k].slice(0, 3).forEach(function (r) { if (!r.waste) set[r.row] = 1; });
  });
  return set;
}

function passFilter(r) {
  var f = ST.f;
  if (f.cat.length && f.cat.indexOf(r.cat) < 0) return false;
  if (f.pay.length && f.pay.indexOf(r.pay) < 0) return false;
  if (f.waste && !r.waste) return false;
  if (f.q) {
    var q = f.q.toLowerCase();
    if ((r.desc + ' ' + r.cat + ' ' + r.pay).toLowerCase().indexOf(q) < 0) return false;
  }
  return true;
}

function renderTx() {
  var s = $('#screen');
  if (!ST.tx) { renderSkeleton(); if (!txLoading) loadTx(); return; }
  var T = ST.tx, f = ST.f;
  var sug = suggestSet();
  var anyF = f.cat.length || f.pay.length || f.waste || f.q;

  var days = (T.days || []).map(function (d) {
    var rows = d.rows.filter(passFilter);
    return { d: d.d, rows: rows };
  }).filter(function (d) { return d.rows.length; });

  var vs = 0, vi = 0, vc = 0;
  days.forEach(function (d) {
    d.rows.forEach(function (r) {
      vc++;
      if (r.gubun === '지출') vs += r.amt; else if (r.gubun === '수입') vi += r.amt;
    });
  });

  var head =
    '<div class="stack" style="gap:12px">' +
    '<div class="sum3">' +
      '<div><span class="k">지출</span><span class="n sp">' + C(vs) + '</span></div>' +
      '<div><span class="k">수입</span><span class="n in">' + C(vi) + '</span></div>' +
      '<div><span class="k">건수</span><span class="n">' + vc + '</span></div>' +
    '</div>' +
    '<div class="fchips" id="fch">' +
      '<button data-a="all" class="' + (anyF ? '' : 'on') + '">전체</button>' +
      '<button data-a="cat" class="' + (f.cat.length ? 'on' : '') + '">카테고리' + (f.cat.length ? ' ' + f.cat.length : '') + '</button>' +
      '<button data-a="pay" class="' + (f.pay.length ? 'on' : '') + '">결제수단' + (f.pay.length ? ' ' + f.pay.length : '') + '</button>' +
      '<button data-a="waste" class="w ' + (f.waste ? 'on' : '') + '">낭비 ' + (T.waste || 0) + '</button>' +
      '<button data-a="q" class="' + (f.q ? 'on' : '') + '">' + (f.q ? '“' + esc(f.q) + '”' : '검색') + '</button>' +
    '</div>' +
    (vc ? '<div class="txhint">항목을 누르면 고칠 수 있어요 · 길게 누르면 낭비 표시</div>' : '');

  var body = days.map(function (d) {
    var tot = d.rows.reduce(function (a, r) { return a + (r.gubun === '지출' ? r.amt : 0); }, 0);
    var rows = d.rows.map(function (r) {
      var cm = catBadge(r.cat);
      var badge = '<div class="bdg" style="background:' + cm.bg + ';color:' + cm.fg + '">' +
        esc(cm.ab) + '</div>';
      var tag = r.waste ? '<span class="tag-w">낭비</span>' : (sug[r.row] ? '<span class="tag-s">후보</span>' : '');
      return '<button class="trow" data-row="' + r.row + '">' + badge +
        '<div class="mid"><div class="t1">' + esc(r.desc || r.cat) + tag + '</div>' +
        '<div class="t2">' + esc(r.pay || '—') + ' · ' + esc(r.who || '') + '</div></div>' +
        '<span class="amt' + (r.gubun === '수입' ? ' in' : '') + '">' +
        (r.gubun === '수입' ? '+' : '') + C(r.amt) + '</span></button>';
    }).join('');
    return '<div class="dgroup"><div class="dhead">' +
      '<span class="d">' + Number(d.d.slice(5, 7)) + '월 ' + Number(d.d.slice(8, 10)) + '일 <em>' + ymdDow(d.d) + '</em></span>' +
      '<span class="t">' + C(tot) + '</span></div>' + rows + '</div>';
  }).join('');

  s.innerHTML = head + (body || '<div class="empty">' + (anyF ? '조건에 맞는 내역이 없어요' : '이 달 내역이 없어요') + '</div>') + '</div>';
  /* 아직 장부에 안 넣은 알림을 맨 위에 모아 둔다. 며칠 지나서
     한꺼번에 처리할 때 내역과 같은 화면에서 보는 게 편하다. */
  if (ST.inbox.length) {
    var st = s.querySelector('.stack');
    if (st) st.insertBefore(cardInbox({ title: '입력 대기' }), st.firstChild);
  }
  bindTx();
}

function bindTx() {
  var fc = $('#fch');
  if (fc) fc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.dataset.a;
    if (a === 'all') { ST.f = { cat: [], pay: [], waste: false, q: '' }; return render(); }
    if (a === 'waste') { ST.f.waste = !ST.f.waste; return render(); }
    if (a === 'cat') {
      var names = uniq(allRows().map(function (r) { return r.cat; }));
      return pickSheet('카테고리', names, ST.f.cat, true, function (v) { ST.f.cat = v; render(); });
    }
    if (a === 'pay') {
      var pays = uniq(allRows().map(function (r) { return r.pay; }));
      return pickSheet('결제수단', pays, ST.f.pay, true, function (v) { ST.f.pay = v; render(); });
    }
    if (a === 'q') return searchSheet();
  };

  var s = $('#screen');
  var lpT = null, lpRow = null, moved = false;
  s.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('.trow');
    if (!b) return;
    lpRow = +b.dataset.row; moved = false;
    lpT = setTimeout(function () {
      lpT = null;
      var r = findRow(lpRow);
      if (!r) return;
      if (navigator.vibrate) navigator.vibrate(12);
      toggleWaste(r);
      lpRow = null;
    }, 500);
  });
  s.addEventListener('pointermove', function () { moved = true; });
  var end = function (e) {
    if (lpT) {
      clearTimeout(lpT); lpT = null;
      if (!moved && lpRow != null) {
        var b = e.target.closest ? e.target.closest('.trow') : null;
        if (b) openEdit(findRow(lpRow));
      }
    }
    lpRow = null;
  };
  s.addEventListener('pointerup', end);
  s.addEventListener('pointercancel', function () { clearTimeout(lpT); lpT = null; lpRow = null; });
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
function toggleWaste(r) {
  var on = !r.waste;
  r.waste = on;
  if (ST.tx) ST.tx.waste = (ST.tx.waste || 0) + (on ? 1 : -1);
  render();
  api('waste', { row: r.row, on: on ? 1 : 0 })
    .then(function () { toast(on ? '낭비로 표시했어요' : '낭비 표시를 뗐어요'); })
    .catch(function () { r.waste = !on; render(); toast('저장 실패'); });
}

/* ───────── 필터 시트 ───────── */
function pickSheet(title, items, selected, multi, done) {
  var sel = selected.slice();
  var m = el('div', 'mask');
  var sh = el('div', 'sheet');
  function paint() {
    sh.innerHTML = '<h4>' + esc(title) + '</h4><div class="list">' +
      items.map(function (n, i) {
        return '<div class="opt' + (sel.indexOf(n) >= 0 ? ' on' : '') + '" data-i="' + i + '">' +
               (sel.indexOf(n) >= 0 ? '● ' : '○ ') + esc(n) + '</div>';
      }).join('') + '</div>' +
      '<div class="act"><button class="no">모두 해제</button><button class="ok">적용</button></div>';
  }
  paint();
  m.appendChild(sh);
  m.onclick = function (e) {
    if (e.target === m) { m.remove(); return; }
    if (e.target.classList.contains('ok')) { m.remove(); done(sel); return; }
    if (e.target.classList.contains('no')) { sel = []; paint(); return; }
    var o = e.target.closest('.opt');
    if (!o) return;
    var n = items[+o.dataset.i];
    if (multi) {
      var i = sel.indexOf(n);
      if (i >= 0) sel.splice(i, 1); else sel.push(n);
      paint();
    } else {
      m.remove(); done(sel[0] === n ? [] : [n]);
    }
  };
  document.body.appendChild(m);
}
function searchSheet() {
  var m = el('div', 'mask');
  var sh = el('div', 'sheet');
  sh.innerHTML = '<h4>검색</h4><input class="srch" id="sq" placeholder="내용 · 카테고리 · 결제수단" value="' +
    esc(ST.f.q) + '"><div class="act"><button class="no">지우기</button><button class="ok">검색</button></div>';
  m.appendChild(sh);
  document.body.appendChild(m);
  var inp = $('#sq');
  inp.focus();
  m.onclick = function (e) {
    if (e.target === m) { m.remove(); return; }
    if (e.target.classList.contains('ok')) { ST.f.q = inp.value.trim(); m.remove(); render(); }
    if (e.target.classList.contains('no')) { ST.f.q = ''; m.remove(); render(); }
  };
  inp.onkeydown = function (e) { if (e.key === 'Enter') { ST.f.q = inp.value.trim(); m.remove(); render(); } };
}

/* ═══════════ 입력 / 수정 (#1d) ═══════════ */
function catsByGroup(g) {
  var cs = (ST.boot && ST.boot.cats) || [];
  return cs.filter(function (c) {
    if (g === '지출') return c.gubun === '지출';
    if (g === '수입') return c.gubun === '수입';
    return c.gubun !== '지출' && c.gubun !== '수입';
  });
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
  paintInput();
}
function openEdit(r) {
  if (!r) return;
  var g = r.gubun === '수입' ? '수입' : (r.gubun === '지출' ? '지출' : '기타');
  var d = null;
  ((ST.tx && ST.tx.days) || []).forEach(function (x) {
    x.rows.forEach(function (y) { if (y.row === r.row) d = x.d; });
  });
  ST.form = {
    edit: r.row, date: d || todayYmd(), group: g, cat: r.cat, merchant: r.merchant || '',
    desc: r.desc, pay: r.pay, amt: r.amt, memo: '', catOpen: true, payOpen: true
  };
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
  paintInput();
}
function closeInput() {
  var m = $('#modal');
  if (m) m.remove();
  ST.form = null;
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

  root.innerHTML =
    '<div class="ihd">' +
      '<div class="r1"><button class="x" id="ix">✕</button><h2>' + esc(title) + '</h2>' +
        '<div class="who" style="margin-left:auto;padding:4px"><span class="av' + (ST.me === '아내' ? ' b' : '') + '">' +
        esc((ST.me || '·').slice(0, 1)) + '</span></div>' +
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
        '<div class="chips" id="cchips">' + chips(cats.slice(0, catLim).map(function (c) { return c.name; }), F.cat, 'cat') +
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
      (F.edit ? '<div class="delrow"><button id="idel">이 내역 삭제</button></div>' : '') +
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
  di.oninput = function () { F.desc = di.value; };

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
    api('del', { row: delRow }).then(function () {
      closeInput();
      txDel(delRow);
      render();
      toast('삭제했어요');
      refreshAll();
    }).catch(function () { toast('삭제 실패'); });
  };
}
function syncAmt(root) {
  var F = ST.form;
  root.querySelector('#iamt').textContent = C(F.amt);
  root.querySelector('[data-k="save"]').disabled = !canSave(F);
}

function save() {
  var F = ST.form;
  if (!canSave(F)) return;
  var btn = document.querySelector('[data-k="save"]');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  if (!F.nonce) F.nonce = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var p = {
    date: F.date, gubun: gubunOf(F.cat), cat: F.cat,
    desc: F.desc || F.merchant || F.cat, pay: F.pay, amt: F.amt,
    merchant: F.merchant, memo: F.memo, n: F.nonce
  };
  var call = F.edit
    ? api('upd', { row: F.edit, date: p.date, gubun: p.gubun, cat: p.cat,
                   desc: p.desc, pay: p.pay, amt: p.amt, merchant: p.merchant })
    : F.inbox
      ? api('inboxOk', { row: F.inbox, date: p.date, gubun: p.gubun, cat: p.cat,
                         desc: p.desc, pay: p.pay, amt: p.amt, merchant: p.merchant })
      : api('add2', p);
  call.then(function (j) {
    var wasInbox = F.inbox, wasEdit = F.edit;
    var newRow = (j && j.data && j.data.row) || 0;
    closeInput();
    if (wasInbox) dropInbox(wasInbox);
    if (wasEdit) txUpd(wasEdit, p); else txAdd(newRow, p);
    render();
    toast(wasEdit ? '수정했어요' : C(p.amt) + '원 저장했어요');
    refreshAll();
  }).catch(function (e) {
    if (btn) { btn.disabled = false; btn.textContent = F.edit ? '수정' : '저장'; }
    toast('저장 실패: ' + e.message);
  });
}

/* ═══════════ 리포트 — 재무상태 ═══════════ */
function loadReport(silent) {
  if (repLoading) return repLoading;
  var cr = LS.get('rep');
  if (cr && !ST.rep) ST.rep = cr;
  if (!silent && !ST.rep) renderSkeleton();
  repLoading = api('report2', {}).then(function (j) {
    repLoading = null;
    ST.rep = j.data;
    LS.set('rep', j.data);
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
  if (!m || m.length < 7) return m || '';
  return Number(m.slice(5, 7)) + '월';
}

function renderReport() {
  if (!ST.rep) { loadReport(); if (!ST.rep) return; }
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
      hint: '부채 ÷ 자산 · 40% 미만 권장' },
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
    '<div class="ct"><h3>건전성</h3><span class="sub">권장선 대비</span></div>' +
    '<div class="hlt">' + rows.map(function (o) {
      var ok = o.good === 'low' ? o.v <= o.line : o.v >= o.line;
      var val = o.fmt === 'pct' ? pct(o.v) + '%' : (Math.round(o.v * 10) / 10) + '개월';
      var lim = o.fmt === 'pct' ? pct(o.line) + '%' : o.line + '개월';
      /* 막대는 권장선을 60% 지점에 놓고 그린다. 권장선을 넘었는지
         못 미쳤는지가 한눈에 보이게 하려는 것. */
      var w = clamp((o.v / o.line) * 60, 3, 100);
      return '<div class="hrow">' +
        '<div class="l1"><span class="nm">' + esc(o.k) + '</span>' +
          '<span class="vv' + (ok ? ' ok' : ' no') + ' num">' + val + '</span></div>' +
        '<div class="hbar"><i style="width:' + w.toFixed(1) + '%;background:' +
          (ok ? 'var(--mint-bar)' : 'var(--coral-bar)') + '"></i>' +
          '<u style="left:60%"></u></div>' +
        '<div class="hh">' + esc(o.hint) + ' · 권장 ' + lim + '</div>' +
      '</div>';
    }).join('') + '</div>';
  return c;
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
function renderSettings() {
  var s = $('#screen');
  var acc = ((ST.boot && ST.boot.accounts) || []).length;
  s.innerHTML =
    '<div class="stack">' +
      '<div class="card p18 set-me">' +
        '<span class="av' + (ST.me === '아내' ? ' b' : '') + '">' +
          esc((ST.me || '·').slice(0, 1)) + '</span>' +
        '<div><b>' + esc(ST.me || '—') + '</b><span>로 로그인됨</span></div>' +
      '</div>' +
      '<div class="card p18 setlist">' +
        '<button data-k="who"><span>보는 대상</span><em>' + esc(ST.who || WHO_ALL) + '</em></button>' +
        '<button data-k="inbox"><span>결제 알림 확인</span><em>' +
          (ST.inbox.length ? ST.inbox.length + '건 대기' : '대기 없음') + '</em></button>' +
        '<button data-k="reload"><span>새로고침</span><em>서버에서 다시 불러오기</em></button>' +
        '<button data-k="out" class="danger"><span>로그아웃</span><em></em></button>' +
      '</div>' +
      '<div class="setfoot">등록된 계좌 ' + acc + '개</div>' +
    '</div>';
  s.querySelector('.setlist').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var k = b.dataset.k;
    if (k === 'who') return switchWho();
    if (k === 'inbox') {
      toast('확인 중…');
      return reloadInbox().then(function () {
        if (!ST.inbox.length) return toast('대기 중인 결제 알림이 없어요');
        ST.tab = 'home';
        [].forEach.call(document.querySelectorAll('#tb button[data-tab]'), function (x) {
          var on = x.dataset.tab === 'home';
          var label = (x.textContent || '').trim();
          x.classList.toggle('on', on);
          x.innerHTML = on ? '<span>' + label + '</span>' : label;
        });
        render();
      });
    }
    if (k === 'reload') {
      LS.clear();
      if (ST.who) LS.set('who', ST.who);
      LS.set('tab', ST.tab);
      ST.tx = null; ST.month = null; ST.rep = null;
      return start();
    }
    if (k === 'out') return logout();
  };
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
  ST.catsOpen = false;
  loadMonth(ms[j]);
}

document.addEventListener('DOMContentLoaded', function () {
  $('#mprev').onclick = function () { shiftMonth(-1); };
  $('#mnext').onclick = function () { shiftMonth(1); };

  $('#whobtn').onclick = switchWho;

  $('#tb').onclick = function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    ST.tab = b.dataset.tab;
    LS.set('tab', ST.tab);
    paintTabs();
    render();
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
});

})();
