FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Create alerts directory
RUN mkdir -p /app/alerts

# Create non-root user
RUN useradd -m -u 1001 analyzer && chown -R analyzer:analyzer /app
USER analyzer

CMD ["python3", "-m", "src.main"]
