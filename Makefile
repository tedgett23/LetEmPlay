.DEFAULT_GOAL := help
# Keep typechecking, linting, unit workers, and browser workers from competing for RAM.
.NOTPARALLEL:
.PHONY: help setup unit watch smoke e2e test verify check lint release

PROJECT ?= iphone
SPEC ?= tests/block-drop.e2e.ts
PW_ARGS ?=

help:
	@echo 'make setup   Install locked dependencies and the two mobile browser engines'
	@echo 'make unit    Run Node unit tests once (make watch for watch mode)'
	@echo 'make smoke   Run a focused browser spec; set PROJECT, SPEC, or PW_ARGS'
	@echo 'make e2e     Run the full production browser suite (both engines)'
	@echo 'make test    Run unit and full browser suites'
	@echo 'make release Budgets, CSP, links and URL audit on build/'
	@echo 'make verify  PR gate: types, lint, unit, build, both browsers, release checks'

setup:
	pnpm install --frozen-lockfile
	pnpm test:e2e:install

unit:
	pnpm test:unit --run

watch:
	pnpm test:unit --watch

smoke:
	pnpm test:e2e --project=$(PROJECT) $(SPEC) $(PW_ARGS)

# Playwright's webServer builds once per invocation and previews that output for both projects.
e2e:
	pnpm test:e2e

test: unit e2e

check:
	pnpm check

lint:
	pnpm lint

# The browser suite leaves its production build in build/; check that exact output.
release:
	pnpm release-check

verify: check lint test release
