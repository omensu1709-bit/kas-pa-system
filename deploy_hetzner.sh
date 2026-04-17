#!/bin/bash
# TRINITY V_APEX - Bare-Metal Deployment Script
# Target: Ubuntu 24.04 (Hetzner cpx32)

set -e

echo "--- [TRINITY V_APEX] STARTING DEPLOYMENT ---"

# 1. System Update & Dependencies
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose git python3-pip

# 2. Directory Setup
sudo mkdir -p /opt/trinity/data/duckdb
sudo chown -R $USER:$USER /opt/trinity

# 3. Code Extraction (Assuming this script is run from the repo root)
cp docker-compose.yml /opt/trinity/
cp .env /opt/trinity/
cp -r python_services/* /opt/trinity/services/

# 4. Docker Stack Launch
cd /opt/trinity
docker-compose up -d --build

echo "--- [TRINITY V_APEX] DEPLOYMENT COMPLETE ---"
echo "Monitor logs with: docker-compose logs -f"
