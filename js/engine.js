// 「다시, 지구」 엔진 — 시드 결정론적 시뮬레이션. 같은 시드 + 같은 선택 = 같은 인생.
import { COUNTRIES, TOTAL_BIRTHS } from '../data/countries.js';
import { ERAS } from '../data/eras.js';
import { NAME_POOLS_V2 } from '../data/names2.js';
import { CULTURES, STAGES, CAUSES, JOBS, WEALTH_LABEL, EVENTS, EVENTS2, ERA_EVENTS, LOCAL_EVENTS, FAMILY_EVENTS, FAMILY_CHAINS, CHAINS } from '../data/content.js';

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomSeed() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) s += chars[arr[i] % chars.length];
  return s;
}

// Gompertz 생존 함수: S(age) = exp((a/b)(1 - e^(b·age))), 중앙 수명 median으로 a 보정
const GOMP_B = 0.09;
function gompA(median) { return GOMP_B * Math.LN2 / Math.exp(GOMP_B * median); }
function gompS(age, a) { return Math.exp((a / GOMP_B) * (1 - Math.exp(GOMP_B * age))); }

function pickWeighted(rng, items, weight) {
  const total = items.reduce((s, it) => s + weight(it), 0);
  let x = rng() * total;
  for (const it of items) { x -= weight(it); if (x <= 0) return it; }
  return items[items.length - 1];
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// choices: 구간별 선택 인덱스 배열. 진행 중이면 앞부분만 채워진 배열.
// 반환: 지금까지의 선택으로 결정되는 인생의 현재 상태(완결이면 done: true).
const EVENT_P = 0.5; // 구간당 사건 발생 확률
const CHAIN_P = 0.75; // 연쇄 조건이 맞았을 때 후속 사건이 일어날 확률
export function simulate(seed, choices, era = 'now', ver = 'n1') {
  const rng = mulberry32(hashSeed(seed));
  // 사건 전용 스트림: 메인 스트림과 분리해, 사건이 없는 삶은 R1과 같은 경로를 유지
  const rngEv = mulberry32(hashSeed(seed + '-ev2'));
  // 연쇄 전용 스트림: 연쇄가 없는 삶은 R3와 같은 경로를 유지
  const rngChain = mulberry32(hashSeed(seed + '-chain1'));
  // 새 선택 사건 전용 스트림 (R6): 새 선택을 하지 않은 삶은 풀이 비어 이 스트림을 소비하지 않음
  const rngEv2 = mulberry32(hashSeed(seed + '-ev3'));
  // 시대 모드 (R8): era !== 'now'이면 그 시대의 출생아 수·기대수명·GDP·도시화로 나라를 뽑는다.
  // 'now'는 기존 배열을 그대로 써서 옛 링크와 바이트 단위로 같다.
  let countryRows = COUNTRIES, totalBirths = TOTAL_BIRTHS;
  if (era !== 'now' && ERAS[era]) {
    const E = ERAS[era];
    countryRows = COUNTRIES.filter((c2) => E.rows[c2[0]]).map((c2) => {
      const er = E.rows[c2[0]];
      return [c2[0], c2[1], er[0], er[1], er[2], er[3], c2[6], c2[7]];
    });
    totalBirths = E.total;
  }
  const c = pickWeighted(rng, countryRows, (r) => r[2]);
  const [iso3, ko, births, le, gdp, urb, gini, cultureKey] = c;
  const urban = rng() * 100 < urb;
  const quintile = 1 + Math.floor(rng() * 5);
  const sex = rng() < 0.5 ? 'm' : 'f';
  const cul = CULTURES[cultureKey];
  // 이름 풀 (R9): 링크 버전 n2부터 확장 풀과 전용 난수 스트림을 쓴다. n1 링크는 기존 풀·기존 순서 그대로 복원된다.
  let name;
  if (ver !== 'n1') {
    const rngName = mulberry32(hashSeed(seed + '-name2'));
    const pool = NAME_POOLS_V2[cultureKey];
    name = pool.fam[Math.floor(rngName() * pool.fam.length)] + ' ' + (sex === 'm' ? pool.m : pool.f)[Math.floor(rngName() * (sex === 'm' ? pool.m.length : pool.f.length))];
  } else {
    name = cul.fam[Math.floor(rng() * cul.fam.length)] + ' ' + (sex === 'm' ? cul.m : cul.f)[Math.floor(rng() * 10)];
  }

  const startBonus = (3 - quintile) * 3;
  const stats = { health: 50 + startBonus, happiness: 50 + startBonus, learning: 50 + startBonus, relations: 50 };
  let money = 0.3;
  const played = [];
  let deathAge = null, cause = null;

  for (let i = 0; i < STAGES.length; i++) {
    const st = STAGES[i];
    if (choices[i] == null) break; // 아직 이 구간을 살지 않음
    const ci = clamp(choices[i], 0, st.choices.length - 1);
    const ch = st.choices[ci];
    stats.health += ch.fx[0]; stats.happiness += ch.fx[1]; stats.learning += ch.fx[2]; stats.relations += ch.fx[3];
    money += ch.money || 0;
    played.push({ stage: st.key, title: st.title, ages: st.ages, choice: ci, tag: ch.tag, text: ch.text });

    // 인생 이벤트 추첨 (R2): 국가·소득·지표·이전 선택에 조건이 걸린 확률 사건
    // 이벤트 연쇄 (R4): 이전 구간에서 방아쇠 사건이 실제로 일어났으면 후속 사건이 우선권을 가진다
    const tags = played.map((p) => p.tag);
    const fired = played.filter((p) => p.event).map((p) => p.event.tag);
    const ctx = { gdp, gini, urb, urban, quintile, le, stats, money, tags, sex, era };
    const chainSrc = ver === 'n3' ? CHAINS.concat(FAMILY_CHAINS) : CHAINS;
    const chainPool = chainSrc.filter((c2) => c2.stage === st.key && fired.includes(c2.from) && (!c2.cond || c2.cond(ctx)));
    let ev = null, chainFrom = null;
    if (chainPool.length && rngChain() < CHAIN_P) {
      ev = pickWeighted(rngChain, chainPool, (c2) => c2.w);
      chainFrom = ev.from;
    } else {
      const pool2 = EVENTS2.filter((e2) => e2.stage === st.key && e2.cond(ctx))
        .concat(ERA_EVENTS.filter((e2) => e2.era === era && e2.stage === st.key && e2.cond(ctx)))
        .concat(ver !== 'n1' ? LOCAL_EVENTS.filter((e2) => e2.culture === cultureKey && e2.stage === st.key && e2.cond(ctx)) : [])
        .concat(ver === 'n3' ? FAMILY_EVENTS.filter((e2) => e2.stage === st.key && e2.cond(ctx)) : []);
      if (pool2.length && rngEv2() < EVENT_P) {
        ev = pickWeighted(rngEv2, pool2, (e2) => e2.w);
      } else {
        const pool = EVENTS.filter((e) => e.stage === st.key && e.cond(ctx));
        if (pool.length && rngEv() < EVENT_P) ev = pickWeighted(rngEv, pool, (e) => e.w);
      }
    }
    if (ev) {
      stats.health += ev.fx[0]; stats.happiness += ev.fx[1]; stats.learning += ev.fx[2]; stats.relations += ev.fx[3];
      money += ev.money || 0;
      const rec = { title: ev.title, text: ev.text, fx: ev.fx, tag: ev.tag };
      if (chainFrom) { rec.chain = true; rec.from = chainFrom; }
      played[played.length - 1].event = rec;
    }

    // 이 구간을 살아서 지나갈 확률 (Gompertz, 현재 스탯 반영)
    const median = le + (clamp(stats.health, 0, 100) - 50) * 0.15 + (3 - quintile) * 1.2;
    const a = gompA(clamp(median, 40, 100));
    const s0 = gompS(st.ages[0], a), s1 = gompS(st.ages[1], a);
    const surviveRatio = s0 > 0 ? s1 / s0 : 0.99999;
    if (rng() > surviveRatio) {
      deathAge = clamp(Math.round(st.ages[0] + rng() * (st.ages[1] - st.ages[0])), 1, 110);
      break;
    }
  }
  let done = false;
  if (deathAge == null) {
    if (played.length === STAGES.length) {
      // 고령기를 지남: 90세 이후 수명 추첨
      const median = le + (clamp(stats.health, 0, 100) - 50) * 0.15 + (3 - quintile) * 1.2;
      const a = gompA(clamp(median, 40, 100));
      const s90 = Math.max(gompS(90, a), 1e-9);
      const u = 1 - rng() * s90; // 90세 조건부
      deathAge = clamp(Math.round(Math.log(1 - (GOMP_B / a) * Math.log(u)) / GOMP_B), 90, 110);
      done = true;
    }
  } else {
    done = true;
  }

  for (const k in stats) stats[k] = clamp(Math.round(stats[k]), 0, 100);

  let result = null;
  if (done) {
    const causeList = CAUSES.find((c2) => deathAge <= c2.max).items;
    cause = causeList[Math.floor(rng() * causeList.length)];
    const sigma = clamp(gini / 100, 0.25, 0.65);
    const u1 = Math.max(rng(), 1e-9), u2 = rng();
    const logn = Math.exp(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma);
    const income = Math.round(gdp * clamp(money * (0.4 + stats.learning / 60), 0.05, 4) * logn);
    const wealthLeft = Math.round(income * (1 + (stats.relations > 60 ? 1.5 : 0.5)) * (deathAge > 60 ? 2 : 0.5));
    const hasPartner = stats.relations + rng() * 40 > 70;
    const children = hasPartner ? clamp(Math.round((le < 65 ? 3 : 2) + (rng() * 3 - 1)), 0, 6) : (rng() < 0.15 ? 1 : 0);
    const jobTier = JOBS.find((j) => stats.learning >= j.min);
    const job = jobTier.items[Math.floor(rng() * jobTier.items.length)];
    result = { deathAge, cause, income, wealthLeft, hasPartner, children, job };
  }

  const rarityN = Math.max(1, Math.round(totalBirths / births));
  return {
    seed, iso3, country: ko, urban, quintile, wealthLabel: WEALTH_LABEL[quintile - 1],
    sex, name, culture: cul.label, stats, le, gdp, gini, urb,
    rarity: births / totalBirths, rarityN,
    stages: played, done, result,
    era, ver, countryRows, totalBirths,
  };
}

// ---------- 삶의 리포트 (R3) ----------
// 표준정규 누적분포 Φ (Abramowitz–Stegun 7.1.26 근사)
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
// 같은 해 출생 코호트 기준 세계 평균 (출생아 수 가중)
export function worldAverages(rows = COUNTRIES, total = TOTAL_BIRTHS) {
  let le = 0, gdp = 0, gini = 0;
  for (const c of rows) { le += c[3] * c[2]; gdp += c[4] * c[2]; gini += c[6] * c[2]; }
  return { le: le / total, gdp: gdp / total, gini: gini / total };
}
// 같은 해 태어난 세계 아기 가운데 age세까지 살아남는 비율 (나라별 기대수명·Gompertz, 추정)
export function cohortSurvival(age, rows = COUNTRIES, total = TOTAL_BIRTHS) {
  let s = 0;
  for (const c of rows) s += c[2] * gompS(age, gompA(clamp(c[3], 40, 100)));
  return s / total;
}
// 사망 시점 리포트: 수명 비교 + 동갑 생존 + 소득 백분위 (로그정규 모델 추정)
export function lifeReport(life) {
  const r = life.result;
  if (!r) return null;
  const rows = life.countryRows || COUNTRIES;
  const total = life.totalBirths || TOTAL_BIRTHS;
  const w = worldAverages(rows, total);
  const sigC = clamp(life.gini / 100, 0.25, 0.65);
  const inc = Math.max(r.income, 1);
  const topC = (1 - normCdf(Math.log(inc / life.gdp) / sigC)) * 100;
  // 세계 백분위: 나라별 로그정규 분포를 출생아 수로 가중한 혼합 분포 (추정)
  let below = 0;
  for (const c of rows) {
    const sig = clamp(c[6] / 100, 0.25, 0.65);
    below += c[2] * normCdf(Math.log(inc / c[4]) / sig);
  }
  const topW = (1 - below / total) * 100;
  return {
    countryLE: life.le,
    worldLE: Math.round(w.le * 10) / 10,
    diffCountry: Math.round((r.deathAge - life.le) * 10) / 10,
    diffWorld: Math.round((r.deathAge - w.le) * 10) / 10,
    diedEarlierPct: Math.round(clamp((1 - cohortSurvival(r.deathAge, rows, total)) * 100, 0.1, 99.9) * 10) / 10,
    incomeTopCountryPct: Math.round(clamp(topC, 0.1, 99.9) * 10) / 10,
    incomeTopWorldPct: Math.round(clamp(topW, 0.1, 99.9) * 10) / 10,
  };
}
