# ==========================================
# Dois Mais - Ecosystem Makefile
# Philosophy: NΞØ Protocol / Sovereign Infrastructure
# ==========================================

# Variables
PROJECT_NAME := dois-mais-rd-solution
SHELL := /bin/bash

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: all help install dev-dashboard dev-client build clean safe-push audit check-env deploy-logs

all: help

help:
	@echo -e "$(CYAN)Available commands for $(PROJECT_NAME):$(NC)"
	@echo -e "  $(GREEN)make install$(NC)       - Install all dependencies (Root, Dashboard, Client)"
	@echo -e "  $(GREEN)make dev-api$(NC)       - Start Dashboard Fastify API (Watch mode)"
	@echo -e "  $(GREEN)make dev-client$(NC)    - Start Dashboard React Client (Vite)"
	@echo -e "  $(GREEN)make build$(NC)         - Build Dashboard (API and Client)"
	@echo -e "  $(GREEN)make audit$(NC)         - Run security audit across the project"
	@echo -e "  $(GREEN)make check-env$(NC)     - Verify .env variables for Dashboard"
	@echo -e "  $(GREEN)make clean$(NC)         - Remove dist folders and node_modules"
	@echo -e "  $(YELLOW)make safe-push$(NC)    - [NΞØ Protocol] Audit -> Build -> Commit -> Push"
	@echo -e "  $(CYAN)make deploy-logs$(NC)   - View Railway deployment logs"

install:
	@echo -e "$(CYAN)Installing root dependencies...$(NC)"
	@npm install
	@echo -e "$(CYAN)Installing dashboard dependencies...$(NC)"
	@cd apps/dashboard && npm install
	@echo -e "$(CYAN)Installing dashboard client dependencies...$(NC)"
	@cd apps/dashboard/client && npm install
	@echo -e "$(GREEN)All dependencies installed.$(NC)"

dev-api:
	@echo -e "$(CYAN)Starting Dashboard API (Fastify)...$(NC)"
	@cd apps/dashboard && npm run dev

dev-client:
	@echo -e "$(CYAN)Starting Dashboard Client (Vite)...$(NC)"
	@cd apps/dashboard && npm run client:dev

build:
	@echo -e "$(CYAN)Building Dashboard Client...$(NC)"
	@cd apps/dashboard && npm run client:build
	@echo -e "$(CYAN)Building Dashboard API...$(NC)"
	@cd apps/dashboard && npm run build
	@echo -e "$(GREEN)Build completed successfully.$(NC)"

audit:
	@echo -e "$(CYAN)Checking for vulnerabilities...$(NC)"
	@npm audit || echo -e "$(YELLOW)Audit finished with warnings.$(NC)"

check-env:
	@echo -e "$(CYAN)Verifying Environment Variables...$(NC)"
	@test -f apps/dashboard/.env || (echo -e "$(RED)apps/dashboard/.env file missing!$(NC)" && exit 1)
	@grep -q "RD_CLIENT_ID" apps/dashboard/.env || (echo -e "$(RED)RD_CLIENT_ID missing$(NC)" && exit 1)
	@grep -q "RD_CLIENT_SECRET" apps/dashboard/.env || (echo -e "$(RED)RD_CLIENT_SECRET missing$(NC)" && exit 1)
	@grep -q "TURSO_DATABASE_URL" apps/dashboard/.env || (echo -e "$(RED)TURSO_DATABASE_URL missing$(NC)" && exit 1)
	@echo -e "$(GREEN)Environment is valid.$(NC)"

deploy-logs:
	@echo -e "$(CYAN)Fetching Railway logs...$(NC)"
	@railway logs

clean:
	@echo -e "$(CYAN)Cleaning up...$(NC)"
	@rm -rf apps/dashboard/dist
	@rm -rf apps/dashboard/public/assets
	@rm -rf node_modules apps/dashboard/node_modules apps/dashboard/client/node_modules
	@echo -e "$(GREEN)Cleaned.$(NC)"

# NΞØ Protocol - Safe Commit and Push
safe-push: audit build
	@echo -e "$(YELLOW)Preparing for Safe Push...$(NC)"
	@if [ -z "$$(git status --porcelain)" ]; then \
		echo -e "$(RED)No changes to commit.$(NC)"; \
	else \
		git add .; \
		echo -e "$(CYAN)Enter commit message (Conventional Commits): $(NC)"; \
		read msg; \
		if [ -z "$$msg" ]; then \
			echo -e "$(RED)Aborted: Commit message is required.$(NC)"; \
			exit 1; \
		fi; \
		git commit -m "$$msg"; \
		echo -e "$(CYAN)Pushing to repository...$(NC)"; \
		git push origin $$(git rev-parse --abbrev-ref HEAD); \
		echo -e "$(GREEN)Done! NΞØ Protocol execution completed successfully.$(NC)"; \
	fi
