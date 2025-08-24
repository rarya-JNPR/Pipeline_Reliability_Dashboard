SHELL := /bin/bash

.PHONY: dev up down logs seed

dev:
	cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

up:
	docker compose up --build

down:
	docker compose down -v

logs:
	docker compose logs -f | cat

seed:
	curl -X POST http://localhost:8000/api/webhooks/github -H 'Content-Type: application/json' -d '{"provider":"github","pipeline_name":"sample-ci","status":"success","started_at":"2025-01-01T10:00:00Z","finished_at":"2025-01-01T10:03:00Z","commit":"abc123","branch":"main","url":"https://github.com/org/repo/actions/runs/1","logs":"Build completed"}'


