"""
scenarios.py - the group's own test data for Scenarios A-F.
Every number here was also traced by hand (see REPORT.md) before trusting
the program's output.
"""

# ---------------------------------------------------------------- Scenario A
# 5 processes, 3 resource types (R0, R1, R2). Total instances = (8, 5, 7).
BASE_STATE = {
    "allocation": [
        [1, 1, 0],   # P0
        [2, 0, 1],   # P1
        [1, 2, 1],   # P2
        [0, 1, 1],   # P3
        [2, 0, 2],   # P4
    ],
    "maximum": [
        [4, 3, 2],   # P0  Need 3 2 2
        [3, 1, 2],   # P1  Need 1 1 1
        [5, 2, 3],   # P2  Need 4 0 2
        [1, 2, 3],   # P3  Need 1 1 2
        [3, 2, 4],   # P4  Need 1 2 2
    ],
    "available": [2, 1, 2],
}

# ---------------------------------------------------------------- Scenario B
# Within Need (P0 Need = 3 2 2) but R1 asks 2 while only 1 is free -> WAIT.
REQUEST_WAIT = {"pid": 0, "request": [0, 2, 0]}

# A request that IS granted (useful for the demo contrast).
REQUEST_GRANT = {"pid": 1, "request": [1, 0, 1]}

# ---------------------------------------------------------------- Scenario C
# Within Need (P4 Need = 1 2 2) and within Available (2 1 2), but the trial
# state leaves Available = 1 0 1, and every process then needs R1 except P2,
# which needs 4 x R0 -> no safe sequence -> DENIED.
REQUEST_UNSAFE = {"pid": 4, "request": [1, 1, 1]}

# ---------------------------------------------------------------- Scenario D
# D1: SINGLE-instance resources (each R has exactly 1 instance).
# P0 holds R0 wants R1, P1 holds R1 wants R2, P2 holds R2 wants R0,
# P3 holds R3 and wants nothing.
DETECT_SINGLE = {
    "allocation": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
    "request":    [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
    "available":  [0, 0, 0, 0],
}

# D2: MULTIPLE-instance resources, totals (2, 2, 1, 1). Confirmed deadlock.
# P0..P3 wait on each other; P4 holds R3 (which nobody wants) and is not waiting,
# so P4 finishes but releasing R3 helps no one -> P0..P3 stay deadlocked.
# (First draft gave P4 an R2 instance instead: the detection algorithm showed
#  that releasing it unblocks the chain -> NOT a deadlock. Caught by testing.)
DETECT_MULTI_DEADLOCK = {
    "allocation": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [1, 1, 0, 0], [0, 0, 0, 1]],
    "request":    [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
    "available":  [0, 0, 0, 0],
}

# D3: MULTIPLE-instance, RAG has a cycle P0->R1->P1->R0->P0 but NO deadlock,
# because P2 and P3 hold the other instances and are not waiting.
DETECT_MULTI_CYCLE_NO_DEADLOCK = {
    "allocation": [[1, 0], [0, 1], [1, 0], [0, 1]],
    "request":    [[0, 1], [1, 0], [0, 0], [0, 0]],
    "available":  [0, 0],
}

# ---------------------------------------------------------------- Scenario E
# Three single-instance devices and three jobs that lock two devices each.
PREVENTION = {
    "resource_names": ["R0 Printer", "R1 Scanner", "R2 Disk"],
    "programs": {0: [0, 1], 1: [1, 2], 2: [2, 0]},   # P2 locks Disk THEN Printer
    "burst": {0: 2, 1: 2, 2: 2},
}

# ---------------------------------------------------------------- Scenario F
ZERO_AVAILABLE_STATE = {          # boundary: Available = 0, P1 already has its max
    "allocation": [[1, 0, 1], [1, 1, 0], [0, 1, 1]],
    "maximum":    [[2, 1, 1], [1, 1, 0], [1, 1, 2]],
    "available":  [0, 0, 0],
}
ALLOC_EXCEEDS_MAX_STATE = {       # invalid: P1 holds 3 x R0 but declared Max 2
    "allocation": [[0, 1, 0], [3, 0, 0], [3, 0, 2]],
    "maximum":    [[7, 5, 3], [2, 2, 2], [9, 0, 2]],
    "available":  [3, 3, 2],
}

PRESETS = {
    "Scenario A - safe state (group's own data)": BASE_STATE,
    "Scenario F - zero Available boundary": ZERO_AVAILABLE_STATE,
    "Scenario F - Allocation exceeds Max (invalid)": ALLOC_EXCEEDS_MAX_STATE,
}

DETECTION_PRESETS = {
    "D1 - single-instance, circular wait (deadlock)": ("single", DETECT_SINGLE),
    "D2 - multi-instance, confirmed deadlock": ("multi", DETECT_MULTI_DEADLOCK),
    "D3 - multi-instance, cycle but NO deadlock": ("multi", DETECT_MULTI_CYCLE_NO_DEADLOCK),
}
