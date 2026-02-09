# EcoPulse AI - ML Evaluation Suite

## 📋 Overview

This evaluation suite allows you to **comprehensively evaluate your ML models WITHOUT connecting the backend to the frontend**. It generates publication-quality metrics, visualizations, and reports suitable for project evaluation and academic submission.

## 🎯 What This Gives You

### **Metrics Generated:**
1. **Regression Metrics:**
   - Mean Absolute Error (MAE)
   - Root Mean Squared Error (RMSE)
   - R² Score
   - Mean Absolute Percentage Error (MAPE)

2. **Accuracy Metrics:**
   - Percentage of predictions within ±2kg CO2
   - Percentage of predictions within ±5kg CO2

3. **Model Insights:**
   - Feature importance rankings
   - Baseline model comparison
   - Train/test performance analysis

### **Visualizations:**
1. Actual vs Predicted scatter plots
2. Residuals distribution
3. Per-user performance comparison
4. Feature importance bar charts
5. Time series prediction plots

### **Outputs:**
- 📄 Markdown evaluation report
- 📊 High-resolution PNG charts (300 DPI)
- 📋 JSON files with detailed metrics
- 📈 Individual user time series plots

---

## 🚀 Quick Start

### **Option 1: Full Pipeline (Recommended)**

Run everything in one command:

```bash
# Install dependencies
pip install -r requirements_ml.txt

# Run complete evaluation pipeline
python run_evaluation.py
```

This will:
1. ✅ Generate synthetic test data (7 users, 60 days each)
2. ✅ Train ML models for each user
3. ✅ Evaluate all models with comprehensive metrics
4. ✅ Create visualizations
5. ✅ Generate evaluation report

### **Option 2: Step-by-Step**

If you want more control:

```bash
# Step 1: Generate test data
python generate_test_data.py

# Step 2: Run evaluation
python evaluate.py --retrain

# The results will be in evaluation_results/
```

### **Option 3: Use Existing Data**

If you already have data in the SQLite database:

```bash
# Just run evaluation (uses existing models if available)
python evaluate.py

# Or retrain all models first
python evaluate.py --retrain
```

---

## 📁 File Structure

```
project/
├── ml/                          # Your existing ML package
│   ├── __init__.py
│   ├── storage.py              # Database operations
│   ├── features.py             # Feature engineering
│   ├── train.py                # Model training
│   ├── predict.py              # Predictions
│   └── cluster.py              # User clustering
│
├── evaluate.py                  # ⭐ Main evaluation script
├── generate_test_data.py        # ⭐ Synthetic data generator
├── run_evaluation.py            # ⭐ Complete pipeline runner
├── requirements_ml.txt          # Dependencies
│
├── data/                        # Created automatically
│   └── ecopulse.db             # SQLite database
│
├── models/                      # Created automatically
│   ├── user_*.pkl              # Trained models
│   └── user_*.json             # Model metadata
│
└── evaluation_results/          # Created automatically
    ├── evaluation_report.md     # Main report
    ├── ml_evaluation_summary.png
    ├── user_*_timeseries.png
    ├── aggregated_metrics.json
    └── individual_results.json
```

---

## 📊 Understanding the Results

### **1. Evaluation Report (`evaluation_report.md`)**

A comprehensive markdown report containing:
- Dataset overview
- Model architecture details
- Performance metrics table
- Feature importance ranking
- Key findings and interpretations
- Recommendations for improvement

**Example snippet:**
```markdown
## Performance Metrics (Test Set)

| Metric | Mean | Std Dev | Min | Max |
|--------|------|---------|-----|-----|
| MAE (kg CO2) | 1.234 | 0.456 | 0.789 | 2.345 |
| R² Score | 0.756 | 0.123 | 0.567 | 0.890 |
```

### **2. Aggregated Metrics (`aggregated_metrics.json`)**

JSON file with statistical summary across all users:

```json
{
  "total_users": 7,
  "successful_evaluations": 7,
  "MAE_mean": 1.234,
  "MAE_std": 0.456,
  "R2_mean": 0.756,
  "avg_feature_importance": {
    "rolling_7": 0.456,
    "day_index": 0.234,
    ...
  }
}
```

### **3. Individual Results (`individual_results.json`)**

Detailed results for each user:

```json
[
  {
    "user_id": "user_eco_friendly_001",
    "status": "success",
    "test_metrics": {
      "MAE": 1.234,
      "RMSE": 1.567,
      "R2": 0.789
    },
    "feature_importance": {...},
    "predictions": {...}
  }
]
```

### **4. Visualizations**

- **`ml_evaluation_summary.png`**: 4-panel overview
  - Panel 1: Actual vs Predicted scatter
  - Panel 2: Residuals distribution
  - Panel 3: Metrics by user
  - Panel 4: Feature importance

- **`user_*_timeseries.png`**: Individual user predictions over time

---

## 🎓 For Academic/Project Evaluation

### **What to Include in Your Report:**

1. **Model Description:**
   - Algorithm: Random Forest Regressor
   - Features: 4 temporal features
   - Training approach: Time-series split (80/20)

2. **Dataset:**
   - From `evaluation_report.md` → "Dataset Overview" section
   - Mention total users, days, trips

3. **Performance Metrics:**
   - Copy the metrics table from the report
   - Highlight R² score and MAE
   - Show improvement over baseline

4. **Visualizations:**
   - Include `ml_evaluation_summary.png`
   - Include 2-3 user timeseries plots
   - These are publication-quality (300 DPI)

5. **Feature Importance:**
   - Show which features matter most
   - Explain why (e.g., "rolling_7 captures recent behavior")

6. **Interpretation:**
   - From the "Key Findings" section
   - Discuss strengths and limitations

### **Example Presentation Slide:**

```
Slide: Model Performance
------------------------
✅ R² Score: 0.756 ± 0.123
   → Explains 75.6% of variance

✅ MAE: 1.234 kg CO2
   → Average error of 1.2 kg

✅ 78.9% of predictions within ±2kg
   → High practical accuracy

[Include ml_evaluation_summary.png]
```

---

## 🔧 Customization

### **Modify Synthetic Data Generation:**

Edit `generate_test_data.py`:

```python
# Add more user types
user_profiles = {
    'user_custom_type': {
        'base_distance': 20.0,
        'base_co2_factor': 0.15,
        ...
    }
}

# Generate more/less data
num_days = 90  # Instead of 60
```

### **Add More Metrics:**

Edit `evaluate.py` → `calculate_metrics()`:

```python
# Add custom metric
max_error = np.max(np.abs(residuals))

return {
    ...
    'Max_Error': float(max_error)
}
```

### **Modify Visualizations:**

Edit `evaluate.py` → `create_visualizations()`:

```python
# Add new plot
fig, ax = plt.subplots()
# ... your custom visualization
```

---

## 📝 Sample Usage Scenarios

### **Scenario 1: Quick Demo**
```bash
python run_evaluation.py
# Takes ~30 seconds
# View: evaluation_results/evaluation_report.md
```

### **Scenario 2: Test Different Configurations**
```bash
# Generate data
python generate_test_data.py

# Edit ml/train.py to change model params
# Then re-evaluate
python evaluate.py --retrain
```

### **Scenario 3: Compare with Baseline**
```bash
# The evaluation automatically includes baseline comparison
python evaluate.py
# Check "improvement_over_baseline" in results
```

---

## 🐛 Troubleshooting

### **ImportError: No module named 'sklearn'**
```bash
pip install -r requirements_ml.txt
```

### **No data found**
```bash
# Generate synthetic data first
python generate_test_data.py
```

### **"Insufficient data" errors**
```bash
# Ensure users have at least 14 days of data
# Modify generate_test_data.py to create more days
```

### **Plots not showing**
```bash
# Make sure matplotlib backend is working
# Plots are saved as PNG files automatically
```

---

## 📊 Expected Results

For the synthetic data:

- **Eco-friendly users:** R² ≈ 0.7-0.8, MAE ≈ 0.5-1.0 kg
- **Moderate users:** R² ≈ 0.6-0.7, MAE ≈ 1.0-2.0 kg  
- **High-emission users:** R² ≈ 0.5-0.7, MAE ≈ 2.0-3.0 kg

(Higher variance users are harder to predict)

---

## 🎯 Next Steps

After evaluation, you can:

1. **Tune Hyperparameters:**
   - Modify `ml/train.py`
   - Experiment with n_estimators, max_depth, etc.
   - Re-run evaluation to compare

2. **Add Features:**
   - Modify `ml/features.py`
   - Add weather, holidays, etc.
   - Re-evaluate to see improvement

3. **Try Different Models:**
   - Replace RandomForest with XGBoost, LSTM, etc.
   - Keep the same evaluation pipeline

4. **Connect to Frontend** (optional):
   - Once satisfied with ML performance
   - Integrate via API endpoints

---

## ✅ Checklist for Project Submission

- [ ] Run `python run_evaluation.py`
- [ ] Include `evaluation_results/evaluation_report.md` in documentation
- [ ] Include `evaluation_results/ml_evaluation_summary.png` in presentation
- [ ] Include 2-3 user timeseries plots
- [ ] Copy metrics table into project report
- [ ] Explain feature importance
- [ ] Discuss R² score and MAE
- [ ] Show improvement over baseline
- [ ] Mention limitations and future work

---

## 📚 Further Reading

- **Scikit-learn Metrics:** https://scikit-learn.org/stable/modules/model_evaluation.html
- **Time Series ML:** https://otexts.com/fpp3/
- **Random Forest:** https://scikit-learn.org/stable/modules/ensemble.html#forest

---

**Questions?** This evaluation suite is self-contained and doesn't require frontend integration. Perfect for ML assessment! 🎓
