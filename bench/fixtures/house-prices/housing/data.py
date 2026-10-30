"""Load the California housing dataset and split it into train and test sets."""

from pathlib import Path

import pandas as pd
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split

DATA_HOME = Path(__file__).resolve().parent.parent / "data"
TARGET = "MedHouseVal"  # median house value, in units of $100,000
RANDOM_STATE = 42


def load_data(data_home: Path = DATA_HOME) -> pd.DataFrame:
    """Return the dataset as one DataFrame: 8 feature columns plus the target."""
    bunch = fetch_california_housing(
        data_home=str(data_home), as_frame=True, download_if_missing=False
    )
    return bunch.frame


def split_data(
    df: pd.DataFrame | None = None,
    test_size: float = 0.2,
    random_state: int = RANDOM_STATE,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """Split into X_train, X_test, y_train, y_test."""
    if df is None:
        df = load_data()
    X = df.drop(columns=TARGET)
    y = df[TARGET]
    return train_test_split(X, y, test_size=test_size, random_state=random_state)
