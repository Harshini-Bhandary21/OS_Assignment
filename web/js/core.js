/*
 * core.js: deadlock algorithms (no UI code).
 * JavaScript port of deadlock_core.py; test/verify_js.mjs checks both give identical results.
 *
 *   AVOIDANCE  : computeNeed, safetyAlgorithm, requestResources   (Banker's, uses Max)
 *   DETECTION  : detectionAlgorithm, waitForGraph, findCycle      (uses current Request)
 *   RECOVERY   : terminateProcess, chooseVictim, autoRecover
 *   PREVENTION : simulate (no policy / resource ordering / all-at-once)
 */
(function (root) {
  "use strict";

  const S = {
    SAFE: "SAFE", UNSAFE: "UNSAFE", GRANTED: "GRANTED", WAIT: "WAIT / DEFERRED",
    DENIED: "DENIED (UNSAFE)", INVALID: "INVALID INPUT", NOOP: "NO-OP",
    DEADLOCK: "DEADLOCK DETECTED", NODEADLOCK: "NO DEADLOCK",
  };

  // ---------- vector helpers
  const leq = (a, b) => a.every((x, i) => x <= b[i]);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const clone = (m) => JSON.parse(JSON.stringify(m));
  const P = (i) => "P" + i;
  const isInt = (x) => Number.isInteger(x);
  const fmt = (v) => "[" + v.join(", ") + "]";

  // ---------- validation
  function validateState(alloc, max, avail) {
    const e = [];
    const n = alloc.length, m = avail.length;
    if (!n) return ["There must be at least one process."];
    if (!m) return ["There must be at least one resource type."];
    if (max.length !== n) return [`Max has ${max.length} rows but Allocation has ${n}.`];
    for (const [label, mat] of [["Allocation", alloc], ["Max", max]])
      mat.forEach((row, i) => {
        if (row.length !== m) { e.push(`${label} row ${P(i)} has ${row.length} columns, expected ${m}.`); return; }
        row.forEach((v, j) => {
          if (!isInt(v)) e.push(`${label}[${P(i)}][R${j}] is empty or not an integer.`);
          else if (v < 0) e.push(`${label}[${P(i)}][R${j}] = ${v} is negative.`);
        });
      });
    avail.forEach((v, j) => {
      if (!isInt(v)) e.push(`Available[R${j}] is empty or not an integer.`);
      else if (v < 0) e.push(`Available[R${j}] = ${v} is negative.`);
    });
    if (e.length) return e;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++)
        if (alloc[i][j] > max[i][j])
          e.push(`Allocation[${P(i)}][R${j}] = ${alloc[i][j]} exceeds declared Max = ${max[i][j]} (a process cannot hold more than it declared).`);
    return e;
  }

  function parseVector(text, m) {
    const parts = String(text).replace(/;/g, ",").split(",").map((s) => s.trim()).filter((s) => s !== "");
    if (parts.length !== m) return { error: `Expected ${m} comma-separated values, got ${parts.length}.` };
    if (!parts.every((p) => /^[+-]?\d+$/.test(p))) return { error: `All values must be integers: "${text}".` };
    return { value: parts.map(Number) };
  }

  function parsePid(text, n) {
    let t = String(text).trim().toUpperCase();
    if (t.startsWith("P")) t = t.slice(1);
    if (!/^[+-]?\d+$/.test(t)) return { error: `"${text}" is not a valid process identifier (use P0..P${n - 1}).` };
    const idx = Number(t);
    if (idx < 0 || idx >= n) return { error: `Process P${idx} does not exist (valid: P0..P${n - 1}).` };
    return { value: idx };
  }

  // ---------- AVOIDANCE: Banker's
  const computeNeed = (alloc, max) => alloc.map((row, i) => sub(max[i], row));

  /* Safety algorithm: scan P0..Pn-1 in repeated passes; finish every process whose Need <= Work. */
  function safetyAlgorithm(alloc, max, avail) {
    const need = computeNeed(alloc, max);
    const n = alloc.length;
    let work = avail.slice();
    const finish = Array(n).fill(false);
    const sequence = [], steps = [];
    let progress = true, pass = 0;
    while (progress) {
      progress = false; pass++;
      for (let i = 0; i < n; i++) {
        if (!finish[i] && leq(need[i], work)) {
          const before = work.slice();
          work = add(work, alloc[i]);
          finish[i] = true;
          sequence.push(i);
          steps.push({ step: sequence.length, pass, process: i, need: need[i].slice(), workBefore: before,
                       released: alloc[i].slice(), workAfter: work.slice() });
          progress = true;
        }
      }
    }
    const unfinished = [];
    for (let i = 0; i < n; i++) if (!finish[i]) unfinished.push(i);
    return { safe: unfinished.length === 0, status: unfinished.length ? S.UNSAFE : S.SAFE,
             sequence, steps, unfinished, finalWork: work, need };
  }

  /* Resource-request algorithm. Never mutates its inputs, so a denied request leaves the state as it was. */
  function requestResources(alloc, max, avail, pid, req) {
    const checks = [];
    const errs = validateState(alloc, max, avail);
    if (errs.length) return { status: S.INVALID, message: "The current system state is invalid: " + errs.join(" "), checks };
    const n = alloc.length, m = avail.length;
    if (!isInt(pid) || pid < 0 || pid >= n)
      return { status: S.INVALID, message: `Process identifier ${pid} does not exist (valid: P0..P${n - 1}).`, checks };
    if (req.length !== m || !req.every(isInt))
      return { status: S.INVALID, message: `Request must contain exactly ${m} integers.`, checks };
    if (req.some((x) => x < 0))
      return { status: S.INVALID, message: `Request ${fmt(req)} contains a negative value; requests must be ≥ 0.`, checks };
    if (req.every((x) => x === 0))
      return { status: S.NOOP, message: `${P(pid)} requested nothing ${fmt(req)}; state unchanged.`, checks };

    const need = computeNeed(alloc, max);
    // Step 1
    if (!leq(req, need[pid])) {
      checks.push({ label: "Request ≤ Need", ok: false, detail: `${fmt(req)} ≤ Need[${P(pid)}] ${fmt(need[pid])}` });
      return { status: S.INVALID, checks,
        message: `${P(pid)} asked for ${fmt(req)} but its remaining Need is only ${fmt(need[pid])}. A process may not exceed its declared maximum claim, so this is an error, not a wait.` };
    }
    checks.push({ label: "Request ≤ Need", ok: true, detail: `${fmt(req)} ≤ Need[${P(pid)}] ${fmt(need[pid])}` });
    // Step 2
    if (!leq(req, avail)) {
      const short = req.map((x, j) => (x > avail[j] ? "R" + j : null)).filter(Boolean);
      checks.push({ label: "Request ≤ Available", ok: false, detail: `${fmt(req)} ≤ Available ${fmt(avail)}: ${short.join(", ")} short` });
      return { status: S.WAIT, checks,
        message: `The request is legal (within Need), but only ${fmt(avail)} is free. ${P(pid)} must WAIT until other processes release resources. Nothing was allocated and the state is unchanged.` };
    }
    checks.push({ label: "Request ≤ Available", ok: true, detail: `${fmt(req)} ≤ Available ${fmt(avail)}` });
    // Step 3
    const tAlloc = clone(alloc);
    tAlloc[pid] = add(tAlloc[pid], req);
    const tAvail = sub(avail, req);
    checks.push({ label: "Pretend to allocate", ok: true,
      detail: `Available → ${fmt(tAvail)}, Allocation[${P(pid)}] → ${fmt(tAlloc[pid])}, Need[${P(pid)}] → ${fmt(sub(need[pid], req))}` });
    // Step 4
    const safety = safetyAlgorithm(tAlloc, max, tAvail);
    if (safety.safe) {
      const seq = safety.sequence.map(P).join(" → ");
      checks.push({ label: "Safety check", ok: true, detail: `SAFE ⟨${seq}⟩` });
      return { status: S.GRANTED, checks, safety, newAlloc: tAlloc, newAvail: tAvail, trialAlloc: tAlloc, trialAvail: tAvail,
               message: `Request granted. The resulting state is safe with sequence ⟨${seq}⟩.` };
    }
    const stuck = safety.unfinished.map(P).join(", ");
    checks.push({ label: "Safety check", ok: false, detail: `UNSAFE: no order lets ${stuck} finish` });
    checks.push({ label: "Roll back", ok: true, detail: "Original Allocation and Available restored" });
    return { status: S.DENIED, checks, safety, trialAlloc: tAlloc, trialAvail: tAvail,
      message: `Granting would leave the system UNSAFE (no order lets ${stuck} finish). The request is denied and the original state is kept. Unsafe means deadlock is possible, not that it has happened.` };
  }

  // ---------- DETECTION
  function validateDetection(alloc, req, avail) {
    const n = alloc.length, m = avail.length, e = [];
    if (!n || !m) return ["Need at least one process and one resource type."];
    if (req.length !== n) return [`Request has ${req.length} rows, Allocation has ${n}.`];
    for (const [label, mat] of [["Allocation", alloc], ["Request", req]])
      mat.forEach((row, i) => row.forEach((v, j) => {
        if (!isInt(v) || v < 0) e.push(`${label}[${P(i)}][R${j}] must be a non-negative integer.`);
      }));
    avail.forEach((v, j) => { if (!isInt(v) || v < 0) e.push(`Available[R${j}] must be a non-negative integer.`); });
    return e;
  }

  /* Detection algorithm for multiple-instance resources. Uses the current Request matrix, not Need. */
  function detectionAlgorithm(alloc, req, avail) {
    const n = alloc.length;
    let work = avail.slice();
    const finish = alloc.map((row) => row.every((x) => x === 0));
    const order = [], steps = [];
    finish.forEach((f, i) => { if (f) steps.push({ process: i, note: "holds nothing → Finish = true", workBefore: work.slice(), workAfter: work.slice() }); });
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i] && leq(req[i], work)) {
          const before = work.slice();
          work = add(work, alloc[i]);
          finish[i] = true; order.push(i); progress = true;
          steps.push({ process: i, note: `Request ${fmt(req[i])} ≤ Work ${fmt(before)}`, workBefore: before, workAfter: work.slice() });
        }
      }
    }
    const deadlocked = [];
    for (let i = 0; i < n; i++) if (!finish[i]) deadlocked.push(i);
    return { deadlocked, order, steps, status: deadlocked.length ? S.DEADLOCK : S.NODEADLOCK, finalWork: work };
  }

  /* Wait-for graph: i -> k when Pi requests a resource type that Pk holds. */
  function waitForGraph(alloc, req) {
    const n = alloc.length, m = n ? alloc[0].length : 0;
    const g = Array.from({ length: n }, () => new Set());
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++)
      if (req[i][j] > 0) for (let k = 0; k < n; k++) if (k !== i && alloc[k][j] > 0) g[i].add(k);
    return g;
  }

  function findCycle(g) {
    const n = g.length, color = Array(n).fill(0), parent = Array(n).fill(-1);
    function dfs(u) {
      color[u] = 1;
      for (const v of [...g[u]].sort((a, b) => a - b)) {
        if (color[v] === 1) {
          const cyc = [v]; let x = u;
          while (x !== v) { cyc.push(x); x = parent[x]; }
          return cyc.reverse();
        }
        if (color[v] === 0) { parent[v] = u; const f = dfs(v); if (f) return f; }
      }
      color[u] = 2; return null;
    }
    for (let s = 0; s < n; s++) if (color[s] === 0) {
      const c = dfs(s);
      if (c) { const k = c.indexOf(Math.min(...c)); return c.slice(k).concat(c.slice(0, k)); }
    }
    return null;
  }

  // ---------- RECOVERY
  function terminateProcess(alloc, req, avail, victim) {
    const a = clone(alloc), r = clone(req);
    const released = a[victim].slice();
    a[victim] = a[victim].map(() => 0);
    r[victim] = r[victim].map(() => 0);
    return { alloc: a, req: r, avail: add(avail, released), released };
  }
  /* Victim policy: the deadlocked process holding the fewest instances (least work lost); ties go to the lowest id. */
  const chooseVictim = (alloc, dead) =>
    dead.slice().sort((x, y) => alloc[x].reduce((s, v) => s + v, 0) - alloc[y].reduce((s, v) => s + v, 0) || x - y)[0];

  function autoRecover(alloc, req, avail) {
    const log = [];
    let st = { alloc: clone(alloc), req: clone(req), avail: avail.slice() };
    for (;;) {
      const d = detectionAlgorithm(st.alloc, st.req, st.avail);
      if (!d.deadlocked.length) break;
      const v = chooseVictim(st.alloc, d.deadlocked);
      const t = terminateProcess(st.alloc, st.req, st.avail, v);
      log.push({ terminated: v, released: t.released, availAfter: t.avail });
      st = t;
    }
    return { log, ...st };
  }

  // ---------- PREVENTION simulator (single-instance resources)
  const POLICY = { NONE: "none", ORDER: "order", ALL: "all" };

  function simulate(programs, burst, policy, nRes, maxTicks = 100) {
    const pids = Object.keys(programs).map(Number).sort((a, b) => a - b);
    const lists = {};
    pids.forEach((p) => { lists[p] = policy === POLICY.ORDER ? programs[p].slice().sort((a, b) => a - b) : programs[p].slice(); });
    const owner = Array(nRes).fill(null);
    const held = {}, next = {}, remaining = {}, done = {};
    pids.forEach((p) => { held[p] = []; next[p] = 0; remaining[p] = burst[p]; });
    const trace = [];
    let heldIdle = 0, maxConc = 0;

    for (let tick = 1; tick <= maxTicks; tick++) {
      const events = []; let progress = false;
      const state = {}; // per-process state this tick: acquire | blocked | run | done | wait
      for (const p of pids) {
        if (p in done) continue;
        const need = lists[p];
        if (next[p] < need.length) {
          if (policy === POLICY.ALL) {
            if (need.every((r) => owner[r] === null)) {
              need.forEach((r) => (owner[r] = p)); held[p] = need.slice(); next[p] = need.length;
              events.push({ p, kind: "acquire", text: `P${p} takes ALL {${need.map((r) => "R" + r).join(", ")}}` });
              progress = true; state[p] = "acquire";
            } else {
              const busy = need.filter((r) => owner[r] !== null).map((r) => "R" + r);
              events.push({ p, kind: "wait", text: `P${p} waits holding nothing (${busy.join(", ")} busy)` });
              state[p] = "wait";
            }
          } else {
            const r = need[next[p]];
            if (owner[r] === null) {
              owner[r] = p; held[p].push(r); next[p]++;
              events.push({ p, kind: "acquire", text: `P${p} acquires R${r}` });
              progress = true; state[p] = "acquire";
            } else {
              events.push({ p, kind: "blocked", text: `P${p} blocked on R${r} (held by P${owner[r]}), holding ${held[p].map((x) => "R" + x).join(", ") || "nothing"}` });
              heldIdle += held[p].length; state[p] = held[p].length ? "blocked" : "wait";
            }
          }
        } else {
          remaining[p]--; progress = true;
          if (remaining[p] === 0) {
            events.push({ p, kind: "finish", text: `P${p} finishes, releases ${held[p].map((r) => "R" + r).join(", ")}` });
            held[p].forEach((r) => (owner[r] = null)); held[p] = []; done[p] = tick; state[p] = "finish";
          } else {
            events.push({ p, kind: "run", text: `P${p} running (${remaining[p]} left)` }); state[p] = "run";
          }
        }
      }
      maxConc = Math.max(maxConc, pids.filter((p) => held[p].length).length);
      trace.push({ tick, events, owners: owner.slice(), state });
      const res = (dl) => ({ policy, deadlocked: dl, ticks: tick, trace, done, heldIdle, maxConcurrent: maxConc, lists });
      if (Object.keys(done).length === pids.length) return res(false);
      if (!progress) { trace[trace.length - 1].deadlock = true; return res(true); }
    }
    return { policy, deadlocked: true, ticks: maxTicks, trace, done, heldIdle, maxConcurrent: maxConc, lists };
  }

  const api = { S, leq, add, sub, clone, P, fmt, validateState, parseVector, parsePid, computeNeed, safetyAlgorithm,
    requestResources, validateDetection, detectionAlgorithm, waitForGraph, findCycle, terminateProcess, chooseVictim,
    autoRecover, POLICY, simulate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DL = api;
})(typeof window !== "undefined" ? window : globalThis);
