"""Train (if needed), evaluate and run the California house price model."""

import argparse

from sklearn.pipeline import Pipeline

from housing.data import split_data
from housing.evaluate import DOLLARS_PER_UNIT, evaluate, format_metrics
from housing.model import MODEL_PATH, load_model, save_model, train_model


def get_model(X_train, y_train, retrain: bool = False) -> Pipeline:
    """Load the saved model, or train and save a new one."""
    if MODEL_PATH.exists() and not retrain:
        print(f"Loading model from {MODEL_PATH}")
        return load_model()
    print("Training model...")
    model = train_model(X_train, y_train)
    print(f"Saved model to {save_model(model)}")
    return model


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retrain", action="store_true", help="train even if a model is saved")
    args = parser.parse_args(argv)

    X_train, X_test, y_train, y_test = split_data()
    model = get_model(X_train, y_train, retrain=args.retrain)

    print("\nTest set metrics (house values are capped at about $500,000):")
    print(format_metrics(evaluate(model, X_test, y_test)))

    example = X_test.iloc[[0]]
    predicted = model.predict(example)[0] * DOLLARS_PER_UNIT
    actual = y_test.iloc[0] * DOLLARS_PER_UNIT
    print("\nExample district:")
    print(example.to_string(index=False))
    print(f"Predicted median house value: ${predicted:,.0f}")
    print(f"Actual median house value:    ${actual:,.0f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
