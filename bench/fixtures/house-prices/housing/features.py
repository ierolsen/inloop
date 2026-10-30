"""Engineered features for the California housing data.

The raw data already has rooms per household (AveRooms) and people per
household (AveOccup), so those are not recomputed here.
"""

import pandas as pd


def _safe_divide(num: pd.Series, den: pd.Series) -> pd.Series:
    """Divide element-wise, returning 0 where the denominator is 0."""
    return (num / den).where(den != 0, 0.0)


def bedroom_ratio(df: pd.DataFrame) -> pd.Series:
    """Share of rooms that are bedrooms."""
    return _safe_divide(df["AveBedrms"], df["AveRooms"])


def rooms_per_person(df: pd.DataFrame) -> pd.Series:
    """Average rooms per resident."""
    return _safe_divide(df["AveRooms"], df["AveOccup"])


def households(df: pd.DataFrame) -> pd.Series:
    """Number of households in the district."""
    return _safe_divide(df["Population"], df["AveOccup"])


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with the engineered feature columns added."""
    out = df.copy()
    out["bedroom_ratio"] = bedroom_ratio(df)
    out["rooms_per_person"] = rooms_per_person(df)
    out["households"] = households(df)
    return out
