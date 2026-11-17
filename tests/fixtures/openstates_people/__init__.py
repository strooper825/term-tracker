"""Invented openstates/people data for the States section (ADR 0035), built in memory.

Every name is invented. The people are placed in real districts from dbt/seeds/state_districts.csv
so the mart joins as it does on live data. What the fixture sets up:

* a governor for every state in the seed: Republican, except California (Democratic) and Puerto
  Rico (Partido Nuevo Progresista);
* California: 30 of 40 senators and 41 of 80 assembly members Democratic, the rest Republican
  -> a Democratic supermajority, a Democratic majority, and Democratic control;
* Nebraska: 49 nonpartisan senators -> a nonpartisan legislature;
* Puerto Rico: 15 of 28 senators and 27 of 53 representatives in the PNP, the rest in the PPD
  -> PNP majorities and PNP control (I), not lumped with the PPD;
* Alaska: 11 Republican and 9 Democratic senators -> a coalition from the override seed;
* one California senator whose role ended in 2025 (not seated) and one Nebraska senator with no
  start date (seated);
* every other state: a Republican governor and no legislators -> every seat vacant, no
  majority, divided.
"""

from __future__ import annotations

import csv
import io
import json
import tarfile
import uuid
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]
SHA = "f" * 40
START = "2025-01-06"


def _id(*parts: str) -> str:
    return f"ocd-person/{uuid.uuid5(uuid.NAMESPACE_URL, '/'.join(parts))}"


def _jurisdiction(state: str) -> str:
    kind = {"DC": "district", "PR": "territory"}.get(state, "state")
    return f"ocd-jurisdiction/country:us/{kind}:{state.lower()}/government"


def _districts() -> dict[tuple[str, str], list[tuple[str, int]]]:
    out: dict[tuple[str, str], list[tuple[str, int]]] = {}
    with (ROOT / "dbt" / "seeds" / "state_districts.csv").open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            out.setdefault((row["state"], row["chamber"]), []).append(
                (row["district"], int(row["seats"]))
            )
    return out


def _states() -> list[str]:
    with (ROOT / "dbt" / "seeds" / "state_chambers.csv").open(encoding="utf-8") as handle:
        return sorted({row["state"] for row in csv.DictReader(handle)})


def _person(state: str, folder: str, n: str, party: str, roles: list[dict[str, Any]]) -> dict:
    return {
        "id": _id(state, folder, n),
        "name": f"Invented {state} {folder} {n}",
        "given_name": "Invented",
        "family_name": f"{state}{n}",
        "party": [{"name": party}],
        "roles": roles,
        "links": [{"url": f"https://legislature.example/{state.lower()}/{n}"}],
    }


def _seat(state: str, chamber: str, parties: list[str], districts: dict) -> list[dict]:
    """One person per party in ``parties``, filling the chamber's districts seat by seat."""
    seats = [d for d, n in districts[(state, chamber)] for _ in range(n)]
    people = []
    for i, party in enumerate(parties):
        role = {
            "type": chamber,
            "district": seats[i],
            "jurisdiction": _jurisdiction(state),
            "start_date": START,
        }
        people.append(_person(state, chamber, str(i), party, [role]))
    return people


def people() -> list[tuple[str, str, dict]]:
    """(state, folder, person) for every fixture person."""
    districts = _districts()
    out: list[tuple[str, str, dict]] = []
    for state in _states():
        party = {"CA": "Democratic", "PR": "Partido Nuevo Progresista"}.get(state, "Republican")
        governor = _person(
            state,
            "executive",
            "gov",
            party,
            [
                {
                    "type": "governor",
                    "jurisdiction": _jurisdiction(state),
                    "start_date": "2023-01-02",
                }
            ],
        )
        out.append((state, "executive", governor))

    def add(state: str, chamber: str, parties: list[str]) -> None:
        out.extend((state, "legislature", p) for p in _seat(state, chamber, parties, districts))

    add("CA", "upper", ["Democratic"] * 30 + ["Republican"] * 10)
    add("CA", "lower", ["Democratic"] * 41 + ["Republican"] * 39)
    add("NE", "legislature", ["Nonpartisan"] * 49)
    add("PR", "upper", ["Partido Nuevo Progresista"] * 15 + ["Partido Popular Democrático"] * 13)
    add("PR", "lower", ["Partido Nuevo Progresista"] * 27 + ["Partido Popular Democrático"] * 26)
    add("AK", "upper", ["Republican"] * 11 + ["Democratic"] * 9)

    # A former California senator: role ended in 2025, kept by the loader, never seated.
    out.append(
        (
            "CA",
            "retired",
            _person(
                "CA",
                "retired",
                "former",
                "Republican",
                [
                    {
                        "type": "upper",
                        "district": "1",
                        "jurisdiction": _jurisdiction("CA"),
                        "start_date": "2021-01-04",
                        "end_date": "2025-06-30",
                    }
                ],
            ),
        )
    )
    # A Nebraska senator with no start date still holds the seat.
    for _, _, person in out:
        if person["id"] == _id("NE", "legislature", "0"):
            del person["roles"][0]["start_date"]
    return out


def tarball(extra: list[tuple[str, str, dict]] | None = None) -> bytes:
    """The fixture people as the GitHub tarball of openstates/people would hold them."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for state, folder, person in people() + (extra or []):
            body = yaml.safe_dump(person, sort_keys=False).encode("utf-8")
            info = tarfile.TarInfo(
                f"people-{SHA}/data/{state.lower()}/{folder}/{person['id'][11:]}.yml"
            )
            info.size = len(body)
            archive.addfile(info, io.BytesIO(body))
        readme = b"not a person"
        info = tarfile.TarInfo(f"people-{SHA}/README.md")
        info.size = len(readme)
        archive.addfile(info, io.BytesIO(readme))
    return buffer.getvalue()


def fixture_fetch(url: str) -> bytes:
    """Stand-in for the source's fetch: the commits API answer, then the tarball."""
    if url.endswith("/commits/main"):
        return json.dumps({"sha": SHA}).encode()
    if url.endswith(f"/tar.gz/{SHA}"):
        return tarball()
    raise FileNotFoundError(f"no fixture for {url}")


FIXTURE_PEOPLE = len(people())
