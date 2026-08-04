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
var CATMAP = {
  '주거/관리비': ['주거', 240], '통신비': ['통신', 270], '보험료': ['보험', 300],
  '교통/차량': ['교통', 220], '식비': ['식비', 165], '외식/배달': ['외식', 25],
  '생활용품': ['생활', 320], '의료/건강': ['의료', 350], '교육/육아': ['교육', 92],
  '문화/여가': ['문화', 290], '의류/미용': ['의류', 330], '경조사': ['경조', 60],
  '여행': ['여행', 200], '반려동물': ['반려', 135], '세금/공과금': ['세금', 250],
  '기타지출': ['기타', 285], '대출이자': ['이자', 15],
  '저축': ['저축', 175], '투자': ['투자', 185], '연금': ['연금', 195],
  '대출원금상환': ['상환', 10], '계좌이체': ['이체', 285]
};
function catMeta(name) {
  var m = CATMAP[name];
  if (m) return { ab: m[0], h: m[1] };
  var s = String(name || ''), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  var ab = s.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 2) || '기타';
  return { ab: ab, h: [165, 240, 92, 300, 200, 330, 135, 60, 270, 220][h % 10] };
}
function catFill(name) {
  var m = CATMAP[name];
  if (m) return 'oklch(.78 .06 ' + m[1] + ')';
  return 'oklch(.78 .06 ' + catMeta(name).h + ')';
}

/* ───────── 상태 ───────── */
var txLoading = null;
var ST = {
  token: null, exp: 0, me: null,
  boot: null, month: null, tx: null, ym: null,
  tab: 'home', paceMode: 'd', catsOpen: false,
  f: { cat: [], pay: [], who: null, waste: false, q: '' },
  form: null
};

/* ───────── 인증 ───────── */
function jwtExp(t) {
  try {
    var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (p.exp || 0) * 1000;
  } catch (e) { return 0; }
}
function setToken(t) {
  ST.token = t; ST.exp = jwtExp(t);
  try { sessionStorage.setItem('idt', t); } catch (e) {}
}
function loadToken() {
  try {
    var t = sessionStorage.getItem('idt');
    if (t && jwtExp(t) - Date.now() > 60000) { ST.token = t; ST.exp = jwtExp(t); return true; }
  } catch (e) {}
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
function onCredential(res) {
  promptPending = false;
  if (!res || !res.credential) return;
  setToken(res.credential);
  showLogin(false);
  start();
}
function reprompt() {
  if (promptPending || !gisReady) return;
  promptPending = true;
  try { google.accounts.id.disableAutoSelect(); } catch (e) {}
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
function api(name, params, _try) {
  if (!tokenAlive()) { reprompt(); return Promise.reject(new Error('auth')); }
  _try = _try || 0;
  var u = new URL(EXEC);
  u.searchParams.set('api', name);
  u.searchParams.set('t', ST.token);
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  });
  if (_try) u.searchParams.set('_r', _try);

  var ctl = window.AbortController ? new AbortController() : null;
  var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);

  function again(why) {
    if (_try >= 2) throw new Error(why);
    return new Promise(function (res) { setTimeout(res, 500 * (_try + 1)); })
      .then(function () { return api(name, params, _try + 1); });
  }

  return fetch(u.toString(), { method: 'GET', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
    .then(function (r) { clearTimeout(tm); return r.text(); })
    .then(function (txt) {
      var j = null;
      try { j = JSON.parse(txt); } catch (e) {}
      if (!j) return again('서버가 응답하지 않아요. 잠시 후 다시 시도해주세요.');
      if (j.code === 401) { ST.token = null; reprompt(); throw new Error('auth'); }
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
  var cb = LS.get('boot');
  var painted = false;
  if (cb && cb.boot) {
    ST.boot = cb.boot; ST.me = cb.me;
    ST.ym = ST.ym || (cb.boot.months || [])[0] || todayYmd().slice(0, 7);
    var cm = LS.get('m.' + ST.ym);
    if (cm) {
      ST.month = cm;
      paintWho(); paintMonthNav();
      ST.tx = LS.get('t.' + ST.ym);
      render();
      painted = true;
    }
  }
  if (!painted) renderSkeleton();

  return api('init', { ym: ST.ym || todayYmd().slice(0, 7) }).then(function (j) {
    ST.boot = j.data.boot; ST.me = j.me;
    var ms = ST.boot.months || [];
    ST.ym = ST.ym || ms[0] || todayYmd().slice(0, 7);
    ST.month = j.data.month;
    LS.set('boot', { boot: ST.boot, me: ST.me });
    LS.set('m.' + ST.ym, ST.month);
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
  var cm = LS.get('m.' + ym);
  if (cm) { ST.month = cm; ST.tx = LS.get('t.' + ym); render(); }
  else renderSkeleton();
  return api('month', { ym: ym }).then(function (j) {
    if (ST.ym !== ym) return;
    ST.month = j.data;
    LS.set('m.' + ym, j.data);
    render();
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요. 다시 로그인해주세요.'); return; }
    renderError(e.message);
  });
}
function loadTx(silent) {
  if (txLoading) return txLoading;
  if (!silent) renderSkeleton();
  var want = ST.ym;
  txLoading = api('tx2', { ym: want }).then(function (j) {
    txLoading = null;
    if (ST.ym !== want) return;
    ST.tx = j.data;
    LS.set('t.' + want, j.data);
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
  var want = ST.ym;
  return api('month', { ym: want }).then(function (j) {
    if (ST.ym !== want) return;
    ST.month = j.data;
    LS.set('m.' + want, j.data);
    return loadTx(true);
  }).then(function () { lastLoad = Date.now(); render(); }).catch(function () {});
}

/* ───────── 헤더 ───────── */
function paintWho() {
  var me = ST.me || '';
  $('#whonm').textContent = '가구 전체';
  var av = $('#whoav');
  av.textContent = me ? me.slice(0, 1) : '·';
  av.className = 'av' + (me === '아내' ? ' b' : '');
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
  return renderSoon();
}

/* ═══════════ 홈 (#1a) ═══════════ */
function renderHome() {
  var M = ST.month;
  if (!M) return;
  var s = $('#screen');
  s.innerHTML = '';
  var wrap = el('div', 'stack');
  wrap.appendChild(cardPnl(M));
  wrap.appendChild(cardPace(M));
  wrap.appendChild(cardCats(M));
  wrap.appendChild(cardPeople(M));
  s.appendChild(wrap);
  bindHome();
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
      (pc.budget ? '예산 ' + C(pc.budget) + '원 · ' : '예산 미설정 · ') +
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
  if (f.who && r.who !== f.who) return false;
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
  var anyF = f.cat.length || f.pay.length || f.who || f.waste || f.q;

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
      '<button data-a="who" class="' + (f.who ? 'on' : '') + '">' + (f.who || '사람') + '</button>' +
      '<button data-a="waste" class="w ' + (f.waste ? 'on' : '') + '">낭비 ' + (T.waste || 0) + '</button>' +
      '<button data-a="q" class="' + (f.q ? 'on' : '') + '">' + (f.q ? '“' + esc(f.q) + '”' : '검색') + '</button>' +
    '</div>';

  var body = days.map(function (d) {
    var tot = d.rows.reduce(function (a, r) { return a + (r.gubun === '지출' ? r.amt : 0); }, 0);
    var rows = d.rows.map(function (r) {
      var cm = catMeta(r.cat);
      var badge = '<div class="bdg" style="background:oklch(.94 .04 ' + cm.h + ');color:oklch(.48 .11 ' + cm.h + ')">' + esc(cm.ab) + '</div>';
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
  bindTx();
}

function bindTx() {
  var fc = $('#fch');
  if (fc) fc.onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.dataset.a;
    if (a === 'all') { ST.f = { cat: [], pay: [], who: null, waste: false, q: '' }; return render(); }
    if (a === 'waste') { ST.f.waste = !ST.f.waste; return render(); }
    if (a === 'cat') {
      var names = uniq(allRows().map(function (r) { return r.cat; }));
      return pickSheet('카테고리', names, ST.f.cat, true, function (v) { ST.f.cat = v; render(); });
    }
    if (a === 'pay') {
      var pays = uniq(allRows().map(function (r) { return r.pay; }));
      return pickSheet('결제수단', pays, ST.f.pay, true, function (v) { ST.f.pay = v; render(); });
    }
    if (a === 'who') {
      return pickSheet('사람', ['폴', '아내', '공동'], ST.f.who ? [ST.f.who] : [], false, function (v) {
        ST.f.who = v[0] || null; render();
      });
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
    edit: r.row, date: d || todayYmd(), group: g, cat: r.cat, merchant: '',
    desc: r.desc, pay: r.pay, amt: r.amt, memo: '', catOpen: true, payOpen: true
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

  var title = F.edit ? '내역 수정' : (F.group === '수입' ? '수입 입력' : F.group === '지출' ? '지출 입력' : '기타 입력');
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
    api('del', { row: F.edit }).then(function () {
      closeInput(); toast('삭제했어요'); refreshAll();
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
  var p = {
    date: F.date, gubun: gubunOf(F.cat), cat: F.cat,
    desc: F.desc || F.merchant || F.cat, pay: F.pay, amt: F.amt,
    merchant: F.merchant, memo: F.memo
  };
  var call = F.edit
    ? api('upd', { row: F.edit, cat: p.cat, desc: p.desc, pay: p.pay, amt: p.amt })
    : api('add2', p);
  call.then(function () {
    closeInput();
    toast(F.edit ? '수정했어요' : C(p.amt) + '원 저장했어요');
    refreshAll();
  }).catch(function (e) {
    if (btn) { btn.disabled = false; btn.textContent = F.edit ? '수정' : '저장'; }
    toast('저장 실패: ' + e.message);
  });
}

/* ───────── 아직 없는 탭 ───────── */
var SOON = {
  report: ['리포트', '재무상태표와 소비 리포트가 들어갈 자리예요.'],
  settings: ['설정', '계정·예산·카테고리 설정이 들어갈 자리예요.']
};
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

  $('#whobtn').onclick = function () {
    sheet('계정', [
      { label: (ST.me || '—') + ' 로 로그인됨' },
      { label: '새로고침', run: function () { ST.tx = null; start(); } },
      { label: '로그아웃', run: function () {
          try { sessionStorage.removeItem('idt'); } catch (e) {}
          LS.clear();
          ST.token = null; ST.exp = 0;
          if (gisReady) google.accounts.id.disableAutoSelect();
          showLogin(true);
        } }
    ]);
  };

  $('#tb').onclick = function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    ST.tab = b.dataset.tab;
    [].forEach.call(document.querySelectorAll('#tb button[data-tab]'), function (x) {
      var on = x.dataset.tab === ST.tab;
      var label = (x.textContent || '').trim();
      x.classList.toggle('on', on);
      x.innerHTML = on ? '<span>' + label + '</span>' : label;
    });
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
  else showLogin(true);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
});

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  if (ST.form) return;
  if (!tokenAlive()) { reprompt(); return; }
  if (Date.now() - lastLoad < 90000) return;
  if (ST.ym && ST.boot) refreshAll();
});

})();
