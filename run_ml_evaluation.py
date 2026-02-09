"""
EcoPulse AI - Complete ML Evaluation
Run this to generate synthetic data, train models, and evaluate
"""

import sys
import os
from pathlib import Path

# Ensure we're in the right directory
os.chdir(Path(__file__).parent)

print("=" * 80)
print("EcoPulse AI - ML Evaluation Pipeline")
print("=" * 80)
print()

# Step 1: Install dependencies
print("Checking dependencies...")
try:
    import sklearn
    import pandas
    import matplotlib
    import seaborn
    print("All dependencies installed")
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("\nPlease run: pip install scikit-learn pandas matplotlib seaborn")
    sys.exit(1)

print()

# Step 2: Generate synthetic data
print("=" * 80)
print("STEP 1: Generating Synthetic Test Data")
print("=" * 80)

from datetime import datetime, timedelta
import random
from ml.storage import init_db, insert_trip, insert_bill
from pydantic import BaseModel

class TripIn(BaseModel):
    user_id: str
    date: str
    distance: float
    co2: float
    vehicle: str = None

class BillIn(BaseModel):
    user_id: str
    date: str
    units: float

init_db()
print("Database initialized")

# Generate data for test users
test_users = [
    ('user_eco_001', 60),
    ('user_moderate_001', 60),
    ('user_high_001', 60),
]

for user_id, num_days in test_users:
    print(f"Generating data for {user_id}...")
    start_date = datetime.now() - timedelta(days=num_days)
    
    for day in range(num_days):
        current_date = start_date + timedelta(days=day)
        num_trips = random.randint(1, 3)
        
        for _ in range(num_trips):
            vehicle = random.choice(['Car', 'Bus', 'Bike', 'Train'])
            distance = random.uniform(2, 30)
            
            vehicle_factors = {'Car': 0.21, 'Bus': 0.089, 'Bike': 0.0, 'Train': 0.041}
            co2 = distance * vehicle_factors[vehicle]
            
            trip = TripIn(
                user_id=user_id,
                date=current_date.isoformat(),
                distance=round(distance, 2),
                co2=round(co2, 2),
                vehicle=vehicle
            )
            insert_trip(trip)
    
    # Add a bill
    bill = BillIn(
        user_id=user_id,
        date=start_date.isoformat(),
        units=random.uniform(200, 400)
    )
    insert_bill(bill)

print("Test data generated")
print()

# Step 3: Train and evaluate
print("=" * 80)
print("STEP 2: Training Models and Evaluating")
print("=" * 80)

from ml.storage import fetch_trips, fetch_bills, fetch_user_ids
from ml.features import build_daily_series, make_features, train_test_split_time
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np
import joblib
import json

models_dir = Path("models")
models_dir.mkdir(exist_ok=True)

results_dir = Path("evaluation_results")
results_dir.mkdir(exist_ok=True)

user_ids = fetch_user_ids()
print(f"Found {len(user_ids)} users to evaluate")
print()

all_results = []

for user_id in user_ids:
    print(f"Evaluating {user_id}...")
    
    trips = fetch_trips(user_id)
    bills = fetch_bills(user_id)
    
    if len(trips) < 14:
        print(f"  WARNING: Insufficient data (only {len(trips)} trips)")
        continue
    
    # Build features
    daily = build_daily_series(trips, bills)
    daily = make_features(daily)
    train, test = train_test_split_time(daily)
    
    feature_cols = ["day_index", "day_of_week", "is_weekend", "rolling_7"]
    X_train = train[feature_cols].values
    y_train = train["total"].values
    X_test = test[feature_cols].values
    y_test = test["total"].values
    
    # Train model
    model = RandomForestRegressor(n_estimators=200, random_state=42, min_samples_leaf=2)
    model.fit(X_train, y_train)
    
    # Evaluate
    test_preds = model.predict(X_test)
    
    mae = mean_absolute_error(y_test, test_preds)
    rmse = np.sqrt(mean_squared_error(y_test, test_preds))
    r2 = r2_score(y_test, test_preds)
    
    print(f"  MAE: {mae:.3f}, RMSE: {rmse:.3f}, R2: {r2:.3f}")
    
    # Save model
    joblib.dump(model, models_dir / f"{user_id}.pkl")
    
    all_results.append({
        'user_id': user_id,
        'mae': mae,
        'rmse': rmse,
        'r2': r2,
        'train_days': len(train),
        'test_days': len(test)
    })

print()

# Step 4: Generate report
print("=" * 80)
print("STEP 3: Generating Report")
print("=" * 80)

if all_results:
    avg_mae = np.mean([r['mae'] for r in all_results])
    avg_rmse = np.mean([r['rmse'] for r in all_results])
    avg_r2 = np.mean([r['r2'] for r in all_results])
    
    report = f"""# EcoPulse AI - ML Evaluation Report

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Summary Statistics

- **Users Evaluated:** {len(all_results)}
- **Average MAE:** {avg_mae:.3f} kg CO2
- **Average RMSE:** {avg_rmse:.3f} kg CO2
- **Average R2 Score:** {avg_r2:.3f}

## Performance Interpretation

"""
    
    if avg_r2 > 0.7:
        report += "[EXCELLENT] Model explains >70% of variance\n"
    elif avg_r2 > 0.5:
        report += "[GOOD] Model explains >50% of variance\n"
    elif avg_r2 > 0:
        report += "[MODERATE] Model shows positive predictive capability\n"
    else:
        report += "[NEEDS IMPROVEMENT] Negative R2 indicates model needs tuning\n"
    
    report += f"\n- Predictions are accurate within +/-{avg_mae:.2f} kg CO2 on average\n"
    report += f"- RMSE of {avg_rmse:.2f} kg indicates typical prediction error magnitude\n"
    
    if avg_r2 < 0:
        report += "\nNOTE: Negative R2 values suggest the model needs more data or feature engineering.\n"
        report += "This is common with very small datasets. Recommendations:\n"
        report += "1. Collect more historical data (>90 days recommended)\n"
        report += "2. Add more features (weather, holidays, user demographics)\n"
        report += "3. Try different model architectures\n"
    
    report += "\n## Individual Results\n\n"
    report += "| User ID | MAE (kg) | RMSE (kg) | R2 Score | Train Days | Test Days |\n"
    report += "|---------|----------|-----------|----------|------------|----------|\n"
    
    for r in all_results:
        report += f"| {r['user_id']} | {r['mae']:.3f} | {r['rmse']:.3f} | {r['r2']:.3f} | {r['train_days']} | {r['test_days']} |\n"
    
    report += "\n## Model Details\n\n"
    report += "- **Algorithm:** Random Forest Regressor\n"
    report += "- **Features:** day_index, day_of_week, is_weekend, rolling_7\n"
    report += "- **Hyperparameters:** n_estimators=200, min_samples_leaf=2\n"
    report += "- **Train/Test Split:** Time-based 80/20 split\n"
    
    report += "\n## Feature Descriptions\n\n"
    report += "- **day_index:** Sequential day counter for trend capture\n"
    report += "- **day_of_week:** 0-6 for weekly patterns\n"
    report += "- **is_weekend:** Binary indicator for weekend behavior\n"
    report += "- **rolling_7:** 7-day moving average of emissions\n"
    
    report += "\n## Recommendations for Improvement\n\n"
    report += "1. **Data Collection:** Gather 90+ days of historical data per user\n"
    report += "2. **Feature Engineering:** Add seasonal features, weather data, holidays\n"
    report += "3. **Model Tuning:** Perform hyperparameter optimization\n"
    report += "4. **Ensemble Methods:** Combine multiple model types\n"
    report += "5. **User Clustering:** Build separate models for different user types\n"
    
    # Save report with UTF-8 encoding
    report_path = results_dir / "evaluation_report.md"
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    # Save JSON
    json_path = results_dir / "results.json"
    with open(json_path, 'w') as f:
        json.dump({
            'summary': {
                'avg_mae': float(avg_mae),
                'avg_rmse': float(avg_rmse),
                'avg_r2': float(avg_r2),
                'num_users': len(all_results)
            },
            'individual_results': all_results
        }, f, indent=2)
    
    print(f"Report saved to: {report_path}")
    print(f"JSON results saved to: {json_path}")
    
    # Print summary to console
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Users Evaluated: {len(all_results)}")
    print(f"Average MAE: {avg_mae:.3f} kg CO2")
    print(f"Average RMSE: {avg_rmse:.3f} kg CO2")
    print(f"Average R2 Score: {avg_r2:.3f}")
    print()
    
    if avg_r2 < 0:
        print("NOTE: Negative R2 indicates the model needs improvement.")
        print("This is normal with small datasets. See report for recommendations.")
else:
    print("No results to report")

print()
print("=" * 80)
print("EVALUATION COMPLETE!")
print("=" * 80)
print()
print("Results available in:")
print(f"  - {results_dir / 'evaluation_report.md'}")
print(f"  - {results_dir / 'results.json'}")
print()
print("Models saved in:")
print(f"  - {models_dir}/")
print()