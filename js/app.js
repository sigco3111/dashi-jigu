import { simulate, randomSeed, hashSeed, mulberry32, lifeReport } from './engine.js';
import { STAGES } from '../data/content.js';

const $ = (s) => document.querySelector(s);
const STORE = 'dashi-jigu-lives';
let seed = null;
let choices = [];
let era = 'now';
let lastLife = null;

function show(id) {
  document.querySelectorAll('.screen').forEach((e) => e.classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}
const fmtUsd = (n) => '$' + n.toLocaleString('en-US');
const pct = (x) => (x * 100 >= 0.1 ? (x * 100).toFixed(1) : (x * 100).toFixed(2));

// ---------- 시작 ----------
$('#btn-born').addEventListener('click', () => { seed = randomSeed(); choices = []; showBirth(); });
$('#btn-archive').addEventListener('click', showArchive);
$('#btn-arch-back').addEventListener('click', () => { location.hash = ''; show('#scr-start'); });

// --- 시대 선택 (R8) ---
const eraBtns = document.querySelectorAll('.era-btn');
eraBtns.forEach((b) => {
  b.addEventListener('click', () => {
    eraBtns.forEach((x) => x.classList.toggle('active', x === b));
    era = b.dataset.era;
  });
});
function eraSuffix() { return era !== 'now' ? '-e' + era : ''; }

// ---------- 탄생 ----------
function showBirth() {
  show('#scr-birth');
  $('#birth-panel').classList.add('hidden');
  const life = simulate(seed, [], era);
  runStarfield(() => {
    $('#b-country').textContent = life.country;
    $('#b-detail').textContent = (life.era && life.era !== 'now' ? life.era + '년생 · ' : '') + (life.urban ? '도시' : '농촌') + ' · ' + life.wealthLabel;
    $('#b-name').textContent = life.name + ' (' + (life.sex === 'm' ? '남' : '여') + ')';
    $('#b-rarity').textContent = (life.era && life.era !== 'now' ? life.era + '년에 태어난 아기 가운데(자료가 있는 나라 기준)' : '올해 태어나는 아기 가운데') + ' 이 삶의 확률 ' + pct(life.rarity) + '% · ' + life.rarityN + '명 중 1명';
    $('#birth-panel').classList.remove('hidden');
  });
}

function runStarfield(done) {
  const cv = $('#cv-birth');
  const ctx = cv.getContext('2d');
  const rng = mulberry32(hashSeed(seed));
  const stars = [];
  for (let i = 0; i < 220; i++) stars.push({ x: rng() * 800, y: rng() * 800, r: rng() * 1.6 + 0.3, tw: rng() * 6.28 });
  const gx = 260 + rng() * 280, gy = 300 + rng() * 220;
  const t0 = performance.now();
  (function frame(t) {
    const el = (t - t0) / 1000;
    ctx.clearRect(0, 0, 800, 800);
    const g = ctx.createLinearGradient(0, 0, 0, 800);
    g.addColorStop(0, '#0b1020'); g.addColorStop(1, '#1a2342');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 800);
    for (const s of stars) {
      const a = 0.35 + 0.3 * Math.sin(el * 2 + s.tw);
      ctx.globalAlpha = Math.min(1, a + el * 0.15);
      ctx.fillStyle = '#cdd6ee';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const glow = Math.min(1, el / 1.6);
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 90 * glow + 10);
    rg.addColorStop(0, 'rgba(255,217,160,' + 0.9 * glow + ')');
    rg.addColorStop(0.3, 'rgba(255,178,110,' + 0.35 * glow + ')');
    rg.addColorStop(1, 'rgba(255,178,110,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(gx, gy, 100 * glow + 10, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#ffe9c8';
    ctx.beginPath(); ctx.arc(gx, gy, 3 + glow * 2, 0, 6.29); ctx.fill();
    if (el < 2.1) requestAnimationFrame(frame); else done();
  })(t0);
}

$('#btn-live').addEventListener('click', () => { show('#scr-life'); renderStage(); });

// ---------- 인생 구간 ----------
function renderHud(stats) {
  const defs = [['건강', 'health'], ['행복', 'happiness'], ['배움', 'learning'], ['관계', 'relations']];
  $('#hud').innerHTML = defs.map(([label, k]) =>
    '<div class="gauge"><div class="g-label"><span>' + label + '</span><span>' + stats[k] + '</span></div>' +
    '<div class="g-track"><div class="g-fill" style="width:' + stats[k] + '%"></div></div></div>').join('');
}

function renderStage() {
  $('#death-overlay').classList.add('hidden');
  $('#event-overlay').classList.add('hidden');
  const life = simulate(seed, choices, era);
  renderHud(life.stats);
  if (life.done) { showDeath(life); return; }
  const i = choices.length;
  const st = STAGES[i];
  const birth = simulate(seed, [], era);
  const place = birth.urban ? '도시의 작은 집' : '농촌의 집';
  $('#st-age').textContent = st.ages[0] + '세 – ' + st.ages[1] + '세';
  $('#st-title').textContent = st.title;
  $('#st-text').textContent = st.text.replace('{place}', place);
  const box = $('#st-choices');
  box.innerHTML = '';
  st.choices.forEach((ch, idx) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = ch.text;
    b.addEventListener('click', () => {
      choices[i] = idx;
      location.hash = '#s=' + seed + '-' + choices.join('') + eraSuffix();
      const after = simulate(seed, choices, era);
      renderHud(after.stats);
      const ev = after.stages[i] && after.stages[i].event;
      if (ev) { setTimeout(() => showEvent(ev), 450); }
      else setTimeout(renderStage, 450);
    });
    box.appendChild(b);
  });
}

function fmtDiff(n) { return n === 0 ? '0년' : (n > 0 ? Math.abs(n) + '년 더 길게' : Math.abs(n) + '년 더 짧게'); }
function showDeath(life) {
  const r = life.result;
  $('#d-text').innerHTML = '<strong>' + life.name + '</strong><br>' + r.deathAge + '세 · ' + r.cause;
  const rep = lifeReport(life);
  if (rep) {
    const rows = [
      ['수명', life.country + ' 기대수명(' + rep.countryLE + '세)보다 ' + fmtDiff(rep.diffCountry) + ' · 세계 평균(' + rep.worldLE + '세)보다 ' + fmtDiff(rep.diffWorld)],
      ['동갑', '같은 해 태어난 세계 아기의 약 ' + rep.diedEarlierPct + '%가 당신보다 먼저 세상을 떠났습니다 (추정)'],
      ['소득', '추정 연 소득 ' + fmtUsd(r.income) + ' — ' + life.country + ' 안에서 상위 ' + rep.incomeTopCountryPct + '% · 세계 동갑 기준 상위 ' + rep.incomeTopWorldPct + '% (추정)'],
    ];
    $('#d-report').innerHTML = rows.map(([k, v]) =>
      '<div class="rep-row"><span class="rep-k">' + k + '</span><span class="rep-v">' + v + '</span></div>').join('');
  } else { $('#d-report').innerHTML = ''; }
  $('#death-overlay').classList.remove('hidden');
  saveLife(life);
}

$('#btn-card').addEventListener('click', () => { $('#death-overlay').classList.add('hidden'); renderCard(simulate(seed, choices, era)); show('#scr-card'); });

// ---------- 인생 이벤트 (R2) ----------
function showEvent(ev) {
  $('#e-kicker').textContent = ev.chain ? '연쇄 사건' : '일어난 일';
  $('#e-chain').textContent = ev.chain ? '◂ 이전 사건 「' + ev.from + '」에서 이어집니다' : '';
  $('#e-title').textContent = ev.title;
  $('#e-text').textContent = ev.text;
  const labels = ['건강', '행복', '배움', '관계'];
  const parts = ev.fx.map((v, i2) => (v ? labels[i2] + (v > 0 ? ' +' : ' ') + v : null)).filter(Boolean);
  $('#e-fx').textContent = parts.join(' · ');
  $('#event-overlay').classList.remove('hidden');
}
$('#btn-event-ok').addEventListener('click', () => { $('#event-overlay').classList.add('hidden'); renderStage(); });

// ---------- 기록 ----------
function loadLives() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
function saveLife(life) {
  const r = life.result;
  const evs = life.stages.filter((s) => s.event).map((s) => s.event.tag);
  const chain = life.stages.some((s) => s.event && s.event.chain);
  const lives = loadLives();
  lives.unshift({ seed, choices: choices.join(''), era: life.era || 'now', name: life.name, country: life.country, age: r.deathAge, cause: r.cause, date: new Date().toISOString().slice(0, 10), rarityN: life.rarityN, chain, events: evs });
  localStorage.setItem(STORE, JSON.stringify(lives.slice(0, 50)));
}

// 수집 도장 (R5): 지난 생애 기록에서 얻는 수집 요소
const STAMPS = [
  { icon: '🌱', name: '첫걸음', desc: '첫 생애 기록', test: (L) => L.length >= 1 },
  { icon: '🧭', name: '열 번의 삶', desc: '10생 기록', test: (L) => L.length >= 10 },
  { icon: '🌟', name: '희귀한 탄생', desc: '5만 명 중 1명 이하의 삶', test: (L) => L.some((l) => (l.rarityN || 0) >= 50000) },
  { icon: '🎂', name: '백 세 인생', desc: '100세 이상 장수', test: (L) => L.some((l) => l.age >= 100) },
  { icon: '⬥', name: '연쇄의 주인공', desc: '연쇄 사건 경험', test: (L) => L.some((l) => l.chain) },
  { icon: '🗺', name: '세계 여행자', desc: '서로 다른 5개국', test: (L) => new Set(L.map((l) => l.country)).size >= 5 },
  { icon: '🎭', name: '파란만장', desc: '서로 다른 사건 10종', test: (L) => new Set(L.flatMap((l) => l.events || [])).size >= 10 },
  { icon: '🏆', name: '전설의 삶', desc: '프로 데뷔 또는 재기 경험', test: (L) => L.some((l) => (l.events || []).some((t) => t === '프로 데뷔' || t === '재기')) },
];
function showArchive() {
  const lives = loadLives();
  const stamps = $('#arch-stamps');
  const got = STAMPS.filter((s) => s.test(lives)).length;
  stamps.innerHTML = '<p class="dim stamp-head">수집 도장 ' + got + ' / ' + STAMPS.length + '</p>' + STAMPS.map((s) => {
    const ok = s.test(lives);
    return '<div class="stamp ' + (ok ? 'earned' : 'locked') + '"><div class="s-icon">' + s.icon + '</div><div class="s-name">' + s.name + '</div><div class="s-desc">' + s.desc + '</div></div>';
  }).join('');
  const list = $('#arch-list');
  list.innerHTML = lives.length ? '' : '<p class="dim">아직 살아본 생이 없습니다.</p>';
  lives.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'arch-item';
    b.innerHTML = '<div class="a-name">' + (l.chain ? '⬥ ' : '') + l.name + ' · ' + l.country + '</div><div class="a-sub">' + (l.era && l.era !== 'now' ? l.era + '년생 · ' : '') + l.age + '세 · ' + l.cause + ' · ' + l.date + '</div>';
    b.addEventListener('click', () => {
      seed = l.seed; choices = l.choices.split('').map(Number);
      era = l.era || 'now';
      eraBtns.forEach((x) => x.classList.toggle('active', x.dataset.era === era));
      location.hash = '#s=' + seed + '-' + l.choices + eraSuffix();
      renderCard(simulate(seed, choices, era)); show('#scr-card');
    });
    list.appendChild(b);
  });
  show('#scr-archive');
}

// ---------- 인생 지도 카드 ----------
function renderCard(life) {
  lastLife = life;
  const r = life.result;
  const cv = $('#cv-card');
  const W = 1000, H = 1420;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(hashSeed(life.seed + '-card'));

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#101832'); g.addColorStop(0.6, '#0b1020'); g.addColorStop(1, '#141c38');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    ctx.globalAlpha = 0.15 + rng() * 0.4;
    ctx.fillStyle = '#cdd6ee';
    ctx.beginPath(); ctx.arc(rng() * W, rng() * H * 0.75, rng() * 1.4 + 0.3, 0, 6.29); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 헤더
  ctx.fillStyle = '#7fd4c1';
  ctx.font = '600 26px sans-serif';
  ctx.fillText('다시, 지구', 56, 66);
  ctx.fillStyle = '#eef1f8';
  ctx.font = '700 52px sans-serif';
  ctx.fillText(life.name, 56, 130);
  ctx.fillStyle = '#9aa3bd';
  ctx.font = '26px sans-serif';
  ctx.fillText((life.era && life.era !== 'now' ? life.era + '년생 · ' : '') + life.country + ' · ' + (life.urban ? '도시' : '농촌') + ' · ' + life.wealthLabel, 56, 172);

  // 여정 경로: 아래(태어남)에서 위(죽음)로
  const pts = [];
  const n = life.stages.length;
  for (let i = 0; i <= n; i++) {
    const age = i === 0 ? 0 : i === n ? r.deathAge : life.stages[i - 1].ages[1];
    const t = n === 0 ? 0 : i / n;
    const y = 1000 - t * 660;
    const x = 500 + Math.sin(i * 1.05 + 0.4) * 190;
    const evObj = i === 0 ? null : life.stages[i - 1].event;
    pts.push({ x, y, age, tag: i === 0 ? '태어남' : life.stages[i - 1].tag, title: i === 0 ? life.country : life.stages[i - 1].title, eventTag: evObj ? evObj.tag : null, chain: !!(evObj && evObj.chain), from: evObj && evObj.from });
  }
  ctx.strokeStyle = 'rgba(255,217,160,.75)';
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(255,190,120,.7)'; ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    ctx.quadraticCurveTo(p.x, (p.y + q.y) / 2, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 연쇄 사건: 방아쇠 사건 노드에서 후속 사건 노드로 점선 연결 (R4)
  pts.forEach((p, i) => {
    if (!p.chain) return;
    const j = pts.findIndex((q, k) => k < i && q.eventTag === p.from);
    if (j < 0) return;
    const a = pts[j];
    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = 'rgba(127,212,193,.65)';
    ctx.lineWidth = 3;
    const cx = (a.x + p.x) / 2 + (a.x < 500 ? 120 : -120);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, (a.y + p.y) / 2, p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(127,212,193,.85)';
    ctx.font = '600 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('연쇄', cx, (a.y + p.y) / 2 - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  });

  pts.forEach((p, i) => {
    const last = i === pts.length - 1;
    ctx.fillStyle = last ? '#ff8f5e' : '#ffd9a0';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(p.x, p.y, last ? 11 : 8, 0, 6.29); ctx.fill();
    ctx.shadowBlur = 0;
    const right = p.x < 500;
    const tx = right ? p.x + 26 : p.x - 26;
    ctx.textAlign = right ? 'left' : 'right';
    ctx.fillStyle = '#eef1f8';
    ctx.font = '600 24px sans-serif';
    ctx.fillText(p.title + ' · ' + p.tag, tx, p.y + 2);
    ctx.fillStyle = '#9aa3bd';
    ctx.font = '20px sans-serif';
    ctx.fillText(p.age + '세', tx, p.y + 28);
    if (p.eventTag) {
      ctx.fillStyle = p.chain ? '#ffb45e' : '#7fd4c1';
      ctx.font = '600 18px sans-serif';
      ctx.fillText((p.chain ? '⬥ ' : '◆ ') + p.eventTag, tx, p.y + 52);
    }
    ctx.textAlign = 'left';
  });

  // 하단 정보 패널
  ctx.fillStyle = 'rgba(20,28,56,.9)';
  roundRect(ctx, 40, 1060, W - 80, 150, 18); ctx.fill();
  ctx.fillStyle = '#9aa3bd'; ctx.font = '22px sans-serif';
  const famTxt = r.hasPartner ? ('배우자 있음 · 자녀 ' + r.children + '명') : '혼자의 삶';
  ctx.fillText('직업  ' + r.job, 70, 1108);
  ctx.fillText('가족  ' + famTxt, 70, 1142);
  ctx.fillText('추정 소득  연 ' + fmtUsd(r.income) + ' · 남긴 재산 ' + fmtUsd(r.wealthLeft), 70, 1176);
  const stats = life.stats;
  const defs = [['건강', stats.health], ['행복', stats.happiness], ['배움', stats.learning], ['관계', stats.relations]];
  defs.forEach(([label, v], i) => {
    const x = 560 + i * 100;
    ctx.fillStyle = '#9aa3bd'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x + 30, 1108);
    ctx.fillStyle = '#1a2342'; roundRect(ctx, x, 1122, 60, 10, 5); ctx.fill();
    ctx.fillStyle = '#7fd4c1'; roundRect(ctx, x, 1122, 60 * v / 100, 10, 5); ctx.fill();
    ctx.fillStyle = '#eef1f8'; ctx.fillText(String(v), x + 30, 1162);
    ctx.textAlign = 'left';
  });

  // 삶의 리포트 패널 (R7): 저장 이미지 안에 수명·동갑·소득 정산을 담는다
  const rep2 = lifeReport(life);
  if (rep2) {
    ctx.fillStyle = 'rgba(20,28,56,.9)';
    roundRect(ctx, 40, 1240, W - 80, 122, 18); ctx.fill();
    const sgn = (d) => (d >= 0 ? '+' : '-') + Math.abs(d) + '년';
    const rows2 = [
      ['수명', life.country + ' 기대수명(' + rep2.countryLE + '세) 대비 ' + sgn(rep2.diffCountry) + ' · 세계 평균(' + rep2.worldLE + '세) 대비 ' + sgn(rep2.diffWorld)],
      ['동갑', '같은 해 태어난 세계 아기의 약 ' + rep2.diedEarlierPct + '%가 먼저 세상을 떠남 (추정)'],
      ['소득', life.country + ' 안 상위 ' + rep2.incomeTopCountryPct + '% · 세계 동갑 상위 ' + rep2.incomeTopWorldPct + '% (추정)'],
    ];
    rows2.forEach(([k, v], i) => {
      ctx.fillStyle = '#7fd4c1'; ctx.font = '600 20px sans-serif';
      ctx.fillText(k, 70, 1280 + i * 32);
      ctx.fillStyle = '#c3cbdf'; ctx.font = '20px sans-serif';
      ctx.fillText(v, 150, 1280 + i * 32);
    });
  }

  ctx.fillStyle = '#5c6685';
  ctx.font = '18px sans-serif';
  const evN = life.stages.filter((s2) => s2.event).length;
  ctx.fillText('산 나이 ' + r.deathAge + '세 · 사인 ' + r.cause + ' · 인생 사건 ' + evN + '건 · 이 삶의 확률 ' + life.rarityN + '명 중 1명', 56, H - 48);
  ctx.textAlign = 'right';
  ctx.fillText('데이터: 세계은행 WDI (CC BY 4.0) · 시드 ' + life.seed, W - 56, H - 18);
  ctx.textAlign = 'left';
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

$('#btn-save').addEventListener('click', () => {
  $('#cv-card').toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dashi-jigu-' + seed + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
});
$('#btn-share').addEventListener('click', async (e) => {
  const url = location.origin + location.pathname + '#s=' + seed + '-' + choices.join('') + eraSuffix();
  const l = lastLife || simulate(seed, choices);
  const text = '「다시, 지구」 ' + (l.era && l.era !== 'now' ? l.era + '년생 · ' : '') + l.name + ' — ' + l.country + '에서 ' + l.result.deathAge + '세를 살았습니다 (이 삶의 확률 ' + l.rarityN + '명 중 1명).\n당신의 삶도 뽑아 보세요: ' + url;
  try {
    await navigator.clipboard.writeText(text);
    e.target.textContent = '복사됨 ✓';
  } catch (err) {
    prompt('아래 문구를 복사하세요', text);
  }
  setTimeout(() => { e.target.textContent = '링크 복사'; }, 1600);
});
$('#btn-again').addEventListener('click', () => { seed = randomSeed(); choices = []; location.hash = ''; showBirth(); });
$('#btn-home').addEventListener('click', () => { location.hash = ''; show('#scr-start'); });

// ---------- 공유 링크 재현 ----------
(function boot() {
  const m = location.hash.match(/^#s=([a-z0-9]{6})-(\d{1,8})(?:-e(\d{4}))?$/);
  if (m) {
    seed = m[1];
    choices = m[2].split('').map(Number);
    era = m[3] || 'now';
    eraBtns.forEach((x) => x.classList.toggle('active', x.dataset.era === era));
    const life = simulate(seed, choices, era);
    if (life.done) { renderCard(life); show('#scr-card'); return; }
  }
  show('#scr-start');
})();
