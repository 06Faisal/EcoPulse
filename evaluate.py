"""
ML Model Evaluation Module for EcoPulse AI
Generates comprehensive evaluation metrics and visualizations
"""

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    mean_absolute_percentage_error
)
from sklearn.ensemble import RandomForestRegressor

# Import from ml package
import sys
sys.path.append(str(Path(__file__).parent / 'ml'))
from storage import fetch_trips, fetch_bills, fetch_user_ids
from features import build_daily_series, make_features, train_test_split_time

MODELS_DIR = Path(__file__).parent / "models"
RESULTS_DIR = Path(__file__).parent / "evaluation_results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Calculate comprehensive regression metrics"""
    
    # Basic metrics
    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_pred)
    
    # MAPE (handle zero values)
    non_zero_mask = y_true != 0
    if non_zero_mask.sum() > 0:
        mape = mean_absolute_percentage_error(y_true[non_zero_mask], y_pred[non_zero_mask])
    else:
        mape = 0.0
    
    # Additional metrics
    residuals = y_true - y_pred
    mean_residual = np.mean(residuals)
    std_residual = np.std(residuals)
    
    # Accuracy within threshold (±2 kg CO2)
    within_2kg = np.mean(np.abs(residuals) <= 2.0) * 100
    within_5kg = np.mean(np.abs(residuals) <= 5.0) * 100
    
    return {
        'MAE': float(mae),
        'MSE': float(mse),
        'RMSE': float(rmse),
        'R2': float(r2),
        'MAPE': float(mape * 100),  # Convert to percentage
        'Mean_Residual': float(mean_residual),
        'Std_Residual': float(std_residual),
        'Accuracy_within_2kg': float(within_2kg),
        'Accuracy_within_5kg': float(within_5kg)
    }


def evaluate_single_user(user_id: str, retrain: bool = False) -> Dict:
    """Evaluate model for a single user"""
    
    print(f"Evaluating user: {user_id}")
    
    # Fetch data
    trips = fetch_trips(user_id)
    bills = fetch_bills(user_id)
    
    if len(trips) < 14:
        return {
            'user_id': user_id,
            'status': 'insufficient_data',
            'trip_count': len(trips)
        }
    
    # Build features
    daily = build_daily_series(trips, bills)
    daily = make_features(daily)
    train, test = train_test_split_time(daily)
    
    feature_cols = ["day_index", "day_of_week", "is_weekend", "rolling_7"]
    X_train = train[feature_cols].values
    y_train = train["total"].values
    X_test = test[feature_cols].values
    y_test = test["total"].values
    
    # Train or load model
    model_path = MODELS_DIR / f"{user_id}.pkl"
    
    if retrain or not model_path.exists():
        print(f"  Training new model...")
        model = RandomForestRegressor(
            n_estimators=200,
            random_state=42,
            min_samples_leaf=2,
        )
        model.fit(X_train, y_train)
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, model_path)
    else:
        print(f"  Loading existing model...")
        model = joblib.load(model_path)
    
    # Predictions
    train_preds = model.predict(X_train)
    test_preds = model.predict(X_test)
    
    # Calculate metrics
    train_metrics = calculate_metrics(y_train, train_preds)
    test_metrics = calculate_metrics(y_test, test_preds)
    
    # Baseline comparison (mean predictor)
    baseline_train = np.full_like(y_train, np.mean(y_train))
    baseline_test = np.full_like(y_test, np.mean(y_train))
    
    baseline_train_metrics = calculate_metrics(y_train, baseline_train)
    baseline_test_metrics = calculate_metrics(y_test, baseline_test)
    
    # Feature importance
    feature_importance = dict(zip(feature_cols, model.feature_importances_))
    
    return {
        'user_id': user_id,
        'status': 'success',
        'data_stats': {
            'total_days': len(daily),
            'train_days': len(train),
            'test_days': len(test),
            'trip_count': len(trips),
            'bill_count': len(bills)
        },
        'train_metrics': train_metrics,
        'test_metrics': test_metrics,
        'baseline_train_metrics': baseline_train_metrics,
        'baseline_test_metrics': baseline_test_metrics,
        'improvement_over_baseline': {
            'MAE': float(baseline_test_metrics['MAE'] - test_metrics['MAE']),
            'RMSE': float(baseline_test_metrics['RMSE'] - test_metrics['RMSE']),
            'R2': float(test_metrics['R2'])
        },
        'feature_importance': feature_importance,
        'predictions': {
            'y_test': y_test.tolist(),
            'test_preds': test_preds.tolist(),
            'y_train': y_train.tolist(),
            'train_preds': train_preds.tolist()
        }
    }


def evaluate_all_users(retrain: bool = False) -> List[Dict]:
    """Evaluate models for all users"""
    
    user_ids = fetch_user_ids()
    print(f"Found {len(user_ids)} users")
    
    results = []
    for user_id in user_ids:
        try:
            result = evaluate_single_user(user_id, retrain=retrain)
            results.append(result)
        except Exception as e:
            print(f"Error evaluating {user_id}: {e}")
            results.append({
                'user_id': user_id,
                'status': 'error',
                'error': str(e)
            })
    
    return results


def aggregate_metrics(results: List[Dict]) -> Dict:
    """Aggregate metrics across all successful evaluations"""
    
    successful = [r for r in results if r.get('status') == 'success']
    
    if not successful:
        return {'status': 'no_successful_evaluations'}
    
    # Aggregate test metrics
    test_metrics_keys = ['MAE', 'RMSE', 'R2', 'MAPE', 'Accuracy_within_2kg', 'Accuracy_within_5kg']
    
    aggregated = {
        'total_users': len(results),
        'successful_evaluations': len(successful),
        'insufficient_data': len([r for r in results if r.get('status') == 'insufficient_data']),
        'errors': len([r for r in results if r.get('status') == 'error']),
    }
    
    # Calculate mean and std for each metric
    for metric in test_metrics_keys:
        values = [r['test_metrics'][metric] for r in successful]
        aggregated[f'{metric}_mean'] = float(np.mean(values))
        aggregated[f'{metric}_std'] = float(np.std(values))
        aggregated[f'{metric}_min'] = float(np.min(values))
        aggregated[f'{metric}_max'] = float(np.max(values))
    
    # Feature importance aggregation
    feature_importances = {}
    for result in successful:
        for feature, importance in result['feature_importance'].items():
            if feature not in feature_importances:
                feature_importances[feature] = []
            feature_importances[feature].append(importance)
    
    aggregated['avg_feature_importance'] = {
        feature: float(np.mean(importances))
        for feature, importances in feature_importances.items()
    }
    
    return aggregated


def create_visualizations(results: List[Dict], output_dir: Path = RESULTS_DIR):
    """Create comprehensive visualization plots"""
    
    successful = [r for r in results if r.get('status') == 'success']
    
    if not successful:
        print("No successful results to visualize")
        return
    
    # Set style
    sns.set_style("whitegrid")
    plt.rcParams['figure.figsize'] = (12, 8)
    
    # 1. Actual vs Predicted (combined for all users)
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    
    # Scatter plot - all users
    ax = axes[0, 0]
    for result in successful:
        y_test = result['predictions']['y_test']
        test_preds = result['predictions']['test_preds']
        ax.scatter(y_test, test_preds, alpha=0.5, s=30)
    
    # Perfect prediction line
    all_values = []
    for result in successful:
        all_values.extend(result['predictions']['y_test'])
    min_val, max_val = min(all_values), max(all_values)
    ax.plot([min_val, max_val], [min_val, max_val], 'r--', lw=2, label='Perfect Prediction')
    
    ax.set_xlabel('Actual CO2 (kg)', fontsize=12)
    ax.set_ylabel('Predicted CO2 (kg)', fontsize=12)
    ax.set_title('Actual vs Predicted CO2 Emissions (All Users)', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # 2. Residuals distribution
    ax = axes[0, 1]
    all_residuals = []
    for result in successful:
        y_test = np.array(result['predictions']['y_test'])
        test_preds = np.array(result['predictions']['test_preds'])
        residuals = y_test - test_preds
        all_residuals.extend(residuals)
    
    ax.hist(all_residuals, bins=30, edgecolor='black', alpha=0.7)
    ax.axvline(x=0, color='r', linestyle='--', linewidth=2, label='Zero Error')
    ax.set_xlabel('Residuals (kg CO2)', fontsize=12)
    ax.set_ylabel('Frequency', fontsize=12)
    ax.set_title('Distribution of Prediction Errors', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # 3. Metrics comparison across users
    ax = axes[1, 0]
    metrics_to_plot = ['MAE', 'RMSE', 'R2']
    user_labels = [r['user_id'][:8] for r in successful]
    
    x = np.arange(len(successful))
    width = 0.25
    
    for i, metric in enumerate(metrics_to_plot):
        values = [r['test_metrics'][metric] for r in successful]
        ax.bar(x + i * width, values, width, label=metric)
    
    ax.set_xlabel('Users', fontsize=12)
    ax.set_ylabel('Metric Value', fontsize=12)
    ax.set_title('Performance Metrics by User', fontsize=14, fontweight='bold')
    ax.set_xticks(x + width)
    ax.set_xticklabels(user_labels, rotation=45, ha='right')
    ax.legend()
    ax.grid(True, alpha=0.3, axis='y')
    
    # 4. Feature importance
    ax = axes[1, 1]
    
    # Aggregate feature importance
    feature_importances = {}
    for result in successful:
        for feature, importance in result['feature_importance'].items():
            if feature not in feature_importances:
                feature_importances[feature] = []
            feature_importances[feature].append(importance)
    
    avg_importance = {k: np.mean(v) for k, v in feature_importances.items()}
    sorted_features = sorted(avg_importance.items(), key=lambda x: x[1], reverse=True)
    
    features = [f[0] for f in sorted_features]
    importances = [f[1] for f in sorted_features]
    
    ax.barh(features, importances, color='steelblue', edgecolor='black')
    ax.set_xlabel('Average Importance', fontsize=12)
    ax.set_ylabel('Feature', fontsize=12)
    ax.set_title('Feature Importance (Averaged Across Users)', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='x')
    
    plt.tight_layout()
    plt.savefig(output_dir / 'ml_evaluation_summary.png', dpi=300, bbox_inches='tight')
    print(f"Saved: {output_dir / 'ml_evaluation_summary.png'}")
    plt.close()
    
    # 5. Create individual time series plots for each user
    for idx, result in enumerate(successful[:5]):  # Limit to first 5 users
        fig, ax = plt.subplots(figsize=(12, 6))
        
        # Plot training data
        train_actual = result['predictions']['y_train']
        train_pred = result['predictions']['train_preds']
        train_days = list(range(len(train_actual)))
        
        # Plot test data
        test_actual = result['predictions']['y_test']
        test_pred = result['predictions']['test_preds']
        test_days = list(range(len(train_actual), len(train_actual) + len(test_actual)))
        
        ax.plot(train_days, train_actual, 'o-', label='Train Actual', alpha=0.7, markersize=4)
        ax.plot(train_days, train_pred, 's-', label='Train Predicted', alpha=0.7, markersize=4)
        ax.plot(test_days, test_actual, 'o-', label='Test Actual', alpha=0.7, markersize=6, linewidth=2)
        ax.plot(test_days, test_pred, 's-', label='Test Predicted', alpha=0.7, markersize=6, linewidth=2)
        
        ax.axvline(x=len(train_actual)-0.5, color='red', linestyle='--', linewidth=2, label='Train/Test Split')
        
        ax.set_xlabel('Day Index', fontsize=12)
        ax.set_ylabel('CO2 Emissions (kg)', fontsize=12)
        ax.set_title(f'Time Series Prediction - User {result["user_id"][:8]}', fontsize=14, fontweight='bold')
        ax.legend(loc='best')
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig(output_dir / f'user_{result["user_id"][:8]}_timeseries.png', dpi=300, bbox_inches='tight')
        print(f"Saved: {output_dir / f'user_{result['user_id'][:8]}_timeseries.png'}")
        plt.close()


def generate_evaluation_report(results: List[Dict], aggregated: Dict, output_dir: Path = RESULTS_DIR):
    """Generate a comprehensive markdown report"""
    
    report = f"""# EcoPulse AI - ML Model Evaluation Report

**Date:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}

## Executive Summary

This report evaluates the performance of the RandomForest regression models used in EcoPulse AI for predicting carbon emissions based on user travel and energy consumption patterns.

## Dataset Overview

- **Total Users Evaluated:** {aggregated['total_users']}
- **Successful Evaluations:** {aggregated['successful_evaluations']}
- **Insufficient Data:** {aggregated['insufficient_data']}
- **Errors:** {aggregated['errors']}

## Model Architecture

- **Algorithm:** Random Forest Regressor
- **Hyperparameters:**
  - n_estimators: 200
  - min_samples_leaf: 2
  - random_state: 42

## Features Used

1. **day_index:** Sequential day counter
2. **day_of_week:** Day of week (0-6)
3. **is_weekend:** Binary weekend indicator
4. **rolling_7:** 7-day rolling average of CO2 emissions

## Performance Metrics (Test Set)

### Regression Metrics

| Metric | Mean | Std Dev | Min | Max |
|--------|------|---------|-----|-----|
| **MAE (kg CO2)** | {aggregated.get('MAE_mean', 0):.3f} | {aggregated.get('MAE_std', 0):.3f} | {aggregated.get('MAE_min', 0):.3f} | {aggregated.get('MAE_max', 0):.3f} |
| **RMSE (kg CO2)** | {aggregated.get('RMSE_mean', 0):.3f} | {aggregated.get('RMSE_std', 0):.3f} | {aggregated.get('RMSE_min', 0):.3f} | {aggregated.get('RMSE_max', 0):.3f} |
| **R² Score** | {aggregated.get('R2_mean', 0):.3f} | {aggregated.get('R2_std', 0):.3f} | {aggregated.get('R2_min', 0):.3f} | {aggregated.get('R2_max', 0):.3f} |
| **MAPE (%)** | {aggregated.get('MAPE_mean', 0):.2f} | {aggregated.get('MAPE_std', 0):.2f} | {aggregated.get('MAPE_min', 0):.2f} | {aggregated.get('MAPE_max', 0):.2f} |

### Accuracy Metrics

- **Predictions within ±2kg:** {aggregated.get('Accuracy_within_2kg_mean', 0):.1f}% (±{aggregated.get('Accuracy_within_2kg_std', 0):.1f}%)
- **Predictions within ±5kg:** {aggregated.get('Accuracy_within_5kg_mean', 0):.1f}% (±{aggregated.get('Accuracy_within_5kg_std', 0):.1f}%)

## Feature Importance

"""
    
    # Add feature importance
    if 'avg_feature_importance' in aggregated:
        sorted_features = sorted(aggregated['avg_feature_importance'].items(), 
                                key=lambda x: x[1], reverse=True)
        report += "| Feature | Importance |\n|---------|------------|\n"
        for feature, importance in sorted_features:
            report += f"| {feature} | {importance:.3f} |\n"
    
    report += """
## Key Findings

"""
    
    # Add interpretation
    avg_r2 = aggregated.get('R2_mean', 0)
    avg_mae = aggregated.get('MAE_mean', 0)
    
    if avg_r2 > 0.7:
        report += f"✅ **Strong Performance:** The model achieves an average R² of {avg_r2:.3f}, indicating strong predictive capability.\n\n"
    elif avg_r2 > 0.5:
        report += f"⚠️ **Moderate Performance:** The model achieves an average R² of {avg_r2:.3f}, showing moderate predictive capability.\n\n"
    else:
        report += f"❌ **Needs Improvement:** The model achieves an average R² of {avg_r2:.3f}, suggesting room for improvement.\n\n"
    
    report += f"- Average prediction error is {avg_mae:.2f} kg CO2\n"
    report += f"- {aggregated.get('Accuracy_within_2kg_mean', 0):.1f}% of predictions are within ±2kg of actual values\n"
    report += f"- {aggregated.get('Accuracy_within_5kg_mean', 0):.1f}% of predictions are within ±5kg of actual values\n\n"
    
    report += """## Recommendations

1. **Feature Engineering:** Consider adding more temporal features (month, season, holidays)
2. **Data Collection:** Gather more historical data for improved model training
3. **Model Tuning:** Experiment with hyperparameter optimization
4. **Additional Features:** Incorporate weather data, user demographics, or regional factors
5. **Ensemble Methods:** Consider combining multiple model types for better predictions

## Visualizations

See accompanying PNG files for detailed visualizations:
- `ml_evaluation_summary.png`: Overall model performance
- `user_*_timeseries.png`: Individual user time series predictions

---

*Generated by EcoPulse AI Evaluation Module*
"""
    
    # Save report
    report_path = output_dir / 'evaluation_report.md'
    report_path.write_text(report)
    print(f"Saved: {report_path}")
    
    return report


def main(retrain: bool = False):
    """Main evaluation pipeline"""
    
    print("=" * 80)
    print("EcoPulse AI - ML Model Evaluation")
    print("=" * 80)
    print()
    
    # Evaluate all users
    results = evaluate_all_users(retrain=retrain)
    
    # Save individual results
    results_path = RESULTS_DIR / 'individual_results.json'
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved individual results: {results_path}")
    
    # Aggregate metrics
    aggregated = aggregate_metrics(results)
    
    # Save aggregated metrics
    aggregated_path = RESULTS_DIR / 'aggregated_metrics.json'
    with open(aggregated_path, 'w') as f:
        json.dump(aggregated, f, indent=2)
    print(f"Saved aggregated metrics: {aggregated_path}")
    
    # Create visualizations
    print("\nGenerating visualizations...")
    create_visualizations(results)
    
    # Generate report
    print("\nGenerating evaluation report...")
    generate_evaluation_report(results, aggregated)
    
    print("\n" + "=" * 80)
    print("Evaluation complete!")
    print(f"Results saved to: {RESULTS_DIR}")
    print("=" * 80)
    
    return results, aggregated


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Evaluate EcoPulse ML models')
    parser.add_argument('--retrain', action='store_true', help='Retrain all models before evaluation')
    args = parser.parse_args()
    
    main(retrain=args.retrain)
