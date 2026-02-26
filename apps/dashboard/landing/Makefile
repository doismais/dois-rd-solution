# ==========================================
# Troia Produções - Advanced Makefile
# Philosophy: NΞØ Protocol / Sovereign Infrastructure
# ==========================================

# Variables
PROJECT_NAME := troia-rdstation
SHELL := /bin/bash
NODE_BIN := ./node_modules/.bin

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: all help install dev build deploy prod audit clean safe-push check-env health-check

all: help

help:
	@echo -e "$(CYAN)Available commands:$(NC)"
	@echo -e "  $(GREEN)make install$(NC)      - Install dependencies"
	@echo -e "  $(GREEN)make dev$(NC)          - Start local development server (Vercel Dev)"
	@echo -e "  $(GREEN)make build$(NC)        - Prepare build"
	@echo -e "  $(GREEN)make deploy$(NC)       - Deploy to Vercel (preview)"
	@echo -e "  $(GREEN)make prod$(NC)         - Deploy to Vercel (production)"
	@echo -e "  $(GREEN)make audit$(NC)        - Run security audit"
	@echo -e "  $(GREEN)make check-env$(NC)    - Verify .env variables"
	@echo -e "  $(GREEN)make clean$(NC)        - Clean temporary files"
	@echo -e "  $(YELLOW)make safe-push$(NC)   - [NΞØ Protocol] Audit -> Build -> Commit -> Push"

install:
	@echo -e "$(CYAN)Installing dependencies...$(NC)"
	@npm install

dev:
	@echo -e "$(CYAN)Starting Vercel development server...$(NC)"
	@vercel dev

build:
	@echo -e "$(CYAN)Validating project...$(NC)"
	@# Since it's a static + serverless setup, we just check if key files exist
	@ls index.html api/rd/auth.js api/rd/callback.js > /dev/null
	@echo -e "$(GREEN)Ready for deployment.$(NC)"

deploy:
	@echo -e "$(CYAN)Deploying to Vercel Preview...$(NC)"
	@vercel

prod:
	@echo -e "$(CYAN)Deploying to Vercel Production...$(NC)"
	@vercel --prod

audit:
	@echo -e "$(CYAN)Checking for vulnerabilities...$(NC)"
	@npm audit || echo -e "$(YELLOW)Audit finished with warnings.$(NC)"

check-env:
	@echo -e "$(CYAN)Verifying Environment Variables...$(NC)"
	@test -f .env || (echo -e "$(RED).env file missing!$(NC)" && exit 1)
	@grep -q "RD_CLIENT_ID" .env || (echo -e "$(RED)RD_CLIENT_ID missing in .env$(NC)" && exit 1)
	@grep -q "RD_CLIENT_SECRET" .env || (echo -e "$(RED)RD_CLIENT_SECRET missing in .env$(NC)" && exit 1)
	@grep -q "RD_REDIRECT_URI" .env || (echo -e "$(RED)RD_REDIRECT_URI missing in .env$(NC)" && exit 1)
	@echo -e "$(GREEN)Environment is valid.$(NC)"

health-check:
	@echo -e "$(CYAN)Checking API Endpoints...$(NC)"
	@test -f api/rd/auth.js && echo -e "$(GREEN)✔ /api/rd/auth exists$(NC)"
	@test -f api/rd/callback.js && echo -e "$(GREEN)✔ /api/rd/callback exists$(NC)"
	@test -f index.html && echo -e "$(GREEN)✔ index.html exists$(NC)"

clean:
	@echo -e "$(CYAN)Cleaning up...$(NC)"
	@rm -rf .vercel
	@rm -rf node_modules
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
