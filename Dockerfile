# --- Stage 1: Builder ---
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment to keep dependencies isolated
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# --- Stage 2: Final ---
FROM python:3.11-slim

WORKDIR /app

# Copy the virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy backend source code
COPY backend/ ./backend/

# Copy LOCALLY BUILT frontend assets
COPY frontend/dist ./frontend/dist

# Expose the FastAPI port
EXPOSE 8000

# Environment variables
ENV POCKETBASE_URL=http://pocketbase:8090
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend
CMD ["python", "main.py"]
