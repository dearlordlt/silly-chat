# Build context is the repo root (so we can copy config.toml alongside backend/).
FROM python:3.12-slim

# uv for fast, reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /srv/backend
ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/srv/backend/.venv \
    PATH="/srv/backend/.venv/bin:$PATH"

# Install deps first (cached layer).
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# App code + non-secret config (config.py resolves ROOT=/srv).
COPY backend/ /srv/backend/
COPY config.toml /srv/config.toml
COPY CHANGELOG.md HELP.md /srv/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
