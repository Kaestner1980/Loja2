# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sistema de Gestão para Loja de Bijuterias e Maquiagem (Jewelry & Makeup Store Management System) - a complete POS and retail management solution for a physical store. This project is currently in the **specification/planning phase** with no implementation code yet.

## Recommended Tech Stack

**Monorepo structure using Turbo:**
```
loja-bijuterias/
├── apps/
│   ├── desktop/          # Electron + React (PDV - main POS interface)
│   ├── web/              # Next.js (admin panel)
│   └── mobile/           # React Native + Expo (queries)
├── packages/
│   ├── database/         # Prisma schema + migrations
│   ├── api/              # Fastify backend
│   ├── ui/               # shadcn/ui shared components
│   └── utils/            # Utility functions
├── docker-compose.yml
└── turbo.json
```

## Running the Application

**Terminal 1 - Backend:**
```bash
cd backend
pnpm install              # First time only
pnpm dev                  # Start API at http://localhost:3333
```

**Terminal 2 - Frontend:**
```bash
cd frontend
pnpm install              # First time only
pnpm dev:web              # Start web at http://localhost:5173
```

**Acesse:** http://localhost:5173 (todas as requisições API são proxy para o backend)

**Default Login:**
| Login | Password | Level |
|-------|----------|-------|
| admin | admin123 | ADMIN |
| fabi | gerente123 | GERENTE |
| maria | vendedor123 | VENDEDOR |

## Architecture Decisions

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand
- **Backend:** Node.js 20 LTS + Fastify + Prisma ORM
- **Database:** PostgreSQL 16 (server) + SQLite (offline desktop)
- **Cache:** Redis + BullMQ for background jobs
- **Desktop:** Electron for Windows/Mac/Linux with offline-first SQLite sync
- **Mobile (optional):** React Native with Expo or Flutter

## Key System Modules

1. **Cadastros** - Products, customers, suppliers, employees with role-based permissions
2. **PDV (Frente de Caixa)** - Ultra-fast POS (max 5 clicks, <30 sec per sale), barcode scanning, multiple payment methods
3. **Estoque** - Automatic stock deduction on sales, alerts, inventory counting
4. **Financeiro** - Accounts payable/receivable, cash flow, simplified DRE
5. **Relatórios** - Dashboard, sales reports, ABC curve, PDF/Excel export
6. **Gestão de Estoque** - Quick stock movements for owner (F2 shortcut)
7. **Venda Rápida** - Instant checkout with automatic receipt printing

## Brazilian Fiscal Compliance

- NFC-e (Nota Fiscal do Consumidor Eletrônica) via node-nfe, nfe-io, or Focus NFe
- SAT integration for São Paulo state via node-sat
- Thermal printer support (58mm/80mm) via node-thermal-printer + escpos

## Hardware Integrations

- Thermal receipt printers (ESC/POS protocol)
- Barcode readers (HID keyboard mode or quagga2 for camera)
- Cash drawer (triggered via printer commands)

## Performance Requirements

- Product search: <0.5 seconds
- Complete sale finalization: <1 second
- Receipt generation: <3 seconds
- Sales must work completely offline (desktop)

## Reference Documentation

- `prompt-loja-bijuterias-maquiagem.md` - Complete product requirements (9 modules, UI wireframes, workflows)
- `stack-tecnologico-loja.md` - Technology stack decisions, architecture diagrams, implementation roadmap
