import {DIFFICULTIES,POSITIONS,BASES} from './engine.mjs';
export const GAME_URL='https://nobot-kang.github.io/apt-bin/';
export const STORAGE_KEY='apt-bin.records.v1';
export const MAX_RECORDS=100;
export const modeLabel=r=>`${r.region==='all'?'전체 지역':r.region} · ${r.area==='all'?'전체 면적':r.area==='17-18'?'전용 17·18평형':'전용 25·26평형'} · ${DIFFICULTIES[r.difficulty]}`;
export const groupKey=r=>`${r.packVersion}/${r.region}/${r.area}/${r.difficulty}`;
export const formatTime=s=>`${Math.floor(s/60)}분 ${String(s%60).padStart(2,'0')}초`;
export const mascotMood=score=>score>80?'smile':score>50?'neutral':'sad';
export const mascotPath=score=>`./assets/mascot-${mascotMood(score)}.webp`;
export const CHARACTER_RIGHTS='펭귄 캐릭터 ‘또박’ © 2026 Nobot Kang. All rights reserved.';
export const mascotAlt=score=>score>80?'활짝 웃는 펭귄 마스코트':score>50?'평범한 표정의 펭귄 마스코트':'시무룩한 펭귄 마스코트';
export function validRecord(r) {
  return Boolean(r && typeof r.id==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(r.id) &&
    Number.isSafeInteger(r.elapsedSeconds) && r.elapsedSeconds>=0 &&
    Number.isInteger(r.score) && r.score>=0 && r.score<=100 &&
    ['all','서울','경기'].includes(r.region) && ['all','17-18','25-26'].includes(r.area) && Object.hasOwn(DIFFICULTIES,r.difficulty) &&
    typeof r.createdAt==='string' && Number.isFinite(Date.parse(r.createdAt)) && typeof r.packVersion==='string' &&
    Array.isArray(r.rounds) && r.rounds.length===10 && new Set(r.rounds.map(x=>x?.id)).size===10 &&
    r.rounds.every(x=>x && typeof x.id==='string' && POSITIONS.includes(x.choice) && POSITIONS.includes(x.answer) &&
      Object.hasOwn(BASES,x.basis) && typeof x.correct==='boolean' && x.correct===(x.choice===x.answer) && x.points===(x.correct?10:0)) &&
    r.score===r.rounds.reduce((s,x)=>s+x.points,0));
}
export const rankRecords=records=>records.filter(validRecord).sort((a,b)=>b.score-a.score || a.elapsedSeconds-b.elapsedSeconds || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
export function loadRecords(storage) {
  try {
    const raw=storage.getItem(STORAGE_KEY);if(!raw)return {records:[],warning:''};
    const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw Error('Invalid records');
    const valid=parsed.filter(validRecord),unique=[...new Map(valid.map(r=>[r.id,r])).values()];
    return {records:rankRecords(unique).slice(0,MAX_RECORDS),warning:valid.length===parsed.length?'':'읽을 수 없는 기록 일부를 제외했어요.'};
  } catch {return {records:[],warning:'브라우저 기록을 읽지 못했어요. 이번 기록은 현재 화면에서 확인할 수 있어요.'};}
}
export function saveRecord(records,record,storage) {
  if(!validRecord(record))throw Error('완료된 10판 기록만 저장할 수 있어요.');
  const ranked=rankRecords([...records.filter(r=>r.id!==record.id),record]);
  const retained=new Map([[record.id,record]]),groups=new Set();
  for(const r of ranked){const key=groupKey(r);if(!groups.has(key)&&retained.size<MAX_RECORDS){groups.add(key);retained.set(r.id,r);}}
  for(const r of ranked){if(retained.size>=MAX_RECORDS)break;retained.set(r.id,r);}
  const result=rankRecords([...retained.values()]);
  try{storage.setItem(STORAGE_KEY,JSON.stringify(result));return {records:result,warning:''};}
  catch{return {records:result,warning:'브라우저에 저장하지 못했어요. 화면을 닫기 전에 기록 이미지를 내려받아 주세요.'};}
}
export function completedRecord(session,{id,packVersion}) {
  if(session.finishedAt===null || session.records.length!==10)throw Error('본게임이 아직 끝나지 않았어요.');
  const record={id,score:session.score,elapsedSeconds:session.elapsedSeconds,...session.settings,
    createdAt:new Date(session.finishedAt*1000).toISOString(),packVersion,
    rounds:session.records.map(r=>({id:r.question.id,choice:r.choice,answer:r.question.answer,basis:r.basis,correct:r.correct,points:r.points}))};
  if(!validRecord(record))throw Error('완료된 기록이 올바르지 않아요.');
  return record;
}
export function shareText(r) {
  if(!validRecord(r))throw Error('기록을 확인해 주세요.');
  return `아파트 값 분리 수거\n나의 기록 ${r.score}/100점 · ${formatTime(r.elapsedSeconds)}\n${modeLabel(r)} · 정답 ${r.score/10}/10\n니 위, 내 밑! 두 가격 사이에서 내 부동산 감각을 확인해 보세요. 여러분은 몇 점인가요?\n${GAME_URL}`;
}
export async function recordImage(r) {
  if(!validRecord(r))throw Error('기록을 확인해 주세요.');
  await document.fonts.ready;
  const mascot=new Image();mascot.src=new URL(mascotPath(r.score),import.meta.url).href;await mascot.decode();
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=660;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지를 만들 수 없어요.');
  const ink='#253d35',muted='#5c6c63',green='#315e48';
  ctx.fillStyle='#f6f7f0';ctx.fillRect(0,0,1000,660);ctx.fillStyle=green;ctx.fillRect(0,0,1000,12);
  const text=(value,x,y,size,color=ink,weight='700')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif`;ctx.fillText(value,x,y);};
  text('PRICE SORTING CLUB / MY RECORD',45,54,14,green);
  text('아파트 값 분리 수거',43,111,42);
  text(modeLabel(r),47,152,21,muted,'400');
  ctx.fillStyle='#e3ebcd';ctx.beginPath();ctx.roundRect(610,187,340,283,24);ctx.fill();
  ctx.drawImage(mascot,610,151,340,340);
  text(String(r.score),40,297,112,green);text('/ 100점',268,291,28,muted,'400');
  text(formatTime(r.elapsedSeconds),48,353,35);text(`정답 ${r.score/10} / 10 · 본게임 완료`,49,397,21,muted,'400');
  r.rounds.forEach((round,i)=>{const x=49+i*50;ctx.fillStyle=round.correct?'#dfe9d4':'#f5e2d3';ctx.beginPath();ctx.roundRect(x,422,41,40,7);ctx.fill();text(round.correct?'✓':'−',x+12,448,19,round.correct?green:'#985032');});
  ctx.strokeStyle='#d7dfd2';ctx.beginPath();ctx.moveTo(45,491);ctx.lineTo(955,491);ctx.stroke();
  text('니 위, 내 밑! 당신의 가격 감각은 몇 점?',46,532,25);
  text('외울 필요 없이, 두 가격 사이에서 자리를 찾아보세요.',46,565,20,muted,'400');
  text(GAME_URL,46,606,24,green);
  const date=new Date(r.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  text(date,46,638,13,muted,'400');
  ctx.textAlign='right';text(CHARACTER_RIGHTS,955,638,12,muted,'400');ctx.textAlign='left';
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('이미지 생성 실패')),'image/png'));
}
