/* 우리집 가계부 v2 — 프런트엔드
   백엔드: Apps Script JSON API (?api=boot2|month|tx2|report2 …)
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

/* 카테고리 색 — 이름 해시로 고정 배정 */
var PAL = [
  'oklch(.78 .06 240)', 'oklch(.78 .07 165)', 'oklch(.8 .07 92)',
  'oklch(.78 .06 300)', 'oklch(.76 .07 200)', 'oklch(.78 .06 330)',
  'oklch(.78 .07 135)', 'oklch(.8 .08 60)', 'oklch(.76 .07 270)',
  'oklch(.78 .05 220)', 'oklch(.79 .06 110)'
];
function catColor(name) {
  var h = 0, s = String(name || '');
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PAL[h % PAL.length];
}

/* ───────── 상태 ───────── */
var ST = {
  token: null, exp: 0, me: null, email: null,
  boot: null, month: null, ym: null,
  tab: 'home', paceMode: 'd', catsOpen: false,
  loading: false
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
    client_id: CLIENT_ID,
    callback: onCredential,
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true
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

/* ───────── API ───────── */
function api(name, params) {
  if (!tokenAlive()) { reprompt(); return Promise.reject(new Error('auth')); }
  var u = new URL(EXEC);
  u.searchParams.set('api', name);
  u.searchParams.set('t', ST.token);
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  });
  return fetch(u.toString(), { method: 'GET', credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.code === 401) { ST.token = null; reprompt(); throw new Error('auth'); }
      if (!j || !j.ok) throw new Error((j && j.error) || 'API 오류');
      return j;
    });
}

/* ───────── 부팅 ───────── */
function start() {
  showLogin(false);
  renderSkeleton();
  api('boot2', {}).then(function (j) {
    ST.boot = j.data; ST.me = j.me;
    var ms = j.data.months || [];
    ST.ym = ST.ym || ms[0] || new Date().toISOString().slice(0, 7);
    paintWho();
    return loadMonth(ST.ym);
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '로그인이 필요합니다.'); return; }
    renderError(e.message);
  });
}
function loadMonth(ym) {
  ST.ym = ym;
  paintMonthNav();
  renderSkeleton();
  return api('month', { ym: ym }).then(function (j) {
    ST.month = j.data;
    render();
  }).catch(function (e) {
    if (e.message === 'auth') { showLogin(true, '세션이 만료됐어요. 다시 로그인해주세요.'); return; }
    renderError(e.message);
  });
}

/* ───────── 헤더 ───────── */
function paintWho() {
  var me = ST.me || '';
  $('#whonm').textContent = '가구 전체';
  var av = $('#whoav');
  av.textContent = me ? me.slice(0, 1) : '·';
  av.className = 'av' + (me === '아내' ? ' b' : '');
  $('#whobtn').title = me + ' 로 로그인됨';
}
function paintMonthNav() {
  $('#mlabel').textContent = ymLabel(ST.ym);
  var ms = (ST.boot && ST.boot.months) || [];
  var i = ms.indexOf(ST.ym);
  $('#mprev').disabled = !(i >= 0 && i < ms.length - 1);
  $('#mnext').disabled = !(i > 0);
}

/* ───────── 렌더: 스켈레톤 / 에러 ───────── */
function renderSkeleton() {
  var s = $('#screen');
  s.innerHTML =
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

/* ───────── 렌더: 홈(#1a) ───────── */
function render() {
  if (ST.tab !== 'home') return renderSoon();
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

/* 페이스 차트 SVG */
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
    var col = over ? 'var(--coral-bar)' : (o.budget ? catColor(o.name) : 'oklch(.88 .01 285)');
    var pill = '';
    if (over) pill = '<span class="pill over">' + pct(o.ratio) + '%</span>';
    else if (o.delta != null && o.delta >= .3) pill = '<span class="pill up">전월 +' + pct(o.delta) + '%</span>';
    var right = o.budget
      ? C(o.spend) + ' <em>/ ' + C(o.budget) + '</em>'
      : C(o.spend) + ' <em>/ —</em>';
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
      ? '<div class="more" id="catmore">' +
        (ST.catsOpen ? '접기' : '나머지 ' + (all.length - 6) + '개 카테고리 보기') + '</div>'
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

/* ───────── 아직 없는 탭 ───────── */
var SOON = {
  tx: ['내역', '거래 목록·검색·수정과 낭비 태그가 들어갈 자리예요.'],
  report: ['리포트', '재무상태표와 소비 리포트가 들어갈 자리예요.'],
  settings: ['설정', '계정·예산·카테고리 설정이 들어갈 자리예요.']
};
function renderSoon() {
  var s = SOON[ST.tab] || ['—', ''];
  $('#screen').innerHTML =
    '<div class="soon"><b>' + esc(s[0]) + '</b>' + esc(s[1]) + '<br>다음 단계에서 붙습니다.</div>';
}

/* ───────── 시트 ───────── */
function sheet(title, opts) {
  var m = el('div', 'mask');
  var sh = el('div', 'sheet');
  sh.innerHTML = '<h4>' + esc(title) + '</h4>' +
    opts.map(function (o, i) {
      return '<div class="opt' + (o.on ? ' on' : '') + '" data-i="' + i + '">' + esc(o.label) + '</div>';
    }).join('');
  m.appendChild(sh);
  m.onclick = function (e) {
    if (e.target === m) { document.body.removeChild(m); return; }
    var o = e.target.closest('.opt');
    if (!o) return;
    document.body.removeChild(m);
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
      { label: '새로고침', run: function () { ST.month = null; start(); } },
      { label: '로그아웃', run: function () {
          try { sessionStorage.removeItem('idt'); } catch (e) {}
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
      x.classList.toggle('on', on);
      x.innerHTML = on ? '<span>' + x.textContent.trim() + '</span>' : x.textContent.trim();
    });
    render();
  };
  $('#fab').onclick = function () {
    sheet('빠른 입력', [{ label: '입력 화면은 다음 단계에서 붙습니다' }]);
  };

  // GIS 준비 대기
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
  if (!tokenAlive()) { reprompt(); return; }
  if (ST.tab === 'home' && ST.ym) loadMonth(ST.ym);
});

})();
