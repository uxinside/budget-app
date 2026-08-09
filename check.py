#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
배포 전 검사 — 조용히 지나가는 실수만 골라 잡는다.

  python3 check.py            # 문제 있으면 종료코드 1
  python3 check.py -v         # 통과한 항목까지 전부 출력

왜 만들었나 (2026-08-05, 전부 실제로 겪은 것)

  · showHealth() 를 설정 화면에서 부르는데 함수가 아예 없었다.
    누르면 ReferenceError 만 나고 아무 일도 안 났는데 몇 주간 아무도 몰랐다.
  · app.css 가 var(--divider-s) 를 쓰는데 그 변수는 정의된 적이 없다.
    내역 날짜 헤더 밑줄이 그동안 안 그려지고 있었다.
  · 1.10.0 때 「다가오는 카드 결제」 CSS 블록이 통째로 빠져서 화면이 뭉갰다.
    JS 는 class 를 붙이는데 CSS 에 그 이름이 없던 것이다.
  · bump.py 를 돌린 뒤 낡은 사본을 덮어써서 APP_V 만 옛 번호로 되돌아갔다.
    index.html·sw.js 는 새 번호라 아무 데서도 안 걸렸다.

넷 다 문법 오류가 아니라서 `node --check` 로는 안 잡힌다.
사람 눈으로도 안 잡혔다. 그래서 기계가 본다.

오탐이 나면 이 검사는 곧 무시당한다. 애매한 건 경고로만 내고,
확실한 것만 오류로 올린다.
"""
import io, os, re, sys, json, subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
V = '-v' in sys.argv

# ── 아직 판단이 안 끝나 통과시키는 것들 ────────────────────────────
# 여기 이름이 적혀 있는 동안은 오류로 안 올린다. 목록 자체가 빚이라
# 늘어나면 그만큼 미해결이 쌓였다는 뜻이다.
ALLOW = {
    'css-var': {
        # 미해결 ⑪ — 밑줄을 살릴지 폴 판단 대기. 살리려면 :root 에
        # --divider-s 를 넣거나 .dhead 를 --divider 로 바꾸면 된다.
        'divider-s',
    },
    'css-class': set(),
    'fn': set(),
}

# 어디서나 있는 표준 전역
GLOBALS_JS = """
isNaN isFinite parseInt parseFloat
encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape
""".split()

# 브라우저·구글이 주는 것들. 여기 없는 이름을 부르면 오류로 본다.
GLOBALS_BROWSER = GLOBALS_JS + """
window document navigator location history caches fetch console
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame
alert confirm prompt atob btoa google gtag
""".split()

GLOBALS_GAS = GLOBALS_JS + """
SpreadsheetApp PropertiesService CacheService LockService Utilities Session
UrlFetchApp ScriptApp DriveApp Logger HtmlService ContentService MailApp
GmailApp CalendarApp Browser
""".split()

KEYWORDS = """
if for while switch catch return function typeof new else do in of var let const
delete void instanceof yield await throw case
""".split()


def read(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8').read()


def strip_noise(src):
    """주석과 문자열을 공백으로 지운다. 줄 번호는 그대로 남긴다.

    이게 없으면 오탐이 쏟아진다 — 주석에 적어둔 `disableAutoSelect()` 도,
    JS 안에 든 CSS 문자열의 `var(--coral-line)` 도 함수 호출로 읽혔다.
    오탐이 나오는 검사는 곧 아무도 안 본다.
    """
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nx = src[i + 1] if i + 1 < n else ''
        if c == '/' and nx == '*':
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(''.join('\n' if x == '\n' else ' ' for x in src[i:j]))
            i = j
        elif c == '/' and nx == '/':
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
        elif c in '\'"`':
            q, j = c, i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == q:
                    j += 1
                    break
                if src[j] == '\n' and q != '`':
                    break                      # 안 닫힌 따옴표 — 줄에서 끊는다
                j += 1
            out.append(''.join('\n' if x == '\n' else ' ' for x in src[i:j]))
            i = j
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def js_files(paths):
    return {p: read(p) for p in paths if os.path.exists(os.path.join(ROOT, p))}


# ── ① 정의 없는 함수 호출 ────────────────────────────────────────
def check_calls(files0, extra_globals, label):
    """여러 파일이 하나의 전역을 공유하는 경우(GAS)를 위해 통째로 본다."""
    files = {k: strip_noise(v) for k, v in files0.items()}
    src = '\n'.join(files.values())

    defined = set()
    defined |= set(re.findall(r'(?:^|[\s;{(])function\s+([A-Za-z0-9_$]+)', src))
    # var·let·const 를 다 본다. Code.gs 의 `const num = function (v)` 를
    # var 만 보다가 「정의 없음」으로 잘못 올렸다.
    defined |= set(re.findall(
        r'\b(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*(?:function|\(|[A-Za-z0-9_$]+\s*=>)', src))
    # 지역 변수·매개변수 이름도 모은다. 이름이 겹칠 뿐인 걸 오류로 올리면
    # 검사가 금방 신뢰를 잃는다.
    defined |= set(re.findall(r'\b(?:var|let|const)\s+([A-Za-z0-9_$]+)', src))
    for args in re.findall(r'function\s*\(([^)]*)\)', src):
        for a in args.split(','):
            a = a.strip()
            if a:
                defined.add(a)

    ok = set(extra_globals) | set(KEYWORDS) | ALLOW['fn']
    bad = {}
    for path, text in files.items():
        for i, line in enumerate(text.split('\n'), 1):
            # 앞에 . 이 없는 것만 = 메서드 호출이 아니라 전역 함수 호출
            for m in re.finditer(r'(?:^|[^.\w$"\'])([a-z_$][A-Za-z0-9_$]*)\s*\(', line):
                n = m.group(1)
                if n in defined or n in ok or n.startswith('_'):
                    continue
                bad.setdefault(n, '%s:%d' % (path, i))
    return [('%s — 정의 없는 함수 호출  %s  (%s)' % (label, n, w))
            for n, w in sorted(bad.items())]


# ── ② 정의 없는 CSS 변수 ────────────────────────────────────────
def check_css_vars(css):
    declared = set(re.findall(r'--([a-zA-Z0-9-]+)\s*:', css))
    used = set(re.findall(r'var\(\s*--([a-zA-Z0-9-]+)', css))
    bad = sorted(v for v in used - declared if v not in ALLOW['css-var'])
    skipped = sorted(v for v in used - declared if v in ALLOW['css-var'])
    return ['정의 없는 CSS 변수  --%s' % v for v in bad], skipped


# ── ③ JS 가 붙이는데 CSS 에 없는 class ──────────────────────────
def check_classes(js, css):
    css_names = set(re.findall(r'\.([a-zA-Z][a-zA-Z0-9_-]*)', css))
    js_names = set()
    # class="a b c" — 안에 ' + 변수 + ' 가 섞인 건 건너뛴다(정적으로 못 읽음)
    for chunk in re.findall(r'class="([^"$+{}]*)"', js):
        js_names |= {c for c in chunk.split() if c}
    # el('div', 'card p18')
    for chunk in re.findall(r"el\(\s*'[a-z]+'\s*,\s*'([a-z0-9 _-]+)'\s*\)", js, re.I):
        js_names |= {c for c in chunk.split() if c}
    bad = sorted(c for c in js_names - css_names
                 if not c.isdigit() and c not in ALLOW['css-class'])
    return ['CSS 에 없는 class  .%s' % c for c in bad]


# ── ④ 버전 네 곳 일치 ───────────────────────────────────────────
def check_version():
    app = read('app.js')
    m = re.search(r"var APP_V = '([^']+)'", app)
    if not m:
        return ['app.js 에서 APP_V 를 못 찾음'], None
    ver = m.group(1)
    found = {'app.js APP_V': ver}
    html = read('index.html')
    for key, pat in [('index.html css', r'app\.css\?v=([^"\']+)'),
                     ('index.html js', r'app\.js\?v=([^"\']+)')]:
        mm = re.search(pat, html)
        found[key] = mm.group(1) if mm else '(없음)'
    sw = read('sw.js')
    mm = re.search(r"var V = 'hb-([^']+)'", sw)
    found['sw.js V'] = mm.group(1) if mm else '(없음)'
    for key, pat in [('sw.js SHELL css', r"app\.css\?v=([^'\"]+)"),
                     ('sw.js SHELL js', r"app\.js\?v=([^'\"]+)")]:
        mm = re.search(pat, sw)
        found[key] = mm.group(1) if mm else '(없음)'
    off = {k: v for k, v in found.items() if v != ver}
    return (['버전 불일치  %s = %s  (APP_V 는 %s)' % (k, v, ver)
             for k, v in sorted(off.items())], ver)


# ── ⑤ 문법 (node 가 있으면) ─────────────────────────────────────
def check_syntax(paths):
    try:
        subprocess.run(['node', '--version'], capture_output=True, check=True)
    except Exception:
        return [], False
    out = []
    for p in paths:
        fp = os.path.join(ROOT, p)
        if not os.path.exists(fp):
            continue
        r = subprocess.run(['node', '--check', fp], capture_output=True)
        if r.returncode:
            first = (r.stderr.decode('utf-8', 'replace').strip().split('\n') or [''])[0]
            out.append('문법 오류  %s  %s' % (p, first))
    return out, True


# ── ⑥ 토큰 안 쓰고 박아둔 색 — «래칫» ──────────────────────────
# 왜 개수로 재는가:
#   다크 모드는 `:root` 한 블록만 갈아끼우면 되게 만드는 게 목표다. 그런데
#   본문에 색이 박혀 있으면 그 자리만 밝은 채로 남아 **얼룩**이 된다.
#   지금 90곳이 남아 있는데, 대부분 아직 리뉴얼 안 한 화면(설정·리포트·입력·
#   시트)에 있다. 그 화면들은 어차피 다시 그릴 거라 지금 고치면 두 번 일한다.
#   그래서 «한 번에 다 고치기» 대신 «더 늘지 못하게» 잠근다.
#
# ⚠️ 이 숫자는 **내려가기만 한다.** 화면을 하나 옮길 때마다 줄여서 여기 적는다.
#    늘리는 쪽으로 고치지 말 것 — 그러면 검사가 아니라 장식이 된다.
#    (줄었으면 검사가 「내려 적으세요」라고 알려준다.)
HARDCODED_MAX = {'app.css': 57, 'app.js': 23}
COLOR_RE = re.compile(r'oklch\([^)\'"]*|#[0-9a-fA-F]{3,8}\b')


def _decomment(src):
    """주석만 지운다. ⚠️ `strip_noise` 를 쓰면 안 된다 — 그건 «문자열도» 지운다.
    JS 안의 색은 전부 문자열 안에 있어서(`'oklch(.945 .045 '`) 통째로 안 보이고,
    검사가 늘 0곳이라 답한다. **늘 통과하는 검사는 없는 것보다 나쁘다.**"""
    s = re.sub(r'/\*[\s\S]*?\*/', '', src)
    return re.sub(r'(?m)^\s*//.*$', '', s)


def check_hardcoded(css, js):
    out, notes = [], []
    # `:root` 안은 토큰 «정의»라 세지 않는다
    c = _decomment(css)
    i = c.find(':root{')
    if i >= 0:
        j = c.find('}', i)
        c = c[:i] + c[j + 1:]
    got = {'app.css': len(COLOR_RE.findall(c)),
           'app.js': len(COLOR_RE.findall(_decomment(js)))}
    for f, mx in HARDCODED_MAX.items():
        n = got[f]
        if n > mx:
            out.append('%s 에 토큰 안 쓴 색이 %d곳 — 기준 %d곳을 넘었습니다.\n'
                       '      var(--토큰) 으로 바꾸세요. 새 색이면 :root 에 토큰을 만드세요.\n'
                       '      (다크 모드는 :root 한 블록만 갈아끼우는 방식입니다 —\n'
                       '       박아둔 색은 그 자리만 밝게 남아 얼룩이 됩니다.)' % (f, n, mx))
        elif n < mx:
            notes.append('%s 의 박아둔 색이 %d곳으로 줄었습니다 — '
                         'check.py 의 HARDCODED_MAX 를 %d 으로 내려 적어주세요.' % (f, n, n))
    return out, notes


# ── (옵션) 아무 데서도 안 쓰는 CSS class ────────────────────────
# 기본 검사에 넣지 않는 이유: class 이름을 `'p' + i` 처럼 만들어 붙이는
# 곳이 있어서 정적으로는 죽었는지 알 수 없다. 오탐이 매번 뜨는 검사는
# 곧 아무도 안 본다. 그래서 `--dead` 로 부를 때만 후보를 보여준다.
def list_dead(js, css, html):
    hay = js + '\n' + html
    names = sorted(set(re.findall(r'\.([a-zA-Z][a-zA-Z0-9_-]*)', css)))
    out = []
    for c in names:
        if not re.search(r'(^|[^A-Za-z0-9_-])%s([^A-Za-z0-9_-]|$)' % re.escape(c), hay):
            out.append(c)
    return out


def main():
    if '--dead' in sys.argv:
        dead = list_dead(read('app.js'), read('app.css'), read('index.html'))
        print('어디서도 안 쓰는 것처럼 보이는 class %d개' % len(dead))
        for c in dead:
            print('  .' + c)
        print('\n※ 이름을 만들어 붙이는 곳(예: class="p" + i)은 여기 잡힙니다.')
        print('   지우기 전에 app.js 에서 그 이름 조각을 꼭 찾아보세요.')
        return 0

    errs, notes = [], []

    app_js = read('app.js')
    app_css = read('app.css')

    gas = js_files(['gas/api.js', 'gas/inbox.js', 'gas/app2.js', 'gas/bs.js',
                    'gas/Code.js', 'gas/import.js', 'gas/cleanup.js',
                    'gas/phase0.js', 'gas/graphs.js', 'gas/diag.js'])

    errs += check_calls({'app.js': app_js}, GLOBALS_BROWSER, '앱')
    errs += check_calls(gas, GLOBALS_GAS, 'GAS')

    e, skipped = check_css_vars(app_css)
    errs += e
    for s in skipped:
        notes.append('넘어감(ALLOW) — CSS 변수 --%s' % s)

    errs += check_classes(app_js, app_css)

    e, n2 = check_hardcoded(app_css, app_js)
    errs += e
    notes += n2

    e, ver = check_version()
    errs += e

    e, had_node = check_syntax(['app.js'] + list(gas.keys()))
    errs += e
    if not had_node:
        notes.append('node 가 없어 문법 검사는 건너뜀')

    if V or notes:
        for n in notes:
            print('  · ' + n)
    if errs:
        print('\n검사 실패 — %d건\n' % len(errs))
        for x in errs:
            print('  ✗ ' + x)
        print('')
        return 1
    print('검사 통과%s' % ((' · 버전 ' + ver) if ver else ''))
    return 0


sys.exit(main())
