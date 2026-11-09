"""
app.py - Deadlock Analysis & Resource Allocation Dashboard (Streamlit UI)

    streamlit run app.py

All algorithms live in deadlock_core.py; this file only handles input,
display and session state.
"""
from copy import deepcopy

import pandas as pd
import streamlit as st

import scenarios as S
from deadlock_core import (
    DEADLOCK, DENIED_UNSAFE, GRANTED, INVALID, NO_DEADLOCK, NO_OP, POLICY_ALL, POLICY_NONE,
    POLICY_ORDER, SAFE, UNSAFE, WAIT, choose_victim, compute_need, detection_algorithm,
    find_cycle, parse_pid, parse_vector, pname, rag_dot, request_resources, safety_algorithm,
    simulate, terminate_process, validate_detection_state, validate_state, wait_for_graph,
)
from test_cases import run_all

st.set_page_config(page_title="Deadlock Dashboard", page_icon="🔒", layout="wide")

# ------------------------------------------------------------------ helpers
STATUS_STYLE = {
    SAFE: ("#2b8a3e", "✅"), GRANTED: ("#2b8a3e", "✅"), NO_DEADLOCK: ("#2b8a3e", "✅"),
    UNSAFE: ("#e67700", "⚠️"), DENIED_UNSAFE: ("#c92a2a", "⛔"),
    WAIT: ("#1971c2", "⏳"), INVALID: ("#6741d9", "🚫"), NO_OP: ("#495057", "➖"),
    DEADLOCK: ("#a61e4d", "💀"),
}


def badge(status: str, text: str = ""):
    color, icon = STATUS_STYLE.get(status, ("#495057", "•"))
    st.markdown(
        f"""<div style="border-left:6px solid {color};background:{color}1A;padding:10px 14px;
        border-radius:6px;margin:6px 0"><span style="color:{color};font-weight:700;font-size:1.05rem">
        {icon} {status}</span><br><span>{text}</span></div>""",
        unsafe_allow_html=True,
    )


def mat_df(mat, n, m, prefix="R"):
    return pd.DataFrame(mat, index=[pname(i) for i in range(n)], columns=[f"{prefix}{j}" for j in range(m)])


def vec_df(vec, m, label):
    return pd.DataFrame([vec], index=[label], columns=[f"R{j}" for j in range(m)])


def df_to_lists(df):
    """Convert an edited DataFrame to a list of int lists. Blank/non-integer cells
    are kept as their raw value so validate_state() can report them."""
    out = []
    for _, row in df.iterrows():
        r = []
        for v in row.tolist():
            if pd.isna(v):
                r.append(None)
            elif float(v).is_integer():
                r.append(int(v))
            else:
                r.append(v)
        out.append(r)
    return out


def resize(mat, n, m):
    mat = [row[:m] + [0] * max(0, m - len(row)) for row in mat[:n]]
    return mat + [[0] * m for _ in range(n - len(mat))]


def editor(df, key, disabled=False):
    return st.data_editor(df, key=key, disabled=disabled, width="stretch",
                          column_config={c: st.column_config.NumberColumn(c, step=1, format="%d") for c in df.columns})


def vec(v):
    return "[" + ", ".join(str(x) for x in v) + "]"


# ------------------------------------------------------------------ session state
ss = st.session_state
if "bank" not in ss:
    ss.bank = deepcopy(S.BASE_STATE)
    ss.bank_ver = 0
    ss.bank_history = []
    ss.req_result = None
if "det" not in ss:
    ss.det_model, d = S.DETECTION_PRESETS["D2 - multi-instance, confirmed deadlock"]
    ss.det = deepcopy(d)
    ss.det_ver = 0
    ss.det_log = []

st.title("🔒 Deadlock Analysis & Resource Allocation Dashboard")
st.caption("OS IA Activity 2: Prevention · Avoidance (Banker's) · Detection · Recovery")

legend = " ".join(
    f'<span style="background:{c}1A;color:{c};border:1px solid {c};border-radius:12px;padding:2px 9px;'
    f'margin-right:4px;font-size:0.8rem;font-weight:600">{i} {s}</span>'
    for s, (c, i) in STATUS_STYLE.items())
st.markdown(f"<div style='line-height:2'>{legend}</div>", unsafe_allow_html=True)

tab_c, tab_a, tab_d, tab_p, tab_t = st.tabs(
    ["📘 Concepts", "🛡️ Avoidance: Banker's", "🔍 Detection & Recovery", "🚧 Prevention", "🧪 Test Cases TC1–TC6"])

# ================================================================== CONCEPTS
with tab_c:
    st.header("Deadlock: four necessary conditions (Coffman)")
    st.markdown("""
A **deadlock** is a set of processes in which every process is blocked, waiting for a resource
that only another process in the set can release. It can only happen if **all four** hold at once:

| # | Condition | Meaning |
|---|-----------|---------|
| 1 | **Mutual exclusion** | at least one resource is non-sharable |
| 2 | **Hold and wait** | a process holds resources while waiting for more |
| 3 | **No preemption** | resources are released only voluntarily |
| 4 | **Circular wait** | P0 waits for P1, P1 waits for P2 … Pn waits for P0 |
""")
    st.header("Four handling strategies (each has its own tab)")
    c1, c2 = st.columns(2)
    with c1:
        st.subheader("🚧 Prevention")
        st.markdown("Design the policy so that **one condition can never hold**. Examples: number all resources "
                    "and acquire them only in increasing order (no circular wait), or request everything at "
                    "once (no hold-and-wait). *Cost:* low utilization, less concurrency.")
        st.subheader("🛡️ Avoidance (Banker's algorithm)")
        st.markdown("Processes declare their **Max** demand in advance. Before granting a request the OS "
                    "*pretends* to allocate and runs the **safety algorithm**; it grants only if the result is "
                    "**safe**. *Cost:* Max must be known; some safe-looking requests are refused.")
    with c2:
        st.subheader("🔍 Detection")
        st.markdown("Let deadlocks happen, then **find them**. Single-instance resources: look for a cycle in "
                    "the wait-for graph. Multiple instances: run the **detection algorithm** on the current "
                    "**Request** matrix.")
        st.subheader("♻️ Recovery")
        st.markdown("Break a detected deadlock: **terminate** one or more processes (or preempt their "
                    "resources) so their allocation returns to Available and the rest can continue.")

    st.header("Unsafe ≠ Deadlocked")
    c1, c2 = st.columns([1, 1])
    with c1:
        st.graphviz_chart("""
digraph { bgcolor=transparent; node[shape=box, style="rounded,filled", fontname=Helvetica]; edge[color="#868e96", fontcolor="#868e96"];
  all [label="All states", fillcolor="#e9ecef"];
  safe [label="SAFE\\n(a safe sequence exists:\\nno deadlock can occur)", fillcolor="#b2f2bb"];
  unsafe [label="UNSAFE\\n(no guaranteed order:\\ndeadlock POSSIBLE)", fillcolor="#ffd8a8"];
  dl [label="DEADLOCKED\\n(processes actually\\nblocked on each other)", fillcolor="#ffa8a8"];
  all -> safe; all -> unsafe; unsafe -> dl [label=" subset"];
}""")
    with c2:
        st.markdown("""
* **Safe**: there is *some* order in which every process can obtain its full Max and finish.
* **Unsafe**: there is no such *guaranteed* order **if every process asks for its full Max**.
  Processes might release resources early or never ask for their full Max, so the system can
  still run fine. Unsafe means deadlock *may* happen.
* **Deadlocked**: processes are **already blocked** on one another. Every deadlocked state is
  unsafe, but **not every unsafe state is deadlocked**.
""")

    st.header("Avoidance vs Detection")
    st.markdown("""
| | **Banker's (avoidance)** | **Detection algorithm** |
|---|---|---|
| When it runs | *before* granting each request | periodically, or when CPU utilisation drops |
| Uses | **Need = Max − Allocation** (future worst case) | **Request** (what is being waited for *now*) |
| Question answered | "If I grant this, can everyone still finish?" | "Are some processes stuck forever right now?" |
| Result | grant / wait / deny: keeps system **safe** | list of **deadlocked** processes → recovery |
| Detects existing deadlock? | **No** | **Yes** |
""")
    st.info("Single-instance resources: a cycle in the resource-allocation graph ⇔ deadlock. "
            "Multiple-instance resources: a cycle is **necessary but not sufficient**; use the detection algorithm.")

# ================================================================== AVOIDANCE
with tab_a:
    st.header("Deadlock Avoidance: Banker's Algorithm")
    with st.expander("⚙️ Configure system", expanded=True):
        c1, c2, c3, c4 = st.columns([3, 1, 1, 1])
        preset = c1.selectbox("Preset", list(S.PRESETS))
        if c1.button("Load preset", key="load_bank"):
            ss.bank = deepcopy(S.PRESETS[preset])
            ss.bank_ver += 1
            ss.req_result = None
            ss.bank_history = []
            st.rerun()
        n = c2.number_input("Processes (n)", 1, 10, len(ss.bank["allocation"]))
        m = c3.number_input("Resource types (m)", 1, 6, len(ss.bank["available"]))
        if c4.button("Apply size"):
            ss.bank = {"allocation": resize(ss.bank["allocation"], n, m),
                       "maximum": resize(ss.bank["maximum"], n, m),
                       "available": resize([ss.bank["available"]], 1, m)[0]}
            ss.bank_ver += 1
            st.rerun()

    n, m = len(ss.bank["allocation"]), len(ss.bank["available"])
    v = ss.bank_ver
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("**Allocation** (editable)")
        alloc_df = editor(mat_df(ss.bank["allocation"], n, m), f"alloc{v}")
    with c2:
        st.markdown("**Max** (editable)")
        max_df = editor(mat_df(ss.bank["maximum"], n, m), f"max{v}")
    with c3:
        st.markdown("**Available** (editable)")
        avail_df = editor(vec_df(ss.bank["available"], m, "Available"), f"avail{v}")

    allocation, maximum = df_to_lists(alloc_df), df_to_lists(max_df)
    available = df_to_lists(avail_df)[0]
    errors = validate_state(allocation, maximum, available)

    if errors:
        badge(INVALID, "The configured state is rejected; fix these before running the algorithm:")
        for e in errors:
            st.markdown(f"- {e}")
    else:
        need = compute_need(allocation, maximum)
        total = [available[j] + sum(allocation[i][j] for i in range(n)) for j in range(m)]
        with c3:
            st.markdown("**Total instances** (Allocation + Available)")
            st.dataframe(vec_df(total, m, "Total"), width="stretch")
        with c3:
            st.markdown("**Need = Max − Allocation** (auto)")
            st.dataframe(mat_df(need, n, m), width="stretch")
        zero_need = [pname(i) for i in range(n) if not any(need[i])]
        notes = []
        if not any(available):
            notes.append("Available is all zero: valid boundary case, still checked for safety.")
        if zero_need:
            notes.append(f"{', '.join(zero_need)} already hold their Max (Need = 0) and can finish immediately.")
        for nt in notes:
            st.caption("ℹ️ " + nt)

        st.subheader("1 · Safety algorithm")
        res = safety_algorithm(allocation, maximum, available)
        if res.safe:
            badge(SAFE, "Safe sequence: <b>⟨" + " → ".join(pname(i) for i in res.sequence) + "⟩</b>")
        else:
            badge(UNSAFE, f"No safe sequence. Stuck: {', '.join(pname(i) for i in res.unfinished)}. "
                          "This is <b>not</b> a deadlock: nobody is blocked yet; a deadlock is only possible.")
        rows = [{"Step": s["step"], "Pass": s["pass"], "Process": s["process"], "Need": vec(s["need"]),
                 "Work (before)": vec(s["work_before"]), "Need ≤ Work": "✔",
                 "+ Allocation released": vec(s["allocation_released"]), "Work (after)": vec(s["work_after"])}
                for s in res.steps]
        st.markdown(f"Initial **Work = Available = {vec(available)}**")
        if rows:
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        if not res.safe:
            st.markdown(f"Stopped with Work = {vec(res.final_work)}; no remaining process has Need ≤ Work: " +
                        ", ".join(f"{pname(i)} Need {vec(need[i])}" for i in res.unfinished))

        st.subheader("2 · Resource request")
        with st.form("req"):
            c1, c2, c3 = st.columns([1, 2, 1])
            pid_txt = c1.text_input("Process id", "P0", help="e.g. P0 … P{}".format(n - 1))
            req_txt = c2.text_input(f"Request vector ({m} integers, comma-separated)", ", ".join(["0"] * m))
            submitted = c3.form_submit_button("Submit request", width="stretch")
        if submitted:
            pid, perr = parse_pid(pid_txt, n)
            rq, verr = parse_vector(req_txt, m)
            if perr or verr:
                ss.req_result = {"status": INVALID, "message": perr or verr, "checks": [], "pid": pid_txt,
                                 "request": req_txt, "before": None}
            else:
                r = request_resources(allocation, maximum, available, pid, rq)
                ss.req_result = {"status": r.status, "message": r.message, "checks": r.checks, "pid": pname(pid),
                                 "request": vec(rq), "safety": r.safety, "trial_alloc": r.trial_allocation,
                                 "trial_avail": r.trial_available,
                                 "before": {"allocation": deepcopy(allocation), "available": list(available)}}
                if r.status == GRANTED:
                    ss.bank_history.append({"allocation": deepcopy(allocation), "maximum": deepcopy(maximum),
                                            "available": list(available)})
                    ss.bank = {"allocation": r.new_allocation, "maximum": deepcopy(maximum),
                               "available": r.new_available}
                    ss.bank_ver += 1
                else:
                    ss.bank = {"allocation": deepcopy(allocation), "maximum": deepcopy(maximum),
                               "available": list(available)}
            st.rerun()

        rr = ss.req_result
        if rr:
            st.markdown(f"**Last request:** {rr['pid']} requests {rr['request']}")
            badge(rr["status"], rr["message"])
            for c in rr["checks"]:
                st.code(c, language=None)
            if rr["status"] == DENIED_UNSAFE and rr.get("safety"):
                with st.expander("Trial (pretend) state that was rejected", expanded=True):
                    t1, t2 = st.columns(2)
                    t1.markdown("Trial Allocation")
                    t1.dataframe(mat_df(rr["trial_alloc"], n, m), width="stretch")
                    t2.markdown("Trial Need")
                    t2.dataframe(mat_df(compute_need(rr["trial_alloc"], maximum), n, m), width="stretch")
                    t2.markdown(f"Trial Available = **{vec(rr['trial_avail'])}**")
                    sres = rr["safety"]
                    if sres.steps:
                        st.dataframe(pd.DataFrame([{"Process": s["process"], "Work before": vec(s["work_before"]),
                                                    "Work after": vec(s["work_after"])} for s in sres.steps]),
                                     hide_index=True)
                    st.markdown(f"Safety algorithm finished only {len(sres.sequence)} of {n} processes; "
                                f"no complete safe sequence exists.")
            if rr["status"] in (WAIT, DENIED_UNSAFE, INVALID, NO_OP) and rr.get("before"):
                same = (rr["before"]["allocation"] == ss.bank["allocation"] and
                        rr["before"]["available"] == ss.bank["available"])
                st.success(f"State verification: Allocation and Available unchanged = **{same}** "
                           f"(Available still {vec(ss.bank['available'])}).")
            if rr["status"] == GRANTED:
                st.success(f"State committed. New Available = {vec(ss.bank['available'])}. Tables above are updated.")
        if ss.bank_history and st.button("↩️ Undo last granted request"):
            ss.bank = ss.bank_history.pop()
            ss.bank_ver += 1
            ss.req_result = None
            st.rerun()

# ================================================================== DETECTION
with tab_d:
    st.header("Deadlock Detection & Recovery")
    st.caption("Separate from Banker's: uses the **current Request matrix** (what each process is blocked on now), not Max.")
    c1, c2 = st.columns([3, 1])
    dp = c1.selectbox("Preset", list(S.DETECTION_PRESETS), index=1)
    if c2.button("Load preset", key="load_det"):
        ss.det_model, d = S.DETECTION_PRESETS[dp]
        ss.det = deepcopy(d)
        ss.det_ver += 1
        ss.det_log = []
        st.rerun()

    model = st.radio("Resource model", ["single", "multi"], horizontal=True,
                     index=0 if ss.det_model == "single" else 1,
                     format_func=lambda x: {"single": "Single-instance: each resource type has exactly 1 instance",
                                            "multi": "Multiple-instance: resource types may have several instances"}[x])
    ss.det_model = model
    dn, dm = len(ss.det["allocation"]), len(ss.det["available"])
    dv = ss.det_ver
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("**Allocation** (held now)")
        d_alloc = df_to_lists(editor(mat_df(ss.det["allocation"], dn, dm), f"dalloc{dv}"))
    with c2:
        st.markdown("**Request** (waiting for now)")
        d_req = df_to_lists(editor(mat_df(ss.det["request"], dn, dm), f"dreq{dv}"))
    with c3:
        st.markdown("**Available**")
        d_avail = df_to_lists(editor(vec_df(ss.det["available"], dm, "Available"), f"davail{dv}"))[0]

    derr = validate_detection_state(d_alloc, d_req, d_avail)
    if derr:
        badge(INVALID, "Fix the inputs:")
        for e in derr:
            st.markdown(f"- {e}")
    else:
        total = [d_avail[j] + sum(d_alloc[i][j] for i in range(dn)) for j in range(dm)]
        with c3:
            st.markdown("**Total instances**")
            st.dataframe(vec_df(total, dm, "Total"), width="stretch")
        model_ok = True
        if model == "single" and any(t > 1 for t in total):
            model_ok = False
            badge(INVALID, f"Totals {vec(total)}: some resource has more than one instance, so the single-instance "
                           "model does not apply. Switch to the multiple-instance model.")

        det = detection_algorithm(d_alloc, d_req, d_avail)
        wfg = wait_for_graph(d_alloc, d_req)
        cycle = find_cycle(wfg)

        g1, g2 = st.columns([3, 2])
        with g1:
            st.markdown("**Resource-allocation graph**: solid green R→P = assigned, dashed P→R = requested, "
                        "• = instance. Deadlocked processes in orange.")
            st.graphviz_chart(rag_dot(d_alloc, d_req, d_avail, set(det.deadlocked)))
        with g2:
            st.markdown("**Wait-for graph** (Pi → Pj: Pi waits for a resource Pj holds)")
            edges = [f"P{i} → P{j}" for i in wfg for j in sorted(wfg[i])]
            st.write(", ".join(edges) if edges else "no wait edges")
            if cycle:
                st.markdown("Cycle found: **" + " → ".join(pname(i) for i in cycle + [cycle[0]]) + "**")
            else:
                st.markdown("No cycle.")

        if model_ok:
            st.subheader("Result")
            if model == "single":
                st.caption("Single-instance model: method = **cycle detection in the wait-for graph** (conclusive).")
                if cycle:
                    badge(DEADLOCK, "Circular wait " + " → ".join(pname(i) for i in cycle + [cycle[0]]) +
                          ". Every resource has one instance, so a cycle is proof of deadlock.")
                else:
                    badge(NO_DEADLOCK, "No cycle in the wait-for graph.")
            else:
                st.caption("Multiple-instance model: method = **detection algorithm** (Work / Request). "
                           "A graph cycle alone is only a *potential* circular wait.")
                if det.deadlocked:
                    badge(DEADLOCK, "Deadlocked processes: <b>" + ", ".join(pname(i) for i in det.deadlocked) + "</b>")
                else:
                    msg = "All processes can eventually finish: order ⟨" + ", ".join(pname(i) for i in det.order) + "⟩"
                    if cycle:
                        msg += ("<br>Note: the graph <b>has a cycle</b>, yet there is no deadlock: other instances are "
                                "held by processes that are not waiting and will release them.")
                    badge(NO_DEADLOCK, msg)
            st.markdown(f"Detection algorithm trace (initial Work = Available = {vec(d_avail)}):")
            st.dataframe(pd.DataFrame([{"Process": s["process"], "Check": s["note"],
                                        "Work before": vec(s["work_before"]), "Work after": vec(s["work_after"])}
                                       for s in det.steps]), hide_index=True, width="stretch")

            st.subheader("♻️ Recovery: process termination")
            if det.deadlocked:
                auto = choose_victim(d_alloc, det.deadlocked)
                c1, c2 = st.columns([2, 1])
                victim = c1.selectbox(
                    "Victim to terminate", det.deadlocked, index=det.deadlocked.index(auto),
                    format_func=lambda i: f"{pname(i)}: holds {vec(d_alloc[i])}"
                                          + ("  (suggested: fewest resources held)" if i == auto else ""))
                if c2.button("Terminate & release", type="primary"):
                    na, nr, nav, rel = terminate_process(d_alloc, d_req, d_avail, victim)
                    after = detection_algorithm(na, nr, nav)
                    ss.det_log.append(f"Terminated **{pname(victim)}** → released {vec(rel)} → Available "
                                      f"{vec(d_avail)} + {vec(rel)} = **{vec(nav)}** → detection: "
                                      f"**{after.status}**" + (f" (still: {', '.join(pname(i) for i in after.deadlocked)})"
                                                               if after.deadlocked else
                                                               f"; remaining processes finish in order ⟨"
                                                               f"{', '.join(pname(i) for i in after.order)}⟩"))
                    ss.det = {"allocation": na, "request": nr, "available": nav}
                    ss.det_ver += 1
                    st.rerun()
            else:
                st.write("No deadlock, so no recovery is needed.")
            for line in ss.det_log:
                st.markdown("- " + line)

# ================================================================== PREVENTION
with tab_p:
    st.header("Deadlock Prevention: break one necessary condition")
    p = S.PREVENTION
    rn = p["resource_names"]
    st.markdown("Three **single-instance** devices. Each job locks its devices one at a time, then runs, then releases. "
                "Edit the acquisition order below (resource numbers, comma-separated).")
    cols = st.columns(len(p["programs"]))
    programs, burst, perr = {}, {}, []
    for k, (pid, lst) in enumerate(p["programs"].items()):
        with cols[k]:
            txt = st.text_input(f"P{pid} acquires", ", ".join(f"R{r}" for r in lst), key=f"prog{pid}")
            b = st.number_input(f"P{pid} run time (ticks)", 1, 10, p["burst"][pid], key=f"burst{pid}")
            try:
                rs = [int(x.strip().upper().lstrip("R")) for x in txt.split(",") if x.strip()]
                if not rs or any(r < 0 or r >= len(rn) for r in rs) or len(set(rs)) != len(rs):
                    raise ValueError
                programs[pid], burst[pid] = rs, int(b)
            except ValueError:
                perr.append(f"P{pid}: '{txt}' must list distinct resources among R0..R{len(rn) - 1}")
    st.caption("Resources: " + ", ".join(rn))
    if perr:
        badge(INVALID, "<br>".join(perr))
    else:
        results = {pol: simulate(programs, burst, pol, rn) for pol in (POLICY_NONE, POLICY_ORDER, POLICY_ALL)}
        cols = st.columns(3)
        broken = {POLICY_NONE: "none (all four conditions can hold)",
                  POLICY_ORDER: "Circular wait: all requests go to a higher-numbered resource",
                  POLICY_ALL: "Hold and wait: a waiting process holds nothing"}
        for col, (pol, r) in zip(cols, results.items()):
            with col:
                st.markdown(f"#### {pol.split(' (')[0]}")
                st.caption(f"Condition removed: {broken[pol]}")
                st.markdown("Acquire order: " + "; ".join(f"{k}: {'→'.join(x.split()[0] for x in v)}"
                                                          for k, v in r.acquire_lists.items()))
                if r.deadlocked:
                    badge(DEADLOCK, f"All remaining jobs blocked at tick {r.ticks}")
                else:
                    badge(NO_DEADLOCK, f"All jobs finished in {r.ticks} ticks")
                st.metric("Resource-ticks held while blocked (wasted)", r.held_idle)
                st.metric("Max jobs holding resources at once", r.max_concurrent)
                with st.expander("Tick-by-tick trace"):
                    st.dataframe(pd.DataFrame(r.trace), hide_index=True, width="stretch")
        st.subheader("Trade-offs")
        st.markdown("""
| Policy | Removes | Benefit | Cost |
|---|---|---|---|
| No prevention | – | max flexibility | deadlock possible (seen above) |
| Resource ordering | circular wait | simple, no runtime check | programs must lock in global order, often *earlier* than needed; blocked jobs still hold devices → **lower utilization** |
| All at once | hold & wait | a waiting job wastes nothing | must know all needs up front; devices are reserved for the whole run even if used briefly; jobs sharing any device run one after another → **reduced concurrency**, possible starvation of big jobs |
""")

# ================================================================== TEST CASES
with tab_t:
    st.header("Required Analytical Results Table")
    st.caption("Generated live by running test_cases.py against this dashboard's own functions.")
    rows = run_all()
    table = pd.DataFrame([{k: r[k] for k in ("Test Case", "System Condition", "Input", "Actual Result",
                                             "Expected Result", "Analysis / Conclusion")}
                          | {"Verdict": "PASS" if r["Pass"] else "FAIL"} for r in rows])
    st.dataframe(table, hide_index=True, width="stretch",
                 column_config={"Actual Result": st.column_config.TextColumn(width="large"),
                                "Analysis / Conclusion": st.column_config.TextColumn(width="large")})
    st.download_button("Download table (CSV)", table.to_csv(index=False), "test_results.csv", "text/csv")
    for r in rows:
        with st.expander(f"{r['Test Case']}: {r['System Condition']}: {'PASS' if r['Pass'] else 'FAIL'}"):
            st.markdown(f"**Actual:** {r['Actual Result']}")
            st.markdown(f"**Analysis:** {r['Analysis / Conclusion']}")
            tr = r["trace"]
            if isinstance(tr, dict):
                for pol, t in tr.items():
                    st.markdown(f"*{pol}*")
                    st.dataframe(pd.DataFrame(t), hide_index=True, width="stretch")
            elif tr and isinstance(tr[0], dict):
                st.dataframe(pd.DataFrame(tr).astype(str), hide_index=True, width="stretch")
            else:
                for line in tr:
                    st.code(line, language=None)
