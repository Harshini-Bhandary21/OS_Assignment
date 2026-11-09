"""
test_cases.py - runs TC1..TC6 against the dashboard's own core functions and
returns the rows of the "Required Analytical Results Table".

    python test_cases.py          # prints the table + full traces
The dashboard's "Test Cases" tab calls run_all() too, so the table in the
report and the table on screen come from the same code.
"""

from deadlock_core import (
    DEADLOCK, DENIED_UNSAFE, INVALID, NO_DEADLOCK, POLICY_ALL, POLICY_NONE, POLICY_ORDER,
    SAFE, WAIT, auto_recover, compute_need, detection_algorithm, find_cycle, parse_pid,
    parse_vector, pname, request_resources, safety_algorithm, simulate, validate_state,
    wait_for_graph,
)
import scenarios as S


def seq_str(seq):
    return "<" + ", ".join(pname(i) for i in seq) + ">"


def tc1():
    st = S.BASE_STATE
    r = safety_algorithm(st["allocation"], st["maximum"], st["available"])
    actual = f"{r.status}; sequence {seq_str(r.sequence)}; final Work {r.final_work}"
    return {
        "Test Case": "TC1", "System Condition": "Safe state",
        "Input": f"Scenario A: 5 processes, 3 types, Available {st['available']}",
        "Actual Result": actual, "Expected Result": "Safe sequence found",
        "Pass": r.safe,
        "Analysis / Conclusion": (
            f"Need = Max - Allocation. Only P1 (Need [1,1,1]) fits Work [2,1,2] first; each finishing "
            f"process returns its Allocation, growing Work until P0 (Need [3,2,2]) fits last. "
            f"All 5 can finish in order {seq_str(r.sequence)}, so the state is SAFE."),
        "trace": r.steps,
    }


def tc2():
    st, rq = S.BASE_STATE, S.REQUEST_WAIT
    r = request_resources(st["allocation"], st["maximum"], st["available"], rq["pid"], rq["request"])
    unchanged = r.new_allocation is None  # function never mutates input
    return {
        "Test Case": "TC2", "System Condition": "Request exceeds Available",
        "Input": f"{pname(rq['pid'])} requests {rq['request']} (Need [3,2,2], Available [2,1,2])",
        "Actual Result": f"{r.status}; Allocation unchanged = {unchanged}; Available still {st['available']}",
        "Expected Result": "Request not granted immediately",
        "Pass": r.status == WAIT and unchanged,
        "Analysis / Conclusion": (
            "Request <= Need, so it is a legal request (not invalid). But R1 asks 2 and only 1 is free, so "
            "it cannot be satisfied now: P0 must wait until another process releases R1. Not permanently "
            "denied - once P1/P3 finish, R1 becomes available."),
        "trace": r.checks,
    }


def tc3():
    st, rq = S.BASE_STATE, S.REQUEST_UNSAFE
    before = [row[:] for row in st["allocation"]], st["available"][:]
    r = request_resources(st["allocation"], st["maximum"], st["available"], rq["pid"], rq["request"])
    restored = (st["allocation"], st["available"]) == before
    stuck = ", ".join(pname(i) for i in r.safety.unfinished) if r.safety else "-"
    return {
        "Test Case": "TC3", "System Condition": "Request makes state unsafe",
        "Input": f"{pname(rq['pid'])} requests {rq['request']} (Need [1,2,2], Available [2,1,2])",
        "Actual Result": f"{r.status}; trial Available {r.trial_available}; no process can finish "
                         f"({stuck}); original state restored = {restored}",
        "Expected Result": "Request denied; state unchanged",
        "Pass": r.status == DENIED_UNSAFE and restored,
        "Analysis / Conclusion": (
            "Request passes both Need and Available checks. After pretending to allocate, Available = [1,0,1]: "
            "P0,P1,P3,P4 all still need R1 (0 free) and P2 needs 4xR0 (1 free), so the safety algorithm "
            "finds no first process -> UNSAFE -> denied and rolled back. The state is unsafe, NOT deadlocked: "
            "no one is actually blocked yet, and processes might release resources before asking for their "
            "full Max, so deadlock is possible but not certain."),
        "trace": r.checks,
    }


def tc4():
    d1 = S.DETECT_SINGLE
    cyc = find_cycle(wait_for_graph(d1["allocation"], d1["request"]))
    d2 = S.DETECT_MULTI_DEADLOCK
    det = detection_algorithm(d2["allocation"], d2["request"], d2["available"])
    log, *_ = auto_recover(d2["allocation"], d2["request"], d2["available"])
    d3 = S.DETECT_MULTI_CYCLE_NO_DEADLOCK
    cyc3 = find_cycle(wait_for_graph(d3["allocation"], d3["request"]))
    det3 = detection_algorithm(d3["allocation"], d3["request"], d3["available"])
    rec = "; ".join(f"terminate {e['terminated']} releases {e['released']} -> Available {e['available_after']}"
                    for e in log)
    actual = (f"D1 single-instance: wait-for cycle {seq_str(cyc) if cyc else 'none'} -> {DEADLOCK}. "
              f"D2 multi-instance: {det.status}, deadlocked {seq_str(det.deadlocked)}; recovery: {rec}; "
              f"then {NO_DEADLOCK}. "
              f"D3 multi-instance: cycle {seq_str(cyc3) if cyc3 else 'none'} but detection = {det3.status}")
    return {
        "Test Case": "TC4", "System Condition": "Deadlocked scenario",
        "Input": "D1 (single-instance), D2 and D3 (multiple-instance)",
        "Actual Result": actual,
        "Expected Result": "Deadlock identified by the selected detection method",
        "Pass": bool(cyc) and det.status == DEADLOCK and det3.status == NO_DEADLOCK and len(log) >= 1,
        "Analysis / Conclusion": (
            "D1 uses single-instance resources, so a cycle in the wait-for graph is proof of deadlock. "
            "D2 uses multiple instances, so we use the detection algorithm (Work/Request), which reports "
            "P0-P3 deadlocked (P4 requests nothing and finishes, but the R3 it releases is wanted by no one).D3 shows a RAG cycle "
            "that is NOT a deadlock because other instances are held by non-waiting processes. Recovery: "
            "aborting the cheapest victim releases its resources and lets the rest finish."),
        "trace": det.steps,
    }


def tc5():
    p = S.PREVENTION
    rows = []
    res = {}
    for pol in (POLICY_NONE, POLICY_ORDER, POLICY_ALL):
        r = simulate(p["programs"], p["burst"], pol, p["resource_names"])
        res[pol] = r
        rows.append(f"{pol.split(' (')[0]}: {'DEADLOCK at tick ' + str(r.ticks) if r.deadlocked else 'completed in ' + str(r.ticks) + ' ticks'}")
    ok = res[POLICY_NONE].deadlocked and not res[POLICY_ORDER].deadlocked and not res[POLICY_ALL].deadlocked
    return {
        "Test Case": "TC5", "System Condition": "Prevention policy applied",
        "Input": "P0:{R0,R1}  P1:{R1,R2}  P2:{R2 then R0}, single-instance",
        "Actual Result": " | ".join(rows),
        "Expected Result": "Selected deadlock condition eliminated",
        "Pass": ok,
        "Analysis / Conclusion": (
            "Original: every process grabs its first device and waits for the next -> circular wait "
            "P0->P1->P2->P0. Resource ordering forces P2 to take R0 before R2, so all waits point to a "
            "higher-numbered resource and no cycle can form (circular wait removed). All-at-once removes "
            "hold-and-wait: a waiting process holds nothing. Trade-offs: ordering makes processes lock "
            "devices earlier than needed and blocked processes still hold resources (lower utilization); "
            "all-at-once serialises jobs that share any device and risks starvation (reduced concurrency)."),
        "trace": {k: v.trace for k, v in res.items()},
    }


def tc6():
    out = []
    ok = True

    z = S.ZERO_AVAILABLE_STATE
    r = safety_algorithm(z["allocation"], z["maximum"], z["available"])
    out.append(f"(a) Available [0,0,0]: valid boundary, {r.status} {seq_str(r.sequence)}")
    ok &= r.safe and r.sequence[0] == 1

    need_p1 = compute_need(z["allocation"], z["maximum"])[1]
    r = request_resources(z["allocation"], z["maximum"], z["available"], 1, [1, 0, 0])
    out.append(f"(b) P1 Need {need_p1} requests [1,0,0]: {r.status}")
    ok &= r.status == INVALID

    r = request_resources(z["allocation"], z["maximum"], z["available"], 0, [1, 0, 0])
    out.append(f"(c) P0 requests [1,0,0] with Available 0: {r.status}")
    ok &= r.status == WAIT

    _, err = parse_pid("P9", 5)
    r = request_resources(S.BASE_STATE["allocation"], S.BASE_STATE["maximum"], S.BASE_STATE["available"], 9, [1, 0, 0])
    out.append(f"(d) process P9: {r.status}")
    ok &= err is not None and r.status == INVALID

    vec, _ = parse_vector("-1, 0, 0", 3)
    r = request_resources(S.BASE_STATE["allocation"], S.BASE_STATE["maximum"], S.BASE_STATE["available"], 0, vec)
    out.append(f"(e) negative request [-1,0,0]: {r.status}")
    ok &= r.status == INVALID

    a = S.ALLOC_EXCEEDS_MAX_STATE
    errs = validate_state(a["allocation"], a["maximum"], a["available"])
    out.append(f"(f) Allocation[P1][R0]=3 > Max 2: {INVALID if errs else 'accepted'}")
    ok &= bool(errs)

    return {
        "Test Case": "TC6", "System Condition": "Boundary and invalid inputs",
        "Input": "zero Available, zero Need, P9, negative request, Allocation > Max",
        "Actual Result": "; ".join(out),
        "Expected Result": "Correct handling or validation message",
        "Pass": ok,
        "Analysis / Conclusion": (
            "Valid boundaries: Available = 0 is still SAFE because P1 has Need 0 and can finish and release; "
            "a request over Available is WAIT, not invalid. Invalid: asking beyond remaining Need (P1 already "
            "at its Max), a non-existent process id, a negative request, and Allocation > Max are rejected "
            "with a validation message and no state change."),
        "trace": out,
    }


def run_all():
    return [tc1(), tc2(), tc3(), tc4(), tc5(), tc6()]


if __name__ == "__main__":
    for row in run_all():
        print("=" * 100)
        print(f"{row['Test Case']}  {row['System Condition']}  ->  {'PASS' if row['Pass'] else 'FAIL'}")
        print(f"  Input   : {row['Input']}")
        print(f"  Actual  : {row['Actual Result']}")
        print(f"  Expected: {row['Expected Result']}")
        tr = row["trace"]
        if isinstance(tr, dict):
            for pol, t in tr.items():
                print(f"  -- {pol}")
                for s in t:
                    print(f"     t{s['tick']:>2}: {s['events']}")
        else:
            for s in tr:
                print(f"     {s}")
