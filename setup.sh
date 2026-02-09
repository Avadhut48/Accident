#!/bin/bash

# Mumbai Safe Route Navigator - Quick Start Script

echo "🚗 Mumbai Safe Route Navigator - Setup Script"
echo "=============================================="
echo ""

# Check Python version
echo "Checking Python version..."
python3 --version

if [ $? -ne 0 ]; then
    echo "❌ Python 3 is not installed. Please install Python 3.9 or higher."
    exit 1
fi

echo "✅ Python is installed"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Generate data
echo "📊 Generating synthetic accident data..."
cd data
python generate_data.py

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate data"
    exit 1
fi

echo "✅ Data generated"
echo ""

# Train model
echo "🤖 Training machine learning model..."
cd ..
python models/train_model.py

if [ $? -ne 0 ]; then
    echo "❌ Failed to train model"
    exit 1
fi

echo "✅ Model trained successfully"
echo ""

echo "=============================================="
echo "✅ Setup complete! Ready to run the application."
echo ""
echo "To start the server, run:"
echo "  python app.py"
echo ""
echo "Then open your browser to: http://localhost:5000"
echo "=============================================="
