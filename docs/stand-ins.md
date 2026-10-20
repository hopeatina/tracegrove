# Stand-ins for third parties

Most agents and apps succeed or fail at the edges: the calendar webhook, the CRM, the payment API, the n8n or Make scenario that does the real booking. A stand-in replaces one of those services with a small recording server on loopback, so a flow can:

- check exactly what your app sent (the booking, the callback request, the transfer), with a separate read that does not trust your app's own reply;
- make the service fail, answer slowly or hang up, and check that your app tells the truth to the caller and recovers.

Stand-ins run only when tracegrove starts your app (`adapter: node`, `fastapi`, `django` or `command`). Each attempt gets fresh stand-ins, so calls never leak between flows.

## Declare them

```yaml
# tracegrove.config.yaml
standIns:
  automation:                # the n8n workflow that puts bookings on the calendar
    env: AUTOMATION_URL      # tracegrove sets this to the stand-in's URL when it starts your app
    respond:
      POST /webhook/book-appointment: { status: 200, json: { eventId: evt_1 } }
      POST /webhook/callback-request: 202
  phone:
    env: PHONE_URL
    respond:
      POST /calls/transfer: { status: 200, json: { transferred: true } }
```

Your app must read the service's base URL from the named variable. Routes use `METHOD /path`; `/{id}` matches one segment and `/*` matches the rest. An undeclared route answers 404 with `stand_in_route_not_declared`, so a call you didn't expect shows up as a failure instead of passing quietly.

## Read back what the app sent

```yaml
  - name: the calendar automation got one booking
    standin: automation
    received: POST /webhook/book-appointment
    expect:
      calls: 1
      json:
        "calls[0].json.pet": Biscuit
        "calls[0].json.phone": 555-0142
```

The readback sees `{ count, calls: [{ method, path, query, json, text, status, faulted, at }] }`. `calls:` means exactly that many matching calls. `json`, `present` and `absent` take the same dotted paths as other steps; put a key that contains `[` in quotes. Leave out `received:` to count every call to the stand-in, such as `expect: { calls: 0 }` to prove nothing reached the calendar.

The readback waits up to the step's timeout for the calls to arrive, so background work can finish. A failed readback prints what the stand-in did receive:

```
✗ the calendar automation got one booking  STANDIN automation POST /webhook/book-appointment
    expected 1 call, got 2
    automation POST /webhook/book-appointment received 2 calls
      1. POST /webhook/book-appointment {"pet":"Biscuit",…} -> 200
      2. POST /webhook/book-appointment {"pet":"Biscuit",…} -> 200
```

## Make it fail

```yaml
  - name: the automation is down
    standin: automation
    fail: { route: POST /webhook/book-appointment, status: 503, times: 5 }
```

A fault applies to the next `times` matching calls, then the declared answer comes back. Use `status` for an error response, `delayMs` for a slow answer, or `drop: true` to close the connection without answering. Faulted calls are recorded with `faulted: true`; a dropped call has `status: 0`.

Arm the fault before the step that triggers the calls. The [vet receptionist example](../src/samples/vet-receptionist) uses one fault to prove a single retry books the caller (`automation-hiccup`) and another to prove that, when the automation stays down, the agent never claims the booking and asks the front desk for a callback (`automation-down`):

```bash
npx tracegrove try vet-receptionist
npx tracegrove try vet-receptionist --bug ignore_automation_errors
npx tracegrove try vet-receptionist --bug double_book
```

## What it proves and what it doesn't

A passing stand-in check proves your app sent those requests, with those bodies, in that run, and how it behaved when the service failed in the way you declared. It does not prove the real service accepts that payload, or that its real failures look like yours. Pair stand-in flows with a few flows against the real sandbox (an n8n test workflow, a Stripe test key) in a staging [environment](environments.md).
