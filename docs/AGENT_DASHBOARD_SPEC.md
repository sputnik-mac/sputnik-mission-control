# Agent Dashboard Mode — Specification

**Version:** 3.0  
**Date:** 2026-03-08  
**Status:** Ready for Implementation  

---

## Philosophy: Universal by Default

Система должна работать с **любым агентом** — существующим и будущим — без изменения кода ядра.  
Добавил нового агента в `openclaw.json` → он автоматически получает дашборд.

Принципы:
1. **Zero hardcode в ядре** — никаких `if (agentId === 'finance')` в server.js или engine.js
2. **Agent-declared** — каждый агент сам описывает свои данные через `mapper.js` и `DASHBOARD.json`
3. **Graceful degradation** — нет данных → красивый empty state; упал один источник → остальные виджеты живут
4. **Canvas Board everywhere** — AI всегда может визуализировать ответ прямо в дашборде
5. **Trigger-driven chat** — любой элемент дашборда может запустить чат с агентом

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: 🛰️ Mission Control  [agent chips]  [status]    │
│  Tabs: 💬 Chats · 🧠 Memory · 🕐 Jobs · 📊 Stats · …   │
├───────────┬──────────────────────────┬──────────────────┤
│  Agents   │  Dashboard Panel         │  Chat Panel      │
│  Sidebar  │  (scrollable)            │  (resizable)     │
│  (fixed)  │  ← agent-specific data   │  ← Canvas Board  │
└───────────┴──────────────────────────┴──────────────────┘
                                        ↕ resize handle
```

При выборе любого агента в sidebar:
- Левая область = **Dashboard Panel** (данные агента)
- Правая область = **Chat Panel** с Canvas Board
- Drag handle между ними — пользователь сам регулирует пропорцию

---

## Universal Dashboard Payload

Единая схема данных, которую сервер возвращает для любого агента.  
Клиентский движок рендерит её — без знания о конкретном агенте.

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
    "xp": 0.65,
    "stats": [
      { "label": "Sessions", "value": 3,       "unit": "this week", "color": "#f97316" },
      { "label": "Volume",   "value": 8400,     "unit": "kg total",  "color": "#10b981" },
      { "label": "Streak",   "value": 12,       "unit": "days",      "color": "#6366f1" },
      { "label": "Next",     "value": "Today",  "unit": "18:00",     "color": "#f59e0b" }
    ]
  },
  "widgets": [
    {
      "id": "volume_chart",
      "type": "chart",
      "title": "Weekly Volume",
      "error": null,
      "data": {
        "chartType": "bar",
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "values": [3200, 0, 4100, 0, 1100],
        "color": "#f97316"
      }
    },
    {
      "id": "today_plan",
      "type": "list",
      "title": "Today's Workout",
      "icon": "🏋️",
      "error": null,
      "data": {
        "items": [
          {
            "label": "Squat",
            "value": "5×5 @ 80kg",
            "status": "done",
            "trigger": "Analyse my squat progress and suggest next weight"
          },
          {
            "label": "Bench Press",
            "value": "5×5 @ 60kg",
            "status": "pending",
            "trigger": "What should my bench press target be today?"
          }
        ]
      }
    },
    {
      "id": "github_prs",
      "type": "list",
      "title": "Open PRs",
      "icon": "🔀",
      "error": "GitHub API unavailable — showing cached data",
      "data": {
        "items": [
          { "label": "ray-project/ray #61383", "value": "needs rebase", "status": "warning",
            "trigger": "What do I need to do to rebase ray-project/ray #61383?" }
        ]
      }
    }
  ],
  "insights": {
    "positive": ["Volume up 12% vs last week", "Streak: 12 days 🔥"],
    "attention": ["Rest day tomorrow recommended"],
    "critical": []
  },
  "quickQuestions": [
    "📋 Today's plan",
    "📈 Progress review",
    "💪 Max weights",
    "🔄 Next cycle"
  ]
}
```

### Поле `error` в виджете

Каждый виджет имеет опциональное поле `error: string | null`.  
- `null` — данные загружены успешно, виджет рендерится нормально  
- `string` — показывается предупреждение внутри виджета, остальное содержимое рендерится из кэша или не рендерится  
- Один упавший виджет **не ронает** весь дашборд

---

## Server-Side: Dashboard API

### `GET /api/agents/:id/dashboard`

Единый эндпоинт. Ядро сервера (`routes/dashboard.js`) не содержит логику конкретных агентов.

```
1. Читает конфиг агента из openclaw.json → получает workspace path
2. Ищет mapper в workspace агента: {workspace}/dashboard/mapper.js
3. Если mapper есть → вызывает его, передаёт raw data sources
4. Если mapper нет → возвращает базовый empty payload с meta агента
5. Обогащает payload общими данными (agent info, last active, model)
6. Возвращает Universal Dashboard Payload
```

### Адаптеры (Mappers) — изоляция бизнес-логики

**Главный принцип:** сервер не знает, как работает агент. Агент сам описывает свои данные.

Каждый агент кладёт `mapper.js` в свой workspace:

```
/agents/pioneer/workspace/dashboard/mapper.js
/agents/finance/workspace/dashboard/mapper.js
/agents/health/workspace/dashboard/mapper.js
/agents/trainer/workspace/dashboard/mapper.js   ← будущий агент
```

Интерфейс mapper'а — строго типизированный контракт:

```javascript
// {workspace}/dashboard/mapper.js
// Сигнатура: mapper(rawData) → Universal Dashboard Payload

module.exports = async function mapper(rawData) {
  // rawData содержит:
  // rawData.sqlite    — объект db (better-sqlite3, readonly)
  // rawData.files     — { [filename]: string } — файлы из workspace
  // rawData.agentMeta — { id, name, emoji, model }
  // rawData.env       — переменные окружения (GITHUB_TOKEN и т.д.)

  // Пример: pioneer mapper
  const stateFile = rawData.files["STATE.md"] || "";
  const openPRs = parseStateMd(stateFile);

  return {
    meta: {
      name: rawData.agentMeta.name,
      emoji: rawData.agentMeta.emoji,
      color: "#10b981",
    },
    hero: {
      title: `${openPRs.length} Open PRs`,
      stats: [
        { label: "Open PRs",  value: openPRs.length,  color: "#10b981" },
        { label: "Repos",     value: 3,                color: "#6366f1" },
      ]
    },
    widgets: [
      {
        id: "open_prs",
        type: "list",
        title: "Open PRs",
        error: null,
        data: {
          items: openPRs.map(pr => ({
            label: pr.repo,
            value: pr.status,
            status: pr.mergeable === "blocked" ? "warning" : "pending",
            trigger: `What is the current status of PR ${pr.url} and what needs to be done?`
          }))
        }
      }
    ],
    quickQuestions: ["📋 PR Status", "🔍 Find Issue", "🔄 Rebase", "📊 Activity"]
  };
};
```

Сервер (`routes/dashboard.js`) — только оркестратор:

```javascript
router.get("/agents/:id/dashboard", async (req, res) => {
  const { id } = req.params;
  const agentMeta = getAgentMeta(id);               // из openclaw.json
  const mapperPath = `${agentMeta.workspace}/dashboard/mapper.js`;

  let payload;
  if (fs.existsSync(mapperPath)) {
    const mapper = require(mapperPath);
    const rawData = await collectRawData(agentMeta); // sqlite + files + env
    payload = await mapper(rawData);
  } else {
    payload = buildEmptyPayload(agentMeta);          // graceful fallback
  }

  payload.agentId = id;
  res.json(payload);
});
```

`collectRawData()` — единственное место, где сервер знает о доступных источниках:
- SQLite (`personal.sqlite`) — read-only доступ
- Файлы workspace агента (`STATE.md`, `DASHBOARD.json`, и т.д.)
- Переменные среды (токены для внешних API)

Добавить нового агента = написать `mapper.js` в его workspace. **Ядро не трогается.**

---

## Client-Side: Dashboard Engine

### Файловая структура

```
public/
  dashboards/
    engine.js          ← универсальный рендерер payload → DOM
    canvas.js          ← Canvas Board (shared, все агенты)
    refresh.js         ← стратегия обновления дашборда
    widgets/
      hero.js          ← Hero Card
      chart.js         ← Chart.js wrapper
      list.js          ← List (с trigger поддержкой)
      insights.js      ← Insights (positive/attention/critical)
      empty.js         ← Empty state
      error.js         ← Partial error badge внутри виджета
  css/
    dashboard.css      ← стили (обобщены из health.html)
```

### engine.js — рендеринг payload

```javascript
// engine.js
function renderDashboard(payload, container) {
  container.innerHTML = "";
  renderHero(payload.hero, payload.meta, container);
  for (const widget of payload.widgets ?? []) {
    renderWidget(widget, container);
  }
  renderInsights(payload.insights, container);
}

function renderWidget(widget, container) {
  // Если есть ошибка — рендерим error badge, но не скрываем виджет
  const el = createWidgetShell(widget);
  if (widget.error) renderErrorBadge(el, widget.error);

  switch (widget.type) {
    case "chart":   renderChart(el, widget.data);   break;
    case "list":    renderList(el, widget.data);    break;
    // ... другие типы
  }
  container.appendChild(el);
}
```

### Интерактивность виджетов — Trigger System

**Элементы списков** (`list` виджеты) работают как триггеры чата.

Если у item есть поле `trigger: string` — элемент кликабелен. При клике:
1. Промпт из `trigger` вставляется в чат-инпут
2. Автоматически отправляется агенту
3. Canvas Board обновляется с ответом

```javascript
// list.js
function renderList(container, data) {
  for (const item of data.items) {
    const el = createListItem(item);
    if (item.trigger) {
      el.classList.add("clickable");
      el.title = "Click to ask agent";
      el.addEventListener("click", () => {
        sendChatMessage(item.trigger); // → chat.js
      });
    }
    container.appendChild(el);
  }
}
```

Визуально: кликабельные items имеют hover-эффект + иконку `→` справа.  
Механика идентична Quick Questions — просто триггер находится внутри виджета.

**Charts** — клик по точке/бару отправляет контекстный промпт:

```javascript
// chart.js
onClick: (event, elements) => {
  if (!elements.length) return;
  const label = chart.data.labels[elements[0].index];
  const value = chart.data.datasets[0].data[elements[0].index];
  sendChatMessage(`Tell me more about ${label}: ${value}`);
}
```

---

## Стратегия обновления UI (Refresh Logic)

WebSockets — Out of Scope. Используется polling + event-driven refresh.

### Триггеры обновления Dashboard Panel

| Событие | Действие |
|---------|----------|
| Пользователь выбрал агента (`selectAgent`) | Полная загрузка `GET /api/agents/:id/dashboard` |
| Окно получило фокус (`window focus`) | Тихое обновление, если прошло > 60 сек с последнего |
| Агент завершил ответ в чате | Лёгкое обновление (только данные, без skeleton) |
| Пользователь нажал ↻ кнопку | Принудительная полная перезагрузка |

### Реализация (refresh.js)

```javascript
// refresh.js
let lastRefresh = 0;
const STALE_AFTER = 60 * 1000; // 60 секунд

async function refreshDashboard(agentId, { force = false, silent = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRefresh < STALE_AFTER) return;

  if (!silent) showSkeleton();         // scan-line анимация
  const payload = await fetchDashboard(agentId);
  renderDashboard(payload, dashContainer);
  lastRefresh = now;
}

// Триггеры:
window.addEventListener("focus", () => refreshDashboard(activeAgent, { silent: true }));
window.addEventListener("agentChatDone", () => refreshDashboard(activeAgent, { silent: true }));
document.getElementById("refresh-btn").onclick = () => refreshDashboard(activeAgent, { force: true });
```

`agentChatDone` — custom event, который диспатчится в `chat.js` при получении финального ответа.

---

## Canvas Board

Универсальный live-компонент. Работает у **всех** агентов одинаково.  
Встроен в правую (Chat) панель, ниже последнего сообщения.

### Как работает

AI добавляет `<CANVAS>` блок в конец ответа. Клиент парсит и рендерит:

```
<CANVAS type="stats" title="PR Status">
{"items":[{"label":"Open","value":5,"color":"#10b981"},{"label":"Merged","value":2}]}
</CANVAS>

<CANVAS type="actions" title="Action Plan">
{"items":[{"title":"REBASE","body":"ray-project/ray #61383 needs rebase"}]}
</CANVAS>

<CANVAS type="mermaid" title="Flow">
flowchart LR
  A[Issue Found] --> B[Fork] --> C[PR]
</CANVAS>

<CANVAS type="chart" title="Trend">
{"type":"line","labels":["Mon","Tue","Wed"],"values":[3,5,4],"color":"#10b981"}
</CANVAS>
```

Типы Canvas: `stats` · `actions` · `mermaid` · `chart` · `table`

### Персистентность Canvas

Canvas-блоки **сохраняются как часть сообщения** в истории чата.  
При загрузке истории сессии (`/api/chat/history`) — Canvas заново рендерится из сохранённого HTML/JSON.

Реализация:
- `<CANVAS>` блок парсится и заменяется на `<div class="canvas-rendered" data-canvas='...'>` при сохранении
- При рендере истории — `canvas.js` находит эти div'ы и рендерит их заново
- Нет зависимости от внешних данных — всё что нужно хранится в `data-canvas`

---

## Обработка ошибок (Partial Failure)

Дашборд не падает если один из источников данных недоступен.

### На сервере (в mapper.js)

```javascript
// Паттерн в каждом mapper'е
let prData, error = null;
try {
  prData = await fetchGitHubPRs(env.GITHUB_TOKEN);
} catch (e) {
  prData = loadCachedPRs(); // из STATE.md
  error = `GitHub API unavailable — showing cached data (${e.message})`;
}

widgets.push({
  id: "open_prs",
  type: "list",
  title: "Open PRs",
  error,            // null если всё ок, строка если ошибка
  data: { items: prData }
});
```

### На клиенте (в engine.js)

```javascript
// Виджет с ошибкой рендерится, но с предупреждением
if (widget.error) {
  renderErrorBadge(widgetEl, widget.error);
  // ⚠️ GitHub API unavailable — showing cached data
}
// Контент всё равно рендерится (из кэша/частичных данных)
renderWidgetContent(widgetEl, widget);
```

Визуально: жёлтая полоска `⚠️` сверху виджета с текстом ошибки. Данные из кэша видны.

---

## Примеры агентов

### 🛰️ `main` — Sputnik (System)
**mapper.js:** агрегирует `/api/status` + `/api/stats` + `/api/sessions`  
**Hero stats:** Uptime · Sessions · Memories · Cron jobs  
**Widgets:** Message activity chart, Active sessions list, Recent cron runs list  

### 🔭 `pioneer` — Pioneer (GitHub)
**mapper.js:** парсит `STATE.md` + вызывает `gh` CLI  
**Hero stats:** Open PRs · Repos watched · Last PR · Merged 30d  
**Widgets:** PRs list (с trigger на каждый PR), Activity chart  
**Quick Q:** `📋 PR Status` · `🔍 Find Issue` · `🔄 Rebase` · `📊 Activity`

### 💰 `finance` — Vault (Finance)
**mapper.js:** читает `DASHBOARD.json` (seed salary data)  
**Hero stats:** $2,500 current · $4,500 target → progress bar · $10k goal · Gap -$2k  
**Widgets:** Salary history chart (2018–2026), Passive income streams list  
**Quick Q:** `💼 Job Search` · `📈 Passive Ideas` · `💱 USDT` · `🎯 Next Step`

### 🏥 `health` — Doc (Health)
**mapper.js:** читает SQLite zepp_* таблицы  
**Hero stats:** Avg steps · Best day · Avg sleep · Avg HR  
**Widgets:** Steps chart, Sleep chart, Weight chart, HR chart, Streak heatmap  
**Quick Q:** `💤 Sleep` · `⚖️ Weight` · `🏃 Plan` · `❤️ HR`

### 🏋️ `trainer` — Coach (пример будущего агента)
**mapper.js:** читает workout лог из SQLite или файлов  
**Hero stats:** Sessions/week · Volume · Streak · Next workout  
**Widgets:** Weekly volume chart, Today's workout list (все items — триггеры)  
**Quick Q:** `📋 Today's plan` · `📈 Progress` · `💪 Max weights`

---

## Цветовая схема

Цвет агента берётся из `mapper.js` → `meta.color`.  
Если mapper нет — из `DASHBOARD.json` → если нет — **генерируется детерминированно из `agentId` hash**:

```javascript
function agentColor(id) {
  const hue = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}
```

| Agent | Color |
|-------|-------|
| main | `#6366f1` (indigo) |
| pioneer | `#10b981` (emerald) |
| finance | `#f59e0b` (amber) |
| health | `#00c8ff` (cyan) |
| trainer | `#f97316` (orange) |
| (любой новый) | auto `hsl` из agentId hash |

---

## Как добавить нового агента

1. Добавить в `openclaw.json` → агент появится в sidebar
2. Создать `{workspace}/dashboard/mapper.js` → дашборд получит данные
3. (Опционально) создать `{workspace}/dashboard/DASHBOARD.json` → seed данные / конфиг

**Изменения в ядре:** ноль.

---

## Приоритет реализации

| Этап | Что | Результат |
|------|-----|-----------|
| 1 | Dashboard layout в index.html + resize handle | Скелет для всех агентов |
| 2 | `engine.js` + `widgets/*` — рендерер payload | Любой payload → DOM |
| 3 | `refresh.js` — стратегия обновления | Авто-refresh по триггерам |
| 4 | `canvas.js` — Canvas Board + персистентность | AI визуализирует везде |
| 5 | `routes/dashboard.js` + `collectRawData()` | API работает |
| 6 | `finance/dashboard/mapper.js` | Первый реальный дашборд |
| 7 | `pioneer/dashboard/mapper.js` | GitHub данные live |
| 8 | `health/dashboard/mapper.js` | health.html → deprecated |
| 9 | `main/dashboard/mapper.js` | System overview |

---

## Out of Scope (пока)

- Real-time WebSocket обновления
- Drag-and-drop виджеты / кастомизация layout
- Mobile layout
- Dashboard builder UI

---

*Spec v3.0 by Sputnik 🛰️ | sputnik-mission-control*
