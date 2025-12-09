FROM python:3.12.9-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Django project
COPY . .

# Default port for local runs; Cloud Run sets $PORT
EXPOSE 8000

# Collect static assets
RUN python manage.py collectstatic --noinput

# Run Django via gunicorn; shell expands $PORT with default 8000; log access to stdout
CMD ["sh", "-c", "gunicorn chess_arena.wsgi:application --bind 0.0.0.0:${PORT:-8000} --access-logfile - --error-logfile -"]