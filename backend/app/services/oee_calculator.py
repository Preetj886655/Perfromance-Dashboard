"""Row-level OEE calculator matching Excel DPR_OEE formulas exactly.

Source of truth: PRIL_DPR_OEE Sheet (PG_NPD_029) - CONFIRMED formulas.

  G  = IFERROR((Stop-Start)*24*60, "")     -> shift_time_min
  M  = IFERROR(3600/(CycleTime/Cavity), "") -> target_qty_per_hr
  P  = IFERROR(G-PlannedDowntime, "")      -> available_time_min
  AB = SUM(Q:AA)                           -> total_idle_time_min
  AC = P-AB                                -> run_time_min
  AD = IFERROR(AC/P, "")                   -> availability
  AE = IFERROR(ProducedQty/AC*60, "")      -> actual_qty_per_hr
  AF = IFERROR(AE/M, "")                   -> performance  (OEE P term)
  AG = IFERROR(ProducedQty/(P/60*M), "")   -> machine_utilisation (NOT OEE P)
  AR = SUM(AH:AQ)                          -> total_rejection_qty
  AS = IFERROR(AR/ProducedQty*1e6, "")     -> rejection_ppm
  AT = IFERROR((ProducedQty-AR)/ProducedQty, "") -> quality
  AU = IFERROR(AD*AF*AT, "")               -> oee

CRITICAL: OEE (AU) uses AF (performance), never AG (machine_utilisation).

Q1 / midnight crossing (TBC - not resolved here):
  Excel naive (Stop-Start)*24*60 goes negative when Stop < Start on the same
  calendar date interpretation. This calculator does **not** invent an overnight
  +24h rule. When deriving shift_time from start_at/stop_at and stop_at < start_at,
  shift_time_min is None and all time-derived metrics that depend on G/P/AC are
  None. Callers may pass shift_time_min explicitly to bypass Q1 when the duration
  is already known from an approved attribution path.

Blank/None downtime minutes and rejection qtys are treated as 0 in sums (Excel).
Division by zero yields None (Excel IFERROR -> blank "").
Quality and PPM are not clamped.
Intermediates are Decimal - no silent float rounding.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Mapping

# Registry identity for production_record_metrics.formula_version (integer column).
FORMULA_KEY = "dpr_oee_v1"
FORMULA_VERSION = 1

_ZERO = Decimal("0")
_SIXTY = Decimal("60")
_THIRTY_SIX_HUNDRED = Decimal("3600")
_ONE_MILLION = Decimal("1000000")


@dataclass(frozen=True, slots=True)
class OeeMetrics:
    """Row-level calculated metrics (Excel G, M, P, AB-AG, AR-AU).

    None means Excel blank / IFERROR(""), including Q1-unresolvable shift time.
    """

    shift_time_min: Decimal | None
    available_time_min: Decimal | None
    total_idle_time_min: Decimal
    run_time_min: Decimal | None
    target_qty_per_hr: Decimal | None
    actual_qty_per_hr: Decimal | None
    availability: Decimal | None
    performance: Decimal | None  # AF - OEE Performance term
    machine_utilisation: Decimal | None  # AG - parallel KPI, not OEE P
    total_rejection_qty: Decimal
    rejection_ppm: Decimal | None
    quality: Decimal | None
    oee: Decimal | None
    formula_key: str = FORMULA_KEY
    formula_version: int = FORMULA_VERSION
    # True when start/stop were provided but stop < start (Q1 TBC).
    q1_midnight_unresolved: bool = False

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _to_decimal(value: Decimal | int | float | str | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _blank_as_zero(value: Decimal | int | float | str | None) -> Decimal:
    """Excel blank numeric cells behave as 0 inside SUM / arithmetic."""
    converted = _to_decimal(value)
    return _ZERO if converted is None else converted


def _safe_div(
    numerator: Decimal | None, denominator: Decimal | None
) -> Decimal | None:
    """Excel IFERROR(num/den, "") - None on missing operands or division by zero."""
    if numerator is None or denominator is None:
        return None
    if denominator == _ZERO:
        return None
    return numerator / denominator


def _sum_blank_as_zero(
    values: Iterable[Decimal | int | float | str | None] | None,
) -> Decimal:
    if values is None:
        return _ZERO
    total = _ZERO
    for item in values:
        total += _blank_as_zero(item)
    return total


def _derive_shift_time_min(
    *,
    start_at: datetime | None,
    stop_at: datetime | None,
    shift_time_min: Decimal | int | float | str | None,
) -> tuple[Decimal | None, bool]:
    """Resolve shift minutes.

    Preference:
      1. Explicit shift_time_min (avoids inventing Q1 when duration is known)
      2. (stop_at - start_at) in minutes - Excel (F-E)*24*60 for same-day cases
         when stop_at >= start_at
      3. stop_at < start_at -> (None, q1_midnight_unresolved=True) - do not add +1 day
    """
    if shift_time_min is not None:
        return _to_decimal(shift_time_min), False

    if start_at is None or stop_at is None:
        return None, False

    if stop_at < start_at:
        # Q1 TBC: do not invent overnight / +24h attribution.
        return None, True

    # Match Excel duration in minutes for same-calendar TIMESTAMPTZ pairs.
    seconds = Decimal(str((stop_at - start_at).total_seconds()))
    return seconds / _SIXTY, False


def calculate_oee_metrics(
    *,
    cavity_count: Decimal | int | float | str | None,
    cycle_time_sec: Decimal | int | float | str | None,
    produced_qty: Decimal | int | float | str | None,
    planned_downtime_min: Decimal | int | float | str | None = None,
    downtime_minutes: Iterable[Decimal | int | float | str | None] | None = None,
    rejection_qtys: Iterable[Decimal | int | float | str | None] | None = None,
    start_at: datetime | None = None,
    stop_at: datetime | None = None,
    shift_time_min: Decimal | int | float | str | None = None,
) -> OeeMetrics:
    """Compute Excel DPR_OEE row metrics from raw inputs.

    Provide either ``shift_time_min`` or ``start_at``/``stop_at`` (or both).
    When both duration sources are present, ``shift_time_min`` wins so tests and
    approved ingestion paths can avoid unresolved Q1 midnight cases.
    """
    shift, q1_unresolved = _derive_shift_time_min(
        start_at=start_at,
        stop_at=stop_at,
        shift_time_min=shift_time_min,
    )

    planned = _blank_as_zero(planned_downtime_min)
    produced = _blank_as_zero(produced_qty)
    cavity = _to_decimal(cavity_count)
    cycle = _to_decimal(cycle_time_sec)

    # M = 3600 / (cycle / cavity) = 3600 * cavity / cycle
    # Zero cavity or zero/missing cycle -> Excel #DIV/0! -> None
    if cavity is None or cycle is None or cavity == _ZERO or cycle == _ZERO:
        target_qty_per_hr: Decimal | None = None
    else:
        target_qty_per_hr = _THIRTY_SIX_HUNDRED / (cycle / cavity)

    total_idle = _sum_blank_as_zero(downtime_minutes)
    total_rejection = _sum_blank_as_zero(rejection_qtys)

    # P = G - planned (None if G unresolved)
    available = None if shift is None else shift - planned
    # AC = P - AB
    run_time = None if available is None else available - total_idle

    # AD = AC / P
    availability = _safe_div(run_time, available)
    # AE = produced / AC * 60  (Excel left-to-right: (N/AC)*60)
    if run_time is None:
        actual_qty_per_hr = None
    else:
        per_min = _safe_div(produced, run_time)
        actual_qty_per_hr = None if per_min is None else per_min * _SIXTY
    # AF = AE / M  (OEE Performance)
    performance = _safe_div(actual_qty_per_hr, target_qty_per_hr)
    # AG = produced / (P/60 * M)  - parallel KPI, not used in OEE
    if available is None or target_qty_per_hr is None:
        machine_utilisation: Decimal | None = None
    else:
        machine_utilisation = _safe_div(
            produced, (available / _SIXTY) * target_qty_per_hr
        )

    # AS / AT - no clamp even if rejection > produced
    rejection_ppm = _safe_div(total_rejection * _ONE_MILLION, produced)
    quality = _safe_div(produced - total_rejection, produced)

    # AU = AD * AF * AT  (never AG)
    if availability is None or performance is None or quality is None:
        oee: Decimal | None = None
    else:
        oee = availability * performance * quality

    return OeeMetrics(
        shift_time_min=shift,
        available_time_min=available,
        total_idle_time_min=total_idle,
        run_time_min=run_time,
        target_qty_per_hr=target_qty_per_hr,
        actual_qty_per_hr=actual_qty_per_hr,
        availability=availability,
        performance=performance,
        machine_utilisation=machine_utilisation,
        total_rejection_qty=total_rejection,
        rejection_ppm=rejection_ppm,
        quality=quality,
        oee=oee,
        formula_key=FORMULA_KEY,
        formula_version=FORMULA_VERSION,
        q1_midnight_unresolved=q1_unresolved,
    )


def calculate_oee_metrics_from_mapping(
    raw: Mapping[str, object],
) -> OeeMetrics:
    """Convenience wrapper for dict-shaped fixtures / import staging rows."""
    return calculate_oee_metrics(
        cavity_count=raw.get("cavity_count"),  # type: ignore[arg-type]
        cycle_time_sec=raw.get("cycle_time_sec"),  # type: ignore[arg-type]
        produced_qty=raw.get("produced_qty"),  # type: ignore[arg-type]
        planned_downtime_min=raw.get("planned_downtime_min"),  # type: ignore[arg-type]
        downtime_minutes=raw.get("downtime_minutes"),  # type: ignore[arg-type]
        rejection_qtys=raw.get("rejection_qtys"),  # type: ignore[arg-type]
        start_at=raw.get("start_at"),  # type: ignore[arg-type]
        stop_at=raw.get("stop_at"),  # type: ignore[arg-type]
        shift_time_min=raw.get("shift_time_min"),  # type: ignore[arg-type]
    )
