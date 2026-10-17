// 「다시, 지구」 엔진 — 시드 결정론적 시뮬레이션. 같은 시드 + 같은 선택 = 같은 인생.
import { COUNTRIES, TOTAL_BIRTHS } from '../data/countries.js';
import { CULTURES, STAGES, CAUSES, JOBS, WEALTH_LABEL, EVENTS } from '../data/content.js';

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
export function simulate(seed, choices) {
  const rng = mulberry32(hashSeed(seed));
  // 사건 전용 스트림: 메인 스트림과 분리해, 사건이 없는 삶은 R1과 같은 경로를 유지
  const rngEv = mulberry32(hashSeed(seed + '-ev2'));
  const c = pickWeighted(rng, COUNTRIES, (r) => r[2]);
  const [iso3, ko, births, le, gdp, urb, gini, cultureKey] = c;
  const urban = rng() * 100 < urb;
  const quintile = 1 + Math.floor(rng() * 5);
  const sex = rng() < 0.5 ? 'm' : 'f';
  const cul = CULTURES[cultureKey];
  const name = cul.fam[Math.floor(rng() * cul.fam.length)] + ' ' + (sex === 'm' ? cul.m : cul.f)[Math.floor(rng() * 10)];

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
    const tags = played.map((p) => p.tag);
    const ctx = { gdp, gini, urb, urban, quintile, le, stats, money, tags, sex };
    const pool = EVENTS.filter((e) => e.stage === st.key && e.cond(ctx));
    if (pool.length && rngEv() < EVENT_P) {
      const ev = pickWeighted(rngEv, pool, (e) => e.w);
      stats.health += ev.fx[0]; stats.happiness += ev.fx[1]; stats.learning += ev.fx[2]; stats.relations += ev.fx[3];
      money += ev.money || 0;
      played[played.length - 1].event = { title: ev.title, text: ev.text, fx: ev.fx, tag: ev.tag };
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

  const rarityN = Math.max(1, Math.round(TOTAL_BIRTHS / births));
  return {
    seed, iso3, country: ko, urban, quintile, wealthLabel: WEALTH_LABEL[quintile - 1],
    sex, name, culture: cul.label, stats, le, gdp, gini, urb,
    rarity: births / TOTAL_BIRTHS, rarityN,
    stages: played, done, result,
  };
}
