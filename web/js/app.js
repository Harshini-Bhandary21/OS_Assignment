/* app.js: UI for Deadlock Lab. All algorithms come from core.js (window.DL). */
(function () {
  "use strict";
  const { S, P, fmt, clone } = DL;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sum = (v) => v.reduce((a, b) => a + b, 0);
  const PCOLORS = ["#5b4fe0", "#0f9f9a", "#e8590c", "#d6336c", "#2f9e44", "#1c7ed6", "#ae3ec9", "#c99400", "#495057", "#0b7285"];

  // ---------------------------------------------------------------- status visuals
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  };
  const STYLE = {
    [S.SAFE]: ["c-safe", "shield"], [S.GRANTED]: ["c-safe", "check"], [S.NODEADLOCK]: ["c-safe", "check"],
    [S.UNSAFE]: ["c-warn", "alert"], [S.DENIED]: ["c-danger", "x"], [S.WAIT]: ["c-info", "clock"],
    [S.INVALID]: ["c-invalid", "ban"], [S.NOOP]: ["c-neutral", "minus"], [S.DEADLOCK]: ["c-deadlock", "lock"],
  };
  const pill = (st) => `<span class="pill ${(STYLE[st] || ["c-neutral"])[0]}">${esc(st)}</span>`;
  function banner(st, msg, list) {
    const [c, ic] = STYLE[st] || ["c-neutral", "minus"];
    return `<div class="status ${c}"><div class="ico">${ICON[ic]}</div><div><div class="ttl">${esc(st)}</div>
      <div class="msg">${msg}</div>${list && list.length ? "<ul>" + list.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : ""}</div></div>`;
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  const vec = (v) => `<span class="mono">${fmt(v)}</span>`;

  // ---------------------------------------------------------------- matrix editor
  /* Builds an editable (or read-only) grid. onEdit(i, j, value|NaN) is called on input. */
  function matrixHTML(id, mat, { rowLabel = (i) => P(i), colPrefix = "R", editable = true, cols } = {}) {
    const m = cols ?? (mat[0] ? mat[0].length : 0);
    let h = `<div class="matrix-wrap"><table class="matrix" id="${id}"><thead><tr><th></th>`;
    for (let j = 0; j < m; j++) h += `<th>${colPrefix}${j}</th>`;
    h += "</tr></thead><tbody>";
    mat.forEach((row, i) => {
      h += `<tr data-r="${i}"><th class="row-h">${rowLabel(i)}</th>`;
      for (let j = 0; j < m; j++) {
        const v = row[j];
        h += editable
          ? `<td><input class="cell" inputmode="numeric" data-i="${i}" data-j="${j}" value="${Number.isInteger(v) ? v : ""}" aria-label="${rowLabel(i)} R${j}"></td>`
          : `<td><div class="cell ro" data-i="${i}" data-j="${j}">${Number.isInteger(v) ? v : "–"}</div></td>`;
      }
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function bindMatrix(id, onEdit) {
    $$(`#${id} input.cell`).forEach((inp) => inp.addEventListener("input", () => {
      const t = inp.value.trim();
      const v = /^[+-]?\d+$/.test(t) ? Number(t) : NaN;
      onEdit(+inp.dataset.i, +inp.dataset.j, v);
    }));
  }
  const stepper = (id, val, min, max) =>
    `<div class="stepper" id="${id}" data-min="${min}" data-max="${max}"><button data-d="-1" aria-label="decrease">−</button><span>${val}</span><button data-d="1" aria-label="increase">+</button></div>`;
  function bindStepper(id, cb) {
    const el = $("#" + id);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const cur = +el.querySelector("span").textContent, nv = cur + +b.dataset.d;
      if (nv < +el.dataset.min || nv > +el.dataset.max) return;
      el.querySelector("span").textContent = nv; cb(nv);
    });
  }
  const resize = (mat, n, m) => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => (mat[i] && Number.isFinite(mat[i][j]) ? mat[i][j] : 0)));

  // ================================================================ ROUTER & THEME
  function route() {
    const page = (location.hash || "#overview").slice(1);
    const valid = ["overview", "avoidance", "detection", "prevention", "tests"];
    const p = valid.includes(page) ? page : "overview";
    $$(".page").forEach((s) => s.classList.toggle("active", s.id === "page-" + p));
    $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === p));
    window.scrollTo({ top: 0 });
  }
  function setTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    $$("#theme button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    try { localStorage.setItem("dl-theme", t); } catch (e) { /* storage unavailable */ }
  }

  // ================================================================ AVOIDANCE
  const av = { preset: "A", alloc: [], max: [], avail: [], history: [], last: null, k: null, timer: null };
  function loadBank(key) {
    const s = SC.banker[key]; av.preset = key;
    av.alloc = clone(s.allocation); av.max = clone(s.maximum); av.avail = s.available.slice();
    av.history = []; av.last = null; av.k = null;
  }

  function renderAvoid() {
    stopAnim();
    const n = av.alloc.length, m = av.avail.length;
    $("#avoid-root").innerHTML = `
      <div class="card"><div class="row" style="gap:18px;align-items:flex-end">
        <div class="field" style="min-width:260px"><label>Preset</label><select class="input" id="av-preset">
          ${Object.entries(SC.banker).map(([k, s]) => `<option value="${k}" ${k === av.preset ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
          <option value="custom" ${av.preset === "custom" ? "selected" : ""}>Custom (edited)</option></select></div>
        <div class="field"><label>Processes</label>${stepper("av-n", n, 1, 10)}</div>
        <div class="field"><label>Resource types</label>${stepper("av-m", m, 1, 6)}</div>
        <div class="spacer"></div>
        <button class="btn ghost" id="av-undo" ${av.history.length ? "" : "disabled"}>↩ Undo grant</button>
        <button class="btn" id="av-reset">Reset preset</button>
      </div></div>

      <div class="grid g3">
        <div class="card"><div class="card-head"><span class="num">A</span><h3>Allocation</h3><span class="card-sub">held now · editable</span></div>${matrixHTML("m-alloc", av.alloc)}</div>
        <div class="card"><div class="card-head"><span class="num">M</span><h3>Max</h3><span class="card-sub">declared claim · editable</span></div>${matrixHTML("m-max", av.max)}</div>
        <div class="card"><div class="card-head"><span class="num">N</span><h3>Need</h3><span class="card-sub">= Max − Allocation · auto</span></div>${matrixHTML("m-need", av.alloc, { editable: false })}</div>
      </div>
      <div class="card"><div class="row" style="gap:34px;align-items:flex-start">
        <div><div class="card-head"><h3>Available</h3><span class="card-sub">free now · editable</span></div>${matrixHTML("m-avail", [av.avail], { rowLabel: () => "Avail" })}</div>
        <div><div class="card-head"><h3>Total instances</h3><span class="card-sub">Allocation + Available</span></div>${matrixHTML("m-total", [av.avail], { rowLabel: () => "Total", editable: false })}</div>
        <div style="flex:1;min-width:220px" id="av-notes"></div>
      </div></div>
      <div id="av-valid"></div>

      <div class="card" id="av-safety-card"><div class="card-head"><span class="num">1</span><h2>Safety algorithm</h2><span class="spacer"></span><div class="row" id="av-anim"></div></div><div id="av-safety"></div></div>

      <div class="card"><div class="card-head"><span class="num">2</span><h2>Resource request</h2><span class="card-sub">Request ≤ Need → Request ≤ Available → pretend → safety check</span></div>
        <div class="row" style="align-items:flex-end;gap:12px">
          <div class="field"><label>Process</label><input class="input mono" id="rq-pid" list="pids" value="P0" style="width:96px">
            <datalist id="pids">${av.alloc.map((_, i) => `<option value="P${i}">`).join("")}</datalist></div>
          <div class="field" style="flex:1;min-width:200px"><label>Request vector (${m} values)</label><input class="input mono" id="rq-vec" value="${Array(m).fill(0).join(", ")}"></div>
          <button class="btn primary" id="rq-go">Submit request</button>
        </div>
        <div class="row" style="margin-top:12px"><span class="muted small">Quick scenarios:</span>
          ${SC.requests.map((r, i) => `<button class="chip-btn" data-q="${i}">${esc(r.label)}</button>`).join("")}</div>
        <div id="rq-out" style="margin-top:16px"></div>
      </div>`;

    $("#av-preset").addEventListener("change", (e) => { if (e.target.value !== "custom") { loadBank(e.target.value); renderAvoid(); } });
    bindStepper("av-n", (nv) => { av.alloc = resize(av.alloc, nv, m); av.max = resize(av.max, nv, m); av.preset = "custom"; av.last = null; renderAvoid(); });
    bindStepper("av-m", (nv) => { av.alloc = resize(av.alloc, n, nv); av.max = resize(av.max, n, nv); av.avail = resize([av.avail], 1, nv)[0]; av.preset = "custom"; av.last = null; renderAvoid(); });
    $("#av-reset").onclick = () => { loadBank(av.preset === "custom" ? "A" : av.preset); renderAvoid(); };
    $("#av-undo").onclick = () => { const h = av.history.pop(); if (h) { Object.assign(av, h); av.last = null; renderAvoid(); toast("Last grant undone"); } };
    const edited = () => { av.preset = "custom"; $("#av-preset").value = "custom"; av.k = null; updateAvoid(); };
    bindMatrix("m-alloc", (i, j, v) => { av.alloc[i][j] = v; edited(); });
    bindMatrix("m-max", (i, j, v) => { av.max[i][j] = v; edited(); });
    bindMatrix("m-avail", (i, j, v) => { av.avail[j] = v; edited(); });
    $("#rq-go").onclick = submitRequest;
    $("#rq-vec").addEventListener("keydown", (e) => { if (e.key === "Enter") submitRequest(); });
    $$("[data-q]").forEach((b) => b.onclick = () => {
      const q = SC.requests[+b.dataset.q];
      if (av.preset !== "A") { loadBank("A"); renderAvoid(); }
      $("#rq-pid").value = q.pid; $("#rq-vec").value = q.req; submitRequest();
    });
    updateAvoid();
    if (av.last) renderRequestResult(av.last);
  }

  function updateAvoid() {
    stopAnim();
    const n = av.alloc.length, m = av.avail.length;
    const errs = DL.validateState(av.alloc, av.max, av.avail);
    // mark bad cells
    $$("#m-alloc input, #m-max input").forEach((c) => {
      const i = +c.dataset.i, j = +c.dataset.j, a = av.alloc[i][j], x = av.max[i][j];
      const isA = c.closest("table").id === "m-alloc", v = isA ? a : x;
      c.classList.toggle("bad", !Number.isInteger(v) || v < 0 || (Number.isInteger(a) && Number.isInteger(x) && a > x));
    });
    $$("#m-avail input").forEach((c) => { const v = av.avail[+c.dataset.j]; c.classList.toggle("bad", !Number.isInteger(v) || v < 0); });

    if (errs.length) {
      $("#av-valid").innerHTML = banner(S.INVALID, "The configured state is rejected. Fix these cells before the algorithm can run:", errs);
      $$("#m-need .cell, #m-total .cell").forEach((c) => (c.textContent = "–"));
      $("#av-safety").innerHTML = `<p class="muted">Waiting for a valid state…</p>`; $("#av-anim").innerHTML = ""; $("#av-notes").innerHTML = "";
      return;
    }
    $("#av-valid").innerHTML = "";
    const need = DL.computeNeed(av.alloc, av.max);
    const total = av.avail.map((a, j) => a + sum(av.alloc.map((r) => r[j])));
    const maxNeed = Math.max(1, ...need.flat());
    $$("#m-need .cell").forEach((c) => {
      const v = need[+c.dataset.i][+c.dataset.j]; c.textContent = v;
      c.style.background = `color-mix(in srgb, var(--warn) ${Math.round((v / maxNeed) * 28)}%, var(--surface-2))`;
    });
    $$("#m-total .cell").forEach((c) => (c.textContent = total[+c.dataset.j]));
    const notes = [];
    if (av.avail.every((x) => x === 0)) notes.push("Available is all zero. This is a <b>valid boundary</b> case and is still checked for safety.");
    const zn = need.map((r, i) => (r.every((x) => x === 0) ? P(i) : null)).filter(Boolean);
    if (zn.length) notes.push(`<b>${zn.join(", ")}</b> already hold${zn.length === 1 ? "s" : ""} the full Max (Need = 0) and can finish immediately.`);
    $("#av-notes").innerHTML = notes.map((x) => `<div class="callout small" style="margin-bottom:8px">${x}</div>`).join("");
    renderSafety(DL.safetyAlgorithm(av.alloc, av.max, av.avail), total);
  }

  function renderSafety(res, total) {
    const n = av.alloc.length;
    const k = av.k ?? res.steps.length;            // how many steps are revealed
    const work = k === 0 ? av.avail : res.steps[k - 1].workAfter;
    const nextStep = res.steps[k];
    const head = res.safe
      ? banner(S.SAFE, `A complete safe sequence exists, so every process can finish. Safe sequence: <b class="mono">⟨${res.sequence.map(P).join(", ")}⟩</b>`)
      : banner(S.UNSAFE, `No complete safe sequence. <b>${res.unfinished.map(P).join(", ")}</b> cannot be guaranteed to finish. This is <b>not</b> a deadlock: nobody is blocked yet, but a deadlock is now possible.`);
    const seqNodes = res.sequence.map((p, idx) => `<span class="seq-node ${idx < k ? "done" : ""}">${P(p)}</span>`)
      .concat(res.unfinished.map((p) => `<span class="seq-node stuck">${P(p)} ✕</span>`))
      .join('<span class="seq-arrow">→</span>');
    const focusNeed = nextStep ? nextStep.need : null;
    const bars = work.map((w, j) => `<div class="wb"><span>R${j}</span><div class="wb-track"><div class="wb-fill" style="width:${total[j] ? (w / total[j]) * 100 : 0}%"></div>
      ${focusNeed ? `<div class="wb-need" style="left:calc(${total[j] ? (focusNeed[j] / total[j]) * 100 : 0}% - 1px)" title="Need of ${P(nextStep.process)}"></div>` : ""}</div><span>${w} / ${total[j]}</span></div>`).join("");
    const rows = res.steps.map((s, idx) => `<tr class="${idx >= k ? "pending" : ""} ${idx === k - 1 && av.k !== null ? "active-step" : ""}">
      <td class="mono">${s.step}</td><td><b class="mono">${P(s.process)}</b></td><td class="mono">${fmt(s.need)}</td><td class="mono">${fmt(s.workBefore)}</td>
      <td><span class="pill c-safe">≤ ✓</span></td><td class="mono">+ ${fmt(s.released)}</td><td class="mono"><b>${fmt(s.workAfter)}</b></td></tr>`).join("");
    let stuckInfo = "";
    if (!res.safe && k === res.steps.length) {
      stuckInfo = `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Stuck process</th><th>Need</th><th>Final Work</th><th>Short by</th></tr></thead><tbody>
        ${res.unfinished.map((p) => `<tr><td><b class="mono">${P(p)}</b></td><td class="mono">${fmt(res.need[p])}</td><td class="mono">${fmt(res.finalWork)}</td>
        <td class="mono" style="color:var(--danger)">${res.need[p].map((x, j) => (x > res.finalWork[j] ? `R${j}×${x - res.finalWork[j]}` : null)).filter(Boolean).join(", ")}</td></tr>`).join("")}</tbody></table></div>`;
    }
    const caption = av.k === null ? `Initial Work = Available = ${vec(av.avail)}` :
      k === 0 ? `Start: Work = Available = ${vec(av.avail)}${nextStep ? `. Next: <b>${P(nextStep.process)}</b>, Need ${vec(nextStep.need)} ≤ Work ✓` : ""}` :
      `After step ${k}: <b>${P(res.steps[k - 1].process)}</b> finished and released ${vec(res.steps[k - 1].released)}, so Work = ${vec(work)}` +
      (nextStep ? `. Next: <b>${P(nextStep.process)}</b>` : res.safe ? ". All processes finished ✓" : ". No remaining process fits ✕");

    $("#av-safety").innerHTML = `${head}
      <div class="sequence">${seqNodes || '<span class="muted">No process can even start.</span>'}</div>
      <div class="grid safety-grid" style="margin-top:12px;align-items:start">
        <div><h3 style="margin-bottom:8px">Work vector</h3><div class="workbars">${bars}</div>
          <p class="small muted" style="margin-top:10px">${caption}</p>
          ${focusNeed ? '<p class="small muted"><span style="display:inline-block;width:10px;height:10px;background:var(--warn);border-radius:2px;vertical-align:middle"></span> orange tick = Need of the next process</p>' : ""}</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Proc</th><th>Need</th><th>Work</th><th>Check</th><th>Release</th><th>New Work</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No process satisfies Need ≤ Work.</td></tr>'}</tbody></table></div>
      </div>${stuckInfo}`;
    // highlight current process in the matrices
    $$("#m-alloc tr, #m-max tr, #m-need tr").forEach((tr) => tr.classList.remove("hl"));
    if (av.k !== null && k > 0) $$(`#m-alloc tr[data-r="${res.steps[k - 1].process}"], #m-max tr[data-r="${res.steps[k - 1].process}"], #m-need tr[data-r="${res.steps[k - 1].process}"]`).forEach((tr) => tr.classList.add("hl"));

    $("#av-anim").innerHTML = res.steps.length ? `
      <button class="btn ghost" data-a="reset" title="Start">⏮</button><button class="btn ghost" data-a="prev" title="Previous">◀</button>
      <button class="btn ghost" data-a="next" title="Next">▶</button><button class="btn primary" data-a="play">${av.timer ? "Pause" : "▶ Animate"}</button>
      ${av.k !== null ? '<button class="btn ghost" data-a="all">Show all</button>' : ""}` : "";
    $$("#av-anim [data-a]").forEach((b) => b.onclick = () => {
      const a = b.dataset.a, L = res.steps.length;
      if (a === "play") {
        if (av.timer) { stopAnim(); renderSafety(res, total); return; }
        av.k = 0; renderSafety(res, total);
        av.timer = setInterval(() => { av.k++; if (av.k >= L) stopAnim(); renderSafety(res, total); }, 1100);
        renderSafety(res, total); return;
      }
      stopAnim();
      if (a === "reset") av.k = 0;
      if (a === "prev") av.k = Math.max(0, (av.k ?? L) - 1);
      if (a === "next") av.k = Math.min(L, (av.k ?? 0) + 1);
      if (a === "all") av.k = null;
      renderSafety(res, total);
    });
  }
  function stopAnim() { if (av.timer) { clearInterval(av.timer); av.timer = null; } }

  function submitRequest() {
    const n = av.alloc.length, m = av.avail.length;
    const pidTxt = $("#rq-pid").value, vecTxt = $("#rq-vec").value;
    const pid = DL.parsePid(pidTxt, n), rq = DL.parseVector(vecTxt, m);
    let out;
    if (pid.error || rq.error) out = { status: S.INVALID, message: esc(pid.error || rq.error), checks: [], who: esc(pidTxt), what: esc(vecTxt) };
    else {
      const before = JSON.stringify([av.alloc, av.avail]);
      const r = DL.requestResources(av.alloc, av.max, av.avail, pid.value, rq.value);
      out = { ...r, who: P(pid.value), what: fmt(rq.value), unchanged: before === JSON.stringify([av.alloc, av.avail]) };
      if (r.status === S.GRANTED) {
        av.history.push({ alloc: clone(av.alloc), max: clone(av.max), avail: av.avail.slice(), preset: av.preset });
        out.changed = { pid: pid.value, cols: rq.value.map((x, j) => (x ? j : -1)).filter((j) => j >= 0) };
        av.alloc = r.newAlloc; av.avail = r.newAvail; av.preset = "custom";
        av.last = out; renderAvoid();
        out.changed.cols.forEach((j) => {
          const a = $(`#m-alloc input[data-i="${pid.value}"][data-j="${j}"]`), b = $(`#m-avail input[data-j="${j}"]`);
          [a, b].forEach((c) => c && c.classList.add("flash"));
        });
        return;
      }
    }
    av.last = out; renderRequestResult(out);
  }

  function renderRequestResult(r) {
    const labels = ["Request ≤ Need", "Request ≤ Available", "Pretend to allocate", "Safety check"];
    let pipe = "";
    if (r.checks && r.checks.length) {
      const by = Object.fromEntries(r.checks.map((c) => [c.label, c]));
      const all = labels.concat(by["Roll back"] ? ["Roll back"] : []);
      pipe = `<div class="pipeline">${all.map((l, i) => {
        const c = by[l];
        const cls = !c ? "skip" : c.ok ? "ok" : "fail";
        return `<div class="pstep ${cls}" style="animation-delay:${i * 0.12}s"><div class="k">${c ? (c.ok ? "✓" : "✕") : "–"} Step ${i + 1} · ${l}</div><div class="d">${c ? esc(c.detail) : "not reached"}</div></div>`;
      }).join("")}</div>`;
    }
    let extra = "";
    if (r.status === S.DENIED && r.trialAlloc) {
      const need = DL.computeNeed(r.trialAlloc, av.max);
      extra = `<details style="margin-top:14px" open><summary class="small" style="cursor:pointer;font-weight:650">Trial state that was rejected</summary>
        <div class="row" style="gap:28px;align-items:flex-start;margin-top:10px">
          <div><div class="small muted">Trial Need</div>${matrixHTML("trial-need", need, { editable: false })}</div>
          <div><div class="small muted">Trial Available</div>${matrixHTML("trial-av", [r.trialAvail], { editable: false, rowLabel: () => "Avail" })}
            <p class="small muted" style="margin-top:10px;max-width:36ch">Safety algorithm finished <b>${r.safety.sequence.length} of ${need.length}</b> processes, so no complete safe sequence exists.</p></div>
        </div></details>`;
    }
    let verify = "";
    if (r.status === S.GRANTED) verify = `<div class="callout small" style="margin-top:14px">State committed. Allocation[${r.who}] and Available were updated (highlighted above). New Available = ${vec(av.avail)}. Use <b>Undo grant</b> to roll back.</div>`;
    else if (r.unchanged !== undefined) verify = `<div class="callout small" style="margin-top:14px">State verification: Allocation and Available unchanged = <b>${r.unchanged}</b>. Available is still ${vec(av.avail)}.</div>`;
    $("#rq-out").innerHTML = `<div class="small muted" style="margin-bottom:8px">Last request: <b class="mono">${r.who}</b> requests <b class="mono">${r.what}</b></div>
      ${banner(r.status, esc(r.message).replace(/⟨/g, "<b>⟨").replace(/⟩/g, "⟩</b>"))}${pipe}${extra}${verify}`;
  }

  // ================================================================ DETECTION
  const dt = { preset: "D2", model: "multi", alloc: [], req: [], avail: [], gone: new Set(), log: [] };
  function loadDet(key) {
    const s = SC.detection[key]; dt.preset = key; dt.model = s.model;
    dt.alloc = clone(s.allocation); dt.req = clone(s.request); dt.avail = s.available.slice(); dt.gone = new Set(); dt.log = [];
  }
  function renderDetect() {
    const n = dt.alloc.length, m = dt.avail.length;
    $("#detect-root").innerHTML = `
      <div class="card"><div class="row" style="gap:18px;align-items:flex-end">
        <div class="field"><label>Scenario</label><div class="seg" id="dt-preset">${Object.entries(SC.detection).map(([k, s]) =>
          `<button data-k="${k}" class="${k === dt.preset ? "on" : ""}" title="${esc(s.label)}">${k}</button>`).join("")}<button data-k="custom" class="${dt.preset === "custom" ? "on" : ""}" disabled>Custom</button></div></div>
        <div class="field"><label>Resource model</label><div class="seg" id="dt-model">
          <button data-m="single" class="${dt.model === "single" ? "on" : ""}">Single-instance</button><button data-m="multi" class="${dt.model === "multi" ? "on" : ""}">Multiple-instance</button></div></div>
        <div class="field"><label>Processes</label>${stepper("dt-n", n, 1, 8)}</div>
        <div class="field"><label>Resources</label>${stepper("dt-m", m, 1, 6)}</div>
        <div class="spacer"></div><button class="btn" id="dt-reset">Reset scenario</button>
      </div>
      <p class="small muted" style="margin-top:12px" id="dt-desc">${dt.preset !== "custom" ? esc(SC.detection[dt.preset].label) + ". " : ""}${dt.model === "single"
        ? "<b>Single-instance model</b>: each resource type has exactly one instance. Method: cycle detection in the wait-for graph, which is <b>conclusive</b>."
        : "<b>Multiple-instance model</b>: a type may have several instances. Method: the <b>detection algorithm</b> (Work / Request). A graph cycle alone is only a <i>potential</i> circular wait."}</p></div>

      <div class="grid g3">
        <div class="card"><div class="card-head"><span class="num">A</span><h3>Allocation</h3><span class="card-sub">held now</span></div>${matrixHTML("d-alloc", dt.alloc)}</div>
        <div class="card"><div class="card-head"><span class="num">Q</span><h3>Request</h3><span class="card-sub">blocked waiting for</span></div>${matrixHTML("d-req", dt.req)}</div>
        <div class="card"><div class="card-head"><h3>Available</h3></div>${matrixHTML("d-avail", [dt.avail], { rowLabel: () => "Avail" })}
          <div class="card-head" style="margin-top:16px"><h3>Total</h3></div>${matrixHTML("d-total", [dt.avail], { rowLabel: () => "Total", editable: false })}</div>
      </div>
      <div id="dt-valid"></div>
      <div class="grid g2" style="align-items:start">
        <div class="card"><div class="card-head"><h2>Resource-allocation graph</h2></div><div id="dt-graph"></div>
          <div class="legend" style="margin-top:10px"><span><i style="border-color:var(--safe)"></i>assigned R→P</span><span><i style="border-color:var(--faint);border-top-style:dashed"></i>request P→R</span>
          <span><i style="border-color:var(--deadlock);border-top-style:dashed"></i>in deadlock</span><span>● held instance ○ free</span></div></div>
        <div class="card"><div class="card-head"><h2>Detection result</h2></div><div id="dt-result"></div></div>
      </div>
      <div class="card"><div class="card-head"><span class="num">R</span><h2>Recovery: process termination</h2></div><div id="dt-recover"></div></div>`;

    $$("#dt-preset [data-k]").forEach((b) => b.onclick = () => { if (b.dataset.k !== "custom") { loadDet(b.dataset.k); renderDetect(); } });
    $$("#dt-model [data-m]").forEach((b) => b.onclick = () => { dt.model = b.dataset.m; renderDetect(); });
    bindStepper("dt-n", (nv) => { dt.alloc = resize(dt.alloc, nv, m); dt.req = resize(dt.req, nv, m); dt.preset = "custom"; dt.log = []; dt.gone = new Set(); renderDetect(); });
    bindStepper("dt-m", (nv) => { dt.alloc = resize(dt.alloc, n, nv); dt.req = resize(dt.req, n, nv); dt.avail = resize([dt.avail], 1, nv)[0]; dt.preset = "custom"; renderDetect(); });
    $("#dt-reset").onclick = () => { loadDet(dt.preset === "custom" ? "D2" : dt.preset); renderDetect(); };
    const edited = () => { if (dt.preset !== "custom") { dt.preset = "custom"; $$("#dt-preset button").forEach((b) => b.classList.toggle("on", b.dataset.k === "custom")); } updateDetect(); };
    bindMatrix("d-alloc", (i, j, v) => { dt.alloc[i][j] = v; dt.gone.delete(i); edited(); });
    bindMatrix("d-req", (i, j, v) => { dt.req[i][j] = v; dt.gone.delete(i); edited(); });
    bindMatrix("d-avail", (i, j, v) => { dt.avail[j] = v; edited(); });
    updateDetect();
  }

  function updateDetect() {
    const n = dt.alloc.length, m = dt.avail.length;
    const errs = DL.validateDetection(dt.alloc, dt.req, dt.avail);
    $$("#d-alloc input, #d-req input, #d-avail input").forEach((c) => {
      const t = c.closest("table").id, i = +c.dataset.i, j = +c.dataset.j;
      const v = t === "d-alloc" ? dt.alloc[i][j] : t === "d-req" ? dt.req[i][j] : dt.avail[j];
      c.classList.toggle("bad", !Number.isInteger(v) || v < 0);
    });
    if (errs.length) {
      $("#dt-valid").innerHTML = banner(S.INVALID, "Fix these inputs:", errs);
      ["#dt-graph", "#dt-result", "#dt-recover"].forEach((s) => ($(s).innerHTML = '<p class="muted">Waiting for valid input…</p>'));
      return;
    }
    const total = dt.avail.map((a, j) => a + sum(dt.alloc.map((r) => r[j])));
    $$("#d-total .cell").forEach((c) => (c.textContent = total[+c.dataset.j]));
    const det = DL.detectionAlgorithm(dt.alloc, dt.req, dt.avail);
    const wfg = DL.waitForGraph(dt.alloc, dt.req);
    const cycle = DL.findCycle(wfg);
    const mismatch = dt.model === "single" && total.some((t) => t > 1);
    $("#dt-valid").innerHTML = mismatch ? banner(S.INVALID, `Totals ${fmt(total)}: some resource has more than one instance, so the <b>single-instance model does not apply</b>. Switch to the multiple-instance model.`) : "";
    const hot = new Set(dt.model === "single" ? (cycle || []) : det.deadlocked);
    $$("#d-alloc tr, #d-req tr").forEach((tr) => tr.classList.toggle("dead", hot.has(+tr.dataset.r)));
    $("#dt-graph").innerHTML = ragSVG(dt.alloc, dt.req, total, hot);

    const edges = []; wfg.forEach((s, i) => [...s].sort().forEach((k) => edges.push(`P${i} → P${k}`)));
    const cyc = cycle ? cycle.concat(cycle[0]).map(P).join(" → ") : null;
    let verdict;
    if (mismatch) verdict = banner(S.INVALID, "Model mismatch: see the message above.");
    else if (dt.model === "single")
      verdict = cycle ? banner(S.DEADLOCK, `Circular wait <b class="mono">${cyc}</b>. Every resource has one instance, so this cycle <b>proves</b> deadlock.`)
                      : banner(S.NODEADLOCK, "No cycle in the wait-for graph, so no deadlock.");
    else verdict = det.deadlocked.length
      ? banner(S.DEADLOCK, `Deadlocked processes: <b class="mono">${det.deadlocked.map(P).join(", ")}</b>. Their requests can never be satisfied, even after every other process finishes.`)
      : banner(S.NODEADLOCK, `All processes can eventually finish, in the order <b class="mono">⟨${det.order.map(P).join(", ")}⟩</b>.` +
          (cycle ? `<br>The graph <b>does contain a cycle</b> (${cyc}), but it is only a <i>potential</i> circular wait: other instances are held by processes that are not waiting, and they will release them.` : ""));

    $("#dt-result").innerHTML = `${verdict}
      <div class="grid g2" style="margin-top:14px">
        <div class="metric"><div class="v">${edges.length}</div><div class="l">wait-for edges</div></div>
        <div class="metric"><div class="v" style="color:${cycle ? "var(--warn)" : "var(--safe)"}">${cycle ? "yes" : "no"}</div><div class="l">cycle in graph</div></div>
      </div>
      <p class="small muted" style="margin-top:12px">Wait-for graph: <span class="mono">${edges.join(", ") || "no edges"}</span></p>
      <h3 style="margin:16px 0 8px">Detection algorithm trace</h3>
      <p class="small muted" style="margin-bottom:8px">Work = Available = ${vec(dt.avail)}. Finish[i] = true when Request[i] ≤ Work.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Proc</th><th>Check</th><th>Work after</th></tr></thead><tbody>
        ${det.steps.map((s) => `<tr><td><b class="mono">${P(s.process)}</b></td><td class="mono small wrap">${esc(s.note)}</td><td class="mono">${fmt(s.workAfter)}</td></tr>`).join("")}
        ${det.deadlocked.map((p) => `<tr><td><b class="mono" style="color:var(--deadlock)">${P(p)}</b></td><td class="mono small wrap" style="color:var(--deadlock)">Request ${fmt(dt.req[p])} ≰ Work ${fmt(det.finalWork)}: stuck</td><td>–</td></tr>`).join("")}
      </tbody></table></div>`;

    // recovery
    let rec = "";
    const dead = det.deadlocked;
    if (dead.length && !mismatch) {
      const sug = DL.chooseVictim(dt.alloc, dead);
      rec = `<div class="row" style="align-items:flex-end;gap:12px">
        <div class="field" style="min-width:280px"><label>Victim</label><select class="input" id="victim">${dead.map((p) =>
          `<option value="${p}" ${p === sug ? "selected" : ""}>${P(p)}: holds ${fmt(dt.alloc[p])}${p === sug ? " (suggested: fewest held)" : ""}</option>`).join("")}</select></div>
        <button class="btn danger" id="kill">Terminate &amp; release</button>
        <span class="small muted" style="max-width:48ch">Policy: abort the deadlocked process that holds the fewest instances (least work lost), then re-run detection.</span></div>`;
    } else if (!mismatch) rec = `<p class="muted">${dt.log.length ? "Deadlock resolved. No further recovery needed." : "No deadlock, so no recovery is needed."}</p>`;
    if (dt.log.length) rec += `<ul class="timeline" style="margin-top:16px">${dt.log.map((l) => `<li>${l}</li>`).join("")}</ul>`;
    $("#dt-recover").innerHTML = rec;
    const kill = $("#kill");
    if (kill) kill.onclick = () => {
      const v = +$("#victim").value;
      const t = DL.terminateProcess(dt.alloc, dt.req, dt.avail, v);
      const after = DL.detectionAlgorithm(t.alloc, t.req, t.avail);
      dt.log.push(`Terminated <b class="mono">${P(v)}</b> and released ${vec(t.released)}. Available ${vec(dt.avail)} → <b class="mono">${fmt(t.avail)}</b>. Detection now reports ${pill(after.status)}` +
        (after.deadlocked.length ? ` (still stuck: ${after.deadlocked.map(P).join(", ")})` : `; remaining processes finish in the order <span class="mono">⟨${after.order.map(P).join(", ")}⟩</span>`));
      dt.alloc = t.alloc; dt.req = t.req; dt.avail = t.avail; dt.gone.add(v);
      const keepLog = dt.log, keepGone = dt.gone, keepPreset = dt.preset;
      renderDetect(); dt.log = keepLog; dt.gone = keepGone; dt.preset = keepPreset;
      toast(`${P(v)} terminated`);
    };
  }

  /* Resource-allocation graph: processes left, resources right. Assignment edges curve one way, requests the other. */
  function ragSVG(alloc, req, total, hot) {
    const n = alloc.length, m = total.length;
    const W = 560, rowsN = Math.max(n, m), gap = 78, H = rowsN * gap + 30;
    const px = 90, rx = W - 120;
    const py = (i) => 15 + gap / 2 + i * gap * (rowsN / n) + (gap * (rowsN / n) - gap) / 2;
    const ry = (j) => 15 + gap / 2 + j * gap * (rowsN / m) + (gap * (rowsN / m) - gap) / 2;
    const hotRes = new Set(); hot.forEach((p) => req[p].forEach((x, j) => x && hotRes.add(j)));
    const curve = (x1, y1, x2, y2, bend) => {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / L) * bend, cy = my + (dx / L) * bend;
      return { d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, lx: (x1 + 2 * cx + x2) / 4, ly: (y1 + 2 * cy + y2) / 4 };
    };
    let edges = "", labels = "";
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const rw = Math.max(70, 26 + total[j] * 13);
      if (alloc[i][j]) {
        const c = curve(rx - rw / 2 + 2, ry(j) + 4, px + 26, py(i) + 4, 18);
        const h = hot.has(i) && hotRes.size && [...hot].some((q) => req[q][j]);
        edges += `<path class="e-assign ${h ? "hot" : ""}" d="${c.d}" marker-end="url(#ar-${h ? "hot" : "a"})"/>`;
        if (alloc[i][j] > 1) labels += `<text class="elabel" x="${c.lx}" y="${c.ly - 4}" text-anchor="middle">${alloc[i][j]}</text>`;
      }
      if (req[i][j]) {
        const c = curve(px + 24, py(i) - 4, rx - rw / 2 - 2, ry(j) - 4, 18);
        edges += `<path class="e-req ${hot.has(i) ? "hot" : ""}" d="${c.d}" marker-end="url(#ar-${hot.has(i) ? "hot" : "r"})"/>`;
        if (req[i][j] > 1) labels += `<text class="elabel" x="${c.lx}" y="${c.ly - 4}" text-anchor="middle">${req[i][j]}</text>`;
      }
    }
    let nodes = "";
    for (let i = 0; i < n; i++)
      nodes += `<g class="pnode ${hot.has(i) ? "dead" : ""} ${dt.gone.has(i) ? "gone" : ""}"><circle cx="${px}" cy="${py(i)}" r="24"/><text x="${px}" y="${py(i) + 4.5}" text-anchor="middle">P${i}</text></g>`;
    for (let j = 0; j < m; j++) {
      const rw = Math.max(70, 26 + total[j] * 13), held = sum(alloc.map((r) => r[j]));
      let dots = "";
      for (let k = 0; k < total[j]; k++) dots += `<circle class="dot ${k >= held ? "free" : ""}" cx="${rx - (total[j] - 1) * 6.5 + k * 13}" cy="${ry(j) + 9}" r="4"/>`;
      nodes += `<g class="rnode"><rect x="${rx - rw / 2}" y="${ry(j) - 22}" width="${rw}" height="44" rx="10"/><text x="${rx}" y="${ry(j) - 3}" text-anchor="middle">R${j}</text>${dots}</g>`;
    }
    const mk = (id, col) => `<marker id="ar-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:${col}"/></marker>`;
    return `<svg class="rag" viewBox="0 0 ${W} ${H}" role="img" aria-label="Resource allocation graph">
      <defs>${mk("a", "var(--safe)")}${mk("r", "var(--faint)")}${mk("hot", "var(--deadlock)")}</defs>
      <text x="${px}" y="12" text-anchor="middle" style="font:700 10px var(--sans);fill:var(--faint);letter-spacing:.1em">PROCESSES</text>
      <text x="${rx}" y="12" text-anchor="middle" style="font:700 10px var(--sans);fill:var(--faint);letter-spacing:.1em">RESOURCES</text>
      ${edges}${labels}${nodes}</svg>`;
  }

  // ================================================================ PREVENTION
  const pv = { programs: clone(SC.prevention.programs), burst: clone(SC.prevention.burst) };
  const POL = [
    { k: DL.POLICY.NONE, name: "No prevention", removes: "Nothing: all four conditions can hold" },
    { k: DL.POLICY.ORDER, name: "Resource ordering", removes: "Circular wait: locks are always taken in increasing R-number" },
    { k: DL.POLICY.ALL, name: "All-at-once", removes: "Hold & wait: a waiting job holds nothing" },
  ];
  function renderPrevent() {
    const names = SC.prevention.names;
    $("#prevent-root").innerHTML = `
      <div class="card"><div class="card-head"><h2>Workload</h2><span class="card-sub">${names.map((x, j) => `R${j} ${x}`).join(" · ")}: one instance each</span></div>
        <div class="grid g3">${Object.keys(pv.programs).map((p) => `
          <div class="row" style="gap:10px;align-items:flex-end">
            <span class="seq-node done" style="background:${PCOLORS[p]}">P${p}</span>
            <div class="field" style="flex:1"><label>Lock order</label><input class="input mono" data-prog="${p}" value="${pv.programs[p].map((r) => "R" + r).join(", ")}"></div>
            <div class="field"><label>Run ticks</label><input class="input mono" data-burst="${p}" value="${pv.burst[p]}" style="width:70px"></div>
          </div>`).join("")}</div>
        <div id="pv-err" style="margin-top:12px"></div>
        <div class="row" style="margin-top:12px"><button class="chip-btn" id="pv-reset">Reset to scenario E</button>
          <span class="small muted">Each tick a job takes its next device. Once it holds all of them it runs, then releases everything.</span></div></div>
      <div class="grid g3" id="pv-cols"></div>
      <div class="card"><div class="card-head"><h2>Trade-offs</h2></div><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Policy</th><th>Removes</th><th>Benefit</th><th>Cost</th></tr></thead><tbody>
        <tr><td><b>No prevention</b></td><td>–</td><td>maximum flexibility</td><td>deadlock possible (shown above)</td></tr>
        <tr><td><b>Resource ordering</b></td><td>Circular wait</td><td>simple, no runtime check, no up-front knowledge</td><td>jobs must lock in global order, often earlier than needed; blocked jobs still sit on devices (<b>lower utilization</b>)</td></tr>
        <tr><td><b>All-at-once</b></td><td>Hold &amp; wait</td><td>a waiting job wastes nothing</td><td>all needs must be known up front; devices are reserved for the whole run; jobs that share any device can't overlap (<b>reduced concurrency</b>); big jobs may starve</td></tr>
        </tbody></table></div></div>`;
    $$("[data-prog],[data-burst]").forEach((inp) => inp.addEventListener("input", updatePrevent));
    $("#pv-reset").onclick = () => { pv.programs = clone(SC.prevention.programs); pv.burst = clone(SC.prevention.burst); renderPrevent(); };
    updatePrevent();
  }
  function updatePrevent() {
    const nR = SC.prevention.names.length, errs = [];
    const programs = {}, burst = {};
    $$("[data-prog]").forEach((inp) => {
      const p = +inp.dataset.prog;
      const rs = inp.value.split(",").map((s) => s.trim().toUpperCase().replace(/^R/, "")).filter(Boolean);
      const nums = rs.map(Number);
      if (!rs.length || !rs.every((s) => /^\d+$/.test(s)) || nums.some((r) => r >= nR) || new Set(nums).size !== nums.length) {
        errs.push(`P${p}: "${inp.value}" must list distinct resources among R0..R${nR - 1}`); inp.classList.add("bad");
      } else { programs[p] = nums; inp.classList.remove("bad"); }
    });
    $$("[data-burst]").forEach((inp) => {
      const p = +inp.dataset.burst, v = inp.value.trim();
      if (!/^\d+$/.test(v) || +v < 1 || +v > 20) { errs.push(`P${p}: run ticks must be an integer 1–20`); inp.classList.add("bad"); }
      else { burst[p] = +v; inp.classList.remove("bad"); }
    });
    if (errs.length) { $("#pv-err").innerHTML = banner(S.INVALID, "Fix the workload:", errs); $("#pv-cols").innerHTML = ""; return; }
    $("#pv-err").innerHTML = ""; pv.programs = programs; pv.burst = burst;
    $("#pv-cols").innerHTML = POL.map((pol) => {
      const r = DL.simulate(programs, burst, pol.k, nR);
      const T = r.trace.length;
      let g = `<div class="gantt" style="grid-template-columns:auto repeat(${T}, minmax(22px,1fr))"><div></div>`;
      for (let t = 1; t <= T; t++) g += `<div class="gh">${t}</div>`;
      for (let j = 0; j < nR; j++) {
        g += `<div class="gl">R${j}</div>`;
        r.trace.forEach((tr) => {
          const o = tr.owners[j];
          g += `<div class="gc ${tr.deadlock && o !== null ? "dl" : ""}" style="${o !== null ? `background:${PCOLORS[o]}` : ""}" title="tick ${tr.tick}: R${j} ${o !== null ? "held by P" + o : "free"}">${o !== null ? o : ""}</div>`;
        });
      }
      g += "</div>";
      const events = r.trace.map((tr) => `<div><b class="mono">t${tr.tick}</b> ${tr.events.map((e) => esc(e.text)).join(" · ")}${tr.deadlock ? ' <b style="color:var(--deadlock)">⇒ no job can proceed: DEADLOCK</b>' : ""}</div>`).join("");
      return `<div class="card"><div class="card-head"><h2>${pol.name}</h2></div>
        <p class="small muted" style="margin:-6px 0 10px">${pol.removes}</p>
        <div class="row small" style="margin-bottom:12px">${Object.entries(r.lists).map(([p, l]) => `<span class="mono" style="color:${PCOLORS[p]};font-weight:700">P${p}</span><span class="mono muted">${l.map((x) => "R" + x).join("→")}</span>`).join('<span class="muted">·</span>')}</div>
        ${r.deadlocked ? banner(S.DEADLOCK, `Every unfinished job is blocked at tick <b>${r.ticks}</b>.`) : banner(S.NODEADLOCK, `All jobs finished in <b>${r.ticks}</b> ticks.`)}
        <div class="grid g3" style="margin:14px 0;gap:8px">
          <div class="metric"><div class="v">${r.deadlocked ? "∞" : r.ticks}</div><div class="l">ticks to finish</div></div>
          <div class="metric"><div class="v">${r.heldIdle}</div><div class="l">resource-ticks held while blocked</div></div>
          <div class="metric"><div class="v">${r.maxConcurrent}</div><div class="l">max jobs holding at once</div></div></div>
        <h3 style="margin-bottom:8px">Device ownership per tick</h3>${g}
        <details style="margin-top:12px"><summary class="small" style="cursor:pointer;font-weight:650">Tick-by-tick events</summary><div class="code" style="margin-top:8px">${events}</div></details></div>`;
    }).join("");
  }

  // ================================================================ TESTS
  let tcRows = [];
  function renderTests() {
    tcRows = TC.runAll();
    const passed = tcRows.filter((r) => r.pass).length;
    $("#tests-root").innerHTML = `
      <div class="card"><div class="score"><div class="ring" style="--p:${(passed / tcRows.length) * 100}"><span>${passed}/${tcRows.length}</span></div>
        <div><h2>${passed === tcRows.length ? "All test cases pass" : "Some test cases fail"}</h2>
        <p class="muted small" style="margin-top:4px">Run at ${new Date().toLocaleTimeString()}. Results come from core.js, which <span class="mono">web/test/verify_js.py</span> checks against the Python reference implementation.</p></div></div></div>
      <div>${tcRows.map((r, i) => `
        <details class="tc" ${i === 0 ? "open" : ""}><summary><span class="tc-id">${r.id}</span><div><b>${esc(r.cond)}</b><div class="small muted">Expected: ${esc(r.expected)}</div></div>
          <span class="pill ${r.pass ? "c-safe" : "c-danger"}">${r.pass ? "PASS" : "FAIL"}</span></summary>
          <div class="body">
            <div class="kv"><div class="k">Input</div><div>${esc(r.input)}</div></div>
            <div class="kv"><div class="k">Expected result</div><div>${esc(r.expected)}</div></div>
            <div class="kv full"><div class="k">Actual result</div><div class="code">${esc(r.actual)}</div></div>
            <div class="kv full"><div class="k">Analysis / conclusion</div><div>${esc(r.analysis)}</div></div>
            <div class="kv full"><div class="k">Trace</div><div class="code">${r.trace.map(esc).join("\n")}</div></div>
          </div></details>`).join("")}</div>`;
  }
  function testsMarkdown() {
    const c = (s) => String(s).replace(/\|/g, "\\|");
    return "| Test Case | System Condition | Actual Result | Expected Result | Analysis / Conclusion |\n|---|---|---|---|---|\n" +
      tcRows.map((r) => `| ${r.id} | ${c(r.cond)} | ${c(r.actual)} | ${c(r.expected)} | ${c(r.analysis)} (${r.pass ? "PASS" : "FAIL"}) |`).join("\n");
  }

  // ================================================================ INIT
  function init() {
    let t = "auto"; try { t = localStorage.getItem("dl-theme") || "auto"; } catch (e) { /* ignore */ }
    setTheme(t);
    $$("#theme button").forEach((b) => (b.onclick = () => setTheme(b.dataset.t)));
    $("#legend").innerHTML = [S.SAFE, S.UNSAFE, S.GRANTED, S.WAIT, S.DENIED, S.INVALID, S.NOOP, S.DEADLOCK, S.NODEADLOCK].map(pill).join("");
    loadBank("A"); renderAvoid();
    loadDet("D2"); renderDetect();
    renderPrevent();
    renderTests();
    $("#rerun").onclick = () => { renderTests(); toast("All test cases re-run"); };
    $("#copy-md").onclick = async () => {
      const md = testsMarkdown();
      try { await navigator.clipboard.writeText(md); toast("Markdown table copied"); }
      catch (e) { const ta = document.createElement("textarea"); ta.value = md; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Markdown table copied"); }
    };
    window.addEventListener("hashchange", route);
    route();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
