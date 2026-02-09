# EcoPulse AI - ML Evaluation Report

**Generated:** 2026-02-06 10:45:14

## Summary Statistics

- **Users Evaluated:** 3
- **Average MAE:** 3.484 kg CO2
- **Average RMSE:** 3.975 kg CO2
- **Average R2 Score:** -2.090

## Performance Interpretation

[NEEDS IMPROVEMENT] Negative R2 indicates model needs tuning

- Predictions are accurate within +/-3.48 kg CO2 on average
- RMSE of 3.98 kg indicates typical prediction error magnitude

NOTE: Negative R2 values suggest the model needs more data or feature engineering.
This is common with very small datasets. Recommendations:
1. Collect more historical data (>90 days recommended)
2. Add more features (weather, holidays, user demographics)
3. Try different model architectures

## Individual Results

| User ID | MAE (kg) | RMSE (kg) | R2 Score | Train Days | Test Days |
|---------|----------|-----------|----------|------------|----------|
| user_eco_001 | 3.192 | 3.454 | -2.873 | 48 | 12 |
| user_high_001 | 4.391 | 5.116 | -3.367 | 48 | 12 |
| user_moderate_001 | 2.870 | 3.355 | -0.030 | 48 | 12 |

## Model Details

- **Algorithm:** Random Forest Regressor
- **Features:** day_index, day_of_week, is_weekend, rolling_7
- **Hyperparameters:** n_estimators=200, min_samples_leaf=2
- **Train/Test Split:** Time-based 80/20 split

## Feature Descriptions

- **day_index:** Sequential day counter for trend capture
- **day_of_week:** 0-6 for weekly patterns
- **is_weekend:** Binary indicator for weekend behavior
- **rolling_7:** 7-day moving average of emissions

## Recommendations for Improvement

1. **Data Collection:** Gather 90+ days of historical data per user
2. **Feature Engineering:** Add seasonal features, weather data, holidays
3. **Model Tuning:** Perform hyperparameter optimization
4. **Ensemble Methods:** Combine multiple model types
5. **User Clustering:** Build separate models for different user types
