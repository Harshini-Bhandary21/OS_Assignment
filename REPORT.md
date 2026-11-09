# OS IA Assignment Activity 2: Deadlock Analysis & Resource Allocation Dashboard

**Group members:** _(fill in names / roll numbers)_
**Platform:** HTML + CSS + vanilla JavaScript dashboard (`web/index.html`, no install needed). Python 3 reference implementation with unit tests (`deadlock_core.py`), plus an optional Streamlit version (`app.py`).

---

## 1. How to run

**Dashboard:** open `deadlock_dashboard/web/index.html` in a browser. It has five pages: Concepts, Avoidance (Banker's), Detection & Recovery, Prevention, and Test Cases.

**Verification tooling:**
```bash
cd deadlock_dashboard
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py                 # dashboard opens at http://localhost:8501
python test_cases.py                 # prints TC1–TC6 with full traces
python -m unittest -v test_core.py   # 19 unit tests (expected values computed by hand)
python web/test/verify_js.py         # JS port == Python on 17 checks (needs node)
```

| File | Purpose |
|---|---|
| `deadlock_core.py` | All algorithms: validation, Need, safety algorithm, request algorithm (avoidance), detection algorithm + wait-for-graph cycle search (detection), process termination (recovery), allocation-policy simulator (prevention) |
| `app.py` | Streamlit UI: 5 tabs (Concepts, Avoidance, Detection & Recovery, Prevention, Test Cases) |
| `scenarios.py` | The group's own test data for Scenarios A–F |
| `test_cases.py` | Runs TC1–TC6 and produces the results table (same code feeds the dashboard's Test Cases tab) |
| `test_core.py` | Unit tests with hand-computed expected values |

### Dashboard features vs. minimum requirements

| Requirement | Where |
|---|---|
| Configure n, m, Allocation, Max, Available | Avoidance tab → "Configure system" + editable tables |
| Need = Max − Allocation computed automatically | Avoidance tab, read-only "Need" table |
| Safety algorithm with Work-vector updates and safe sequence | Avoidance tab → "1 · Safety algorithm" step table |
| Request validation, grant / wait / deny with state restoration | Avoidance tab → "2 · Resource request" (shows Steps 1–5 and verifies state unchanged) |
| Distinct status messages | Colour-coded badges: SAFE, UNSAFE, GRANTED, WAIT/DEFERRED, DENIED (UNSAFE), INVALID INPUT, NO-OP, DEADLOCK DETECTED, NO DEADLOCK |
| Separate avoidance / detection / prevention-recovery views | Separate tabs; detection uses the Request matrix, never Max |
| Single vs multiple-instance model stated | Detection tab radio button; single-instance model refuses data with >1 instance |
| Recovery demonstration | Detection tab → "Terminate & release" (victim = fewest resources held, or user choice) |
| Explanation of concepts / unsafe ≠ deadlock | Concepts tab, plus inline notes on UNSAFE results |

---

## 2. Status semantics used by the dashboard

| Situation | Status | Why |
|---|---|---|
| Request ≤ Need, ≤ Available, trial state safe | **GRANTED** | Banker's guarantees everyone can still finish |
| Request ≤ Need but > Available | **WAIT / DEFERRED** | Legal request; resources simply not free *now*. Not invalid, not permanently denied |
| Request ≤ Need, ≤ Available, trial state unsafe | **DENIED (UNSAFE)** | Granting could lead to deadlock; original state retained |
| Request > Need, negative, wrong length, bad PID, Allocation > Max, negative Available | **INVALID INPUT** | Violates the model's rules |
| Request = 0 vector | **NO-OP** | Valid but nothing to allocate |
| No safe sequence for a configured state | **UNSAFE** | Deadlock *possible*, not confirmed |
| Detection algorithm leaves processes unfinished / single-instance cycle | **DEADLOCK DETECTED** | Processes are actually blocked forever |

---

## 3. Analytical evaluation (hand-worked, then checked against the dashboard)

### Scenario A: Safe state (TC1)

5 processes, 3 resource types. Total instances = (8, 5, 7).

| Process | Allocation | Max | **Need = Max − Alloc** |
|---|---|---|---|
| P0 | 1 1 0 | 4 3 2 | **3 2 2** |
| P1 | 2 0 1 | 3 1 2 | **1 1 1** |
| P2 | 1 2 1 | 5 2 3 | **4 0 2** |
| P3 | 0 1 1 | 1 2 3 | **1 1 2** |
| P4 | 2 0 2 | 3 2 4 | **1 2 2** |

Available = (2, 1, 2). Safety algorithm (scan P0→P4 repeatedly):

| Step | Process | Need ≤ Work? | Work before | + Allocation | Work after |
|---|---|---|---|---|---|
| – | P0 | 3 2 2 ≤ 2 1 2? **No** | 2 1 2 | – | – |
| 1 | P1 | 1 1 1 ≤ 2 1 2 ✔ | 2 1 2 | 2 0 1 | **4 1 3** |
| 2 | P2 | 4 0 2 ≤ 4 1 3 ✔ | 4 1 3 | 1 2 1 | **5 3 4** |
| 3 | P3 | 1 1 2 ≤ 5 3 4 ✔ | 5 3 4 | 0 1 1 | **5 4 5** |
| 4 | P4 | 1 2 2 ≤ 5 4 5 ✔ | 5 4 5 | 2 0 2 | **7 4 7** |
| 5 | P0 | 3 2 2 ≤ 7 4 7 ✔ | 7 4 7 | 1 1 0 | **8 5 7** |

**Safe sequence: ⟨P1, P2, P3, P4, P0⟩.** Final Work = (8, 5, 7) = total instances, as expected.
**Why safe:** there is an order in which each process, even if it asks for its full remaining Need, finds enough free resources, finishes and returns its allocation. P1 is the only process that can start (its Need ≤ Available); every later completion enlarges Work.

### Scenario B: Request exceeds Available (TC2)

P0 requests (0, 2, 0).
- Step 1: (0,2,0) ≤ Need[P0] = (3,2,2) ✔ → a **legal** request.
- Step 2: (0,2,0) ≤ Available = (2,1,2)? **No**: R1 needs 2, only 1 free.

→ **WAIT / DEFERRED.** P0 must wait until another process (e.g. P2 or P3, which hold R1) releases resources. Nothing is allocated; the dashboard verifies Allocation and Available are unchanged (Available still (2,1,2)). It is not invalid and not permanently denied.

### Scenario C: Request produces an unsafe state (TC3)

P4 requests (1, 1, 1).
- Step 1: (1,1,1) ≤ Need[P4] = (1,2,2) ✔
- Step 2: (1,1,1) ≤ Available = (2,1,2) ✔
- Step 3 (pretend): Available = (1,0,1); Allocation[P4] = (3,1,3); Need[P4] = (0,1,1)
- Step 4 (safety on trial state), Work = (1,0,1):
  - P0 needs (3,2,2): R1 short. P1 (1,1,1): R1 short. P2 (4,0,2): R0 short (needs 4, has 1). P3 (1,1,2): R1 short. P4 (0,1,1): R1 short.
  - **No process can even start → no safe sequence.**
- Step 5: **DENIED (UNSAFE)**; original Allocation and Available restored (the algorithm works on copies).

**Why unsafe ≠ deadlocked:** in the trial state no process is actually blocked; the "unsafe" verdict assumes the worst case where every process immediately demands its full Max. In reality P4 might finish using only what it has, or others might release resources first, so deadlock is *possible*, not certain. Banker's refuses to take that risk.

*(Contrast for the demo: P1 requesting (1,0,1) is **GRANTED**. New Available = (1,1,1), safe sequence ⟨P1, P2, P3, P4, P0⟩.)*

### Scenario D: Deadlock detection and recovery (TC4)

**D1: single-instance resources** (R0..R3, one instance each)

| | Holds | Waiting for |
|---|---|---|
| P0 | R0 | R1 |
| P1 | R1 | R2 |
| P2 | R2 | R0 |
| P3 | R3 | – |

Wait-for graph: P0→P1, P1→P2, P2→P0. **Cycle P0→P1→P2→P0.** With one instance per resource, a cycle is necessary *and sufficient*, so **deadlock confirmed** for P0, P1, P2. P3 is not involved.

**D2: multiple-instance resources** (totals R0=2, R1=2, R2=1, R3=1), detection algorithm:

| | Allocation | Request |
|---|---|---|
| P0 | 1 0 0 0 | 0 1 0 0 |
| P1 | 0 1 0 0 | 0 0 1 0 |
| P2 | 0 0 1 0 | 1 0 0 0 |
| P3 | 1 1 0 0 | 0 0 1 0 |
| P4 | 0 0 0 1 | 0 0 0 0 |

Available = (0,0,0,0). Work = (0,0,0,0): only P4 (Request 0) can finish → Work = (0,0,0,1). Nobody wants R3, so P0..P3 still cannot proceed. **Deadlocked: P0, P1, P2, P3.**

**Recovery:** victim policy = terminate the deadlocked process holding the fewest instances (ties → lowest id) → **terminate P0**, which releases (1,0,0,0). Available = (1,0,0,0) → P2's request for R0 is satisfied → P2 finishes, releases R2 → P1 and P3 get R2 in turn → all finish. Detection now reports **NO DEADLOCK** (order ⟨P2, P3, P4, P1⟩ in the dashboard).

**D3: potential circular wait vs. confirmed deadlock** (multiple instances: R0=2, R1=2)

P0 holds R0 and wants R1; P1 holds R1 and wants R0; P2 holds the other R0; P3 holds the other R1; P2 and P3 want nothing.
The RAG has a cycle P0→R1→P1→R0→P0, but the detection algorithm finishes P2, P3 (releasing one R0 and one R1), then P0 and P1 → **NO DEADLOCK**. With multiple instances a cycle is only a *potential* circular wait; only the detection algorithm (or a knot / no-free-instance argument) confirms deadlock.

### Scenario E: Deadlock prevention (TC5)

Three single-instance devices: R0 Printer, R1 Scanner, R2 Disk. Each job locks two devices one per tick, runs 2 ticks, then releases both.
Original programs: P0: R0→R1, P1: R1→R2, P2: **R2→R0**.

| Policy | Condition removed | Result (dashboard) | Wasted resource-ticks* |
|---|---|---|---|
| No prevention | – | **DEADLOCK at tick 2**: P0 holds Printer wants Scanner, P1 holds Scanner wants Disk, P2 holds Disk wants Printer | – |
| Resource ordering (always R0<R1<R2) | **Circular wait** (P2 becomes R0→R2) | Completes in **10 ticks** | 3 (P0 sits on the Printer while blocked on the Scanner) |
| All-at-once | **Hold and wait** | Completes in **7 ticks** | 0 (a waiting job holds nothing) |

\* resource-ticks during which a resource was held by a blocked process.

**Trade-offs:**
- *Ordering:* no runtime check needed, but programs must lock in the global order, often earlier than they need the device, and blocked jobs keep holding devices (lower utilization). In our run P0 held the Printer for 3 ticks without using it.
- *All-at-once:* no waste while waiting, but each job must know all its needs up front and reserves every device for its whole run, even if a device is used only briefly. Jobs that share any device can never overlap (reduced concurrency), and a job needing many popular devices may starve. In this small example it happened to finish sooner; with longer jobs that use a device only briefly, holding it for the whole run lowers utilization.

### Scenario F: Boundary and invalid inputs (TC6)

Boundary state: Allocation P0 (1,0,1), P1 (1,1,0), P2 (0,1,1); Max P0 (2,1,1), P1 (1,1,0), P2 (1,1,2); **Available (0,0,0)**.

| Input | Valid? | Dashboard result | Explanation |
|---|---|---|---|
| Available = (0,0,0) | **Valid boundary** | SAFE ⟨P1, P0, P2⟩ | P1 has Need (0,0,0), so it finishes with nothing free and releases (1,1,0); then P0 and P2 can finish |
| P1 (Need 0) requests (1,0,0) | Invalid | INVALID INPUT | Exceeds remaining Need, so the process would exceed its declared Max |
| P0 requests (1,0,0) with Available 0 | Valid | WAIT / DEFERRED | Within Need; simply nothing free right now |
| Process "P9" (n = 5) | Invalid | INVALID INPUT "Process P9 does not exist (valid: P0..P4)" | Bad identifier |
| Request (−1,0,0) | Invalid | INVALID INPUT "contains a negative value" | Requests must be ≥ 0 |
| Allocation[P1][R0] = 3 > Max 2 | Invalid | INVALID INPUT; safety algorithm not run | A process cannot hold more than its declared maximum |
| Request (0,0,0) | Valid boundary | NO-OP | Nothing to allocate, state unchanged |
| Blank / non-integer cell, wrong vector length | Invalid | INVALID INPUT with cell location | Input validation |

---

## 4. Required Analytical Results Table

Actual results are copied from `python test_cases.py` and the dashboard's **Test Cases** tab.

| Test Case | System Condition | Actual Result | Expected Result | Analysis / Conclusion |
|---|---|---|---|---|
| TC1 | Safe state | SAFE; sequence ⟨P1, P2, P3, P4, P0⟩; Work 2 1 2 → 4 1 3 → 5 3 4 → 5 4 5 → 7 4 7 → 8 5 7 | Safe sequence found | Only P1's Need fits the initial Available; each completion releases its allocation until P0 fits last. All five can finish, so the state is safe. ✔ |
| TC2 | Request exceeds Available | P0 requests (0,2,0) → WAIT / DEFERRED; Allocation unchanged; Available still (2,1,2) | Request not granted immediately | Request ≤ Need (legal), but R1 has only 1 free. P0 must wait for a release. Not invalid, not permanently denied. ✔ |
| TC3 | Request makes state unsafe | P4 requests (1,1,1) → DENIED (UNSAFE); trial Available (1,0,1); no process can finish; original state restored = True | Request denied; state unchanged | Passes the Need and Available checks, but in the trial state every process needs R1 (0 free) or 4×R0. No safe sequence, so the request is rolled back. Unsafe means deadlock is possible, not that it has occurred. ✔ |
| TC4 | Deadlocked scenario | D1 (single-instance): cycle ⟨P0,P1,P2⟩ → DEADLOCK. D2 (multi-instance): DEADLOCK, P0–P3; terminate P0 releases (1,0,0,0) → NO DEADLOCK. D3: cycle ⟨P0,P1⟩ but NO DEADLOCK | Deadlock identified by the selected detection method | Single-instance: a cycle proves deadlock. Multi-instance: the detection algorithm is required; D3 shows that a cycle alone is not proof. Aborting the cheapest victim breaks the deadlock. ✔ |
| TC5 | Prevention policy applied | No prevention: DEADLOCK at tick 2. Resource ordering: completed in 10 ticks. All-at-once: completed in 7 ticks | Selected deadlock condition eliminated | Ordering removes circular wait; all-at-once removes hold-and-wait. Costs: idle held resources (ordering), and reduced concurrency plus up-front knowledge of needs (all-at-once). ✔ |
| TC6 | Boundary and invalid inputs | Available 0 → SAFE ⟨P1,P0,P2⟩; zero-Need P1 requests → INVALID; P0 request with Available 0 → WAIT; P9 → INVALID; (−1,0,0) → INVALID; Alloc > Max → INVALID | Correct handling or validation message | Boundary cases are accepted and analysed; truly invalid inputs are rejected with a message and no state change. An unavailable request is WAIT, not INVALID. ✔ |

All 6 test cases PASS, and all 19 unit tests in `test_core.py` pass.

---

## 5. AI Usage Record

> ⚠️ **Group to complete:** the rows below record how AI was used to build this version. Before submitting, add the tools *you* used (e.g. ChatGPT/Gemini for concept questions, Canva for slides). In the Student Verification column, record checks that **you** carried out yourselves: redo at least the TC1 and TC3 hand traces on paper.

| AI Tool Used | Purpose | Output Generated | Student Verification |
|---|---|---|---|
| Claude (Claude Code) | Dashboard design | Streamlit app layout: five tabs, colour-coded status badges, editable matrices, RAG drawing | Ran the dashboard; checked every scenario preset in each tab; confirmed WAIT, DENIED, UNSAFE, INVALID and DEADLOCK show different messages; fixed dark-mode graph label colour after visual check |
| Claude (Claude Code) | Algorithm/code assistance | `deadlock_core.py`: safety, request, detection, cycle detection, termination, prevention simulator | Hand-traced Scenarios A–F (Section 3) and compared each Work vector and sequence with the dashboard output; confirmed the request algorithm never mutates the input (state restoration) |
| Claude (Claude Code) | Dashboard design (HTML/CSS/JS version) | `web/`: sidebar layout, light/dark theme, animated step-through of the safety algorithm, request pipeline, SVG resource-allocation graph, Gantt charts for prevention | Cross-checked the JS algorithms against the Python version (`web/test/verify_js.py`: 17/17 match); clicked through every scenario in Chrome; checked mobile layout |
| Claude (Claude Code) | Test-case generation or debugging | `scenarios.py`, `test_cases.py`, `test_core.py` (hand-computed expected values) | Testing caught an error in the first draft of D2: P4 held an R2 instance and wanted nothing, so the detection algorithm correctly reported NO deadlock (P4's release unblocked the chain). The data was corrected (P4 holds R3 instead) and re-verified by hand. This shows why AI output must be tested |

---

## 6. Six-minute demonstration plan

| Time | Show | Say |
|---|---|---|
| 0:00–0:45 | Concepts tab | Four conditions; four strategies; unsafe ⊃ deadlocked diagram; avoidance vs detection table |
| 0:45–2:00 | Avoidance tab, Scenario A | Need computed automatically; walk the Work table; safe sequence ⟨P1,P2,P3,P4,P0⟩ |
| 2:00–2:40 | Request P0 (0,2,0) | **WAIT**: legal but not available; state unchanged |
| 2:40–3:30 | Request P4 (1,1,1) | **DENIED (UNSAFE)**: trial state, no process can start, rollback; unsafe ≠ deadlock |
| 3:30–4:45 | Detection tab D2, then D3 | Multi-instance → detection algorithm; P0–P3 deadlocked; terminate P0 → resolved. D3: cycle but no deadlock |
| 4:45–5:30 | Prevention tab | No prevention deadlocks at tick 2; ordering / all-at-once finish; trade-off metrics |
| 5:30–6:00 | Test Cases tab | All TC1–TC6 pass from live runs |

**Key viva line:** *Banker's algorithm checks whether granting a request keeps the system in a safe state, using Max. It cannot detect an existing deadlock. Detection uses the current Request matrix to find processes that are already blocked forever. In the dashboard these are two separate tabs and two separate functions (`request_resources` and `detection_algorithm`).*

### Likely viva questions

- *Why is a request > Need invalid but a request > Available only WAIT?* Need is the process's declared limit, so exceeding it breaks the contract. Available is just the current situation and will change.
- *Why can the safe sequence differ between correct implementations?* Any order that lets everyone finish is valid. We scan P0→Pn−1 repeatedly, which gives ⟨P1,P2,P3,P4,P0⟩.
- *Why does the detection algorithm mark a process holding nothing as finished?* It cannot be part of a wait cycle, because nobody waits on it.
- *Why the fewest-resources victim?* It is the cheapest abort (least work lost). Other policies: lowest priority, least CPU time used, fewest processes to abort.
- *Small change to try live:* resubmit P0 (0,2,0) after editing Available, and the same request gets all three outcomes:
  Available (2,1,2) → **WAIT**; (2,2,2) → **DENIED (UNSAFE)** (trial Available (2,0,2) leaves R1 at 0, which every other process needs); (3,2,2) → **GRANTED**.
  (Verified with the code. Our first guess was that (2,2,2) would be granted, which was wrong. Always run the safety check.)

---

## 7. Screenshots (to add)

Take screenshots of the running dashboard for each scenario (A safety table; B WAIT; C DENIED with trial state; D2 before and after termination; D3; E comparison; F invalid-input badge; Test Cases table) and paste them here before submitting.
