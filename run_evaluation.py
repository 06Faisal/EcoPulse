#!/usr/bin/env python3
"""
EcoPulse AI - Complete ML Evaluation Pipeline
Runs: Data generation -> training -> evaluation -> report
"""

import sys
import subprocess
from pathlib import Path

def run_step(description, command):
    """Run a pipeline step"""
    print("\n" + "=" * 80)
    print(f"STEP: {description}")
    print("=" * 80)
    
    result = subprocess.run(command, shell=True)
    
    if result.returncode != 0:
        print(f"\n[FAIL] Error in step: {description}")
        return False
    
    print(f"\n[OK] Completed: {description}")
    return True


def main():
    # Plain ASCII: box-drawing and emoji raise UnicodeEncodeError on a Windows
    # console, which defaults to cp1252 and cannot encode them.
    print("\n" + "=" * 60)
    print("EcoPulse - ML Evaluation Pipeline")
    print("=" * 60)

    # Step 1: Generate synthetic test data
    if not run_step(
        "Generate Synthetic Test Data",
        f"{sys.executable} generate_test_data.py"
    ):
        return
    
    # Step 2: Run evaluation (with training)
    if not run_step(
        "Train Models & Run Evaluation",
        f"{sys.executable} evaluate.py --retrain"
    ):
        return
    
    print("\n" + "=" * 60)
    print("Pipeline complete. Results in evaluation_results/:")
    print("  evaluation_report.md      summary write-up")
    print("  aggregated_metrics.json   metrics across all users")
    print("  individual_results.json   per-user metrics")
    print("  ml_evaluation_summary.png, user_*_timeseries.png")
    print("=" * 60)


if __name__ == "__main__":
    main()
