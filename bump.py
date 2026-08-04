#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
버전 올리기 — 한 군데서 올리고 네 파일을 같이 고친다.

  python3 bump.py 1.5.1 "저장 실패 메시지 수정"
  python3 bump.py 1.6.0 "카드 결제 알림" --gas 34

전에는 app.js·app.css·index.html·sw.js 의 번호를 따로 올렸다.
그러다 app.js 만 올리고 app.css 를 빼먹으면 옛 스타일이 그대로 붙는다.
번호를 하나로 묶고 이 스크립트로만 올린다.

규칙 (시맨틱)
  MAJOR  데이터·서버 계약이 바뀌어 되돌리기 어려운 변경
         (시트 컬럼 추가/삭제, API 응답 형식 변경)
  MINOR  새 기능
  PATCH  버그·문구·스타일
"""
import io, re, sys, os, datetime

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

def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'):
        print(__doc__); print('지금 버전:', cur()); return
    ver = a[0]
    if not SEMVER.match(ver):
        raise SystemExit('버전은 X.Y.Z 꼴이어야 합니다 (지금: %s)' % cur())
    note = a[1] if len(a) > 1 and not a[1].startswith('--') else ''
    gas = ''
    if '--gas' in a:
        gas = a[a.index('--gas') + 1]

    write('app.js', sub1(read('app.js'),
          r"var APP_V = '[^']+'", "var APP_V = '%s'" % ver, 'app.js APP_V'))

    h = read('index.html')
    h = sub1(h, r'app\.css\?v=[^"]+', 'app.css?v=' + ver, 'index.html css')
    h = sub1(h, r'app\.js\?v=[^"]+',  'app.js?v='  + ver, 'index.html js')
    write('index.html', h)

    w = read('sw.js')
    w = sub1(w, r"var V = '[^']+'", "var V = 'hb-%s'" % ver, 'sw.js V')
    w = sub1(w, r"app\.css\?v=[^']+", 'app.css?v=' + ver, 'sw.js css')
    w = sub1(w, r"app\.js\?v=[^']+",  'app.js?v='  + ver, 'sw.js js')
    write('sw.js', w)

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
    write(cl, body.replace(MARK, MARK + '\n' + entry, 1))

    print('올렸습니다: %s  (app.js / index.html / sw.js / CHANGELOG.md)' % ver)
    if not gas:
        print('  Apps Script 를 같이 배포했다면 --gas <번호> 로 다시 적어주세요.')

main()
