"""The error every source raises when upstream data is not the shape it expects.

Sources stop and report rather than adapting in place (plan section 3): a response that differs
from what docs/PLAN.md or the source's ADR describes fails the run, which marks the source's
``meta.ingest_run`` row ``failed`` with the message.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ValidationError


class SourceShapeError(RuntimeError):
    """An upstream response does not have the shape the pipeline expects. Stop and report."""


def shape_error(where: str, detail: object) -> SourceShapeError:
    return SourceShapeError(
        f"{where}: shape differs from what docs/PLAN.md expects; not adapting in place. {detail}"
    )


def validate(model: type[BaseModel], item: Any, where: str) -> None:
    """Raise :class:`SourceShapeError` naming ``where`` unless ``item`` validates as ``model``."""
    try:
        model.model_validate(item)
    except ValidationError as exc:
        raise shape_error(where, exc) from exc
