import {Session,POSITIONS,LABELS,DIFFICULTIES,BASES,validatePack,selectSession,price,priceText,explanation} from './engine.mjs';
import {modeLabel,groupKey,formatTime,loadRecords,saveRecord,completedRecord,shareText,recordImage,mascotPath,mascotAlt} from './records.mjs';
import {watchCardHints} from './card-layout.mjs';
const main = document.querySelector('main');
const common = './';
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = c => `${priceText(price(c))}원`;
const compactFront=c=>`./${c.assets.front.replace('.webp','.avif')}`;
const frontMarkup=c=>`<picture><source type="image/avif" srcset="${compactFront(c)}"><img class="card-front" src="${common}${c.assets.front}" width="630" height="880" fetchpriority="high" decoding="async" alt=""></picture>`;
const imageWarmups=new Map();
function warmCard(id,priority='low') {
  const src=`${common}${cards.get(id).assets.front}`;
  if(!imageWarmups.has(src)){
    const picture=document.createElement('picture'),source=document.createElement('source'),image=new Image();
    source.type='image/avif';source.srcset=compactFront(cards.get(id));
    image.decoding='async';image.fetchPriority=priority;picture.append(source,image);image.src=src;
    const ready=image.decode().catch(()=>{imageWarmups.delete(src);});
    imageWarmups.set(src,ready);
    if(imageWarmups.size>32)imageWarmups.delete(imageWarmups.keys().next().value);
  }
  return imageWarmups.get(src);
}
let pack, manifest, cards, session;
let stopHintLayout=()=>{};
let settings = {region:'all',area:'all',difficulty:'easy'}, seed = newSeed(), timer;
const browserStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
let recordState=loadRecords(browserStorage),currentRecord=null,selectedRecordId=recordState.records[0]?.id,sharingBusy=false;
function newSeed() {return crypto.getRandomValues(new Uint32Array(2)).join('-');}
const icon = (p, cls='') => `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17h30l-3 24H12L9 17Zm-2-6h34M17 6h14"/><path d="${p==='below'?'M24 21v13m-5-5 5 5 5-5':p==='above'?'M24 34V21m-5 5 5-5 5 5':'M18 27h12m-12 6h12'}"/></svg>`;
const areaLabel = value => value==='all'?'전체 면적':value==='17-18'?'전용 17·18평형':'전용 25·26평형';
function focusTitle(id) { document.getElementById(id)?.focus({preventScroll:true}); }
function announce(text) {document.getElementById('announcer').textContent=text;}
function selectedRecord(){return recordState.records.find(r=>r.id===selectedRecordId)||recordState.records[0];}
function recordPreview(r){
  if(!r)return '';
  const best=recordState.records.find(record=>groupKey(record)===groupKey(r));
  return `<div class="record-preview"><img src="${mascotPath(r.score)}" alt="${mascotAlt(r.score)}" width="180" height="180"><div><p>${esc(modeLabel(r))}</p>${best?.id===r.id?'<span class="best-badge">이 설정의 최고 기록</span>':''}<strong>${r.score}<small> / 100점</small></strong><p class="record-time">${formatTime(r.elapsedSeconds)} · 정답 ${r.score/10}/10</p><p class="muted">${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</p></div></div>`;
}
function recordBoard(){
  return `<section class="record-board" aria-labelledby="records-title"><div class="record-heading"><div><p class="eyebrow">MY SORTING RECORDS</p><h2 id="records-title">나의 기록 보관함 <span>${recordState.records.length}</span></h2></div><p>점수 우선 · 동점이면 짧은 시간 순</p></div><p class="muted">이 브라우저에만 최대 100개를 저장해요. 지역·면적·난이도가 같은 기록끼리 최고 기록을 표시해요. 브라우저 데이터를 지우면 사라져요.</p>${recordState.warning?`<p class="storage-warning" role="status">${esc(recordState.warning)}</p>`:''}${recordState.records.length?`<label for="record-select">공유할 기록 선택</label><select id="record-select">${recordState.records.map(r=>`<option value="${esc(r.id)}" ${r.id===selectedRecord()?.id?'selected':''}>${r.score}점 · ${formatTime(r.elapsedSeconds)} · ${esc(modeLabel(r))} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</option>`).join('')}</select><div id="record-preview">${recordPreview(selectedRecord())}</div><div class="record-actions"><button class="primary" data-record-action="download">선택한 기록 이미지 다운로드 <span aria-hidden="true">↓</span></button><button class="secondary" data-record-action="share">게임 링크·기록 공유 문구 복사</button></div><p id="share-status" role="status" aria-live="polite"></p><div id="copy-fallback"></div>`:'<p class="empty-records">본게임 10판을 마치면 점수와 시간이 자동으로 저장돼요. 나만의 최고 기록을 모아보세요.</p>'}</section>`;
}
function bindRecords(){
  document.getElementById('record-select')?.addEventListener('change',event=>{selectedRecordId=event.target.value;document.getElementById('record-preview').innerHTML=recordPreview(selectedRecord());document.getElementById('share-status').textContent='';document.getElementById('copy-fallback').replaceChildren();});
}
function rememberRecord(){
  if(currentRecord || session.finishedAt===null)return;
  currentRecord=completedRecord(session,{id:crypto.randomUUID(),packVersion:pack.version});
  const latest=loadRecords(browserStorage);
  const merged=[...new Map([...recordState.records,...latest.records].map(r=>[r.id,r])).values()];
  recordState=saveRecord(merged,currentRecord,browserStorage);selectedRecordId=currentRecord.id;clearInterval(timer);
}
function startGame(practice=false){
  let nextSeed=newSeed();while(nextSeed===seed)nextSeed=newSeed();seed=nextSeed;
  session=new Session(pack,cards,settings,seed,{practice});currentRecord=null;
  clearInterval(timer);timer=setInterval(()=>{const clock=document.querySelector('[data-elapsed]');if(clock&&session)clock.textContent=formatTime(session.elapsedSeconds);},1000);
  renderRound();focusTitle('round-title');window.scrollTo({top:0,behavior:'instant'});
}
async function shareRecord(action){
  if(sharingBusy)return;const record=selectedRecord();if(!record)return;
  const status=document.getElementById('share-status');sharingBusy=true;
  main.querySelectorAll('.record-actions button,#record-select').forEach(el=>el.disabled=true);
  try {
    if(action==='download'){
      status.textContent='선택한 기록 이미지를 만들고 있어요…';
      const blob=await recordImage(record),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`apt-bin-${record.score}pts-${record.elapsedSeconds}s-${record.id.slice(0,8)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
      status.textContent=`${record.score}점 · ${formatTime(record.elapsedSeconds)} 기록 이미지를 다운로드했어요.`;
    }else{
      const text=shareText(record);
      try{await navigator.clipboard.writeText(text);status.textContent='게임 링크와 선택한 기록의 공유 문구를 복사했어요.';document.getElementById('copy-fallback')?.replaceChildren();}
      catch{status.textContent='자동 복사가 허용되지 않았어요. 아래 문구를 직접 복사해 주세요.';const box=document.getElementById('copy-fallback');if(!box)return;box.innerHTML='<label for="manual-copy">공유 문구</label><textarea id="manual-copy" readonly rows="5"></textarea>';const field=box.querySelector('textarea');field.value=text;field.focus();field.select();}
    }
  }catch{status.textContent='기록 이미지를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.';}
  finally{sharingBusy=false;main.querySelectorAll('.record-actions button,#record-select').forEach(el=>el.disabled=false);}
}
main.addEventListener('click',event=>{const action=event.target.closest('[data-record-action]')?.dataset.recordAction;if(action)void shareRecord(action);});
main.addEventListener('error',event=>{
  // AVIF support detection handles old browsers; unavailable derivatives retry originals.
  if(event.target.matches?.('.card-front'))event.target.parentElement.querySelector('source')?.remove();
},true);
function intro() {
  stopHintLayout();
  session = null; clearInterval(timer);
  main.innerHTML = `<section class="intro-grid">
    <div class="intro-copy"><p class="eyebrow">오늘의 가격 감각, 가볍게 한 판</p><h1>아파트 값도<br><span>분리 수거</span>가 되나요?</h1><p class="lead">두 가격을 기준으로, 새 카드의 자리를 찾아요.<br>낮으면 <b>${LABELS.below}</b>, 사이면 <b>${LABELS.inside}</b>, 높으면 <b>${LABELS.above}</b>.</p>
      <div class="mini-facts"><span>혼자서</span><span>본게임 10판 · 연습은 선택</span><span>시간 제한 없음</span></div>
      <div class="intro-art" aria-hidden="true"><div class="sample-back"><img src="./assets/back.webp" width="630" height="880" alt=""><span>이 카드의<br>자리는 어디?</span></div><div class="art-note"><span class="mascot-turnaround" role="img" aria-label="안경 쓴 펭귄 마스코트"></span>외울 필요 없어요.<br>두 기준만 읽어 보세요.<span>↙</span></div><div class="mini-bins">${POSITIONS.map(p=>`<div class="mini-bin ${p}">${icon(p)}<b>${LABELS[p]}</b></div>`).join('')}</div></div>
    </div>
    <section class="setup" aria-labelledby="setup-title"><p class="eyebrow">01 / 오늘의 수거 구역</p><h2 id="setup-title">어디부터 연습할까요?</h2><p class="muted">선택한 지역과 면적 안에서만 출제해요.</p>
      <form id="setup-form"><fieldset><legend>지역</legend><div class="segments">${['all','서울','경기'].map(v=>`<label><input type="radio" name="region" value="${v}" ${settings.region===v?'checked':''}><span>${v==='all'?'전체':v}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>전용면적</legend><div class="segments areas">${['17-18','25-26','all'].map(v=>`<label><input type="radio" name="area" value="${v}" ${settings.area===v?'checked':''}><span>${v==='all'?'전체':v==='17-18'?'17 + 18평형':'25 + 26평형'}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>가격 간격</legend><div class="segments">${Object.entries(DIFFICULTIES).map(([v,label])=>`<label><input type="radio" name="difficulty" value="${v}" ${settings.difficulty===v?'checked':''}><span>${label}<small>${v==='easy'?'처음이라면 추천':v==='hard'?'비슷한 카드로 도전':'갈수록 어려워져요'}</small></span></label>`).join('')}</div></fieldset>
      <p class="mode-note">점점 좁게: 넓은 간격 5판 → 가까운 간격 5판.<br>가장 가까운 두 가격의 상대 간격이 점차 좁아져요.</p>
      <p id="availability" class="availability" role="status"></p><button class="primary start" type="submit">바로 본게임 시작 <span aria-hidden="true">→</span></button>
      <button class="secondary practice-start" type="submit" name="practice" value="yes">먼저 연습해 보기</button>
      <p class="timing-note">본게임 시작부터 마지막 채점까지 초 단위로 기록해요. 연습 시간은 제외하고, 시간은 점수에 영향을 주지 않아요.</p>
      </form><div class="data-note"><b>2026.01.01 기준 매매 추정가격</b><p>공용 카드의 전용 17·18·25·26평형을 사용해요. 전체는 이 면적군의 합이에요. 정답 10점씩, 총 100점.</p></div>
    </section></section>${recordBoard()}`;
  const form = document.getElementById('setup-form');
  const preflight = () => {
    const data = new FormData(form); settings = {region:data.get('region'),area:data.get('area'),difficulty:data.get('difficulty')};
    try {selectSession(pack,settings,seed,cards);document.getElementById('availability').textContent='준비 완료 · 연습 1문제와 본게임 10판';form.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false);return true;}
    catch(error) {document.getElementById('availability').textContent=error.message;form.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=true);return false;}
  };
  form.addEventListener('input',preflight);
  form.onsubmit=event=>{event.preventDefault();if(preflight()){try{startGame(event.submitter?.name==='practice');}catch(error){document.getElementById('availability').textContent=error.message;}}};
  preflight();bindRecords();
}
function attributes(c) {
  const a=c.attributes,d=c.derived;
  return `<dl class="hint-grid"><div><dt>전용면적</dt><dd>${a.pyeong}평형 <small>${d.exclusive_m2}㎡</small></dd></div><div><dt>준공</dt><dd>${a.built_year}년 <small>${d.age_years}년차</small></dd></div><div class="wide"><dt>단지 전체</dt><dd>${a.households.toLocaleString('ko-KR')}세대</dd></div></dl>`;
}
function cardMarkup(c, role, revealed=false) {
  const a=c.attributes, target=role==='target';
  const label=target?'자리를 찾을 새 카드':role==='low'?'낮은 가격 · 기준 1':'높은 가격 · 기준 2';
  return `<article class="game-card ${target?'target-card':`anchor-card ${role}`}" aria-label="${label}"><div class="card-label">${target?'<span class="dot"></span>':''}${label}</div>
    <div class="card-surface ${target?(revealed?'flip-in':'concealed'):''}" ${target?'id="target-surface"':''}>
    ${target&&!revealed?`<img class="card-back" src="./assets/back.webp" width="630" height="880" alt="가격을 가린 공용 카드 뒷면"><div class="hint-panel"><div class="hint-content"><span class="hint-tag">가격 빼고, 모두 힌트</span><h3>${esc(c.name)}</h3><p class="address">${esc(a.sido)} ${esc(a.sigungu)}<br>${esc(a.dong)}</p>${attributes(c)}<div class="hidden-price">? <span>매매 추정가격</span></div></div></div>`:
      `${frontMarkup(c)}<div class="sr-only">${esc(c.name)}, ${esc(a.sido)} ${esc(a.sigungu)} ${esc(a.dong)}. ${a.built_year}년 준공, ${a.households}세대, 전용 ${a.pyeong}평형, ${c.derived.exclusive_m2}㎡.</div>`}
    </div><div class="card-caption">${target&&!revealed?'<strong>어느 수거함에 들어갈까요?</strong>':`<span>${esc(c.name)}</span><strong>${money(c)}</strong>`}</div></article>`;
}
function renderRound() {
  stopHintLayout();
  const s=session,q=s.question,result=s.phase==='result',practice=s.index===-1;
  const [lo,hi]=q.anchors.map(id=>cards.get(id)),target=cards.get(q.target);
  main.innerHTML=`<section class="play" data-phase="${s.phase}"><div class="round-bar"><div><span class="round-chip">${practice?'연습':`ROUND ${String(s.index+1).padStart(2,'0')}`}</span><span class="round-count">${practice?'점수에 포함되지 않아요':`${s.index+1} / 10`}</span></div><div class="round-stats">${practice?'':`<span class="elapsed" aria-label="본게임 경과 시간" data-elapsed>${formatTime(s.elapsedSeconds)}</span>`}<div class="score"><b>${s.score}</b><span> / 100점</span></div></div></div>
    <div class="progress" aria-label="${practice?'연습 문제':`10판 중 ${s.index+1}판`}">${Array.from({length:10},(_,i)=>`<span class="${i<s.records.length?(s.records[i].correct?'done':'miss'):i===s.index?'current':''}"></span>`).join('')}</div>
    <div class="round-heading"><div><p class="eyebrow">${practice?'먼저 한 번, 가볍게 연습해요':'가격을 외우지 말고, 위치를 찾아요'}</p><h1 id="round-title" tabindex="-1">새 카드의 가격은 <span>어디쯤일까요?</span></h1></div><p class="scope">${settings.region==='all'?'전체 지역':settings.region} · ${areaLabel(settings.area)}<br> ${DIFFICULTIES[settings.difficulty]}${settings.difficulty==='progressive'?` · ${DIFFICULTIES[q.difficulty]}`:''} · 2026.01.01 기준</p></div>
    ${practice?`<p class="practice-guide"><b>두 기준 가격을 먼저 읽어요.</b> 새 카드가 둘보다 싸면 ${LABELS.below}, 사이면 ${LABELS.inside}, 둘보다 비싸면 ${LABELS.above}. 수거함을 누르면 답이 제출돼요.</p>`:''}
    <div class="cards-table">${cardMarkup(lo,'low')}${cardMarkup(target,'target',result)}${cardMarkup(hi,'high')}</div>
    <section class="sorting-station" aria-label="가격 구간 수거함"><div class="price-axis"><span>낮은 가격</span><span>높은 가격 <b aria-hidden="true">→</b></span></div>
      <div class="boundaries"><span>기준 1 <b>${money(lo)}</b></span><span>기준 2 <b>${money(hi)}</b></span></div>
      <div class="bins">${POSITIONS.map((p,i)=>`<button type="button" class="bin ${p} ${result&&s.result.choice===p?'chosen':''} ${result&&q.answer===p?'correct-bin':''}" data-choice="${p}" ${s.phase!=='selecting'?'disabled':''} aria-label="${i+1}. ${LABELS[p]}: ${p==='below'?'낮은 기준보다 낮음':p==='inside'?'두 기준 사이':'높은 기준보다 높음'}"><div class="bin-lid"></div><div class="bin-body">${icon(p)}<div><strong>${LABELS[p]}</strong><span>${p==='below'?'기준 1보다 낮아요':p==='inside'?'두 기준 사이예요':'기준 2보다 높아요'}</span></div><kbd>${i+1}</kbd></div>${result?`<span class="bin-verdict">${q.answer===p?'정답 위치':''}${s.result.choice===p?' · 내 선택':''}</span>`:''}</button>`).join('')}</div>
    </section>
    ${result?resultMarkup():`<div class="choice-help"><label for="basis">무엇을 보고 판단하나요? <span>(선택)</span></label><select id="basis">${Object.entries(BASES).map(([key,label])=>`<option value="${key}" ${key==='unsure'?'selected':''}>${label}</option>`).join('')}</select><p>수거함 클릭 또는 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> · 제출 후 변경할 수 없어요.</p></div>`}
  </section>`;
  main.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>submit(b.dataset.choice));
  stopHintLayout=watchCardHints(main.querySelector('.card-surface.concealed'));
  document.getElementById('next')?.addEventListener('click',()=>{if(!s.next())return;if(s.phase==='summary')summary();else renderRound();focusTitle(s.phase==='summary'?'summary-title':'round-title');window.scrollTo({top:0,behavior:'instant'});});
}
function resultMarkup() {
  const r=session.result,e=explanation(r,cards),practice=session.index===-1;
  return `<section class="result-panel ${r.correct?'success':'incorrect'}" aria-labelledby="result-title"><div><p class="eyebrow">${practice?'연습 완료':r.correct?'+10점 · 분리 수거 성공':'이번 판 0점 · 구간을 다시 읽어 봐요'}</p><h2 id="result-title" tabindex="-1">${r.correct?'딱 맞는 자리를 찾았어요!':`이 카드의 자리는 ‘${LABELS[r.question.answer]}’예요.`}</h2><p>${esc(e.relation)}</p><p class="comparison-gap">${esc(e.gap)}</p><div class="learning-tip">${!r.correct&&r.basis!=='unsure'?`<b>내 판단 기준: ${BASES[r.basis]}</b> `:''}${esc(e.tip)}</div></div><button class="primary" id="next">${practice?'본게임 시작하기':session.index===9?'결과와 오답 복습':'다음 문제'} <span aria-hidden="true">→</span></button></section>`;
}
async function submit(choice) {
  const s=session;if(!s||s.phase!=='selecting')return;
  if(!s.submit(choice,document.getElementById('basis').value))return;
  // The target's price-bearing front is requested only after the answer is locked.
  const revealedImage=warmCard(s.question.target,'high');
  rememberRecord();
  main.querySelector('.play').dataset.phase='sorting';
  main.querySelectorAll('[data-choice], #basis').forEach(b=>b.disabled=true);
  announce(`${LABELS[choice]} 수거함에 넣었어요. 답안을 확인합니다.`);
  const surface=document.getElementById('target-surface'),bin=main.querySelector(`[data-choice="${choice}"]`);
  try {
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const from=surface.getBoundingClientRect(),to=bin.getBoundingClientRect();
      const flying=surface.cloneNode(true);flying.removeAttribute('id');flying.setAttribute('aria-hidden','true');flying.classList.add('flying-card');
      Object.assign(flying.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});
      document.body.append(flying);surface.classList.add('in-transit');bin.classList.add('receiving');
      const dx=to.left+to.width/2-from.left-from.width/2,dy=to.top+to.height/2-from.top-from.height/2;
      try {await flying.animate([{transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},{transform:`translate(${dx*.5}px,${Math.min(-50,dy*.25)}px) rotate(-9deg) scale(.65)`,opacity:1,offset:.4},{transform:`translate(${dx}px,${dy}px) rotate(7deg) scale(.13)`,opacity:0}],{duration:760,easing:'cubic-bezier(.4,0,.2,1)'}).finished;}
      finally {flying.remove();}
    }
  } finally {
    if(session===s){s.reveal();renderRound();focusTitle('result-title');document.getElementById('result-title').scrollIntoView({block:'nearest',behavior:'instant'});announce(s.result.correct?'정답이에요. 가격 관계를 읽고 다음 문제 버튼을 눌러 주세요.':'가격을 공개했어요. 설명을 읽고 다음 문제 버튼을 눌러 주세요.');}
    // Warm just the next two public anchors while the player reads the result.
    void revealedImage.then(()=>{
      if(session===s&&s.phase==='result')s.rounds[s.index+1]?.anchors.forEach(id=>void warmCard(id));
    });
  }
}
function summary() {
  stopHintLayout();
  const s=session,wrong=s.records.filter(r=>!r.correct),count=10-wrong.length;
  main.innerHTML=`<section class="summary"><p class="eyebrow">오늘의 분리 수거 완료</p><h1 id="summary-title" tabindex="-1">${count===10?'열 장 모두, 제자리에!':'가격을 보는 감각이 한 걸음 자랐어요.'}</h1><img class="summary-mascot" src="${mascotPath(s.score)}" alt="${mascotAlt(s.score)}" width="180" height="180"><div class="summary-score"><strong>${s.score}<small> / 100점</small></strong><span>정답 ${count}개 <i>·</i> 오답 ${wrong.length}개 <i>·</i> 본게임 10판</span><b class="final-time">완료 시간 ${formatTime(s.elapsedSeconds)}</b></div><p>낮은 기준 → 높은 기준, 이 순서로 비교해 보세요.<br>정확한 가격보다 두 경계와의 관계를 기억하면 돼요.</p><div class="summary-actions"><button class="primary" id="restart">새 카드로 다시 수거하기 <span aria-hidden="true">↻</span></button><button class="secondary" id="settings">학습 범위 바꾸기</button></div><p class="receipt">${settings.region==='all'?'전체 지역':settings.region} · ${areaLabel(settings.area)} · ${DIFFICULTIES[settings.difficulty]}<br>2026.01.01 기준 매매 추정가격</p>${recordBoard()}
    <section class="review" aria-labelledby="review-title"><h2 id="review-title">다시 살펴볼 카드 <span>${wrong.length}</span></h2>${wrong.length?'<p class="muted">카드를 펼쳐 가격 관계와 나의 판단 기준을 복습해요.</p>':'<p class="perfect">모든 구간을 정확히 읽었어요. 다른 범위나 가까운 간격에도 도전해 보세요.</p>'}${s.records.map((r,i)=>r.correct?'':reviewMarkup(r,i)).join('')}</section></section>`;
  document.getElementById('restart').onclick=()=>startGame(false);
  document.getElementById('settings').onclick=()=>{intro();document.getElementById('setup-title').setAttribute('tabindex','-1');focusTitle('setup-title');window.scrollTo({top:0,behavior:'instant'});};
  bindRecords();
}
function reviewMarkup(r,index) {
  const e=explanation(r,cards),q=r.question;
  const sorted=[...q.anchors,q.target].map(id=>cards.get(id)).sort((a,b)=>price(a)-price(b));
  return `<details class="review-item"><summary><span class="review-number">${String(index+1).padStart(2,'0')}</span><b>${esc(cards.get(q.target).name)}</b><span>내 선택 ${LABELS[r.choice]} <span aria-hidden="true">→</span> 정답 ${LABELS[q.answer]}</span></summary><div class="review-content"><div class="review-cards">${sorted.map(c=>`<figure><img src="${common}${c.assets.front}" width="630" height="880" loading="lazy" alt=""><figcaption>${c.id===q.target?'새 카드 · ':''}${esc(c.name)}<strong>${money(c)}</strong></figcaption></figure>`).join('')}</div><p>${esc(e.relation)} ${esc(e.gap)}</p><div class="learning-tip"><b>내 판단 기준: ${BASES[r.basis]}</b><br>${esc(e.tip)}</div></div></details>`;
}
document.addEventListener('keydown',event=>{
  if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))return;
  if(session?.phase==='selecting'&&['1','2','3'].includes(event.key)){event.preventDefault();submit(POSITIONS[Number(event.key)-1]);}
});
async function loadData() {
  if(typeof DecompressionStream==='function'){
    try{
      const response=await fetch('./assets/runtime.json.gz');
      if(!response.ok)throw Error('압축 데이터 없음');
      const bytes=new Uint8Array(await response.arrayBuffer());
      const body=new Blob([bytes]).stream();
      // Some hosts decompress .gz automatically; accept both HTTP representations.
      const raw=await new Response(bytes[0]===31&&bytes[1]===139?body.pipeThrough(new DecompressionStream('gzip')):body).text();
      return JSON.parse(raw);
    }catch{/* Older hosts or missing derivatives can use the canonical JSON. */}
  }
  const responses=await Promise.all([fetch('./pack.json'),fetch(`${common}data/cards.json`)]);
  if(responses.some(r=>!r.ok))throw Error('카드 파일을 불러오지 못했어요.');
  return {pack:await responses[0].json(),manifest:await responses[1].text()};
}
async function load() {
  try {
    const data=await loadData();pack=data.pack;const raw=data.manifest;manifest=JSON.parse(raw);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==pack.sourceSha256)throw Error('공용 카드가 바뀌어 문제 팩을 갱신해야 해요.');
    cards=validatePack(pack,manifest);intro();
  } catch(error) {main.innerHTML=`<section class="load-error" role="alert"><h1>카드 준비를 마치지 못했어요.</h1><p>${esc(error.message)}</p><p>게임 파일을 모두 업로드했는지 확인하고 다시 시도해 주세요.</p><button class="primary" id="retry">다시 불러오기</button></section>`;document.getElementById('retry').onclick=load;}
}
load();
