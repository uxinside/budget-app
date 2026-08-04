function 정리실행() {
  var ss = SpreadsheetApp.openById('1Hc7wfvucANXFZp9d1i9X26oS2gUc9Mofg9lrzGWScWU');
  var sh = ss.getSheetByName('거래내역');
  var tz = Session.getScriptTimeZone();
  var log = [];
  // 0) 백업
  var bn = '거래내역_백업_' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(bn);
  log.push('백업 시트: ' + bn);

  var last = sh.getLastRow();
  var v = sh.getRange(2,1,last-1,8).getValues();
  function nk(s){ return String(s||'').replace(/\([^)]*\)/g,'').replace(/[\s()\[\]·.\-_,*\/]/g,'').toUpperCase().slice(0,10); }
  var rows = [];
  for (var i=0;i<v.length;i++){
    var d = v[i][0]; if(!(d instanceof Date)) continue;
    rows.push({ row:i+2, ymd:Utilities.formatDate(d,tz,'yyyy-MM-dd'), gub:String(v[i][1]).trim(),
                desc:String(v[i][3]), pay:String(v[i][4]).trim(), amt:Number(v[i][6]) });
  }
  var del = {}, newAmt = {};

  // A) 가족계좌 건 (8/2 판교매일식당 · 헤이븐커피)
  var a = rows.filter(function(r){ return r.ymd==='2026-08-02' && (r.desc.indexOf('판교매일식당')>=0 || r.desc.indexOf('헤이븐커피')>=0); });
  a.forEach(function(r){ del[r.row]=1; });
  log.push('A) 가족계좌 삭제: ' + a.length + '건 (' + a.map(function(r){return '#'+r.row+' '+r.desc+' '+r.amt;}).join(', ') + ')');

  // B) 네이버페이 포인트 분할 병합
  var g = {};
  rows.forEach(function(r){ if(r.gub!=='지출'||r.pay!=='네이버페이'||del[r.row]) return;
    var k=r.ymd+'|'+nk(r.desc); (g[k]=g[k]||[]).push(r); });
  var mg=0, mr=0;
  Object.keys(g).forEach(function(k){
    var arr=g[k]; if(arr.length<2) return;
    arr.sort(function(x,y){return y.amt-x.amt;});
    var s=0; arr.forEach(function(x){s+=x.amt;});
    newAmt[arr[0].row]=s; arr[0].amt=s;
    for(var j=1;j<arr.length;j++){ del[arr[j].row]=1; mr++; }
    mg++;
  });
  log.push('B) 포인트 분할 병합: ' + mg + '그룹, ' + mr + '행 삭제');

  // C) 이중집계 제거 (네이버페이 쪽)
  var byK = {};
  rows.forEach(function(r){ if(r.gub!=='지출'||del[r.row]) return;
    var k=r.ymd+'|'+r.amt+'|'+nk(r.desc); (byK[k]=byK[k]||[]).push(r); });
  var dd=0, ddAmt=0;
  Object.keys(byK).forEach(function(k){
    var arr=byK[k]; if(arr.length<2) return;
    var np=arr.filter(function(x){return x.pay==='네이버페이';});
    var ot=arr.filter(function(x){return x.pay!=='네이버페이';});
    if(!np.length || !ot.length) return;
    np.forEach(function(x){ del[x.row]=1; dd++; ddAmt+=x.amt; });
  });
  log.push('C) 이중집계(네이버페이) 삭제: ' + dd + '건 / ' + ddAmt + '원');

  // 적용 1: 금액 갱신
  var na = 0;
  Object.keys(newAmt).forEach(function(r){ if(del[r]) return; sh.getRange(Number(r),7).setValue(newAmt[r]); na++; });
  log.push('금액 갱신: ' + na + '행');

  // 적용 2: 행 삭제 (내림차순 블록)
  var ds = Object.keys(del).map(Number).sort(function(x,y){return y-x;});
  var i2 = 0, blocks = 0;
  while (i2 < ds.length) {
    var end = ds[i2], cnt = 1;
    while (i2+cnt < ds.length && ds[i2+cnt] === end-cnt) cnt++;
    sh.deleteRows(end-cnt+1, cnt); blocks++; i2 += cnt;
  }
  log.push('총 삭제 행: ' + ds.length + ' (' + blocks + '블록)');
  log.push('남은 행: ' + (sh.getLastRow()-1));

  var p = PropertiesService.getScriptProperties();
  p.setProperty('API_VER', String(Number(p.getProperty('API_VER')||1)+1));
  CacheService.getScriptCache().removeAll(['agg1','agg2','agg3']);
  log.push('API 캐시 버전 → ' + p.getProperty('API_VER'));
  var s = log.join('\n'); Logger.log(s); return s;
}