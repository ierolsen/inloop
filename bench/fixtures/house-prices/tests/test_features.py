import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal, assert_series_equal

from housing.data import load_data
from housing.features import add_features, bedroom_ratio, households, rooms_per_person


@pytest.fixture
def raw() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "AveRooms": [5.0, 0.0],
            "AveBedrms": [1.0, 0.0],
            "Population": [1000.0, 300.0],
            "AveOccup": [2.5, 0.0],
        }
    )


def test_bedroom_ratio(raw):
    assert_series_equal(bedroom_ratio(raw), pd.Series([0.2, 0.0]), check_names=False)


def test_rooms_per_person(raw):
    assert_series_equal(rooms_per_person(raw), pd.Series([2.0, 0.0]), check_names=False)


def test_households(raw):
    assert_series_equal(households(raw), pd.Series([400.0, 0.0]), check_names=False)


def test_add_features_adds_columns_and_keeps_originals(raw):
    out = add_features(raw)
    assert list(out.columns) == list(raw.columns) + [
        "bedroom_ratio",
        "rooms_per_person",
        "households",
    ]
    assert_frame_equal(out[raw.columns], raw)


def test_add_features_does_not_mutate_input(raw):
    before = raw.copy()
    add_features(raw)
    assert_frame_equal(raw, before)


def test_add_features_on_real_data_is_finite():
    out = add_features(load_data())
    new = out[["bedroom_ratio", "rooms_per_person", "households"]]
    assert np.isfinite(new.to_numpy()).all()
    assert new["bedroom_ratio"].between(0, 1).all()
