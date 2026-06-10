#!/bin/bash

# Windross Tailoring - Production Zip Builder
# This script packages the project for final client delivery,
# strictly excluding development artifacts, node_modules, and local databases.

# Exit immediately if a command exits with a non-zero status
set -e

echo "Building production delivery zip..."

# Target zip file name
ZIP_NAME="windross_delivery.zip"

# Remove existing zip if it exists
if [ -f "$ZIP_NAME" ]; then
    rm "$ZIP_NAME"
fi

# Create the zip, excluding unwanted directories and files
zip -r "$ZIP_NAME" . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x "__MACOSX/*" \
    -x "*.DS_Store" \
    -x ".vscode/*" \
    -x "temp/*" \
    -x "server/db/*.sqlite" \
    -x "server/db/*.sqlite-journal" \
    -x "server/db/*.sqlite-wal" \
    -x "server/db/*.sqlite-shm" \
    -x "server/*.db" \
    -x "server/*.sqlite" \
    -x "server/*.sqlite-journal" \
    -x "server/*.sqlite-wal" \
    -x "server/*.sqlite-shm" \
    -x "scripts/test*" \
    -x "*.pdf" \
    -x "*.zip" \
    -x "$ZIP_NAME"

echo "========================================="
echo "✅ Build complete: $ZIP_NAME"
echo "========================================="
echo "This zip file is clean and ready for production deployment."
echo "The deployment server should run 'npm install' or 'npm ci' to install dependencies."
