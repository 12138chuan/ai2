/* ==========================================================
   小 P 的 MLP 大冒险 · 交互脚本
   姚佳男 / 苏州大学 2026 级人工智能 / 学号 2662404078
   全部计算在浏览器本地完成，无网络请求。
   ========================================================== */
(() => {
  "use strict";

  /* ================= 工具 ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function prep(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!canvas.dataset.w) {
      canvas.dataset.w = canvas.width;
      canvas.dataset.h = canvas.height;
    }
    const w = +canvas.dataset.w, h = +canvas.dataset.h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  const C = {
    ink: "#141110",
    paper: "#fffdf7",
    a: "#6fb1ff",
    b: "#ff9ec0",
    red: "#ff5c5c",
    green: "#22c55e",
    yellow: "#ffc93c",
    purple: "#b9a7ff",
    soft: "rgba(20,17,16,0.18)",
  };

  /* ================= 音效 ================= */
  const Sound = (() => {
    let ctx = null;
    let muted = false;
    try { muted = localStorage.getItem("mlpquest.mute") === "1"; } catch (e) { /* ignore */ }

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      return ctx;
    }
    function tone(freq, dur, type = "square", gain = 0.035, delay = 0) {
      if (muted) return;
      const ac = ensure();
      if (!ac) return;
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }
    return {
      click() { tone(520, 0.06, "square", 0.03); },
      toggle() { tone(760, 0.07, "triangle", 0.04); },
      good() { [523, 659, 784].forEach((f, i) => tone(f, 0.14, "triangle", 0.05, i * 0.085)); },
      great() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", 0.055, i * 0.09)); },
      bad() { tone(220, 0.16, "sawtooth", 0.03); tone(160, 0.2, "sawtooth", 0.03, 0.1); },
      isMuted() { return muted; },
      setMuted(v) {
        muted = v;
        try { localStorage.setItem("mlpquest.mute", v ? "1" : "0"); } catch (e) { /* ignore */ }
      },
    };
  })();

  /* ================= 进度 ================= */
  const TOTAL_XP = 120;
  const XP_MAP = { lv1: 10, lv2: 20, lv3: 30, q0: 10, q1: 10, q2: 10, lv5: 30 };
  const DONE_LV = { lv1: 1, lv2: 2, lv3: 3, lv5: 5 };

  const Progress = {
    keys: new Set(),
    load() {
      try {
        const raw = localStorage.getItem("mlpquest.xp");
        if (raw) JSON.parse(raw).forEach((k) => this.keys.add(k));
      } catch (e) { /* ignore */ }
    },
    save() {
      try { localStorage.setItem("mlpquest.xp", JSON.stringify(Array.from(this.keys))); } catch (e) { /* ignore */ }
    },
    has(k) { return this.keys.has(k); },
    get xp() {
      let s = 0;
      this.keys.forEach((k) => { s += XP_MAP[k] || 0; });
      return s;
    },
    add(key) {
      if (this.keys.has(key)) return false;
      this.keys.add(key);
      this.save();
      return true;
    },
    reset() {
      this.keys.clear();
      this.save();
    },
  };

  /* ================= 提示 ================= */
  let toastTimer = null;
  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  document.body.appendChild(toastEl);

  function toast(msg, ms = 2400) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  /* ================= 彩带 ================= */
  const Confetti = (() => {
    const canvas = $("#confetti");
    const ctx = canvas.getContext("2d");
    let parts = [];
    let raf = null;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    function tick() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      parts = parts.filter((p) => p.life > 0);
      parts.forEach((p) => {
        p.vy += 0.22;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (parts.length) {
        raf = requestAnimationFrame(tick);
      } else {
        canvas.classList.remove("on");
        raf = null;
      }
    }

    return {
      fire(n = 110) {
        resize();
        const colors = [C.yellow, C.red, C.green, C.purple, C.a, C.b];
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight * 0.35;
        for (let i = 0; i < n; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 4 + Math.random() * 9;
          parts.push({
            x: cx + (Math.random() - 0.5) * 120,
            y: cy + (Math.random() - 0.5) * 60,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 3,
            w: 6 + Math.random() * 7,
            h: 8 + Math.random() * 9,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            color: colors[(Math.random() * colors.length) | 0],
            life: 90 + Math.random() * 50,
          });
        }
        canvas.classList.add("on");
        if (!raf) raf = requestAnimationFrame(tick);
      },
    };
  })();

  /* ================= 小 P 注入 ================= */
  const MASCOT_SVG = `
  <svg viewBox="0 0 200 212" aria-hidden="true">
    <g class="p-float">
      <line x1="100" y1="60" x2="100" y2="30" stroke="#141110" stroke-width="5" stroke-linecap="round"/>
      <circle cx="100" cy="24" r="9" fill="#FF5C5C" stroke="#141110" stroke-width="4"/>
      <path class="p-arm p-arm-l" d="M44 136 q-20 8 -24 26" stroke="#141110" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path class="p-arm" d="M156 136 q20 8 24 26" stroke="#141110" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="100" cy="120" r="62" fill="#FFE08A" stroke="#141110" stroke-width="6"/>
      <ellipse cx="56" cy="134" rx="12" ry="8" fill="#FF8FA3" opacity=".8"/>
      <ellipse cx="144" cy="134" rx="12" ry="8" fill="#FF8FA3" opacity=".8"/>
      <g class="p-eyes">
        <circle cx="79" cy="106" r="10" fill="#141110"/>
        <circle cx="121" cy="106" r="10" fill="#141110"/>
        <circle cx="82" cy="102" r="3.4" fill="#fff"/>
        <circle cx="124" cy="102" r="3.4" fill="#fff"/>
      </g>
      <path class="p-mouth p-mouth--idle" d="M86 138 q14 11 28 0" stroke="#141110" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path class="p-mouth p-mouth--happy" d="M82 133 q18 26 36 0 q-18 10 -36 0" stroke="#141110" stroke-width="5" fill="#FF5C5C" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="p-mouth p-mouth--confused" d="M87 141 h26" stroke="#141110" stroke-width="5" stroke-linecap="round"/>
      <path class="p-mouth p-mouth--scared" d="M84 143 q8 -10 16 0 q8 10 16 0" stroke="#141110" stroke-width="5" fill="none" stroke-linecap="round"/>
    </g>
  </svg>`;

  $$(".mascot").forEach((el) => { el.innerHTML = MASCOT_SVG; });

  function setMood(el, mood) {
    if (el) el.setAttribute("data-mood", mood);
  }

  /* ================= HUD / 关卡状态 ================= */
  const hudNav = $("#hudNav");

  function renderHud() {
    const xp = Progress.xp;
    $("#xpFill").style.width = Math.round((xp / TOTAL_XP) * 100) + "%";
    $("#xpText").textContent = xp + " / " + TOTAL_XP;

    Object.keys(DONE_LV).forEach((key) => {
      const lv = DONE_LV[key];
      const done = Progress.has(key);
      const state = document.querySelector(`[data-state-for="${lv}"]`);
      if (state) {
        state.textContent = done ? "已通关 ✓" : "未通关";
        state.classList.toggle("done", done);
      }
      const link = hudNav.querySelector(`a[data-lv="${lv}"]`);
      if (link) link.classList.toggle("done", done);
    });

    // 问答关：三道全对才算通关
    const quizDone = ["q0", "q1", "q2"].every((k) => Progress.has(k));
    const qState = document.querySelector('[data-state-for="4"]');
    if (qState) {
      qState.textContent = quizDone ? "已通关 ✓" : "未通关";
      qState.classList.toggle("done", quizDone);
    }
    const qLink = hudNav.querySelector('a[data-lv="4"]');
    if (qLink) qLink.classList.toggle("done", quizDone);

    // 徽章
    $$("#badges .badge").forEach((b) => {
      const key = "lv" + b.dataset.badge;
      const done = key === "lv4" ? quizDone : Progress.has(key);
      b.classList.toggle("earned", done);
    });

    // 结业证
    const doneCount = ["lv1", "lv2", "lv3", "lv5"]
      .filter((k) => Progress.has(k))
      .length + (quizDone ? 1 : 0);
    $("#certXp").textContent = xp + " / " + TOTAL_XP;

    const cert = $("#cert");
    if (doneCount >= 5) {
      $("#certTitle").textContent = "毕业啦！小 P 学会分月亮了";
      $("#certText").textContent = "从一根直尺，到能围住一圈、还能打赢过拟合怪。五关全清。";
      cert.classList.add("graduated");
    } else {
      $("#certTitle").textContent = `还差 ${5 - doneCount} 关就能毕业`;
      $("#certText").textContent = "把小 P 从“只会画直线”带到“能打赢过拟合怪”。";
      cert.classList.remove("graduated");
    }
  }

  function award(key, message, confetti = true) {
    if (!Progress.add(key)) return false;
    Sound.great();
    if (confetti) Confetti.fire();
    toast(message);
    renderHud();
    return true;
  }

  /* ================= 数据生成 ================= */
  function normalize(pts) {
    let max = 0;
    pts.forEach((p) => { max = Math.max(max, Math.abs(p.x), Math.abs(p.y)); });
    if (!max) return pts;
    const s = 0.92 / max;
    pts.forEach((p) => { p.x *= s; p.y *= s; });
    return pts;
  }

  function genMoons(n, noise, rng) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = rng() * Math.PI;
      const label = i % 2;
      let x, y;
      if (label === 0) {
        x = Math.cos(t); y = Math.sin(t);
      } else {
        x = 1 - Math.cos(t); y = 0.45 - Math.sin(t);
      }
      pts.push({
        x: x - 0.5 + randn(rng) * noise * 0.5,
        y: y - 0.2 + randn(rng) * noise * 0.5,
        label,
      });
    }
    return normalize(pts);
  }

  function genCircles(n, noise, rng) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const r = label === 0 ? 0.42 : 0.92;
      const a = rng() * Math.PI * 2;
      pts.push({
        x: Math.cos(a) * r + randn(rng) * noise * 0.3,
        y: Math.sin(a) * r + randn(rng) * noise * 0.3,
        label,
      });
    }
    return normalize(pts);
  }

  /* ================= 神经网络 ================= */
  function applyAct(name, z) {
    if (name === "tanh") return Math.tanh(z);
    if (name === "relu") return z > 0 ? z : 0;
    if (name === "sigmoid") return 1 / (1 + Math.exp(-z));
    return z;
  }
  function dAct(name, z) {
    if (name === "tanh") { const t = Math.tanh(z); return 1 - t * t; }
    if (name === "relu") return z > 0 ? 1 : 0;
    if (name === "sigmoid") { const s = 1 / (1 + Math.exp(-z)); return s * (1 - s); }
    return 1;
  }
  function softmax(logits) {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]);
    const out = new Float64Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      const e = Math.exp(logits[i] - max);
      out[i] = e; sum += e;
    }
    for (let i = 0; i < out.length; i++) out[i] /= sum;
    return out;
  }

  class MLP {
    constructor(sizes, act = "tanh", seed = 1) {
      this.sizes = sizes.slice();
      this.act = act;
      this.rng = mulberry32(seed);
      this.layers = [];
      this.t = 0;
      for (let i = 0; i < sizes.length - 1; i++) {
        const nIn = sizes[i], nOut = sizes[i + 1];
        const scale = Math.sqrt(2 / (nIn + nOut));
        const W = new Float64Array(nIn * nOut);
        for (let k = 0; k < W.length; k++) W[k] = randn(this.rng) * scale;
        this.layers.push({
          nIn, nOut, W, b: new Float64Array(nOut),
          mW: new Float64Array(nIn * nOut), vW: new Float64Array(nIn * nOut),
          mb: new Float64Array(nOut), vb: new Float64Array(nOut),
        });
      }
    }

    get paramCount() {
      return this.layers.reduce((s, L) => s + L.W.length + L.b.length, 0);
    }

    forward(x) {
      let a = x;
      const cache = [];
      for (let li = 0; li < this.layers.length; li++) {
        const L = this.layers[li];
        const z = new Float64Array(L.nOut);
        for (let j = 0; j < L.nOut; j++) {
          let s = L.b[j];
          const off = j * L.nIn;
          for (let i = 0; i < L.nIn; i++) s += L.W[off + i] * a[i];
          z[j] = s;
        }
        const last = li === this.layers.length - 1;
        const act = last ? "linear" : this.act;
        const out = new Float64Array(L.nOut);
        for (let j = 0; j < L.nOut; j++) out[j] = applyAct(act, z[j]);
        cache.push({ a, z, out, act });
        a = out;
      }
      return { logits: a, cache };
    }

    probs(x) { return softmax(this.forward(x).logits); }

    trainStep(X, Y, lr) {
      const n = X.length, L = this.layers.length;
      const grads = this.layers.map((l) => ({
        gW: new Float64Array(l.W.length),
        gb: new Float64Array(l.b.length),
      }));
      let loss = 0;

      for (let k = 0; k < n; k++) {
        const x = X[k], y = Y[k];
        const { logits, cache } = this.forward(x);
        const p = softmax(logits);
        loss += -Math.log(Math.max(p[y], 1e-12));

        let dA = new Float64Array(p);
        dA[y] -= 1;

        for (let li = L - 1; li >= 0; li--) {
          const Ly = this.layers[li], c = cache[li];
          const dZ = new Float64Array(Ly.nOut);
          for (let j = 0; j < Ly.nOut; j++) dZ[j] = dA[j] * dAct(c.act, c.z[j]);

          const g = grads[li];
          for (let j = 0; j < Ly.nOut; j++) {
            const off = j * Ly.nIn, dz = dZ[j];
            g.gb[j] += dz;
            for (let i = 0; i < Ly.nIn; i++) g.gW[off + i] += dz * c.a[i];
          }
          if (li > 0) {
            const dPrev = new Float64Array(Ly.nIn);
            for (let j = 0; j < Ly.nOut; j++) {
              const off = j * Ly.nIn, dz = dZ[j];
              for (let i = 0; i < Ly.nIn; i++) dPrev[i] += Ly.W[off + i] * dz;
            }
            dA = dPrev;
          }
        }
      }

      this.t += 1;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      const bc1 = 1 - Math.pow(b1, this.t);
      const bc2 = 1 - Math.pow(b2, this.t);

      for (let li = 0; li < L; li++) {
        const Ly = this.layers[li], g = grads[li];
        for (let k = 0; k < Ly.W.length; k++) {
          const gr = g.gW[k] / n;
          Ly.mW[k] = b1 * Ly.mW[k] + (1 - b1) * gr;
          Ly.vW[k] = b2 * Ly.vW[k] + (1 - b2) * gr * gr;
          Ly.W[k] -= (lr * (Ly.mW[k] / bc1)) / (Math.sqrt(Ly.vW[k] / bc2) + eps);
        }
        for (let k = 0; k < Ly.b.length; k++) {
          const gr = g.gb[k] / n;
          Ly.mb[k] = b1 * Ly.mb[k] + (1 - b1) * gr;
          Ly.vb[k] = b2 * Ly.vb[k] + (1 - b2) * gr * gr;
          Ly.b[k] -= (lr * (Ly.mb[k] / bc1)) / (Math.sqrt(Ly.vb[k] / bc2) + eps);
        }
      }
      return loss / n;
    }
  }

  function accuracy(net, pts) {
    if (!pts.length) return 0;
    let ok = 0;
    const x = new Float64Array(2);
    for (let i = 0; i < pts.length; i++) {
      x[0] = pts[i].x; x[1] = pts[i].y;
      const p = net.probs(x);
      if ((p[1] > p[0] ? 1 : 0) === pts[i].label) ok++;
    }
    return ok / pts.length;
  }

  /* ==========================================================
     LV.01 直线挑战
     ========================================================== */
  (function level1() {
    const canvas = $("#c1");
    if (!canvas) return;
    const { ctx, w, h } = prep(canvas);
    const RANGE = 1.05;
    const px = (x) => ((x + RANGE) / (2 * RANGE)) * w;
    const py = (y) => ((RANGE - y) / (2 * RANGE)) * h;
    const toData = (evt) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((evt.clientX - r.left) / r.width) * 2 * RANGE - RANGE,
        y: RANGE - ((evt.clientY - r.top) / r.height) * 2 * RANGE,
      };
    };

    const pts = genMoons(200, 0.12, mulberry32(13));
    const state = { angle: 0, r: 0, misses: 0, drag: false };

    function classify(p) {
      const nx = Math.cos((state.angle * Math.PI) / 180);
      const ny = Math.sin((state.angle * Math.PI) / 180);
      const s = p.x * nx + p.y * ny - state.r;
      return s > 0 ? 0 : 1;
    }

    // 预计算“理论上最少分错几个”
    let best = Infinity;
    for (let a = 0; a < 180; a += 2) {
      const nx = Math.cos((a * Math.PI) / 180);
      const ny = Math.sin((a * Math.PI) / 180);
      for (let r = -1.2; r <= 1.2; r += 0.05) {
        let m = 0;
        for (const p of pts) {
          const s = p.x * nx + p.y * ny - r;
          if ((s > 0 ? 0 : 1) !== p.label) m++;
        }
        if (m < best) best = m;
      }
    }

    function draw() {
      const nx = Math.cos((state.angle * Math.PI) / 180);
      const ny = Math.sin((state.angle * Math.PI) / 180);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, w, h);

      // 网格
      ctx.strokeStyle = "rgba(20,17,16,0.07)";
      ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        const g = (i / 4) * RANGE;
        ctx.beginPath(); ctx.moveTo(px(g), 0); ctx.lineTo(px(g), h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, py(g)); ctx.lineTo(w, py(g)); ctx.stroke();
      }

      // 点的两侧淡色底：数据里 s>0 的那一侧（即 +n 方向）
      const cx0 = px(state.r * nx);
      const cy0 = py(state.r * ny);
      const dxc = -ny, dyc = -nx;   // 直线方向（canvas 坐标）
      const nxc = nx, nyc = -ny;    // 法向（canvas 坐标，指向 s>0 一侧）
      const L = 3000;
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = C.a;
      ctx.beginPath();
      ctx.moveTo(cx0 + dxc * L, cy0 + dyc * L);
      ctx.lineTo(cx0 - dxc * L, cy0 - dyc * L);
      ctx.lineTo(cx0 - dxc * L + nxc * L, cy0 - dyc * L + nyc * L);
      ctx.lineTo(cx0 + dxc * L + nxc * L, cy0 + dyc * L + nyc * L);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 直尺
      ctx.lineCap = "round";
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx0 - dxc * L, cy0 - dyc * L);
      ctx.lineTo(cx0 + dxc * L, cy0 + dyc * L);
      ctx.stroke();
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx0 - dxc * L, cy0 - dyc * L);
      ctx.lineTo(cx0 + dxc * L, cy0 + dyc * L);
      ctx.stroke();

      // 点
      let misses = 0;
      pts.forEach((p) => {
        const pred = classify(p);
        const wrong = pred !== p.label;
        if (wrong) misses++;
        const X = px(p.x), Y = py(p.y);
        ctx.beginPath();
        ctx.arc(X, Y, wrong ? 6 : 5, 0, Math.PI * 2);
        ctx.fillStyle = p.label === 0 ? C.a : C.b;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = wrong ? C.red : C.ink;
        ctx.stroke();
        if (wrong) {
          ctx.strokeStyle = C.red;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(X - 9, Y - 9); ctx.lineTo(X + 9, Y + 9);
          ctx.moveTo(X + 9, Y - 9); ctx.lineTo(X - 9, Y + 9);
          ctx.stroke();
        }
      });

      state.misses = misses;
      $("#missCount").textContent = misses;
      $("#angleVal").textContent = Math.round(state.angle) + "°";

      if (misses <= Math.max(best + 3, 6)) {
        $("#lv1Hint").textContent = "已经很接近理论最优了 —— 但你看，它压不到 0。";
      } else {
        $("#lv1Hint").textContent = "试着让分错数变成 0 —— 你会发现它不肯归零。";
      }
    }

    canvas.addEventListener("pointerdown", (e) => {
      state.drag = true;
      canvas.setPointerCapture(e.pointerId);
      moveTo(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!state.drag) return;
      moveTo(e);
    });
    canvas.addEventListener("pointerup", () => { state.drag = false; });
    canvas.addEventListener("pointercancel", () => { state.drag = false; });

    function moveTo(e) {
      const p = toData(e);
      const nx = Math.cos((state.angle * Math.PI) / 180);
      const ny = Math.sin((state.angle * Math.PI) / 180);
      state.r = clamp(p.x * nx + p.y * ny, -1.25, 1.25);
      draw();
    }

    $("#angle").addEventListener("input", (e) => {
      state.angle = parseFloat(e.target.value);
      draw();
    });

    $("#giveUp").addEventListener("click", () => {
      $("#lv1Insight").hidden = false;
      $("#giveUp").disabled = true;
      $("#giveUp").textContent = "已解锁：下一关 →";
      $("#giveUp").disabled = false;
      $("#giveUp").onclick = () => {
        document.querySelector("#lv2").scrollIntoView({ behavior: "smooth", block: "start" });
      };
      $("#missBest").textContent = best;
      setMood($("#heroMascot"), "confused");
      award("lv1", `+10 XP · 你发现了线性分类器的天花板（最少也会错 ${best} 个）`);
    });

    $("#missBest").textContent = "?";
    draw();
  })();

  /* ==========================================================
     LV.02 神经元调音台
     ========================================================== */
  (function level2() {
    const els = {
      w1: $("#w1"), w2: $("#w2"), bb: $("#bb"),
      w1v: $("#w1v"), w2v: $("#w2v"), bv: $("#bv"),
      z: $("#mixZ"), a: $("#mixA"), bar: $("#mixBar"),
      status: $("#mixStatus"), mascot: $("#mixMascot"),
    };
    if (!els.w1) return;

    const X1 = 1.0, X2 = 0.5;

    function update() {
      const w1 = parseFloat(els.w1.value);
      const w2 = parseFloat(els.w2.value);
      const b = parseFloat(els.bb.value);
      const z = w1 * X1 + w2 * X2 + b;
      const a = 1 / (1 + Math.exp(-z));

      els.w1v.textContent = w1.toFixed(2);
      els.w2v.textContent = w2.toFixed(2);
      els.bv.textContent = b.toFixed(2);
      els.z.textContent = z.toFixed(2);
      els.a.textContent = a.toFixed(3);

      els.bar.style.width = (a * 100).toFixed(1) + "%";
      const ok = a >= 0.9;
      els.bar.classList.toggle("ok", ok);

      if (ok) {
        els.status.textContent = "举起来了！a = " + a.toFixed(3) + " ≥ 0.90";
        els.status.classList.add("ok");
        if (Progress.has("lv2")) return;
        setMood(els.mascot, "happy");
        setMood($("#heroMascot"), "happy");
        award("lv2", "+20 XP · 成功点亮一个神经元！");
      } else if (a >= 0.5) {
        els.status.textContent = "有感觉了，再加把劲（a 还不到 0.90）";
        els.status.classList.remove("ok");
        setMood(els.mascot, "idle");
      } else {
        els.status.textContent = "还差点火候……";
        els.status.classList.remove("ok");
        setMood(els.mascot, "confused");
      }
    }

    [els.w1, els.w2, els.bb].forEach((el) => el.addEventListener("input", update));
    update();
  })();

  /* ==========================================================
     LV.03 长层实验
     ========================================================== */
  (function level3() {
    const canvas = $("#c3");
    if (!canvas) return;
    const { ctx, w, h } = prep(canvas);
    const RANGE = 1.05;
    const px = (x) => ((x + RANGE) / (2 * RANGE)) * w;
    const py = (y) => ((RANGE - y) / (2 * RANGE)) * h;

    const data = genCircles(200, 0.1, mulberry32(21));
    const X = data.map((p) => [p.x, p.y]);
    const Y = data.map((p) => p.label);

    const st = {
      net: null,
      mode: "deep",
      epoch: 0,
      acc: null,
      running: false,
      showBoundary: false,
      deepAcc: null,
      linAcc: null,
      raf: null,
    };

    const off = document.createElement("canvas");
    off.width = 84; off.height = 63;
    const octx = off.getContext("2d");

    function build() {
      st.net = new MLP(st.mode === "deep" ? [2, 8, 8, 2] : [2, 2], "tanh", st.mode === "deep" ? 4 : 6);
      st.epoch = 0;
      st.acc = null;
      st.running = false;
      st.showBoundary = false;
      if (st.raf) cancelAnimationFrame(st.raf);
      $("#acc3").textContent = "—";
      $("#par3").textContent = st.net.paramCount;
      draw();
    }

    function drawBoundary() {
      if (!st.net) return;
      const img = octx.createImageData(84, 63);
      const d = img.data;
      const xv = new Float64Array(2);
      for (let gy = 0; gy < 63; gy++) {
        const y = RANGE - ((gy + 0.5) / 63) * 2 * RANGE;
        for (let gx = 0; gx < 84; gx++) {
          const x = ((gx + 0.5) / 84) * 2 * RANGE - RANGE;
          xv[0] = x; xv[1] = y;
          const p = st.net.probs(xv)[0];
          const idx = (gy * 84 + gx) * 4;
          d[idx] = Math.round(111 + (255 - 111) * (1 - p));
          d[idx + 1] = Math.round(177 + (158 - 177) * (1 - p));
          d[idx + 2] = Math.round(255 + (192 - 255) * (1 - p));
          d[idx + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w, h);
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, w, h);

      if (st.net && st.showBoundary) drawBoundary();

      data.forEach((p) => {
        const x = px(p.x), y = py(p.y);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = p.label === 0 ? C.a : C.b;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
      });
    }

    function step() {
      if (!st.running) return;
      const chunk = 6;
      for (let i = 0; i < chunk; i++) {
        st.net.trainStep(X, Y, 0.03);
        st.epoch++;
      }
      if (st.epoch % 12 === 0 || st.epoch >= 300) {
        draw();
      }
      if (st.epoch >= 300) {
        finish();
        return;
      }
      st.raf = requestAnimationFrame(step);
    }

    function finish() {
      st.running = false;
      st.acc = accuracy(st.net, data);
      $("#acc3").textContent = (st.acc * 100).toFixed(1);

      if (st.mode === "deep") {
        st.deepAcc = st.acc;
        $("#cmpDeep").textContent = (st.acc * 100).toFixed(1) + "%";
        $("#lv3Hint").textContent = "看，边界把内圈整个包住了。";
        if (st.acc >= 0.97) {
          award("lv3", `+30 XP · 深网络拿了 ${(st.acc * 100).toFixed(1)} 分！`);
        }
      } else {
        st.linAcc = st.acc;
        $("#cmpLin").textContent = (st.acc * 100).toFixed(1) + "%";
        $("#lv3Hint").textContent = "只有一条直线，圆怎么都包不住 —— 差不多就是抛硬币。";
      }
      if (st.deepAcc != null && st.linAcc != null) $("#compare3").hidden = false;
      setMood($("#heroMascot"), st.mode === "deep" ? "happy" : "confused");
    }

    function run(mode) {
      if (st.running) return;
      st.mode = mode;
      build();
      st.showBoundary = true;
      st.running = true;
      $("#lv3Hint").textContent = mode === "deep" ? "训练中……看边界变形" : "训练纯线性模型……";
      step();
    }

    $("#train3").addEventListener("click", () => { Sound.click(); run("deep"); });
    $("#linear3").addEventListener("click", () => { Sound.click(); run("linear"); });
    $("#reset3").addEventListener("click", () => {
      Sound.click();
      st.deepAcc = null; st.linAcc = null;
      $("#compare3").hidden = true;
      $("#cmpDeep").textContent = "—";
      $("#cmpLin").textContent = "—";
      $("#lv3Hint").textContent = "深网络：2 → 8 → 8 → 2。点「训练小 P」，看边界从直线变成一圈。";
      build();
    });

    build();
  })();

  /* ==========================================================
     LV.04 问答
     ========================================================== */
  (function level4() {
    const QUIZ = [
      {
        q: "如果没有激活函数，100 层的 MLP 实际等价于几层？",
        opts: ["还是 100 层", "1 层（一次线性变换）", "50 层左右"],
        a: 1,
        why: "W²(W¹x+b¹)+b² 可以合并成 (W²W¹)x + 常数。没有非线性，堆多少层都在同一个线性空间里。",
      },
      {
        q: "学习率 η 设得太大，训练会怎样？",
        opts: ["收敛更稳更快", "在谷底来回震荡，甚至发散", "完全没影响"],
        why: "每步迈得太远，会直接跨过最低点落到对面更高处，损失越来越大。这就是第 5 关里那条曲线的另一种崩法。",
      },
      {
        q: "训练集 99%、测试集 70%，最可能是哪种情况？",
        opts: ["欠拟合", "过拟合", "数据太少，没法判断"],
        why: "在见过的数据上接近满分、在没见过的数据上掉一大截，就是过拟合的典型症状：它记住了训练集，没学到规律。",
      },
    ];

    const wrap = $("#quiz");
    if (!wrap) return;

    QUIZ.forEach((item, qi) => {
      const card = document.createElement("article");
      card.className = "q-card";
      card.innerHTML = `
        <span class="q-num">Q${qi + 1}</span>
        <h3 class="q-title">${item.q}</h3>
        <div class="q-opts"></div>
        <p class="q-explain" hidden></p>`;

      const optsBox = card.querySelector(".q-opts");
      const explain = card.querySelector(".q-explain");

      item.opts.forEach((text, oi) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "q-opt";
        btn.innerHTML = `<span class="q-key">${"ABC"[oi]}</span><span>${text}</span>`;
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          if (oi === item.a) {
            btn.classList.add("right");
            Array.from(optsBox.children).forEach((b) => { b.disabled = true; });
            explain.hidden = false;
            explain.textContent = "✅ " + item.why;
            Sound.good();
            award("q" + qi, `+10 XP · 答对了！`, false);
            if (["q0", "q1", "q2"].every((k) => Progress.has(k))) {
              Confetti.fire(80);
              toast("三道全对，30 XP 到手！");
            }
          } else {
            btn.classList.add("wrong");
            btn.disabled = true;
            explain.hidden = false;
            explain.textContent = "❌ 再想想 —— " + item.why;
            Sound.bad();
            setMood($("#heroMascot"), "confused");
          }
        });
        optsBox.appendChild(btn);
      });

      wrap.appendChild(card);
    });
  })();

  /* ==========================================================
     LV.05 过拟合怪
     ========================================================== */
  (function level5() {
    const canvas = $("#c5");
    if (!canvas) return;
    const { ctx, w, h } = prep(canvas);

    const trainSet = genMoons(120, 0.18, mulberry32(5));
    const flipRng = mulberry32(99);
    trainSet.forEach((p) => { if (flipRng() < 0.15) p.label = 1 - p.label; });
    const valSet = genMoons(40, 0.18, mulberry32(7));
    const testSet = genMoons(200, 0.18, mulberry32(6));

    const X = trainSet.map((p) => [p.x, p.y]);
    const Y = trainSet.map((p) => p.label);

    const MAX_EPOCH = 800;

    const st = {
      net: null,
      epoch: 0,
      hist: [],      // {e, train, test}
      trainAcc: 0,
      testAcc: 0,
      bestVal: 0,
      running: false,
      raf: null,
      stopped: false,
    };

    function build() {
      st.net = new MLP([2, 32, 32, 2], "tanh", 3);
      st.epoch = 0;
      st.hist = [];
      st.trainAcc = 0;
      st.testAcc = 0;
      st.bestVal = 0;
      st.running = false;
      st.stopped = false;
      if (st.raf) cancelAnimationFrame(st.raf);
      $("#tr5").textContent = "—";
      $("#te5").textContent = "—";
      $("#gap5").textContent = "—";
      $("#gapFill").style.width = "0%";
      setMonster(0);
      drawChart();
    }

    function setMonster(level) {
      const m = $("#monster");
      m.dataset.level = String(level);
    }

    function drawChart() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, w, h);

      const padL = 46, padR = 16, padT = 18, padB = 34;
      const cw = w - padL - padR;
      const chh = h - padT - padB;

      // 网格
      ctx.strokeStyle = "rgba(20,17,16,0.1)";
      ctx.lineWidth = 1;
      ctx.font = "11px ui-monospace, Consolas, monospace";
      ctx.fillStyle = "rgba(20,17,16,0.45)";
      for (let i = 0; i <= 4; i++) {
        const y = padT + (chh * i) / 4;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.fillText((100 - i * 25) + "%", 6, y + 4);
      }
      for (let i = 0; i <= 4; i++) {
        const x = padL + (cw * i) / 4;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
        const label = String((MAX_EPOCH / 4) * i);
        ctx.fillText(label, x - label.length * 3, h - padB + 16);
      }

      if (st.hist.length < 2) {
        ctx.fillStyle = "rgba(20,17,16,0.35)";
        ctx.font = "13px sans-serif";
        ctx.fillText("点「放它去练」，两条曲线就会开始跑", padL + 14, padT + 28);
        return;
      }

      const px = (e) => padL + (cw * e) / MAX_EPOCH;
      const py = (v) => padT + chh * (1 - v);

      function line(key, color) {
        ctx.beginPath();
        st.hist.forEach((d, i) => {
          const x = px(d.e), y = py(d[key]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      line("train", C.green);
      line("test", C.red);

      // 末端端点
      const last = st.hist[st.hist.length - 1];
      [
        [last.train, C.green],
        [last.test, C.red],
      ].forEach(([v, color]) => {
        ctx.beginPath();
        ctx.arc(px(last.e), py(v), 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // 峰值标记
      if (st.bestVal > 0) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(20,17,16,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padL, py(st.bestVal));
        ctx.lineTo(w - padR, py(st.bestVal));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    function updateUi() {
      $("#tr5").textContent = (st.trainAcc * 100).toFixed(1) + "%";
      $("#te5").textContent = (st.testAcc * 100).toFixed(1) + "%";
      const gap = st.trainAcc - st.testAcc;
      $("#gap5").textContent = (gap * 100).toFixed(1) + "%";
      $("#gapFill").style.width = clamp(gap * 350, 0, 100) + "%";

      let level = 0;
      if (gap > 0.03) level = 1;
      if (gap > 0.08) level = 2;
      if (gap > 0.13) level = 3;
      setMonster(level);
    }

    function step() {
      if (!st.running) return;

      const perFrame = 4;
      for (let i = 0; i < perFrame; i++) {
        st.net.trainStep(X, Y, 0.03);
        st.epoch++;
        if (st.epoch >= MAX_EPOCH) break;
      }

      if (st.epoch % 10 === 0) {
        const tr = accuracy(st.net, trainSet);
        const te = accuracy(st.net, testSet);
        const va = accuracy(st.net, valSet);
        st.trainAcc = tr;
        st.testAcc = te;
        st.hist.push({ e: st.epoch, train: tr, test: te });
        if (va > st.bestVal) st.bestVal = va;
        updateUi();
        drawChart();

        // 早停：验证集比最好成绩掉了 2 个点以上，且已经练够 150 轮
        if ($("#earlyStop").checked && st.epoch >= 150 && va < st.bestVal - 0.02) {
          stop(true);
          return;
        }
      }

      if (st.epoch >= MAX_EPOCH) {
        stop(false);
        return;
      }
      st.raf = requestAnimationFrame(step);
    }

    function stop(byEarly) {
      st.running = false;
      st.stopped = true;
      if (st.raf) cancelAnimationFrame(st.raf);

      const gap = st.trainAcc - st.testAcc;
      $("#lv5Hint").textContent = byEarly
        ? `早停在第 ${st.epoch} 轮触发：考场 ${(st.testAcc * 100).toFixed(1)}%，差距只有 ${(gap * 100).toFixed(1)}%。`
        : `练满了 ${st.epoch} 轮：训练场 ${(st.trainAcc * 100).toFixed(1)}%，考场 ${(st.testAcc * 100).toFixed(1)}%。`;

      if (st.testAcc >= 0.9 && gap <= 0.06) {
        award("lv5", `+30 XP · 打败过拟合怪！考场 ${(st.testAcc * 100).toFixed(1)}%`);
        setMonster(0);
        $("#monster").style.filter = "grayscale(1) opacity(.35)";
      } else if (!byEarly) {
        toast("考场只有 " + (st.testAcc * 100).toFixed(1) + "% —— 试试打开早停", 2800);
      }
    }

    $("#train5").addEventListener("click", () => {
      Sound.click();
      if (st.running) return;
      if (st.stopped) build();
      $("#monster").style.filter = "";
      st.running = true;
      $("#lv5Hint").textContent = "训练中……盯着红色那条。";
      step();
    });

    $("#reset5").addEventListener("click", () => {
      Sound.click();
      build();
      $("#lv5Hint").textContent = "先不开早停，看看考场分数会长什么样。";
      $("#monster").style.filter = "";
    });

    $("#earlyStop").addEventListener("change", () => { Sound.toggle(); });

    build();
  })();

  /* ==========================================================
     HUD 交互 / 初始化
     ========================================================== */
  const soundBtn = $("#soundBtn");
  function renderSoundBtn() {
    const muted = Sound.isMuted();
    soundBtn.textContent = muted ? "🔇" : "🔊";
    soundBtn.classList.toggle("muted", muted);
  }
  soundBtn.addEventListener("click", () => {
    Sound.setMuted(!Sound.isMuted());
    renderSoundBtn();
    if (!Sound.isMuted()) Sound.toggle();
  });

  $("#restart").addEventListener("click", () => {
    Progress.reset();
    renderHud();
    toast("进度已清空，可以重新闯关了");
    Sound.click();
    Confetti.fire(60);
  });

  $("#startBtn").addEventListener("click", () => Sound.click());

  // 导航高亮
  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const lv = e.target.id.replace("lv", "");
        $$("#hudNav a").forEach((a) => a.classList.toggle("active", a.dataset.lv === lv));
      });
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  $$("section[id]").forEach((s) => navObserver.observe(s));

  Progress.load();
  renderHud();
  renderSoundBtn();

  // 全部通关时自动庆祝一次
  (function checkAllDone() {
    const all = ["lv1", "lv2", "lv3", "q0", "q1", "q2", "lv5"].every((k) => Progress.has(k));
    if (all) {
      setTimeout(() => {
        Confetti.fire(150);
        toast("五关全清！往下滚动看结业证 ↓", 3200);
      }, 600);
    }
  })();
})();
