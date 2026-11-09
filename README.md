# Deadlock Analysis & Resource Allocation Dashboard

## Main dashboard (HTML / CSS / JavaScript): no install needed
Open **`web/index.html`** in any modern browser (double-click it).

| File | Purpose |
|---|---|
| `web/js/core.js` | All algorithms: Banker's safety + request, detection, wait-for cycle, recovery, prevention simulator |
| `web/js/scenarios.js` | The group's test data (Scenarios A–F) |
| `web/js/testcases.js` | TC1–TC6, rendered live on the *Test Cases* page |
| `web/js/app.js` | UI only (rendering, events) |
| `web/css/styles.css` | Styling, light/dark theme |

## Python reference implementation + tests
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m unittest -v test_core.py    # 19 unit tests (hand-computed expected values)
python test_cases.py                  # TC1–TC6 with traces
python web/test/verify_js.py          # checks the JS port gives identical results to Python (needs node)
streamlit run app.py                  # optional: Streamlit version of the dashboard
```

See **REPORT.md** for the analysis, completed results table, AI Usage Record and demo plan.
