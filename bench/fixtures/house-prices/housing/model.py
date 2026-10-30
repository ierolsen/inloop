"""Build, train, save and load the house price model."""

from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer

from housing.data import RANDOM_STATE
from housing.features import add_features

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "house_price_model.joblib"


def build_pipeline() -> Pipeline:
    """Return an unfitted pipeline: feature engineering, then gradient boosting."""
    return Pipeline(
        [
            ("features", FunctionTransformer(add_features)),
            (
                "regressor",
                GradientBoostingRegressor(
                    n_estimators=500,
                    learning_rate=0.05,
                    max_depth=5,
                    subsample=0.8,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )


def train_model(X: pd.DataFrame, y: pd.Series) -> Pipeline:
    """Fit a new pipeline on X and y."""
    return build_pipeline().fit(X, y)


def save_model(model: Pipeline, path: Path = MODEL_PATH) -> Path:
    """Write the fitted pipeline to path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    return path


def load_model(path: Path = MODEL_PATH) -> Pipeline:
    """Read a fitted pipeline from path."""
    return joblib.load(path)
