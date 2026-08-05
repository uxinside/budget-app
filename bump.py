#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
버전 올리기 — 한 군데서 올리고 네 파일을 같이 고친다.

  python3 bump.py 1.5.1 "저장 실패 메시지 수정"
  python3 bump.py 1.6.0 "카드 결제 알림" --gas 34

전에는 app.js·app.css·index.html·sw.js 의 번호를 따로 올렸다.
그러다 app.js 만 올리고 app.css 를 빼먹으면 옛 스타일이 그대로 붙는다.
번호를 하나로 묶고 이 스크립트로만 올린다.

올리기 전에 check.py 가 먼저 돕니다. 걸리면 아무것도 안 고치고 멈춥니다 —
검사를 사람이 기억해서 돌려야 하면 결국 빼먹습니다.

규칙 (시맨틱)
  MAJOR  데이터·서버 계약이 바뀌어 되돌리기 어려운 변경
         (시트 컬럼 추가/삭제, API 응답 형식 변경)
  MINOR  새 기능
  PATCH  버그·문구·스타일
"""
import io, re, sys, os, datetime, subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')

def read(p):  return io.open(os.path.join(ROOT, p), encoding='utf-8').read()
def write(p, s): io.open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)

def sub1(s, pat, new, where):
    out, n = re.subn(pat, new, s)
    if n != 1:
        raise SystemExit('%s: %d곳 바뀜 (1곳이어야 함) — 패턴 %s' % (where, n, pat))
    return out

def cur():
    m = re.search(r"var APP_V = '([^']+)'", read('app.js'))
    return m.group(1) if m else '?'

def precheck():
    """올리기 전에 검사부터. 빼먹을 수 있는 자리에 두면 결국 빼먹는다.
    검사가 없는 저장소(옛 체크아웃)에서는 조용히 건너뛴다."""
    chk = os.path.join(ROOT, 'check.py')
    if not os.path.exists(chk):
        return
    r = subprocess.run([sys.executable, chk], cwd=ROOT)
    if r.returncode:
        raise SystemExit('\n검사에서 걸렸습니다 — 고친 뒤 다시 올리세요. '
                         '(정말 그대로 가야 하면 check.py 의 ALLOW 에 적으세요)')


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'):
        print(__doc__); print('지금 버전:', cur()); return
    ver = a[0]
    if not SEMVER.match(ver):
        raise SystemExit('버전은 X.Y.Z 꼴이어야 합니다 (지금: %s)' % cur())
    precheck()
    note = a[1] if len(a) > 1 and not a[1].startswith('--') else ''
    gas = ''
    if '--gas' in a:
        gas = a[a.index('--gas') + 1]

    # 네 파일 모두 「고친 내용」을 먼저 만들어 두고, 다 성공했을 때만 쓴다.
    # 예전엔 순서대로 저장해서, CHANGELOG 마커가 없으면 app.js 만 올라간
    # 반쯤 적용된 상태로 멈췄다. 문서에 적어둔 약속과 달랐다.
    todo = {}

    todo['app.js'] = sub1(read('app.js'),
          r"var APP_V = '[^']+'", "var APP_V = '%s'" % ver, 'app.js APP_V')

    h = read('index.html')
    h = sub1(h, r'app\.css\?v=[^"]+', 'app.css?v=' + ver, 'index.html css')
    h = sub1(h, r'app\.js\?v=[^"]+',  'app.js?v='  + ver, 'index.html js')
    todo['index.html'] = h

    w = read('sw.js')
    w = sub1(w, r"var V = '[^']+'", "var V = 'hb-%s'" % ver, 'sw.js V')
    w = sub1(w, r"app\.css\?v=[^']+", 'app.css?v=' + ver, 'sw.js css')
    w = sub1(w, r"app\.js\?v=[^']+",  'app.js?v='  + ver, 'sw.js js')
    todo['sw.js'] = w

    cl = 'CHANGELOG.md'
    body = read(cl) if os.path.exists(os.path.join(ROOT, cl)) else '# 변경 이력\n'
    # 시트도 앱도 한국 시간 기준이다. 작업 환경이 UTC 라 하루 밀린 적 있음
    today = (datetime.datetime.now(datetime.timezone.utc) +
             datetime.timedelta(hours=9)).date().isoformat()
    entry = '\n## %s — %s\n\n- 앱 `%s` · Apps Script `%s`\n- %s\n' % (
        ver, today, ver, gas or '변경 없음', note or '(설명을 채워주세요)')
    MARK = '<!-- 새 항목은 이 줄 아래에 -->'
    if MARK not in body:
        raise SystemExit('CHANGELOG.md 에 마커가 없습니다: ' + MARK)
    todo[cl] = body.replace(MARK, MARK + '\n' + entry, 1)

    # 여기까지 왔으면 전부 성공 — 이제 쓴다
    for path, text in todo.items():
        write(path, text)

    print('올렸습니다: %s  (app.js / index.html / sw.js / CHANGELOG.md)' % ver)
    if not gas:
        print('  Apps Script 를 같이 배포했다면 --gas <번호> 로 다시 적어주세요.')

main()
