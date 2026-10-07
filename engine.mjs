export const POSITIONS = ['below', 'inside', 'above'];
export const LABELS = {below: 'BELOW', inside: 'IN', above: 'ABOVE'};
export const DIFFICULTIES = {easy: '넓은 간격', hard: '가까운 간격', progressive: '점점 좁게'};
export const BASES = {interval: '가격 구간', region: '지역', area: '면적', building: '준공·세대수', unsure: '아직 잘 모르겠어요'};
export const price = c => c.attributes.price_manwon;
export function priceText(n) {
  const eok = Math.floor(n / 10000), rest = n % 10000;
  return [eok ? `${eok}억` : '', rest ? `${rest.toLocaleString('ko-KR')}만` : ''].filter(Boolean).join(' ') || '0만';
}
export const tripleKey = q => [...q.anchors, q.target].sort().join('|');
export function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
// Boundary ties are accepted by both adjacent bins if a future pack permits them.
// The current admission gate rejects all ties before a session can be created.
export function acceptedPositions(low, high, target) {
  if (![low, high, target].every(n => Number.isFinite(n) && n > 0) || low > high) throw Error('잘못된 가격입니다.');
  return POSITIONS.filter(p => p === 'below' ? target <= low : p === 'inside' ? target >= low && target <= high : target >= high);
}
export function validateCard(c) {
  const a = c?.attributes, d = c?.derived;
  if (!c?.id || !c.complex_id || !c.name || !a || !d || !/^\d{4}-\d{2}-\d{2}$/.test(c.edition?.price_date)) throw Error('카드 정보가 부족합니다.');
  if (!['서울', '경기'].includes(a.sido) || !a.sigungu || !a.dong || ![17,18,25,26].includes(a.pyeong)) throw Error('지역·면적 기준이 다릅니다.');
  if (![a.price_manwon, a.households, a.built_year].every(n => Number.isSafeInteger(n) && n > 0) || a.built_year < 1800 || a.built_year > c.edition.year || !(d.exclusive_m2 > 0)) throw Error('가격·속성 품질 기준 미달입니다.');
  if (d.pyeong_group !== ([17,18].includes(a.pyeong) ? '17-18' : '25-26') || c.display?.price !== priceText(price(c))) throw Error('표시값과 실제 값이 다릅니다.');
  if (!/^assets\/front\/[a-zA-Z0-9_-]+\.webp$/.test(c.assets?.front)) throw Error('카드 앞면 경로를 확인하세요.');
}
export function profile(q, cards) {
  const [lo, hi] = q.anchors.map(id => cards.get(id)), target = cards.get(q.target);
  const sorted = [lo, hi, target].sort((a,b) => price(a)-price(b));
  const gaps = [price(sorted[1])-price(sorted[0]), price(sorted[2])-price(sorted[1])];
  const ratios = gaps.map((v,i) => v / price(sorted[i]));
  const similarity = [lo,hi].reduce((sum,c) => sum + Number(c.attributes.sigungu === target.attributes.sigungu) + Number(c.attributes.pyeong === target.attributes.pyeong) + Number(Math.abs(c.attributes.built_year-target.attributes.built_year) <= 10), 0);
  return {sorted, gaps, ratios, similarity, span: price(sorted[2])/price(sorted[0])-1};
}
export function validateQuestion(q, cards) {
  if (!q || q.anchors?.length !== 2 || !POSITIONS.includes(q.answer) || !['easy','hard'].includes(q.difficulty)) throw Error('문항 형식 오류입니다.');
  const cs = [...q.anchors,q.target].map(id => cards.get(id));
  cs.forEach(validateCard);
  if (new Set(cs.map(c => c.complex_id)).size !== 3 || new Set(cs.map(c => c.edition.price_date)).size !== 1) throw Error('서로 다른 단지와 같은 기준일이 필요합니다.');
  if (!cs.every(c => c.attributes.sido === q.region && c.derived.pyeong_group === q.area)) throw Error('문항의 학습 범위가 다릅니다.');
  const [lo,hi,t] = cs.map(price);
  if (!(lo < hi) || hi-lo < Math.max(6000,lo*0.12)) throw Error('앵커 간격이 좁거나 순서가 잘못되었습니다.');
  const p = profile(q,cards);
  if (p.gaps.some((gap,i) => gap < Math.max(3000,price(p.sorted[i])*0.06))) throw Error('가격 차이가 모호합니다.');
  if (new Set(cs.map(c=>c.display.price)).size !== 3 || acceptedPositions(lo,hi,t).join() !== q.answer) throw Error('표시 동점 또는 정답 오류입니다.');
  if (q.difficulty === 'easy' && p.gaps.some((gap,i) => gap < Math.max(10000,price(p.sorted[i])*0.25))) throw Error('쉬운 간격 기준 미달입니다.');
  if (q.difficulty === 'hard' && (p.ratios.some(r=>r>0.30) || p.span>0.60 || p.similarity<2)) throw Error('가까운 간격·유사성 기준 미달입니다.');
  return q;
}
export function validatePack(pack, manifest) {
  if (pack.version !== 'G002-1' || manifest.price_source?.unit_original !== '만원' || manifest.price_source.version !== pack.priceSource || manifest.back !== 'assets/back.webp') throw Error('문제 팩과 공용 카드 버전이 다릅니다.');
  const cards = new Map(manifest.cards.map(c=>[c.id,c]));
  if (cards.size !== manifest.cards.length || !pack.questions?.length || new Set(pack.questions.map(q=>q.id)).size !== pack.questions.length) throw Error('중복 카드 또는 문항입니다.');
  pack.questions.forEach(q => { validateQuestion(q,cards); if (cards.get(q.target).edition.price_date !== pack.priceDate) throw Error('기준일이 다릅니다.'); });
  return cards;
}
export function selectSession(pack, settings, seed, cards) {
  if (!['all','서울','경기'].includes(settings.region) || !['all','17-18','25-26'].includes(settings.area) || !Object.hasOwn(DIFFICULTIES,settings.difficulty)) throw Error('학습 범위를 확인하세요.');
  const random = rng(`${pack.version}|${seed}|${settings.region}|${settings.area}|${settings.difficulty}`);
  const pool = pack.questions.filter(q => (settings.region === 'all' || q.region === settings.region) && (settings.area === 'all' || q.area === settings.area) && (settings.difficulty === 'progressive' || q.difficulty === settings.difficulty));
  const order = shuffle(POSITIONS,random);
  if (settings.difficulty === 'progressive') {
    if (!cards) throw Error('점진 난이도에는 카드 가격 정보가 필요합니다.');
    const gap = q => Math.min(...profile(q,cards).ratios);
    const used = new Set();
    const draw = (position,difficulty) => {
      const q=shuffle(pool.filter(q=>q.answer===position && q.difficulty===difficulty &&
        (difficulty==='easy' || gap(q)<0.25) && !used.has(tripleKey(q))),random)[0];
      if(!q)throw Error('이 설정은 점진 난이도 10판을 만들 수 없습니다. 다른 범위를 선택해 주세요.');
      used.add(tripleKey(q));return q;
    };
    // 5 broad then 5 close questions; retain the 4/3/3 answer-position balance.
    const rounds=[...order,...order.slice(0,2)].map(p=>draw(p,'easy'));
    rounds.push(...[order[0],order[0],order[1],order[2],order[2]].map(p=>draw(p,'hard')));
    rounds.sort((a,b)=>gap(b)-gap(a));
    return {rounds,practice:draw(order[1],'easy')};
  }
  const schedule = shuffle([...POSITIONS,...POSITIONS,...POSITIONS,order[0]],random);
  // Reserve distinct triples across positions, including practice; never silently shorten a run.
  const buckets = Object.fromEntries(POSITIONS.map(p=>[p,shuffle(pool.filter(q=>q.answer===p),random)]));
  const used = new Set();
  const draw = position => {const q=buckets[position].find(q=>!used.has(tripleKey(q))); if (!q) throw Error('이 설정은 연습 1개와 본게임 10판을 만들 수 없습니다. 다른 범위를 선택해 주세요.'); used.add(tripleKey(q)); return q;};
  const rounds = schedule.map(draw), practice = draw(order[1]);
  return {practice, rounds};
}
export class Session {
  constructor(pack, cards, settings, seed, {practice=true, clock=()=>Math.floor(Date.now()/1000)}={}) {
    this.cards = cards; this.settings = {...settings}; this.seed = seed;
    Object.assign(this, selectSession(pack,settings,seed,cards));
    this.clock=clock; this.startedAt=practice?null:Math.floor(clock()); this.finishedAt=null;
    this.index = practice ? -1 : 0; this.phase = 'selecting'; this.records = []; this.score = 0;
  }
  get elapsedSeconds() { return this.startedAt===null?0:Math.max(0,(this.finishedAt??Math.floor(this.clock()))-this.startedAt); }
  get question() { return this.index === -1 ? this.practice : this.rounds[this.index]; }
  submit(choice, basis = 'unsure') {
    if (this.phase !== 'selecting' || !POSITIONS.includes(choice) || !Object.hasOwn(BASES,basis)) return false;
    const q = this.question, [lo,hi] = q.anchors.map(id=>price(this.cards.get(id)));
    const correct = acceptedPositions(lo,hi,price(this.cards.get(q.target))).includes(choice);
    this.result = {question:q, choice, basis, correct, points:this.index>=0 && correct ? 10 : 0};
    this.score += this.result.points;
    if (this.index >= 0) this.records.push(this.result);
    if (this.index===9) this.finishedAt=Math.floor(this.clock());
    this.phase = 'sorting';
    return true;
  }
  reveal() { if (this.phase !== 'sorting') return false; this.phase = 'result'; return true; }
  next() {
    if (this.phase !== 'result') return false;
    this.index++;
    if(this.index===0)this.startedAt=Math.floor(this.clock());
    this.phase = this.index === 10 ? 'summary' : 'selecting';
    this.result = null;
    return true;
  }
}
export function explanation(record, cards) {
  const q = record.question, [lo,hi] = q.anchors.map(id=>cards.get(id)), t = cards.get(q.target);
  const relation = `${t.name} ${priceText(price(t))}원은 ${priceText(price(lo))}원 ~ ${priceText(price(hi))}원 구간${q.answer==='inside'?' 안':q.answer==='below'?' 아래':' 위'}에 있어요.`;
  const gap = `두 기준 사이의 간격은 ${priceText(price(hi)-price(lo))}원이에요.`;
  const tips = {
    region:'지역 이름은 힌트지만 가격 순서를 정하지는 않아요. 지역이 같아도 단지별 가격은 달라요.',
    area:'전용면적 하나로 총가격 순서를 정할 수는 없어요. 지역과 단지 조건을 함께 비교해요.',
    building:'준공연도나 세대수 하나가 가격 순서를 정하지는 않아요. 먼저 두 기준 가격을 읽어 보세요.',
    interval:`‘${LABELS[record.choice]}’로 놓았지만 실제로는 ‘${LABELS[q.answer]}’예요. 낮은 기준과 높은 기준을 차례로 비교해 보세요.`,
    unsure:'먼저 낮은 기준보다 싼지, 다음으로 높은 기준보다 비싼지 비교하세요. 둘 다 아니면 구간 안이에요.',
  };
  return {relation, gap, tip:record.correct?'두 기준을 차례로 비교하면 가격을 외우지 않고도 위치를 읽을 수 있어요.':tips[record.basis]};
}
