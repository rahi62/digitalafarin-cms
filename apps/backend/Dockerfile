FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY packages/cms-django /tmp/cms-django
COPY apps/backend/requirements.txt /tmp/host-requirements.txt
RUN pip install --no-cache-dir "/tmp/cms-django[all]" -r /tmp/host-requirements.txt

COPY apps/backend /app
EXPOSE 8000
