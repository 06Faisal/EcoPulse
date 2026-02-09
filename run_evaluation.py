#!/usr/bin/env python3
"""
EcoPulse AI - Complete ML Evaluation Pipeline
Runs: Data Generation → Training → Evaluation → Report Generation
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
        print(f"\n❌ Error in step: {description}")
        return False
    
    print(f"\n✅ Completed: {description}")
    return True


def main():
    print("""
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           EcoPulse AI - ML Evaluation Pipeline               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
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
    
    print("\n" + "=" * 80)
    print("🎉 PIPELINE COMPLETE!")
    print("=" * 80)
    print("\nResults available in:")
    print("  📁 evaluation_results/")
    print("     ├── 📄 evaluation_report.md")
    print("     ├── 📊 ml_evaluation_summary.png")
    print("     ├── 📈 user_*_timeseries.png")
    print("     ├── 📋 aggregated_metrics.json")
    print("     └── 📋 individual_results.json")
    print("\nView the report:")
    print(f"  cat evaluation_results/evaluation_report.md")


if __name__ == "__main__":
    main()
