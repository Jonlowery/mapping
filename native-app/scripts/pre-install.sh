#!/bin/bash
echo "Current user: $(whoami)"
echo "Working directory: $(pwd)"
echo "Parent directory permissions: $(ls -ld .)"
chmod -R u+w . || echo "Failed to chmod parent directory"
mkdir -p node_modules || echo "Failed to create node_modules"
chmod -R u+w node_modules || echo "Failed to chmod node_modules"
echo "node_modules permissions: $(ls -ld node_modules)"