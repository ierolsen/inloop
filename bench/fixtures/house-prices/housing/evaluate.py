"""Evaluate a fitted model on the test set, with errors in US dollars."""

import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.pipeline import Pipeline

DOLLARS_PER_UNIT = 100_000  # the target is in units of $100,000


def evaluate(model: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> dict[str, float]:
    """Return MAE and RMSE in dollars, and R2."""
    y_pred = model.predict(X_test)
    return {
        "mae": mean_absolute_error(y_test, y_pred) * DOLLARS_PER_UNIT,
        "rmse": root_mean_squared_error(y_test, y_pred) * DOLLARS_PER_UNIT,
        "r2": r2_score(y_test, y_pred),
    }


def format_metrics(metrics: dict[str, float]) -> str:
    """Return the metrics as human-readable lines."""
    return (
        f"MAE:  ${metrics['mae']:,.0f}\n"
        f"RMSE: ${metrics['rmse']:,.0f}\n"
        f"R2:   {metrics['r2']:.3f}"
    )
