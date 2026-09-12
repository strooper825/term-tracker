# Test fixtures

Recorded upstream payloads used by ingestion tests. CI never calls a live API.

Rules (see docs/PLAN.md, section 11):

- One directory per source (`congress_gov/`, `senate_votes/`, `legislators/`), added together with
  that source's ingestion code.
- Fixtures are trimmed real responses. Include nothing that is not public: no API keys, no request
  headers, no personal data beyond what the public source itself publishes.
