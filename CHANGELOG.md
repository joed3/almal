# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- Initial project scaffold with `pyproject.toml` (hatchling build, uv dependency groups)
- FastAPI backend skeleton with `/health` endpoint and Pydantic response model
- `pydantic-settings`-based `Settings` class loading from `.env`
- Agent stubs: `OrchestratorAgent`, `ResearchAgent`, `OptimizerAgent`, `ReviewAgent`
- `pytest` test suite with async `httpx` client fixture and health endpoint test
- React + TypeScript frontend shell created via Vite with Tailwind CSS (v4) and `react-router-dom`
- Dark-themed sidebar navigation with placeholder pages: Portfolio Profiler, Investigator, Optimizer
- Pre-commit hooks: `pre-commit-hooks`, `black`, `ruff`, `mypy`, `pytest`
- `.env.example` with `ANTHROPIC_API_KEY` placeholder
