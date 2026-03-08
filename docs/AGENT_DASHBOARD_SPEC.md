# Agent Dashboard Mode — Specification

**Version:** 2.0  
**Date:** 2026-03-08  
**Status:** Proposed  

---

## Philosophy: Universal by Default

Система должна работать с **любым агентом** — существующим и будущим — без изменения кода.  
Добавил нового агента в `openclaw.json` → он автоматически получает дашборд.

Принципы:
1. **Zero hardcode** — никаких `if (agentId === 'finance') { ... }` в ядре
2. **Agent-declared** — каждый агент описывает свой дашборд через конфиг/данные
3. **Graceful empty** — нет данных → красивый "пустой" дашборд, не ошибка
4. **Canvas Board everywhere** — AI всегда может визуализировать ответ в дашборде

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: 🛰️ Mission Control  [agent chips]  [status]    │
│  Tabs: 💬 Chats · 🧠 Memory · 🕐 Jobs · 📊 Stats · …   │
├───────────┬──────────────────────────┬──────────────────┤
│  Agents   │  Dashboard Panel         │  Chat Panel      │
│  Sidebar  │  (scrollable)            │  (resizable)     │
│  (fixed)  │  ← agent-specific data   │  ← same chat UX  │
└───────────┴──────────────────────────┴──────────────────┘
                                        ↕ resize handle
```

При выборе любого агента в sidebar:
- Левая область = **Dashboard Panel** (данные агента)
- Правая область = **Chat Panel** с Canvas Board
- Drag handle между ними — пользователь сам регулирует пропорцию

---

## Universal Dashboard Engine

### Как работает

1. При `selectAgent(id)` — запрос на `GET /api/agents/:id/dashboard`
2. Сервер возвращает **Universal Dashboard Payload**
3. Клиент рендерит payload через универсальный движок — без кода под конкретный агент
4. Если у агента нет данных — рендерится "empty state" с подсказками

### Universal Dashboard Payload

```json
{
  "agentId": "trainer",
  "meta": {
    "name": "Coach",
    "emoji": "🏋️",
    "color": "#f97316",
    "description": "Your personal fitness coach"
  },
  "hero": {
    "title": "Week 3 / Cycle 2",
    "subtitle": "Push phase",
    "badge": "💪 On track",
    "stats": [
      { "label": "Sessions", "value": 3, "unit": "this week", "color": "#f97316" },
      { "label": "Volume",   "value": 8400, "unit": "kg total", "color": "#10b981" },
      { "label": "Streak",   "value": 12, "unit": "days", "color": "#6366f1" },
      { "label": "Next",     "value": "Today", "unit": "18:00", "color": "#f59e0b" }
    ]
  },
  "charts": [
    {
      "id": "volume",
      "title": "Weekly Volume",
      "type": "bar",
      "data": { "labels": [...], "values": [...] },
      "color": "#f97316"
    },
    {
      "id": "progress",
      "title": "1RM Progress",
      "type": "line",
      "data": { "labels": [...], "values": [...] },
      "color": "#10b981"
    }
  ],
  "lists": [
    {
      "id": "today",
      "title": "Today's Workout",
      "icon": "🏋️",
      "items": [
        { "label": "Squat", "value": "5×5 @ 80kg", "status": "done" },
        { "label": "Bench",  "value": "5×5 @ 60kg", "status": "pending" }
      ]
    }
  ],
  "insights": {
    "positive": ["Volume up 12% vs last week", "Streak: 12 days 🔥"],
    "attention": ["Rest day tomorrow recommended"]
  },
  "quickQuestions": [
    "📋 Today's plan",
    "📈 Progress review",
    "💪 Max weights",
    "🔄 Next cycle"
  ]
}
```

Движок на клиенте читает этот JSON и рендерит **один и тот же шаблон** для любого агента.

---

## Секции дашборда

### Hero Card (обязательная)
Всегда есть. Если данных нет — показывает имя агента + "No data yet".
- Avatar/emoji агента
- Заголовок + subtitle
- До 4 stat badges (цифры, значения)
- XP-bar (опционально — прогресс к цели)

### Charts (опционально, 0–N штук)
- `line` — тренды (шаги, вес, доход)
- `bar` — сравнения (объём тренировок, расходы по категориям)
- `doughnut` — распределения (HR zones, категории трат)
- `heatmap` — активность по дням

### Lists (опционально, 0–N штук)
Списки: PR'ы, задачи, транзакции, упражнения, события.
- `status` поле: `done` / `pending` / `blocked` / `warning`

### Insights (опционально)
- `positive` — зелёные карточки
- `attention` — оранжевые карточки
- `critical` — красные карточки

### Canvas Board (всегда)
Встроен в **Chat Panel** справа.  
При каждом ответе AI — может рендерить `<CANVAS>` блок с визуализацией прямо в дашборд.

---

## Canvas Board

Универсальный live-компонент. Работает у **всех** агентов одинаково.

AI добавляет в конец ответа `<CANVAS>` блок. Клиент парсит и рендерит:

```
<CANVAS type="stats" title="PR Status">
{"items":[{"label":"Open","value":5},{"label":"Merged","value":2}]}
</CANVAS>

<CANVAS type="actions" title="Action Plan">
{"items":[{"title":"REBASE","body":"ray-project/ray #61383 needs rebase"}]}
</CANVAS>

<CANVAS type="mermaid" title="Flow">
flowchart LR
  A[Issue Found] --> B[Fork] --> C[PR]
</CANVAS>

<CANVAS type="chart" title="Trend">
{"type":"line","labels":["Mon","Tue","Wed"],"values":[3,5,4]}
</CANVAS>
```

Типы Canvas: `stats` · `actions` · `mermaid` · `chart` · `table`

---

## Server-Side: Dashboard API

### `GET /api/agents/:id/dashboard`

Единый эндпоинт. Логика на сервере:

```
1. Читает конфиг агента из openclaw.json
2. Проверяет наличие DASHBOARD.json в workspace агента (опционально)
3. Собирает данные из доступных источников:
   - SQLite (по тегам агента)
   - STATE.md / workspace файлы
   - gh CLI (если агент = pioneer-типа)
   - hardcoded seed данные из DASHBOARD.json
4. Формирует Universal Dashboard Payload
5. Если данных нет — возвращает empty payload с meta агента
```

### Agent Dashboard Config (`DASHBOARD.json`)

Каждый агент может положить `DASHBOARD.json` в свой workspace — опционально.  
Описывает: какие данные собирать, какие быстрые вопросы показывать, seed данные.

```json
{
  "quickQuestions": ["📋 Plan", "📈 Progress"],
  "dataSources": ["sqlite:timeline", "file:STATE.md"],
  "color": "#f97316",
  "seedData": {
    "hero": { "title": "Coach AI", "badge": "Ready" }
  }
}
```

Нет `DASHBOARD.json` → дашборд всё равно работает, просто показывает базовую информацию об агенте.

---

## Client-Side: Dashboard Engine

### Файловая структура

```
public/
  dashboards/
    engine.js        ← универсальный рендерер (читает payload, рендерит виджеты)
    canvas.js        ← Canvas Board компонент (shared между всеми агентами)
    widgets/
      hero.js        ← Hero Card виджет
      chart.js       ← Chart виджет (Chart.js wrapper)
      list.js        ← List виджет
      insights.js    ← Insights виджет
      empty.js       ← Empty state виджет
  css/
    dashboard.css    ← стили (из health.html, обобщённые)
```

### Как добавить нового агента

1. Добавить агента в `openclaw.json`
2. (Опционально) создать `DASHBOARD.json` в его workspace
3. **Готово** — дашборд автоматически появится при выборе агента

Никаких изменений в коде клиента или сервера не нужно.

---

## Примеры агентов

### 🛰️ `main` — Sputnik (System)
**Данные:** `/api/status` + `/api/stats` + `/api/sessions`  
**Hero stats:** Uptime · Sessions · Memories · Cron jobs  
**Charts:** Message activity (7d), Memory growth  
**Lists:** Active sessions, Recent cron runs  

### 🔭 `pioneer` — Pioneer (GitHub)
**Данные:** `STATE.md` + `gh` CLI  
**Hero stats:** Open PRs · Repos watched · Last PR date · Merged 30d  
**Charts:** PR activity heatmap  
**Lists:** Open PRs (с mergeable status)  
**Quick Q:** `📋 PR Status` · `🔍 Find Issue` · `🔄 Rebase` · `📊 Activity`

### 💰 `finance` — Vault (Finance)
**Данные:** MEMORY.md salary данные → seed в DASHBOARD.json  
**Hero stats:** Current $2,500 · Target $4,500 · Goal $10k · Gap -$2k  
**Charts:** Salary history 2018–2026, Passive income progress  
**Lists:** Passive income streams (status: pending/active)  
**Quick Q:** `💼 Job Search` · `📈 Passive Ideas` · `💱 USDT` · `🎯 Next Step`

### 🏥 `health` — Doc (Health)
**Данные:** SQLite zepp_* таблицы через `/api/health/dashboard`  
**Hero stats:** Avg steps · Best day · Avg sleep · Avg HR  
**Charts:** Steps (90d), Sleep, Weight, Heart Rate  
**Heatmap:** Streak 60 дней  
**Quick Q:** `💤 Sleep` · `⚖️ Weight` · `🏃 Plan` · `❤️ HR`

### 🏋️ `trainer` — Coach (будущий пример)
**Данные:** DASHBOARD.json с workout данными  
**Hero stats:** Sessions/week · Volume · Streak · Next workout  
**Charts:** Weekly volume, 1RM progress  
**Lists:** Today's workout plan  
**Quick Q:** `📋 Today's plan` · `📈 Progress` · `💪 Max weights`

---

## Цветовая схема

Цвет берётся из `DASHBOARD.json` агента или дефолт из `openclaw.json identity`.  
Если не указан — генерируется детерминированно из `agentId` (hue rotation).

| Agent | Color |
|-------|-------|
| main | `#6366f1` (indigo) |
| pioneer | `#10b981` (emerald) |
| finance | `#f59e0b` (amber) |
| health | `#00c8ff` (cyan) |
| trainer | `#f97316` (orange) |
| (любой новый) | auto из agentId hash |

---

## Приоритет реализации

| Этап | Что | Результат |
|------|-----|-----------|
| 1 | Dashboard layout в index.html + resize handle | Скелет работает для всех |
| 2 | `engine.js` — универсальный рендерер payload | Любой агент рендерится |
| 3 | `canvas.js` — Canvas Board компонент | AI визуализирует везде |
| 4 | `/api/agents/:id/dashboard` — базовый эндпоинт | API работает |
| 5 | Finance dashboard (DASHBOARD.json с seed данными) | Первый реальный дашборд |
| 6 | Pioneer dashboard (STATE.md + gh CLI) | GitHub данные live |
| 7 | Health dashboard встроен в главную | health.html → deprecated |
| 8 | Main/System dashboard | Полная картина системы |

---

## Out of Scope (пока)

- Real-time WebSocket обновления
- Drag-and-drop виджеты / кастомизация layout
- Mobile layout
- Dashboard builder UI (настройка через интерфейс)

---

*Spec v2.0 by Sputnik 🛰️ | sputnik-mission-control*
