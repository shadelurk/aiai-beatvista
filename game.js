// AI:哀 —— 素のブラウザ版（Akashic を使わない）。曲：★バックアップの夜（作詞・作曲 ShadeLurk）　映像：JIZURA（歌詞モーション）＋背景
// 合図の音のあと、2拍おいて同じリズムでタップし、記録を保存する。遊び・判定・得点・演出・10言語は Akashic 版（BackupNight/script/main.js）と同じ。
// 映像はゲーム画面（canvas）の後ろの <video> で流し、曲（Web Audio）の時刻に合わせて再生位置を補正する。
(() => {
'use strict';
const W = 1280, H = 720;
const EXACT_SEC = 0.015, GOOD_SEC = 0.11;          // 0.015 秒以内は同期率 100%、判定幅 0.11 秒
const GUIDE_Y = 640, GUIDE_X0 = 400, SLOT = 60;     // 下の小節ガイド（合図 4 マス ＋ 応答 4 マス、8分音符）。その下に日本語字幕
const INK = '#F2F0EC', DIM = 'rgba(242,240,236,0.28)', LOST = '#C2185B';
const X_URL = 'https://x.com/ShadeLurk';
const STEAM_URL = 'https://store.steampowered.com/app/2527810/BEATVISTA/';
const SHARE_URL = 'https://unityroom.com/games/aiai-beatvista';
const FONT = 'serif';
const VIDEO_FPS = 24;
const THEMES = [
	{ ink: INK, dim: DIM, mid: 'rgba(242,240,236,0.55)', soft: 'rgba(242,240,236,0.75)', box: 'rgba(16,15,17,0.55)', stroke: 'rgba(10,10,12,0.85)' },
	{ ink: '#1B1A1C', dim: 'rgba(27,26,28,0.28)', mid: 'rgba(27,26,28,0.55)', soft: 'rgba(27,26,28,0.75)', box: 'rgba(242,240,236,0.6)', stroke: 'rgba(242,240,236,0.85)' }
];

// ---------------- 画面
const stage = document.getElementById('stage'), cv = document.getElementById('cv'), video = document.getElementById('bg');
const ctx = cv.getContext('2d');
let scale = 1;
function layout() {
	const vw = window.innerWidth, vh = window.innerHeight;
	scale = Math.min(vw / W, vh / H);
	stage.style.transform = `translate(${(vw - W * scale) / 2}px, ${(vh - H * scale) / 2}px) scale(${scale})`;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
}
window.addEventListener('resize', layout); layout();

// ---------------- 文字・図形
function setFont(size, big) { ctx.font = `${size}px ${FONT}`; }
// 文字（y は上端）。ax：0 左寄せ / 0.5 中央 / 1 右寄せ。maxW を超えたら縮める。縁取りは文字色に合わせて濃い／明るい色
function text(str, x, y, size, o) {
	o = o || {};
	if (!str) return 0;
	setFont(size);
	const w = ctx.measureText(str).width;
	const s = o.maxW && w > o.maxW ? o.maxW / w : 1;
	ctx.save();
	ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
	ctx.translate(x - (o.ax == null ? 0.5 : o.ax) * w * s, y);
	ctx.scale(s, s);
	ctx.textBaseline = 'top';
	ctx.lineJoin = 'round';
	ctx.lineWidth = size * (o.big ? 6 / 96 : 4 / 48);
	ctx.strokeStyle = o.stroke || THEMES[0].stroke;
	ctx.strokeText(str, 0, 0);
	ctx.fillStyle = o.color || INK;
	ctx.fillText(str, 0, 0);
	ctx.restore();
	return w * s;
}
function rect(color, x, y, w, h, a) {
	if (a === 0 || w <= 0 || h <= 0) return;
	ctx.save(); ctx.globalAlpha *= a == null ? 1 : a; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.restore();
}
function square(color, cx, cy, half, a, lw) {
	rect(color, cx - half, cy - half, half * 2, lw, a); rect(color, cx - half, cy + half - lw, half * 2, lw, a);
	rect(color, cx - half, cy - half, lw, half * 2, a); rect(color, cx + half - lw, cy - half, lw, half * 2, a);
}
const IMG = {};
function sprite(id, x, y, sc, a, ang, ax, ay) {
	const im = IMG[id]; if (!im || !im.complete || a <= 0) return;
	ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); if (ang) ctx.rotate(ang); ctx.scale(sc, sc);
	ctx.drawImage(im, -im.width * (ax == null ? .5 : ax), -im.height * (ay == null ? .5 : ay));
	ctx.restore();
}

// ---------------- 音（Web Audio。曲の時刻は音の時計で測る）
const AC = window.AudioContext || window.webkitAudioContext;
// Web Audio が無い環境では、通常の音声で鳴らし、時計は実時間（予備）
const HAS_WA = !!AC;
const ac = HAS_WA ? new AC() : { state: 'running', get currentTime() { return performance.now() / 1000; }, resume() {}, outputLatency: 0 };
const BUF = {};
const ext = (() => { const a = document.createElement('audio'); return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; })();
async function loadAudio(name) {
	if (!HAS_WA) { const a = new Audio(`audio/${name}.${ext}`); a.preload = 'auto'; BUF[name] = a; return; }
	const r = await fetch(`audio/${name}.${ext}`); const b = await r.arrayBuffer();
	BUF[name] = await new Promise((ok, ng) => ac.decodeAudioData(b, ok, ng));
}
function play(name, when, gain) {
	const b = BUF[name]; if (!b) return null;
	if (!HAS_WA) {
		const a = b.cloneNode(); a.volume = gain == null ? 1 : gain;
		const t = setTimeout(() => { const q = a.play(); if (q && q.catch) q.catch(() => {}); }, Math.max(0, (when || 0) - ac.currentTime) * 1000);
		return { stop() { clearTimeout(t); a.pause(); } };
	}
	const s = ac.createBufferSource(); s.buffer = b;
	const g = ac.createGain(); g.gain.value = gain == null ? 1 : gain;
	s.connect(g); g.connect(ac.destination); s.start(when || 0);
	return s;
}

// ---------------- データ
let CHART, I18N, LUMS, SUBS, SUBPOSES;
let lang = 'ja';
function detectLang(order) {
	const q = new URLSearchParams(location.search).get('lang'); if (q && order.includes(q)) return q;   // URL の指定（?lang=en など）がいちばん優先
	try { const s = localStorage.getItem('aiai.lang'); if (s && order.includes(s)) return s; } catch (e) { /* 保存領域が使えない */ }
	const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
	for (const raw of list) {
		const l = String(raw || '').toLowerCase();
		if (l.startsWith('zh')) return /tw|hk|mo|hant/.test(l) ? 'zht' : 'zhs';
		const two = l.slice(0, 2); if (order.includes(two)) return two;
	}
	return 'en';
}
function saveLang(l) { try { localStorage.setItem('aiai.lang', l); } catch (e) { /* 保存できなくても進める */ } }
function T(key, v) {
	let s = (I18N[lang] && I18N[lang][key]) || I18N.ja[key] || '';
	if (v) Object.keys(v).forEach((k) => { s = s.split('{' + k + '}').join(String(v[k])); });
	return s;
}
function openUrl(url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* 開けない環境 */ } }

// ---------------- ボタン（押せる範囲）
let buttons = [];
function button(x, y, w, h, color, onPush, a) { rect(color, x, y, w, h, a); buttons.push({ x, y, w, h, onPush }); }
// 告知（右下・右詰め）。各行を押すと X / Steam のページ。下線でリンクだと分かるように
function promo(big, a) {
	const l1 = { y: big ? 640 : 660, size: big ? 22 : 16, color: big ? 'rgba(242,240,236,0.65)' : 'rgba(242,240,236,0.5)', s: 'x.com/ShadeLurk', url: X_URL };
	const l2 = { y: big ? 672 : 682, size: big ? 24 : 17, color: big ? 'rgba(242,240,236,0.85)' : 'rgba(242,240,236,0.65)', s: T('promo'), url: STEAM_URL };
	[l1, l2].forEach((l) => {
		const w = text(l.s, 1250, l.y, l.size, { ax: 1, color: l.color, maxW: l === l1 ? 600 : 900, alpha: a });
		rect('rgba(242,240,236,0.45)', 1250 - w, l.y + l.size + 2, w, 1, a);
		buttons.push({ x: 1250 - w - 6, y: l.y - 4, w: w + 12, h: l.size + 10, onPush: () => openUrl(l.url) });
	});
}

// ---------------- 状態
let state = 'load';           // load → start（言語選択）→ intro（遊び方）→ play → end
let now = 0;                  // 曲の秒
let songStart = 0, songSrc = null;
let introAt = 0, titleAt = 8.4;
let notes = [], cues = [], total = 0;
let saved = 0, streak = 0, syncSum = 0, miss = 0, score = 0, shown = 0, shownTarget = 0;
let tapLog = [], pendingMiss = [];
let tScore = THEMES[0], tJudge = THEMES[0], tGuide = THEMES[0], tSub = THEMES[0];
let judge = { text: '', until: 0, lost: false, strong: true };
let guideA = 0;
let fx = [];                  // 一時的な演出 { start, dur, draw(u) }
let replays = [], offs = [];
let flashA = 0, gain = { s: '', at: -9 };
let endAt = 0, result = null;
const rt = () => performance.now() / 1000;   // 演出の時計（実時間）
const songTime = () => ac.currentTime - songStart - (ac.outputLatency || 0);

function setupNotes() {
	notes = [];
	CHART.events.forEach((ev) => {
		const e8 = (ev.hit[0] - ev.cue[0]) / 4;
		ev.cue.forEach((t, i) => notes.push({ t: ev.hit[i], cue: t, slot: Math.max(0, Math.min(3, Math.round((t - ev.bar) / e8))), bar: ev, done: false, state: '' }));
	});
	const playEnd = CHART.duration;
	total = notes.filter((n) => n.t < playEnd - 0.2).length;
	cues = notes.slice().sort((a, b) => a.cue - b.cue);
	saved = streak = syncSum = miss = score = shown = shownTarget = 0;
	tapLog = []; pendingMiss = []; fx = []; replays = []; offs = []; judge = { text: '', until: 0 }; guideA = 0; flashA = 0; gain = { s: '', at: -9 };
}

// ---------------- 入力（画面のどこをタップ / クリックしても、どのキーを押しても）
const keysDown = {};
cv.addEventListener('pointerdown', (e) => {
	e.preventDefault();
	if (ac.state !== 'running') ac.resume();
	const r = cv.getBoundingClientRect();
	const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
	for (let i = buttons.length - 1; i >= 0; i--) {
		const b = buttons[i];
		if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.onPush(); return; }
	}
	if (state === 'play') tap();
});
window.addEventListener('keydown', (e) => {
	if (e.repeat || keysDown[e.code]) return;
	keysDown[e.code] = true;
	if (ac.state !== 'running') ac.resume();
	if (state === 'start') pressStart();
	else if (state === 'intro') skipIntro();
	else if (state === 'play') { e.preventDefault(); tap(); }
});
window.addEventListener('keyup', (e) => { keysDown[e.code] = false; });

function tap() {
	if (state !== 'play') return;
	const t = songTime();
	tapLog.push(t); if (tapLog.length > 16) tapLog.shift();
	let hit = null;
	for (const n of notes) {
		if (n.done || n.t > t + GOOD_SEC || n.t >= CHART.duration - 0.2) continue;
		const dt = Math.abs(n.t - t);
		if (dt <= GOOD_SEC && (!hit || dt < Math.abs(hit.t - t))) hit = n;
	}
	if (!hit) { streak = 0; score = Math.max(0, score - 10); shownTarget -= 10; return; }   // 空打ちは少し減点（連打対策）
	hit.done = true; hit.state = 'saved';
	// 同期率：ずれ 0.015 秒以内で 100%、判定幅の端（0.11 秒）で 40%。得点は同期率そのまま＋続けて保存した分の少しの加点
	const dt = Math.abs(hit.t - t);
	const pct = Math.round(100 - 60 * Math.max(0, Math.min(1, (dt - EXACT_SEC) / (GOOD_SEC - EXACT_SEC))));
	syncSum += pct; saved++; streak++;
	const pts = pct + Math.min(40, streak * 2);
	score = Math.min(99999, score + pts);
	showJudge(T('sync', { n: pct }), false, pct >= 90);
	spawnFly(hit.slot + 4, pts, pct >= 90);
	if (dt > EXACT_SEC) showOffset(hit, t - hit.t);
	play('se_hit');
}
function showJudge(s, lost, strong) { judge = { text: s, until: rt() + 0.5, lost, strong }; }

// ---------------- 保存の光：右の四角から得点へ飛んで、届くと得点が数え上がる（niji 6 の光の素材）
const SCORE_X = 1160, SCORE_Y = 50;
function spawnFly(slotIdx, pts, strong) {
	const sx = GUIDE_X0 + SLOT * slotIdx + SLOT / 2, sy = GUIDE_Y;
	const cx = sx + (SCORE_X - sx) * 0.25, cy = sy - 300;
	const dk = tGuide === THEMES[1];
	fx.push({ start: rt(), dur: 0.38, draw: (u) => sprite(dk ? 'fx_ring_k' : 'fx_ring_w', sx, sy, 0.12 + 0.3 * (1 - (1 - u) * (1 - u)), 1 - u) });
	const at = (u) => {
		u = Math.max(0, Math.min(1, u)); const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
		return [(1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * SCORE_X, (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * SCORE_Y];
	};
	const base = strong ? 0.62 : 0.5;
	let arrived = false;
	fx.push({ start: rt(), dur: 0.55, draw: (u) => {
		const q = at(u), p0 = at(u - 0.02);
		const ang = Math.atan2(q[0] - p0[0], -(q[1] - p0[1]));
		const sc = base * (0.6 + 0.6 * Math.min(1, u * 2.2)) * (u > 0.85 ? 1 - (u - 0.85) * 4 : 1);
		sprite(dk ? 'fx_trail_k' : 'fx_trail_w', q[0], q[1], sc, u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1, ang, 0.5, 0.18);
		if (u >= 1 && !arrived) {
			arrived = true;
			shownTarget += pts;   // 光が届いた：得点が数え上がる
			const dks = tScore === THEMES[1];
			fx.push({ start: rt(), dur: 0.45, draw: (v) => sprite(dks ? 'fx_burst_k' : 'fx_burst_w', SCORE_X, SCORE_Y, 0.28 + 0.5 * (1 - (1 - v) * (1 - v)), (1 - v) * 0.95) });
			flashA = 0.3; gain = { s: '+' + pts, at: rt() };
		}
	} });
}

// ---------------- 欠損の手がかり（言葉なし）：合図の四角が脈打つ → 線が押すべき四角へ伸びる → 再生位置の線が重なる → 赤い輪 ×2。押していれば押した位置に薄い赤線
function startReplay(n) {
	replays.push({ xa: GUIDE_X0 + SLOT * n.slot + SLOT / 2, xb: GUIDE_X0 + SLOT * (n.slot + 4) + SLOT / 2, start: rt(), spawned: 0, tapX: null, note: n, cut: null });
	if (replays.length > 3) replays.shift();
}
function setReplayTap(n, dtSlots) {
	replays.forEach((r) => { if (r.note === n && dtSlots != null) r.tapX = Math.max(GUIDE_X0 - 26, Math.min(GUIDE_X0 + SLOT * 8 + 24, r.xb + dtSlots * SLOT)); });
}
function barLeft(ev) { return ev.bar + (ev.hit[0] - ev.cue[0]) * 2 - 0.05 - now; }
function drawReplays() {
	const LINK_Y = GUIDE_Y - 30;
	replays = replays.filter((r) => {
		const t = rt() - r.start;
		if (barLeft(r.note.bar) < 0 && r.cut == null) r.cut = t;   // ガイドが次の小節に切り替わったら早めに消す
		const END = r.cut == null ? 1.1 : Math.min(1.1, r.cut + 0.2);
		if (t >= END) return false;
		const fade = t > END - 0.2 ? Math.max(0, (END - t) / 0.2) : 1;
		const pulse = t < 0.2 ? 1 + 0.5 * Math.max(0, 1 - t / 0.2) : 1;
		square(LOST, r.xa, GUIDE_Y, 14 * pulse, fade, 2);
		const u = Math.max(0, Math.min(1, (t - 0.06) / 0.22));
		const up = Math.min(1, u * 3), across = Math.max(0, Math.min(1, u * 3 - 1)), down = Math.max(0, Math.min(1, u * 3 - 2));
		const h = GUIDE_Y - 14 - LINK_Y;
		if (u > 0) rect(LOST, r.xa - 1, GUIDE_Y - 14 - h * up, 2, h * up, fade);
		if (across > 0) rect(LOST, r.xa - 1, LINK_Y - 1, (r.xb - r.xa + 2) * across, 2, fade);
		if (down > 0) rect(LOST, r.xb - 1, LINK_Y, 2, h * down, fade);
		if (t >= 0.28) { const v = Math.min(1, (t - 0.28) / 0.15), e = 1 - (1 - v) * (1 - v); rect(LOST, r.xb - SLOT + SLOT * e - 1.5, GUIDE_Y - 26, 3, 52, fade); }
		if (t >= 0.43) square(LOST, r.xb, GUIDE_Y, 16, fade, 2);
		while (r.cut == null && t >= 0.43 && r.spawned < 2 && t >= 0.43 + r.spawned * 0.25) {
			r.spawned++;
			const xb = r.xb;
			fx.push({ start: rt(), dur: 0.32, draw: (w) => sprite('fx_ring_r', xb, GUIDE_Y, 0.14 + 0.26 * w, 1 - w * w) });
		}
		if (r.tapX != null) rect(LOST, r.tapX - 1, GUIDE_Y - 20, 2, 40, 0.5 * fade);
		return true;
	});
}

// ---------------- 保存できたが、ずれたとき：押した瞬間の再生位置（2.5 倍に広げた位置）に印、印から四角の中心へ帯、ずれの量（ms）。早ければ左、遅ければ右
const OFF_GAIN = 2.5;
function showOffset(n, dtSec) {
	const e8 = (n.bar.hit[0] - n.bar.cue[0]) / 4, cx = GUIDE_X0 + SLOT * (n.slot + 4) + SLOT / 2;
	offs.push({ cx, tx: cx + dtSec / e8 * SLOT * OFF_GAIN, ms: Math.round(Math.abs(dtSec) * 1000) + 'ms', early: dtSec < 0, note: n, start: rt(), cut: null });
	if (offs.length > 4) offs.shift();
}
function drawOffsets() {
	offs = offs.filter((o) => {
		const t = rt() - o.start;
		if (barLeft(o.note.bar) < 0 && o.cut == null) o.cut = t;
		const END = o.cut == null ? 0.75 : Math.min(0.75, o.cut + 0.15);
		if (t >= END) return false;
		const fade = t > END - 0.2 ? Math.max(0, (END - t) / 0.2) : 1;
		rect(tGuide.ink, o.tx - 1, GUIDE_Y - 26, 2, 52, fade);
		const u = Math.max(0, Math.min(1, (t - 0.05) / 0.2)), e = 1 - (1 - u) * (1 - u), x1 = o.tx + (o.cx - o.tx) * e;
		if (u > 0) rect(tGuide.mid, Math.min(o.tx, x1), GUIDE_Y - 27, Math.abs(x1 - o.tx), 3, fade);
		text(o.ms, o.early ? o.tx - 6 : o.tx + 6, GUIDE_Y - 50, 16, { ax: o.early ? 1 : 0, color: tGuide.ink, stroke: tGuide.stroke, maxW: 120, alpha: fade });
		return true;
	});
}

// ---------------- 映像（曲の時刻に合わせる）
function videoSrc(l) { return `video/${l}.mp4`; }
let videoLang = null;
function prepareVideo() {
	const want = LUMS[lang] ? lang : 'ja';
	if (videoLang !== want) { videoLang = want; video.src = videoSrc(want); video.load(); }
	video.pause();
	try { video.currentTime = 0; } catch (e) { /* 読み込み前 */ }
}
function syncVideo() {
	if (state !== 'play' && state !== 'end') return;
	if (!isFinite(songStart)) return;   // 映像が動き出すのを待っている間は合わせない
	if (state === 'end') return;                                           // 結果画面では映像は最後のコマで止めたまま
	const vEnd = isFinite(video.duration) ? video.duration - 0.05 : CHART.duration;
	const t = Math.max(0, Math.min(vEnd, now));
	if (video.ended || now >= vEnd) return;                                // 映像は曲より少し短い。最後まで来たら再生し直さない（頭から流れ直すのを防ぐ）
	if (video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
	const drift = video.currentTime - t;
	if (Math.abs(drift) > 0.15) { try { video.currentTime = t; } catch (e) { /* シーク不可 */ } video.playbackRate = 1; }
	else video.playbackRate = Math.max(0.92, Math.min(1.08, 1 - drift * 0.8));
}
// 背景の明るさ（コマごと、24 コマ/秒）：bit0 得点 / bit1 判定 / bit2 ガイド。明るい所は黒文字
function applyTheme() {
	const L = LUMS[videoLang] || ''; if (!L) return;
	const f = Math.max(0, Math.min(L.length - 1, Math.floor(now * VIDEO_FPS)));
	const bits = L.charCodeAt(f) - 48;
	tScore = THEMES[bits & 1]; tJudge = THEMES[(bits >> 1) & 1]; tGuide = THEMES[(bits >> 2) & 1]; tSub = THEMES[(bits >> 3) & 1];
}


// ---------------- 日本語字幕（他言語のとき。日本語で歌っているので、何を歌っているかを出す）
// 見た目は JIZURA の字幕帯（下帯）を真似る：明朝・細い下線と両端の小さな四角・行番号。下から覆いが開くように入り、静かに消える
// 時刻はいつもの手順の解析（data/subs.json：分離ボーカルに Whisper 窓スキャン → 原詞に照合 → 声の立ち上がりにスナップ）
// 置き場所：その言語の JIZURA の文字と重ならない所を行ごとに選んである（data/subpos.json：b ノーツの下 / l ノーツの左 / r ノーツの右 / t いちばん上）
const SUBPOS = { b: { cx: 640, y: 676, maxW: 660 }, l: { cx: 191, y: 612, maxW: 330 }, r: { cx: 1089, y: 612, maxW: 330 }, t: { cx: 640, y: 20, maxW: 660 } };
// 字幕の下の映像の明るさ（その場で映像を小さく写して測る）。明るければ墨色、暗ければ白
const probe = document.createElement('canvas'); probe.width = 64; probe.height = 36;
const pctx = probe.getContext('2d', { willReadFrequently: true });
let subTheme = THEMES[0], subProbeAt = -1;
function measureSub(pos) {
	if (rt() - subProbeAt < 0.25) return subTheme;
	subProbeAt = rt();
	try {
		pctx.drawImage(video, 0, 0, 64, 36);
		const x0 = Math.max(0, Math.floor((pos.cx - pos.maxW / 2) / 20)), x1 = Math.min(64, Math.ceil((pos.cx + pos.maxW / 2) / 20));
		const y0 = Math.floor(pos.y / 20), y1 = Math.min(36, Math.ceil((pos.y + 36) / 20));
		const d = pctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
		let m = 0; for (let i = 0; i < d.length; i += 4) m += (d[i] + d[i + 1] + d[i + 2]) / 3;
		m /= d.length / 4;
		if (subTheme === THEMES[0] && m > 165) subTheme = THEMES[1]; else if (subTheme === THEMES[1] && m < 135) subTheme = THEMES[0];
	} catch (e) { /* 読めない環境は白のまま */ }
	return subTheme;
}
function drawSub() {
	let x = null, i = -1;
	for (let k = 0; k < SUBS.length; k++) if (SUBS[k].t - 0.05 <= now && now < SUBS[k].end) { x = SUBS[k]; i = k; }
	if (!x) return;
	const pos = SUBPOS[(SUBPOSES[videoLang] || [])[i] || 'b'];
	const outA = Math.max(0, Math.min(1, (x.end - now) / 0.22));
	const th = measureSub(pos), size = 26;
	setFont(size);
	const chars = [...x.ja], ws = chars.map((c) => ctx.measureText(c).width);
	const w0 = ws.reduce((p, q) => p + q, 0), sc = w0 > pos.maxW ? pos.maxW / w0 : 1, w = w0 * sc;
	const left = pos.cx - w / 2, Y = pos.y;
	ctx.save();
	ctx.globalAlpha = outA;
	// 1 文字ずつ、その文字が歌われる時刻に、下からせり上がって現れる（JIZURA の文字送りを真似る）
	let cx = left, shown = 0;
	chars.forEach((c, j) => {
		const t0 = (x.ct ? x.ct[j] : x.t) - 0.04, u = Math.max(0, Math.min(1, (now - t0) / 0.2)), e = 1 - Math.pow(1 - u, 3);
		if (u > 0) {
			text(c, cx + ws[j] * sc / 2, Y + (1 - e) * 10, size * sc, { color: th.ink, stroke: th.stroke, alpha: e });
			shown = cx + ws[j] * sc - left;
		}
		cx += ws[j] * sc;
	});
	// 下線：現れた文字の下だけ伸び、歌い切ると両端に小さな四角
	const ly = Y + size + 6, lead = Math.min(1, (now - x.t + 0.05) / 0.25);
	rect(th.ink, left - 18 * lead, ly, shown + 36 * lead - 18 * lead, 1, 0.8);
	const done = x.ct ? now >= x.ct[x.ct.length - 1] + 0.15 : true;
	if (done) { rect(th.ink, left - 21, ly - 2, 5, 5, 0.9); rect(th.ink, left + w + 16, ly - 2, 5, 5, 0.9); }
	// 行番号（JIZURA の小さな刻印）
	text(String(i + 1).padStart(2, '0'), left - 14, Y + 4, 11, { ax: 1, color: th.soft, stroke: th.stroke, alpha: lead });
	ctx.restore();
}

// ---------------- 画面ごとの処理
function pressStart() {
	if (state !== 'start') return;
	if (ac.state !== 'running') ac.resume();
	state = 'intro'; introAt = rt(); titleAt = 8.4; lastLoop = -1; lastP = -1;
	setupNotes(); prepareVideo();
}
function skipIntro() { const t = rt() - introAt; if (t < titleAt) titleAt = t; }
// 曲の開始：先に映像を動かし始め、映像が実際に動き出した位置に曲を合わせて鳴らす（映像の再生開始の遅れで頭がずれないように）
function startSong() {
	state = 'play'; songStart = Infinity;
	try { video.currentTime = 0; } catch (e) { /* 読み込み前 */ }
	video.playbackRate = 1;
	let begun = false;
	const begin = () => {
		if (begun) return; begun = true;
		const lead = 0.06, off = (video.paused ? 0 : video.currentTime) + lead;
		songStart = ac.currentTime + lead - off;
		if (HAS_WA) { const s = ac.createBufferSource(); s.buffer = BUF.song; s.connect(ac.destination); s.start(ac.currentTime + lead, off); songSrc = s; }
		else { const a = BUF.song; a.currentTime = off; setTimeout(() => { const q = a.play(); if (q && q.catch) q.catch(() => {}); }, lead * 1000); songSrc = { stop() { a.pause(); } }; }
		// 合図の音は、音の時計で前もって並べる（曲とずれない）
		cues.forEach((n) => { if (n.t < CHART.duration - 0.2 && n.cue > off) play('se_cue', songStart + n.cue); });
		video.style.opacity = 1;
	};
	video.addEventListener('playing', begin, { once: true });
	const p = video.play(); if (p && p.catch) p.catch(() => begin());
	setTimeout(begin, 1200);   // 映像が動かない環境でも曲は始める
	window.__aiai = { songTime, video };   // 確認用
}

function drawStart() {
	rect('#1B1A1C', 0, 0, W, H);
	text('AI:哀', W / 2, 80, 110, { big: true });
	const LW = 200, LH = 48, LG = 16, LX0 = (W - (LW * 5 + LG * 4)) / 2;
	I18N.order.forEach((code, i) => {
		const x = LX0 + (i % 5) * (LW + LG), y = 330 + Math.floor(i / 5) * (LH + 14);
		button(x, y, LW, LH, code === lang ? 'rgba(242,240,236,0.32)' : 'rgba(242,240,236,0.08)', () => { lang = code; saveLang(code); });
		text(I18N[code].langName, x + LW / 2, y + 11, 24, { maxW: LW - 16 });
	});
	button(440, 476, 400, 72, 'rgba(242,240,236,0.18)', pressStart);
	text(T('edition'), 28, 22, 24, { ax: 0, color: 'rgba(242,240,236,0.8)', maxW: 600 });
	text(T('credit'), 640, 230, 24, { color: 'rgba(242,240,236,0.7)', maxW: 1180 });
	text(T('start'), 640, 494, 34, { maxW: 380 });
	text(T('note'), 640, 584, 22, { color: 'rgba(242,240,236,0.6)', maxW: 1180 });
	promo(false);
}

// 遊び方：大きなガイドで見本を動かし、見本の音も鳴らす。左で光った四角と右でタップする四角を線でつなぐ。終わるとすぐ曲が始まる
const E8 = 0.2125, LOOP = 2.1, PATS = [[0, 2], [0, 1, 2], [0, 2, 3], [1, 2]];
let lastLoop = -1, lastP = -1;
function drawIntro() {
	const t = rt() - introAt;
	if (t >= titleAt) { startSong(); return; }
	rect('#1B1A1C', 0, 0, W, H);
	const BS = 96, BX0 = (W - BS * 8) / 2, BY = 390;
	text(T('edition'), 28, 22, 24, { ax: 0, color: 'rgba(242,240,236,0.8)', maxW: 600 });
	text(T('caption'), 640, 170, 36, { maxW: 1200 });
	rect('rgba(242,240,236,0.08)', BX0 - 40, BY - 56, BS * 8 + 80, 104);
	rect(DIM, BX0 + BS * 4 - 1, BY - 44, 2, 88);
	const loop = Math.floor(t / LOOP), pat = PATS[loop % PATS.length], p = (t % LOOP) / E8;
	if (loop !== lastLoop) { lastLoop = loop; lastP = -1; }
	const size = []; const col = [];
	for (let i = 0; i < 8; i++) { size[i] = 14; col[i] = DIM; }
	let tapAt = -1;
	pat.forEach((s, k) => {
		if (lastP < s && p >= s) play('se_cue');
		if (lastP < s + 4 && p >= s + 4) play('se_hit');
		if (p >= s) {
			col[s] = INK; size[s] = p - s < 0.6 ? 30 : 22;
			col[s + 4] = p >= s + 4 ? INK : 'rgba(242,240,236,0.45)'; size[s + 4] = p >= s + 4 ? (p - s - 4 < 0.6 ? 34 : 26) : 22;
		}
		// 合図が光ってから、右でタップし終えるまで、対応する四角どうしを線でつなぐ（コの字を逆さにした形）
		const op = p >= s && p < s + 4.8 ? (p >= s + 4 ? 0.9 : 0.5) : 0;
		if (op > 0) {
			const y = BY - 42 - k * 12, xa = BX0 + BS * s + BS / 2, xb = BX0 + BS * (s + 4) + BS / 2, len = BY - 24 - y;
			rect(INK, xa - 1, y, 2, len, op); rect(INK, xb - 1, y, 2, len, op); rect(INK, xa - 1, y, xb - xa + 2, 2, op);
		}
		if (p >= s + 4 && p - (s + 4) < 0.9) tapAt = s + 4;
	});
	lastP = p;
	for (let i = 0; i < 8; i++) rect(col[i], BX0 + BS * i + BS / 2 - size[i] / 2, BY - size[i] / 2, size[i], size[i]);
	if (p <= 8) rect(INK, BX0 + BS * Math.min(p, 7.5) + BS / 2 - 1, BY + 30, 3, 14);
	if (tapAt >= 0) text(T('pop'), BX0 + BS * tapAt + BS / 2, BY - 112, 30, { maxW: 220 });
	text(T('capLeft'), BX0 + BS * 2, BY + 66, 26, { color: p < 4 ? INK : 'rgba(242,240,236,0.6)', maxW: BS * 4 - 10 });
	text(T('capRight'), BX0 + BS * 6, BY + 66, 26, { color: p >= 4 && p <= 8 ? INK : 'rgba(242,240,236,0.6)', maxW: BS * 4 - 10 });
	text(T('input'), 640, 530, 22, { color: 'rgba(242,240,236,0.7)', maxW: 1180 });
	button(510, 620, 260, 50, 'rgba(242,240,236,0.12)', skipIntro);
	text(T('skip'), 640, 632, 24, { maxW: 240 });
	promo(false);
}

function drawPlay() {
	applyTheme();
	// 見逃し
	for (const n of notes) {
		if (n.done || n.t >= CHART.duration - 0.2) continue;
		if (now - n.t > GOOD_SEC) {
			n.done = true; n.state = 'lost'; miss++; streak = 0;
			showJudge(T('lost'), true, true); play('se_miss');
			startReplay(n); pendingMiss.push(n);
		}
	}
	while (pendingMiss.length && now >= pendingMiss[0].t + 0.45) {
		const n = pendingMiss.shift(), e8 = (n.bar.hit[0] - n.bar.cue[0]) / 4;
		let best = null;
		tapLog.forEach((tt) => { if (Math.abs(tt - n.t) <= 0.45 && (best == null || Math.abs(tt - n.t) < Math.abs(best - n.t))) best = tt; });
		setReplayTap(n, best == null ? null : (best - n.t) / e8);
	}
	// 得点（光が届いたら数え上がる）
	if (shown !== shownTarget) { const d = shownTarget - shown; shown += d > 0 ? Math.max(1, Math.ceil(d * 0.22)) : Math.min(-1, Math.floor(d * 0.22)); }
	rect(tScore.box, 1060, 12, 208, 76);
	text(String(Math.max(0, shown)), 1250, 20, 30, { ax: 1, color: tScore.ink, stroke: tScore.stroke });
	text(T('counter', { a: saved, b: total }), 1250, 58, 20, { ax: 1, color: tScore.soft, stroke: tScore.stroke, maxW: 200 });
	if (flashA > 0) { rect(tScore.ink, 1060, 12, 208, 76, flashA); flashA = Math.max(0, flashA - 0.03); }
	const ga = rt() - gain.at;
	if (ga < 0.7) text(gain.s, 1250, 92 - ga * 24, 22, { ax: 1, color: tScore.ink, stroke: tScore.stroke, maxW: 200, alpha: Math.min(1, (0.7 - ga) / 0.3) });
	// いまの小節（合図の小節頭から応答の終わりまで）を下端のガイドに出す
	let cur = null;
	for (const ev of CHART.events) {
		const len = (ev.hit[0] - ev.cue[0]) * 2;
		if (ev.bar - 0.15 <= now && now < ev.bar + len - 0.05 && ev.bar + len / 2 < CHART.duration) { cur = ev; break; }
	}
	guideA = cur ? Math.min(1, guideA + 0.15) : Math.max(0, guideA - 0.08);
	if (guideA > 0) {
		ctx.save(); ctx.globalAlpha = guideA;
		rect(tGuide.box, GUIDE_X0 - 30, GUIDE_Y - 34, SLOT * 8 + 60, 62);
		rect(tGuide.dim, GUIDE_X0 + SLOT * 4 - 1, GUIDE_Y - 26, 2, 46);
		const size = [], col = [];
		for (let i = 0; i < 8; i++) { size[i] = 10; col[i] = tGuide.dim; }
		if (cur) {
			notes.forEach((n) => {
				if (n.bar !== cur) return;
				if (now >= n.cue) { col[n.slot] = tGuide.ink; size[n.slot] = now - n.cue < 0.12 ? 18 : 14; }
				const r = n.slot + 4;
				if (n.state === 'saved') { col[r] = tGuide.ink; size[r] = 18; }
				else if (n.state === 'lost') { col[r] = LOST; size[r] = 14; }
				else if (now >= n.cue) { col[r] = tGuide.mid; size[r] = 14; }
			});
		}
		for (let i = 0; i < 8; i++) { const x = GUIDE_X0 + SLOT * i + SLOT / 2; rect(col[i], x - size[i] / 2, GUIDE_Y - size[i] / 2, size[i], size[i]); }
		if (cur) {
			const e8 = (cur.hit[0] - cur.cue[0]) / 4, p = Math.max(-0.5, Math.min(7.5, (now - cur.bar) / e8));
			rect(tGuide.ink, GUIDE_X0 + SLOT * p + SLOT / 2 - 1, GUIDE_Y + 16, 2, 8);   // 線がマスの中心を通る瞬間＝判定の時刻
		}
		ctx.restore();
	}
	drawReplays(); drawOffsets();
	if (lang !== 'ja') drawSub();
	if (rt() < judge.until) text(judge.text, GUIDE_X0 + SLOT * 4, GUIDE_Y - 82, 30, { color: judge.lost ? LOST : judge.strong ? tJudge.ink : tJudge.soft, stroke: tJudge.stroke, maxW: SLOT * 8 });
	if (state === 'play' && now >= CHART.duration) finish();   // 結果画面に入ったら、もう一度は呼ばない（呼ぶと結果画面の表示が毎コマやり直しになり、見えなくなる）
}

function finish() {
	state = 'end'; endAt = rt();
	video.pause();   // 映像は最後のコマで止める
	const rate = Math.round(syncSum / Math.max(1, total));
	// 結果の一文は歌詞から（92% は上手い人が丁寧に叩けば届く線）
	const words = rate >= 92 ? T('res1') : rate >= 82 ? T('res2') : rate >= 65 ? T('res3') : rate >= 40 ? T('res4') : T('res5');
	result = { rate, words, score };
}
function drawEnd() {
	const a = Math.min(1, (rt() - endAt) / 0.4);
	rect('rgba(16,15,17,0.86)', 0, 0, W, H, a);
	ctx.save(); ctx.globalAlpha = a;
	text(result.words, 640, 200, 54, { big: true, maxW: 1180 });
	text(String(result.score), 640, 300, 72, { big: true });
	text(T('resSaved', { a: saved, b: total }), 640, 420, 26, { color: 'rgba(242,240,236,0.75)', maxW: 1100 });
	text(T('resRate', { n: result.rate, m: miss }), 640, 466, 24, { color: 'rgba(242,240,236,0.6)', maxW: 1100 });
	promo(true);
	button(370, 540, 260, 56, 'rgba(242,240,236,0.18)', retry);
	text(T('retry'), 500, 553, 28, { maxW: 240 });
	button(650, 540, 260, 56, 'rgba(242,240,236,0.18)', () => {
		const s = T('postText', { w: result.words, s: result.score, n: result.rate }) + '\n#AI哀 #ShadeLurk';
		openUrl('https://x.com/intent/post?text=' + encodeURIComponent(s) + (SHARE_URL ? '&url=' + encodeURIComponent(SHARE_URL) : ''));
	});
	text(T('post'), 780, 553, 28, { maxW: 240 });
	ctx.restore();
}
// もう一度（同じ言語のまま、遊び方の画面から）
function retry() {
	try { if (songSrc) songSrc.stop(); } catch (e) { /* 止め済み */ }
	video.pause(); video.style.opacity = 0;
	state = 'start'; pressStart();
}

// ---------------- 毎フレーム
function frame() {
	requestAnimationFrame(frame);
	const dpr = cv.width / W;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, W, H);
	buttons = [];
	if (state === 'load') { rect('#1B1A1C', 0, 0, W, H); text('…', 640, 340, 40); return; }
	if (state === 'play' || state === 'end') { now = songTime(); syncVideo(); }
	if (state === 'start') drawStart();
	else if (state === 'intro') drawIntro();
	else if (state === 'play') drawPlay();
	else if (state === 'end') { drawPlay(); drawEnd(); }
	// 一時的な演出
	const t = rt();
	fx = fx.filter((e) => { const u = Math.min(1, (t - e.start) / e.dur); e.draw(u); return u < 1; });
}

// ---------------- 読み込み
(async () => {
	const j = (p) => fetch(p).then((r) => r.json());
	[CHART, I18N, LUMS, SUBS, SUBPOSES] = await Promise.all([j('data/chart.json'), j('data/i18n.json'), j('data/lums.json'), j('data/subs.json'), j('data/subpos.json')]);
	lang = detectLang(I18N.order);
	['fx_trail_w', 'fx_trail_k', 'fx_burst_w', 'fx_burst_k', 'fx_ring_w', 'fx_ring_k', 'fx_ring_r'].forEach((id) => { const im = new Image(); im.src = `img/${id}.png`; IMG[id] = im; });
	await Promise.all(['song', 'se_cue', 'se_hit', 'se_miss'].map(loadAudio));
	if (document.fonts && document.fonts.ready) await document.fonts.ready;
	state = 'start';
	prepareVideo();
})();
requestAnimationFrame(frame);
})();
