"""
deadlock_core.py
----------------
Pure-Python logic for the Deadlock Analysis & Resource Allocation Dashboard.
No UI code lives here, so every function can be unit-tested and explained
on its own during the viva.

Sections
  1. Status labels           - the distinct states the dashboard reports
  2. Input validation        - invalid input vs. valid boundary cases
  3. AVOIDANCE  (Banker's)   - Need, safety algorithm, resource-request algorithm
  4. DETECTION               - multi-instance detection algorithm,
                               single-instance wait-for-graph cycle detection
  5. RECOVERY                - process termination and resource release
  6. PREVENTION              - simulator comparing allocation policies

Key idea (asked in the viva):
  * Banker's algorithm = AVOIDANCE. It uses MAX claims (future demand) and
    asks "if I grant this, can everyone still finish in SOME order?"
    It never looks at what processes are blocked on right now, so it does
    NOT detect an existing deadlock.
  * Detection algorithm = DETECTION. It uses the CURRENT outstanding
    REQUEST matrix (what processes are blocked on right now) and asks
    "can the current waiters ever be satisfied?"
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# 1. Status labels
# --------------------------------------------------------------------------
SAFE = "SAFE"                    # a complete safe sequence exists
UNSAFE = "UNSAFE"                # no safe sequence (NOT the same as deadlock)
GRANTED = "GRANTED"              # request allocated, new state is safe
WAIT = "WAIT / DEFERRED"         # request valid but > Available right now
DENIED_UNSAFE = "DENIED (UNSAFE)"  # request would lead to an unsafe state
INVALID = "INVALID INPUT"        # malformed / impossible input
NO_OP = "NO-OP (ZERO REQUEST)"   # all-zero request: valid but nothing to do
DEADLOCK = "DEADLOCK DETECTED"
NO_DEADLOCK = "NO DEADLOCK"


# --------------------------------------------------------------------------
# Small vector helpers (kept explicit so they are easy to explain)
# --------------------------------------------------------------------------
def leq(a: list[int], b: list[int]) -> bool:
    """Element-wise a <= b."""
    return all(x <= y for x, y in zip(a, b))


def add(a: list[int], b: list[int]) -> list[int]:
    return [x + y for x, y in zip(a, b)]


def sub(a: list[int], b: list[int]) -> list[int]:
    return [x - y for x, y in zip(a, b)]


def pname(i: int) -> str:
    return f"P{i}"


# --------------------------------------------------------------------------
# 2. Input validation
# --------------------------------------------------------------------------
def _is_int(x) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def validate_state(allocation, maximum, available) -> list[str]:
    """Return a list of error messages. Empty list => state is valid.

    Valid boundary cases that are NOT errors:
      * Available vector that is all zeros
      * a process whose Need is all zeros (Allocation == Max)
    """
    errors: list[str] = []
    n = len(allocation)
    if n == 0:
        return ["There must be at least one process."]
    if len(maximum) != n:
        errors.append(f"Max has {len(maximum)} rows but Allocation has {n}.")
        return errors
    m = len(available)
    if m == 0:
        return ["There must be at least one resource type."]

    for label, mat in (("Allocation", allocation), ("Max", maximum)):
        for i, row in enumerate(mat):
            if len(row) != m:
                errors.append(f"{label} row {pname(i)} has {len(row)} columns, expected {m}.")
                continue
            for j, v in enumerate(row):
                if not _is_int(v):
                    errors.append(f"{label}[{pname(i)}][R{j}] = {v!r} is not an integer.")
                elif v < 0:
                    errors.append(f"{label}[{pname(i)}][R{j}] = {v} is negative.")
    for j, v in enumerate(available):
        if not _is_int(v):
            errors.append(f"Available[R{j}] = {v!r} is not an integer.")
        elif v < 0:
            errors.append(f"Available[R{j}] = {v} is negative.")
    if errors:
        return errors

    for i in range(n):
        for j in range(m):
            if allocation[i][j] > maximum[i][j]:
                errors.append(
                    f"Allocation[{pname(i)}][R{j}] = {allocation[i][j]} exceeds declared "
                    f"Max = {maximum[i][j]} (a process cannot hold more than it declared)."
                )
    return errors


def parse_vector(text: str, m: int) -> tuple[list[int] | None, str | None]:
    """Parse '1, 0, 2' into [1, 0, 2]. Returns (vector, error)."""
    parts = [p.strip() for p in text.replace(";", ",").split(",") if p.strip() != ""]
    if len(parts) != m:
        return None, f"Expected {m} comma-separated values, got {len(parts)}."
    try:
        vec = [int(p) for p in parts]
    except ValueError:
        return None, f"All values must be integers: {text!r}."
    return vec, None


def parse_pid(text: str, n: int) -> tuple[int | None, str | None]:
    """Accept 'P2' or '2'. Returns (index, error)."""
    t = str(text).strip().upper()
    if t.startswith("P"):
        t = t[1:]
    try:
        idx = int(t)
    except ValueError:
        return None, f"'{text}' is not a valid process identifier (use P0..P{n - 1})."
    if not 0 <= idx < n:
        return None, f"Process P{idx} does not exist (valid: P0..P{n - 1})."
    return idx, None


# --------------------------------------------------------------------------
# 3. AVOIDANCE - Banker's algorithm
# --------------------------------------------------------------------------
def compute_need(allocation, maximum):
    """Need = Max - Allocation (computed automatically, never typed in)."""
    return [sub(mx, al) for al, mx in zip(allocation, maximum)]


@dataclass
class SafetyResult:
    safe: bool
    sequence: list[int]
    steps: list[dict]            # one row per process that finished
    unfinished: list[int]        # processes left when the algorithm stopped
    final_work: list[int]

    @property
    def status(self) -> str:
        return SAFE if self.safe else UNSAFE


def safety_algorithm(allocation, maximum, available) -> SafetyResult:
    """Banker's safety algorithm.

    Work = Available, Finish[i] = False
    repeat:
        find i with Finish[i] == False and Need[i] <= Work
        Work = Work + Allocation[i]; Finish[i] = True
    until no such i
    safe  <=> all Finish[i] are True

    We scan P0..Pn-1 repeatedly (passes). Inside a pass, every process that
    fits is finished in index order. The trace records the Work vector
    before and after each completion so the dashboard can display it.
    """
    need = compute_need(allocation, maximum)
    n = len(allocation)
    work = list(available)
    finish = [False] * n
    sequence: list[int] = []
    steps: list[dict] = []

    progress = True
    pass_no = 0
    while progress:
        progress = False
        pass_no += 1
        for i in range(n):
            if not finish[i] and leq(need[i], work):
                before = list(work)
                work = add(work, allocation[i])
                finish[i] = True
                sequence.append(i)
                steps.append({
                    "step": len(sequence),
                    "pass": pass_no,
                    "process": pname(i),
                    "need": list(need[i]),
                    "work_before": before,
                    "check": f"Need {need[i]} <= Work {before}",
                    "allocation_released": list(allocation[i]),
                    "work_after": list(work),
                })
                progress = True

    unfinished = [i for i in range(n) if not finish[i]]
    return SafetyResult(not unfinished, sequence, steps, unfinished, work)


@dataclass
class RequestResult:
    status: str
    message: str
    checks: list[str] = field(default_factory=list)
    safety: SafetyResult | None = None          # safety run on the *trial* state
    new_allocation: list[list[int]] | None = None
    new_available: list[int] | None = None
    trial_allocation: list[list[int]] | None = None
    trial_available: list[int] | None = None


def request_resources(allocation, maximum, available, pid, request) -> RequestResult:
    """Banker's resource-request algorithm.

    Order of checks (each produces a DIFFERENT status):
      0. validate inputs                         -> INVALID
      1. Request <= Need ?        no             -> INVALID (exceeds max claim)
      2. Request <= Available ?   no             -> WAIT / DEFERRED
      3. pretend to allocate, run safety algorithm
             unsafe                              -> DENIED (UNSAFE), state restored
             safe                                -> GRANTED, state committed

    The caller's matrices are NEVER mutated; the trial uses deep copies, so
    "restore the original state" is guaranteed by construction.
    """
    checks: list[str] = []
    errs = validate_state(allocation, maximum, available)
    if errs:
        return RequestResult(INVALID, "The current system state is invalid: " + " ".join(errs))

    n, m = len(allocation), len(available)
    if not _is_int(pid) or not 0 <= pid < n:
        return RequestResult(INVALID, f"Process identifier {pid!r} does not exist (valid: P0..P{n - 1}).")
    if len(request) != m or not all(_is_int(x) for x in request):
        return RequestResult(INVALID, f"Request must contain exactly {m} integers.")
    if any(x < 0 for x in request):
        return RequestResult(INVALID, f"Request {request} contains a negative value; requests must be >= 0.")
    if all(x == 0 for x in request):
        return RequestResult(NO_OP, f"{pname(pid)} requested nothing {request}; state unchanged.")

    need = compute_need(allocation, maximum)

    # Step 1: Request <= Need
    if not leq(request, need[pid]):
        checks.append(f"Step 1  Request {request} <= Need[{pname(pid)}] {need[pid]} ?  NO")
        return RequestResult(
            INVALID,
            f"{pname(pid)} asked for {request} but its remaining Need is only {need[pid]}. "
            "A process may not exceed its declared maximum claim, so this is an error, not a wait.",
            checks,
        )
    checks.append(f"Step 1  Request {request} <= Need[{pname(pid)}] {need[pid]} ?  YES")

    # Step 2: Request <= Available
    if not leq(request, available):
        short = [f"R{j}" for j in range(m) if request[j] > available[j]]
        checks.append(f"Step 2  Request {request} <= Available {available} ?  NO ({', '.join(short)} short)")
        return RequestResult(
            WAIT,
            f"Request is legal (within Need) but only {available} is free. {pname(pid)} must WAIT "
            "until other processes release resources. Nothing was allocated; state unchanged.",
            checks,
        )
    checks.append(f"Step 2  Request {request} <= Available {available} ?  YES")

    # Step 3: pretend to allocate on copies
    trial_alloc = deepcopy(allocation)
    trial_alloc[pid] = add(trial_alloc[pid], request)
    trial_avail = sub(available, request)
    trial_need_pid = sub(need[pid], request)
    checks.append(
        f"Step 3  Pretend: Available = {available} - {request} = {trial_avail}; "
        f"Allocation[{pname(pid)}] = {trial_alloc[pid]}; Need[{pname(pid)}] = {trial_need_pid}"
    )
    safety = safety_algorithm(trial_alloc, maximum, trial_avail)

    if safety.safe:
        seq = " -> ".join(pname(i) for i in safety.sequence)
        checks.append(f"Step 4  Safety check on trial state: SAFE  <{seq}>")
        return RequestResult(
            GRANTED,
            f"Request granted. The resulting state is safe with sequence <{seq}>.",
            checks, safety, trial_alloc, trial_avail, trial_alloc, trial_avail,
        )

    stuck = ", ".join(pname(i) for i in safety.unfinished)
    checks.append(f"Step 4  Safety check on trial state: UNSAFE (cannot finish: {stuck})")
    checks.append("Step 5  Roll back: original Allocation and Available restored.")
    return RequestResult(
        DENIED_UNSAFE,
        f"Granting would leave the system UNSAFE (no order lets {stuck} finish). "
        "Request denied and the original state is retained. Note: unsafe means deadlock is "
        "POSSIBLE, not that it has happened.",
        checks, safety, None, None, trial_alloc, trial_avail,
    )


# --------------------------------------------------------------------------
# 4. DETECTION
# --------------------------------------------------------------------------
@dataclass
class DetectionResult:
    deadlocked: list[int]
    order: list[int]
    steps: list[dict]

    @property
    def status(self) -> str:
        return DEADLOCK if self.deadlocked else NO_DEADLOCK


def validate_detection_state(allocation, request, available) -> list[str]:
    errors: list[str] = []
    n, m = len(allocation), len(available)
    if n == 0 or m == 0:
        return ["Need at least one process and one resource type."]
    if len(request) != n:
        return [f"Request has {len(request)} rows, Allocation has {n}."]
    for label, mat in (("Allocation", allocation), ("Request", request)):
        for i, row in enumerate(mat):
            if len(row) != m:
                errors.append(f"{label} row {pname(i)} has wrong length.")
                continue
            for j, v in enumerate(row):
                if not _is_int(v) or v < 0:
                    errors.append(f"{label}[{pname(i)}][R{j}] = {v!r} must be a non-negative integer.")
    for j, v in enumerate(available):
        if not _is_int(v) or v < 0:
            errors.append(f"Available[R{j}] = {v!r} must be a non-negative integer.")
    return errors


def detection_algorithm(allocation, request, available) -> DetectionResult:
    """Deadlock-detection algorithm for MULTIPLE-instance resources
    (Silberschatz, Sec. 8.7.2). Same shape as the safety algorithm, but:
      * uses the current outstanding Request matrix, not Need = Max - Alloc
      * a process holding nothing is trivially Finish = True
    Processes still unfinished at the end ARE deadlocked (definitive result
    under the assumption that a process that gets its request will finish
    and release everything).
    """
    n = len(allocation)
    work = list(available)
    finish = [all(x == 0 for x in allocation[i]) for i in range(n)]
    order: list[int] = []
    steps: list[dict] = []
    for i in range(n):
        if finish[i]:
            steps.append({"process": pname(i), "note": "holds nothing -> Finish = True",
                          "request": list(request[i]), "work_before": list(work), "work_after": list(work)})

    progress = True
    while progress:
        progress = False
        for i in range(n):
            if not finish[i] and leq(request[i], work):
                before = list(work)
                work = add(work, allocation[i])
                finish[i] = True
                order.append(i)
                steps.append({"process": pname(i), "note": f"Request {request[i]} <= Work {before}",
                              "request": list(request[i]), "work_before": before, "work_after": list(work)})
                progress = True
    return DetectionResult([i for i in range(n) if not finish[i]], order, steps)


def wait_for_graph(allocation, request) -> dict[int, set[int]]:
    """Build a wait-for graph: edge Pi -> Pj if Pi requests a resource that Pj holds.
    For SINGLE-instance resources a cycle here is necessary AND sufficient for deadlock."""
    n, m = len(allocation), len(allocation[0]) if allocation else 0
    g: dict[int, set[int]] = {i: set() for i in range(n)}
    for i in range(n):
        for j in range(m):
            if request[i][j] > 0:
                for k in range(n):
                    if k != i and allocation[k][j] > 0:
                        g[i].add(k)
    return g


def find_cycle(graph: dict[int, set[int]]) -> list[int] | None:
    """DFS cycle search. Returns the nodes of one cycle, or None."""
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {v: WHITE for v in graph}
    parent: dict[int, int] = {}

    def dfs(u):
        colour[u] = GREY
        for v in sorted(graph[u]):
            if colour[v] == GREY:            # back edge -> cycle
                cyc = [v]
                x = u
                while x != v:
                    cyc.append(x)
                    x = parent[x]
                return list(reversed(cyc))
            if colour[v] == WHITE:
                parent[v] = u
                found = dfs(v)
                if found:
                    return found
        colour[u] = BLACK
        return None

    for s in sorted(graph):
        if colour[s] == WHITE:
            c = dfs(s)
            if c:
                # rotate so the cycle starts at its smallest process id
                k = c.index(min(c))
                return c[k:] + c[:k]
    return None


def rag_dot(allocation, request, available, highlight: set[int] | None = None) -> str:
    """Graphviz DOT for the resource-allocation graph.
    Processes = circles, resources = boxes with one dot per instance.
    Assignment edge  R -> P (solid), request edge P -> R (dashed)."""
    highlight = highlight or set()
    n, m = len(allocation), len(available)
    total = [available[j] + sum(allocation[i][j] for i in range(n)) for j in range(m)]
    lines = ["digraph RAG {", "rankdir=LR; bgcolor=transparent;",
             'node [fontname="Helvetica", fontsize=12];', 'edge [fontname="Helvetica", fontsize=10, fontcolor="#868e96"];']
    for i in range(n):
        col = "#d9480f" if i in highlight else "#1c7ed6"
        lines.append(f'P{i} [shape=circle, style=filled, fillcolor="{col}", fontcolor=white];')
    for j in range(m):
        dots = "• " * total[j]
        lines.append(f'R{j} [shape=box, style="rounded,filled", fillcolor="#e9ecef", '
                     f'label="R{j}\\n{dots.strip()}"];')
    for i in range(n):
        for j in range(m):
            if allocation[i][j]:
                lab = f' label="{allocation[i][j]}"' if allocation[i][j] > 1 else ""
                lines.append(f'R{j} -> P{i} [color="#2b8a3e", penwidth=2{"," if lab else ""}{lab}];')
            if request[i][j]:
                col = "#d9480f" if i in highlight else "#868e96"
                lab = f' label="{request[i][j]}"' if request[i][j] > 1 else ""
                lines.append(f'P{i} -> R{j} [style=dashed, color="{col}"{"," if lab else ""}{lab}];')
    lines.append("}")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# 5. RECOVERY
# --------------------------------------------------------------------------
def terminate_process(allocation, request, available, victim: int):
    """Abort `victim`: its allocation goes back to Available, its row is zeroed.
    Returns (new_allocation, new_request, new_available, released_vector)."""
    alloc = deepcopy(allocation)
    req = deepcopy(request)
    released = list(alloc[victim])
    avail = add(available, released)
    alloc[victim] = [0] * len(available)
    req[victim] = [0] * len(available)
    return alloc, req, avail, released


def choose_victim(allocation, deadlocked: list[int]) -> int:
    """Victim-selection policy: among the deadlocked processes, abort the one
    holding the FEWEST total resource instances (least work lost); ties -> lowest id."""
    return min(deadlocked, key=lambda i: (sum(allocation[i]), i))


def auto_recover(allocation, request, available):
    """Abort one process at a time until the detection algorithm reports no deadlock.
    Returns (log, final_alloc, final_req, final_avail)."""
    log = []
    alloc, req, avail = deepcopy(allocation), deepcopy(request), list(available)
    while True:
        det = detection_algorithm(alloc, req, avail)
        if not det.deadlocked:
            break
        v = choose_victim(alloc, det.deadlocked)
        alloc, req, avail, released = terminate_process(alloc, req, avail, v)
        log.append({"terminated": pname(v), "released": released, "available_after": list(avail),
                    "deadlocked_before": [pname(i) for i in det.deadlocked]})
    return log, alloc, req, avail


# --------------------------------------------------------------------------
# 6. PREVENTION - discrete-time allocation simulator
# --------------------------------------------------------------------------
POLICY_NONE = "No prevention (acquire in program order, hold while waiting)"
POLICY_ORDER = "Resource ordering (break CIRCULAR WAIT)"
POLICY_ALL = "Request all at once (break HOLD-AND-WAIT)"


@dataclass
class SimResult:
    policy: str
    deadlocked: bool
    ticks: int
    trace: list[dict]
    finish_tick: dict[str, int]
    held_idle: int            # resource-ticks a resource was held but its owner was blocked
    max_concurrent: int       # max processes holding resources at the same time
    acquire_lists: dict[str, list[str]]


def simulate(programs: dict[int, list[int]], burst: dict[int, int], policy: str,
             resource_names: list[str], max_ticks: int = 100) -> SimResult:
    """Each process needs a list of SINGLE-instance resources and, once it owns
    all of them, runs for `burst` ticks, then releases everything.

    Each tick, processes are visited in id order:
      * POLICY_NONE  : acquire the next resource in the program's own order;
                       if busy, block while HOLDING what it has (hold-and-wait).
      * POLICY_ORDER : same, but the list is sorted by global resource number
                       R0 < R1 < R2 ... so a cycle of waits is impossible.
      * POLICY_ALL   : take ALL resources atomically in one tick, or none.
    If in some tick no unfinished process makes progress -> deadlock.
    """
    if policy == POLICY_ORDER:
        lists = {p: sorted(rs) for p, rs in programs.items()}
    else:
        lists = {p: list(rs) for p, rs in programs.items()}

    owner: dict[int, int | None] = {r: None for r in range(len(resource_names))}
    held: dict[int, list[int]] = {p: [] for p in programs}
    nxt = {p: 0 for p in programs}
    remaining = dict(burst)
    done: dict[int, int] = {}
    trace: list[dict] = []
    held_idle = 0
    max_conc = 0
    rn = resource_names

    for tick in range(1, max_ticks + 1):
        events = []
        progress = False
        for p in sorted(programs):
            if p in done:
                continue
            need = lists[p]
            if nxt[p] < len(need):                      # still acquiring
                if policy == POLICY_ALL:
                    if all(owner[r] is None for r in need):
                        for r in need:
                            owner[r] = p
                        held[p] = list(need)
                        nxt[p] = len(need)
                        events.append(f"P{p} gets ALL {{{', '.join(rn[r] for r in need)}}}")
                        progress = True
                    else:
                        busy = [rn[r] for r in need if owner[r] is not None]
                        events.append(f"P{p} waits (holds nothing; {', '.join(busy)} busy)")
                else:
                    r = need[nxt[p]]
                    if owner[r] is None:
                        owner[r] = p
                        held[p].append(r)
                        nxt[p] += 1
                        events.append(f"P{p} acquires {rn[r]}")
                        progress = True
                    else:
                        hold = ", ".join(rn[x] for x in held[p]) or "nothing"
                        events.append(f"P{p} BLOCKED on {rn[r]} (held by P{owner[r]}), holding {hold}")
                        held_idle += len(held[p])
            else:                                       # running
                remaining[p] -= 1
                progress = True
                if remaining[p] == 0:
                    for r in held[p]:
                        owner[r] = None
                    events.append(f"P{p} finishes, releases {', '.join(rn[r] for r in held[p])}")
                    held[p] = []
                    done[p] = tick
                else:
                    events.append(f"P{p} running ({remaining[p]} tick(s) left)")
        conc = sum(1 for p in programs if held[p])
        max_conc = max(max_conc, conc)
        trace.append({"tick": tick, "events": "; ".join(events),
                      "owners": ", ".join(f"{rn[r]}:{'P' + str(o) if o is not None else '-'}"
                                          for r, o in owner.items())})
        if len(done) == len(programs):
            return SimResult(policy, False, tick, trace, {pname(k): v for k, v in done.items()},
                             held_idle, max_conc, {pname(p): [rn[r] for r in l] for p, l in lists.items()})
        if not progress:
            trace[-1]["events"] += "  =>  NO PROCESS CAN PROCEED: DEADLOCK"
            return SimResult(policy, True, tick, trace, {pname(k): v for k, v in done.items()},
                             held_idle, max_conc, {pname(p): [rn[r] for r in l] for p, l in lists.items()})
    return SimResult(policy, True, max_ticks, trace, {pname(k): v for k, v in done.items()},
                     held_idle, max_conc, {pname(p): [rn[r] for r in l] for p, l in lists.items()})
