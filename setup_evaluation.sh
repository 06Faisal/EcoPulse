#!/bin/bash

# EcoPulse AI - ML Evaluation Quick Setup
# This script sets up everything you need for ML evaluation

echo "========================================="
echo "EcoPulse AI - ML Evaluation Setup"
echo "========================================="
echo ""

# 1. Create directory structure
echo "📁 Creating directories..."
mkdir -p ml data models evaluation_results
echo "✅ Directories created"
echo ""

# 2. Copy ML package files
echo "📦 Setting up ML package..."
echo "Please ensure these files are in the ml/ directory:"
echo "  - __init__.py"
echo "  - storage.py"
echo "  - features.py"
echo "  - train.py"
echo "  - predict.py"
echo "  - cluster.py"
echo "  - (Also copy app.py to the root)"
echo ""

# 3. Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements_ml.txt
echo "✅ Dependencies installed"
echo ""

# 4. Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x run_evaluation.py
chmod +x generate_test_data.py
chmod +x evaluate.py
echo "✅ Scripts ready"
echo ""

echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Ensure your ml/ package files are in place"
echo "  2. Run: python run_evaluation.py"
echo ""
echo "Or step-by-step:"
echo "  1. python generate_test_data.py"
echo "  2. python evaluate.py --retrain"
echo ""
echo "Results will be in: evaluation_results/"
echo "========================================="
