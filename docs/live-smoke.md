# Live smoke — Pitch First Slot

Operator-only. `bash scripts/live-smoke.sh` is not called from the offline
test gate or GitHub Actions. It never registers a webhook, mutates a Waffo
store, or requires a live payment to verify the fixture path.

## Mode

This offline smoke accepts only one explicit mode:

- `fixture` runs the no-network walk against a locally started process and a
  temporary SQLite database.

The application still supports `waffo-test` and `waffo-prod` for separately
authorized deployment verification, but `scripts/live-smoke.sh` refuses those
modes. Never point this mutating offline walk at an existing or deployed
process.

Missing, invalid, or legacy selector variables make the script fail closed
before it creates a workdir or starts a process; they never select the fixture
implicitly.

## How to run

```bash
WAFFO_MODE=fixture bash scripts/live-smoke.sh
```

The script refuses CI environments, starts the local fixture process with a
temporary database, walks the SPEC acceptance rows, and reports `PASS`,
`PASS-ERROR`, `BLOCKED-SECRET`, or `FAIL`. A fixture checkout must never be
presented as a live hosted checkout, and an unpaid checkout must never rank.

Live Waffo checkout and webhook verification are deployment-bound follow-up
work. They require an explicitly authorized stable HTTPS endpoint and signed
test event at `POST /api/webhooks/waffo`; this repository does not call the
provider or register endpoints.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Expected product validation error; nothing invented. |
| `BLOCKED-SECRET` | Required deployment configuration is absent. |
| `FAIL` | Broken product, unsafe redirect, or invented listing/count. |

The offline fixture walk must remain deterministic and network-free. Keep
provider credentials out of logs and never seed fake companies, bids, or click
counts on an empty week.
