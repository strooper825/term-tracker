# Test fixtures

Recorded upstream payloads used by ingestion tests. CI never calls a live API.

Rules (see docs/PLAN.md, section 11):

- One directory per source (`congress_gov/`, `votes/`, `legislators/`, `fec/`, `statements/`, `house_ptr/`), added
  together with that source's ingestion code.
- Fixtures are trimmed real responses. Include nothing that is not public: no API keys, no request
  headers, no personal data beyond what the public source itself publishes. The OpenFEC fixtures
  additionally drop the contact fields the pipeline never reads (committee and candidate
  addresses, phones, emails, custodian and treasurer details beyond the treasurer name).
- `statements/` holds three live press feeds (Sanders and Slotkin page 1, Jeffries page 53) recorded
  2026-09-19 and cut to two or three whole items each, with `content:encoded` trimmed to a short
  prefix; `empty_channel.xml` is hand-written. Jeffries's page 53 is used because it holds the one
  untitled item the loader must skip. The releases are public statements by the members' offices.
- `house_ptr/` holds four real House Clerk PDFs (public filings), and builds the filing index in code
  (`index_archive`, hand-written rows; it is not a recording). `electronic_2_pages.pdf` is report
  20033945 (GA-12, four rows, spouse and self owners) and `electronic_3_pages_partial_sales.pdf` is
  20034201 (MO-4, nine rows over two pages, every one a partial sale, a long description under each);
  both were downloaded 2026-09-20 and are kept whole. `scanned_1_page.pdf` is page 4 of paper filing
  9116328 cut to that page (a CCITT image, no text layer; the form all 20 of Ro Khanna's 2025-2026
  reports use), and `text_without_transactions.pdf` is page 3 of 20034201 alone (a text layer and a
  table header with only detail lines, which the reader must refuse). No fixture invents a filing for
  a real member: the built-mart index holds only filers who are not tracked, so a correct loader
  ignores every row.
