import random
from datetime import UTC, datetime, timedelta

import pytest

import seed_events_prod as seed

END = datetime(2026, 11, 12, 21, tzinfo=UTC)
START = END - timedelta(days=seed.WINDOW_DAYS)
ROWS = 50_000


@pytest.fixture(scope="module")
def occurred_at() -> list[datetime]:
    occurred_at, _ = seed.generate_distributed_occurred_at(END, ROWS, random.Random(42))
    return occurred_at


def test_shares_sum_to_one_and_are_not_negative() -> None:
    shares = seed.derive_shares()

    assert shares.spike + shares.ramp + shares.baseline == pytest.approx(1)
    assert min(shares.spike, shares.ramp, shares.baseline) >= 0


def test_shares_reject_requirements_that_cannot_be_met(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "LAST_HOUR_SHARE", 0.01)

    with pytest.raises(ValueError):
        seed.derive_shares()


def test_occurred_at_has_requested_count_and_stays_in_window(occurred_at: list[datetime]) -> None:
    assert len(occurred_at) == ROWS
    assert min(occurred_at) >= START
    assert max(occurred_at) <= END


def test_occurred_at_has_millisecond_precision(occurred_at: list[datetime]) -> None:
    assert all(value.microsecond % 1000 == 0 for value in occurred_at)


def test_occurred_at_is_deterministic(occurred_at: list[datetime]) -> None:
    again = seed.generate_distributed_occurred_at(END, ROWS, random.Random(42))

    assert again == occurred_at


def test_occurred_at_matches_client_shares(occurred_at: list[datetime]) -> None:
    last_day = sum(value >= END - timedelta(days=1) for value in occurred_at) / ROWS
    last_hour = sum(value >= END - seed.LAST_HOUR for value in occurred_at) / ROWS

    assert last_day == pytest.approx(seed.LAST_DAY_SHARE, abs=0.01)
    assert last_hour == pytest.approx(seed.LAST_HOUR_SHARE, abs=0.005)


def test_created_at_is_never_before_occurred_at_or_after_end(occurred_at: list[datetime]) -> None:
    created_at = seed.generate_created_at(occurred_at, END, random.Random(7))

    assert len(created_at) == len(occurred_at)
    assert all(c >= o for c, o in zip(created_at, occurred_at, strict=True))
    assert max(created_at) <= END


@pytest.mark.parametrize("room", [timedelta(0), timedelta(microseconds=500), seed.MIN_LAG])
def test_created_at_terminates_right_before_the_end(room: timedelta) -> None:
    created_at = seed.generate_created_at([END - room], END, random.Random(1))

    assert END - room <= created_at[0] <= END
