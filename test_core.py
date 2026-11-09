"""
Unit tests. Expected values were computed BY HAND (see REPORT.md, section 3)
and are hard-coded here, so the tests check the code against our own
reasoning instead of against itself.

    python -m unittest -v test_core.py
"""
import unittest

import scenarios as S
from deadlock_core import (
    DEADLOCK, DENIED_UNSAFE, GRANTED, INVALID, NO_DEADLOCK, NO_OP, POLICY_ALL, POLICY_NONE,
    POLICY_ORDER, WAIT, auto_recover, compute_need, detection_algorithm, find_cycle, parse_pid,
    parse_vector, request_resources, safety_algorithm, simulate, validate_state, wait_for_graph,
)

A = S.BASE_STATE


class TestBankers(unittest.TestCase):
    def test_need_matrix(self):
        self.assertEqual(compute_need(A["allocation"], A["maximum"]),
                         [[3, 2, 2], [1, 1, 1], [4, 0, 2], [1, 1, 2], [1, 2, 2]])

    def test_tc1_safe_sequence_and_work(self):
        r = safety_algorithm(A["allocation"], A["maximum"], A["available"])
        self.assertTrue(r.safe)
        self.assertEqual(r.sequence, [1, 2, 3, 4, 0])
        self.assertEqual([s["work_after"] for s in r.steps],
                         [[4, 1, 3], [5, 3, 4], [5, 4, 5], [7, 4, 7], [8, 5, 7]])

    def test_granted_request(self):
        r = request_resources(A["allocation"], A["maximum"], A["available"], 1, [1, 0, 1])
        self.assertEqual(r.status, GRANTED)
        self.assertEqual(r.new_available, [1, 1, 1])
        self.assertEqual(r.new_allocation[1], [3, 0, 2])

    def test_tc2_wait(self):
        alloc_before = [row[:] for row in A["allocation"]]
        r = request_resources(A["allocation"], A["maximum"], A["available"], 0, [0, 2, 0])
        self.assertEqual(r.status, WAIT)
        self.assertEqual(A["allocation"], alloc_before)
        self.assertEqual(A["available"], [2, 1, 2])

    def test_tc3_unsafe_denied_and_restored(self):
        alloc_before = [row[:] for row in A["allocation"]]
        r = request_resources(A["allocation"], A["maximum"], A["available"], 4, [1, 1, 1])
        self.assertEqual(r.status, DENIED_UNSAFE)
        self.assertEqual(r.trial_available, [1, 0, 1])
        self.assertEqual(r.safety.sequence, [])          # not even one process can start
        self.assertIsNone(r.new_allocation)
        self.assertEqual(A["allocation"], alloc_before)
        self.assertEqual(A["available"], [2, 1, 2])

    def test_request_beyond_need_is_invalid_not_wait(self):
        r = request_resources(A["allocation"], A["maximum"], A["available"], 1, [2, 0, 0])
        self.assertEqual(r.status, INVALID)


class TestDetectionRecovery(unittest.TestCase):
    def test_single_instance_cycle(self):
        d = S.DETECT_SINGLE
        self.assertEqual(find_cycle(wait_for_graph(d["allocation"], d["request"])), [0, 1, 2])
        self.assertEqual(detection_algorithm(d["allocation"], d["request"], d["available"]).deadlocked, [0, 1, 2])

    def test_multi_instance_deadlock(self):
        d = S.DETECT_MULTI_DEADLOCK
        r = detection_algorithm(d["allocation"], d["request"], d["available"])
        self.assertEqual(r.status, DEADLOCK)
        self.assertEqual(r.deadlocked, [0, 1, 2, 3])

    def test_cycle_without_deadlock(self):
        d = S.DETECT_MULTI_CYCLE_NO_DEADLOCK
        self.assertIsNotNone(find_cycle(wait_for_graph(d["allocation"], d["request"])))
        self.assertEqual(detection_algorithm(d["allocation"], d["request"], d["available"]).status, NO_DEADLOCK)

    def test_recovery(self):
        d = S.DETECT_MULTI_DEADLOCK
        log, alloc, req, avail = auto_recover(d["allocation"], d["request"], d["available"])
        self.assertEqual([e["terminated"] for e in log], ["P0"])
        self.assertEqual(log[0]["released"], [1, 0, 0, 0])
        self.assertEqual(detection_algorithm(alloc, req, avail).status, NO_DEADLOCK)


class TestPrevention(unittest.TestCase):
    def test_policies(self):
        p = S.PREVENTION
        self.assertTrue(simulate(p["programs"], p["burst"], POLICY_NONE, p["resource_names"]).deadlocked)
        self.assertFalse(simulate(p["programs"], p["burst"], POLICY_ORDER, p["resource_names"]).deadlocked)
        self.assertFalse(simulate(p["programs"], p["burst"], POLICY_ALL, p["resource_names"]).deadlocked)


class TestBoundaryInvalid(unittest.TestCase):
    def test_zero_available_is_valid_and_safe(self):
        z = S.ZERO_AVAILABLE_STATE
        self.assertEqual(validate_state(z["allocation"], z["maximum"], z["available"]), [])
        self.assertEqual(safety_algorithm(z["allocation"], z["maximum"], z["available"]).sequence, [1, 0, 2])

    def test_zero_need_process_requesting(self):
        z = S.ZERO_AVAILABLE_STATE
        self.assertEqual(request_resources(z["allocation"], z["maximum"], z["available"], 1, [1, 0, 0]).status, INVALID)

    def test_zero_request_is_noop(self):
        self.assertEqual(request_resources(A["allocation"], A["maximum"], A["available"], 0, [0, 0, 0]).status, NO_OP)

    def test_invalid_pid(self):
        self.assertIsNotNone(parse_pid("P9", 5)[1])
        self.assertIsNotNone(parse_pid("abc", 5)[1])
        self.assertEqual(parse_pid("p3", 5), (3, None))

    def test_negative_request(self):
        vec, err = parse_vector("-1,0,0", 3)
        self.assertIsNone(err)
        self.assertEqual(request_resources(A["allocation"], A["maximum"], A["available"], 0, vec).status, INVALID)

    def test_bad_vector_text(self):
        self.assertIsNotNone(parse_vector("1,2", 3)[1])
        self.assertIsNotNone(parse_vector("1,x,2", 3)[1])

    def test_alloc_exceeds_max(self):
        a = S.ALLOC_EXCEEDS_MAX_STATE
        self.assertTrue(validate_state(a["allocation"], a["maximum"], a["available"]))

    def test_negative_available(self):
        self.assertTrue(validate_state(A["allocation"], A["maximum"], [2, -1, 2]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
