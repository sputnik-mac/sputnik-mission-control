# Agent Dashboard Mode — Specification

**Version:** 1.0  
**Date:** 2026-03-08  
**Status:** Proposed  

---

## Overview

Переделать главную страницу (`index.html`) так, чтобы при выборе агента открывался **персональный дашборд** этого агента + чат с ним — аналогично тому, как устроена `/health.html`.

Текущая главная: sidebar с агентами → чат посередине.  
Новая главная: sidebar с агентами → при выборе агента → **дашборд агента** (слева) + **чат** (справа, масштабируемый).

---

## Агенты и их дашборды

### 🛰️ `main` — Sputnik (System Dashboard)
Общая картина состояния всей системы.

**Метрики:**
- Uptime Gateway
- Кол-во активных сессий
- Кол-во воспоминаний в памяти (Qdrant + SQLite)
- Cron jobs (активные / последний запуск)
- Модель по умолчанию + использование
- Последние события (timeline из personal.sqlite)
- Memory growth chart

**Данные:** `/api/status`, `/api/stats`, `/api/sessions`, `/api/cron`, `/api/memory`

---

### 🔭 `pioneer` — Pioneer (GitHub Dashboard)
Всё про open source активность агента.

**Метрики:**
- Open PRs (список с названием, репо, статусом, mergeable state)
- Repos под наблюдением (Cesium, logchimp, wxt, ...)
- Статус каждого PR: open / blocked / needs rebase / waiting review
- Последние actions (что делал агент)
- Activity heatmap (PR активность по дням)
- Быстрые действия: кнопки "Rebase", "Check status", "Find new issue"

**Данные:** 
- `STATE.md` из `/Users/sputnik/.openclaw/agents/pioneer/workspace/STATE.md`
- GitHub API через `gh` CLI (через новый `/api/agents/pioneer/dashboard`)
- SQLite timeline events с тегом `pioneer`

**Quick Q кнопки чата:** `📋 PR Status` · `🔍 Find Issue` · `🔄 Rebase` · `📊 Activity`

---

### 💰 `finance` — Vault (Finance Dashboard)
Финансовая картина: доходы, цели, прогресс.

**Метрики:**
- Current salary: $2,500 USDT/month
- Target salary: $4,500/month → progress bar
- Grand goal: $10,000/month (salary + passive)
- Salary history chart (2018–2026, из MEMORY.md данных)
- Passive income streams (текущие / в разработке)
- Peak salary reference: $5,726/month (2024)
- Gap to target: -$2,000/month

**Данные:**
- Захардкоженные данные из MEMORY.md (salary таблица)
- Новый эндпоинт `/api/agents/finance/dashboard`
- SQLite entities/decisions с тегом finance
- В будущем: реальные транзакции

**Quick Q кнопки чата:** `💼 Job Search` · `📈 Passive Ideas` · `💱 USDT Tips` · `🎯 Next Step`

---

### 🏥 `health` — Doc (Health Dashboard)
Уже реализован в `/health.html`. Нужно **встроить** эту же логику в главную страницу при выборе агента health.

**Метрики (уже есть):**
- Steps / Sleep / Heart Rate / Weight
- Streak + Heatmap
- Canvas Board (live visualization)
- Insights: Positive / Attention

**Данные:** SQLite zepp_* таблицы через `/api/health/dashboard`

---

## Архитектура изменений

### Layout (index.html)

Добавить новый layout режим — `view-agent-dashboard`:

```
┌─────────────────────────────────────────────────────┐
│  Header: 🛰️ Mission Control  [chips]  [status]       │
│  Tabs: 💬 Chats · 🧠 Memory · 🕐 Jobs · ...         │
├──────────┬──────────────────────────┬───────────────┤
│  Agents  │  Agent Dashboard         │ Resize │ Chat │
│  Sidebar │  (scrollable left panel) │ Handle │ Side │
│  (w-52)  │  specific to agent       │        │ bar  │
└──────────┴──────────────────────────┴────────┴──────┘
```

В `view-chat` (текущий view) — при выборе агента с дашбордом:
- Скрыть старый `flex-1` chat-only layout
- Показать новый `agent-dashboard-layout` (дашборд + resize handle + чат)

Агент `main` — остаётся в старом чат-режиме (или system dashboard).

---

### Новые файлы

```
public/
  dashboards/
    main.js        ← System dashboard
    pioneer.js     ← GitHub dashboard  
    finance.js     ← Finance dashboard
    health.js      ← (переиспользует логику из /js/health.js)
  css/
    dashboard.css  ← общие стили для dashboard layout (из health.html)

routes/
  dashboard.js     ← /api/agents/:id/dashboard (агрегатор данных)
```

---

### API эндпоинты

#### `GET /api/agents/:id/dashboard`
Возвращает данные дашборда для конкретного агента.

**Response (pioneer):**
```json
{
  "agent": "pioneer",
  "openPRs": [
    { "repo": "ray-project/ray", "pr": 61383, "title": "Fix typo", "status": "open", "mergeable": "needs_rebase" }
  ],
  "repos": ["Cesium", "logchimp", "wxt"],
  "recentActivity": [...],
  "stats": { "openPRs": 5, "merged30d": 0, "repos": 3 }
}
```

**Response (finance):**
```json
{
  "agent": "finance",
  "currentSalary": 2500,
  "targetSalary": 4500,
  "grandGoal": 10000,
  "peak": 5726,
  "salaryHistory": [...],
  "passiveStreams": [],
  "gapToTarget": -2000
}
```

**Response (health):**  
Редирект на существующий `/api/health/dashboard`

**Response (main):**  
Агрегирует `/api/status` + `/api/stats` + `/api/sessions`

---

### Chat интеграция

Чат в dashboard режиме — тот же механизм что в `/health.html`:
- `POST /api/health/chat` (health)
- `POST /api/chat` (остальные агенты, с правильным `agentId`)
- Canvas Board — общий компонент, рендерит `<CANVAS>` блоки из ответов AI
- Каждый агент получает system context из своих данных дашборда

---

### JS архитектура (index.html)

```javascript
// agents.js — расширить selectAgent()
function selectAgent(id) {
  activeAgent = id;
  // ...existing code...
  
  if (AGENTS_WITH_DASHBOARD.includes(id)) {
    showAgentDashboard(id);   // новая функция
  } else {
    showChatOnly();           // текущее поведение
  }
}

// dashboards/pioneer.js, finance.js, etc.
// Каждый экспортирует: 
//   render(container)   — рисует дашборд
//   refresh()           — обновляет данные
//   getQuickQuestions() — кнопки быстрых вопросов
//   getChatContext()    — контекст для AI
```

---

## Визуальный стиль

Взять за основу `/health.html`:
- `glass-card` компоненты
- Chart.js для графиков
- Canvas Board (LIVE VISUALIZATION панель) — для live updates от AI
- Resize handle — пользователь сам выбирает пропорцию дашборд:чат
- Scan-grid анимация при ожидании данных
- Цветовая схема per-agent:
  - `main` → indigo (`#6366f1`)
  - `pioneer` → emerald (`#10b981`)  
  - `finance` → amber (`#f59e0b`)
  - `health` → cyan (`#00c8ff`)

---

## Приоритет реализации

| Этап | Что | Агент |
|------|-----|-------|
| 1 | Dashboard layout + resize handle в index.html | all |
| 2 | Finance dashboard (hardcoded данные из MEMORY.md) | finance |
| 3 | Pioneer dashboard (STATE.md + gh CLI) | pioneer |
| 4 | Health dashboard встроен в главную | health |
| 5 | Main/System dashboard | main |
| 6 | Canvas Board в каждом агенте | all |
| 7 | /api/agents/:id/dashboard эндпоинт | all |

---

## Out of Scope (пока)

- Real-time WebSocket обновления (позже)
- Drag-and-drop виджеты
- Кастомизация дашборда пользователем
- Mobile layout

---

*Spec by Sputnik 🛰️ | sputnik-mission-control*
