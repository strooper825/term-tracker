# Test fixtures

Recorded upstream payloads used by ingestion tests. CI never calls a live API.

Rules (see docs/PLAN.md, section 11):

- One directory per source (`congress_gov/`, `votes/`, `legislators/`, `fec/`), added together with
  that source's ingestion code.
- Fixtures are trimmed real responses. Include nothing that is not public: no API keys, no request
  headers, no personal data beyond what the public source itself publishes. The OpenFEC fixtures
  additionally drop the contact fields the pipeline never reads (committee and candidate
  addresses, phones, emails, custodian and treasurer details beyond the treasurer name).
