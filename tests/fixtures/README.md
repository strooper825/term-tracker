# Test fixtures

Recorded upstream payloads used by ingestion tests. CI never calls a live API.

Rules (see docs/PLAN.md, section 11):

- One directory per source (`congress_gov/`, `votes/`, `legislators/`, `fec/`, `statements/`), added
  together with that source's ingestion code.
- Fixtures are trimmed real responses. Include nothing that is not public: no API keys, no request
  headers, no personal data beyond what the public source itself publishes. The OpenFEC fixtures
  additionally drop the contact fields the pipeline never reads (committee and candidate
  addresses, phones, emails, custodian and treasurer details beyond the treasurer name).
- `statements/` holds three live press feeds (Sanders and Slotkin page 1, Jeffries page 53) recorded
  2026-09-19 and cut to two or three whole items each, with `content:encoded` trimmed to a short
  prefix; `empty_channel.xml` is hand-written. Jeffries's page 53 is used because it holds the one
  untitled item the loader must skip. The releases are public statements by the members' offices.
