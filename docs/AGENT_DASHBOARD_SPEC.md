# Agent Dashboard Mode — Specification

**Version:** 4.0  
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
      { "label": "Sessions", "value": 3,      "unit": "this week", "color": "#f97316" },
      { "label": "Volume",   "value": 8400,    "unit": "kg total",  "color": "#10b981" },
      { "label": "Streak",   "value": 12,      "unit": "days",      "color": "#6366f1" },
      { "label": "Next",     "value": "Today", "unit": "18:00",     "color": "#f59e0b" }
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
          {
            "label": "ray-project/ray #61383",
            "value": "needs rebase",
            "status": "warning",
            "trigger": "What do I need to do to rebase ray-project/ray #61383?"
          }
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
- `string` — показывается предупреждение внутри виджета, данные рендерятся из кэша  
- Один упавший виджет **не роняет** весь дашборд

---

## Server-Side: Dashboard API

### `GET /api/agents/:id/dashboard`

Единый эндпоинт. Ядро сервера (`routes/dashboard.js`) не содержит логику конкретных агентов.

```
1. Читает конфиг агента из openclaw.json → получает workspace path
2. Ищет mapper: {workspace}/dashboard/mapper.js
3. Если mapper есть → загружает через dynamic import() (без кэша)
4. Если mapper нет → возвращает базовый empty payload с meta агента
5. Вызывает mapper(rawData), получает Universal Dashboard Payload
6. Обогащает payload общими данными (agentId, last active, model)
7. Возвращает результат
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
  // rawData.files     — { [filename]: string } — файлы workspace
  // rawData.agentMeta — { id, name, emoji, model }
  // rawData.env       — переменные окружения (GITHUB_TOKEN и т.д.)

  const stateFile = rawData.files["STATE.md"] || "";
  const openPRs = parseStateMd(stateFile);

  return {
    meta: { name: rawData.agentMeta.name, emoji: rawData.agentMeta.emoji, color: "#10b981" },
    hero: {
      title: `${openPRs.length} Open PRs`,
      stats: [
        { label: "Open PRs", value: openPRs.length, color: "#10b981" },
        { label: "Repos",    value: 3,               color: "#6366f1" },
      ]
    },
    widgets: [ /* ... */ ],
    quickQuestions: ["📋 PR Status", "🔍 Find Issue", "🔄 Rebase", "📊 Activity"]
  };
};
```

### ⚠️ Загрузка mapper'а: dynamic import вместо require()

`require()` в Node.js кэширует модуль навсегда. Если агент обновит `mapper.js` в runtime — сервер продолжит использовать старую версию до перезапуска.

**Решение — `dynamic import()` с разрушением кэша:**

```javascript
// routes/dashboard.js — оркестратор
router.get("/agents/:id/dashboard", async (req, res) => {
  const { id } = req.params;
  const agentMeta = getAgentMeta(id);
  const mapperPath = `${agentMeta.workspace}/dashboard/mapper.js`;

  let payload;
  if (fs.existsSync(mapperPath)) {
    // Принудительно сбрасываем кэш перед загрузкой
    // чтобы получить актуальную версию файла
    delete require.cache[require.resolve(mapperPath)];
    const mapper = require(mapperPath);

    const rawData = await collectRawData(agentMeta);
    payload = await mapper(rawData);
  } else {
    payload = buildEmptyPayload(agentMeta);
  }

  payload.agentId = id;
  res.json(payload);
});
```

> **Примечание:** `delete require.cache` добавляет небольшой overhead (~1–5ms) на re-parse файла при каждом запросе. Это приемлемо для дашборда, который не вызывается чаще раза в минуту. Если производительность станет проблемой — добавить файловый watcher (`fs.watch`) и сбрасывать кэш только при реальном изменении файла.

`collectRawData()` — единственное место, где сервер знает о доступных источниках:
- SQLite (`personal.sqlite`) — read-only доступ
- Файлы workspace агента (`STATE.md`, `DASHBOARD.json`, и т.д.)
- Переменные среды (токены для внешних API)

### 🔒 Безопасность: Execution Context mappers'ов

`mapper.js` выполняется в том же процессе, что и сервер (`require` = full Node.js context).  
Это удобно, но открывает вектор атаки если **агент сам** может модифицировать свой mapper.

**Правило безопасности по умолчанию:**

> `mapper.js` пишет только разработчик (человек). AI-агент не имеет права модифицировать файлы в `dashboard/` директории своего workspace.

Это правило фиксируется в `SOUL.md` каждого агента и контролируется на уровне инструкций.

**Если в будущем потребуется AI-генерируемые mapper'ы** — изолировать выполнение через `worker_threads`:

```javascript
// Будущий вариант (когда AI сможет писать mapper'ы)
const { Worker } = require("worker_threads");

function runMapperSandboxed(mapperCode, rawData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { workerData, parentPort } = require("worker_threads");
      const fn = new Function("rawData", workerData.code);
      Promise.resolve(fn(workerData.rawData))
        .then(r => parentPort.postMessage({ ok: true, result: r }))
        .catch(e => parentPort.postMessage({ ok: false, error: e.message }));
    `, {
      eval: true,
      workerData: { code: mapperCode, rawData },
      resourceLimits: { maxOldGenerationSizeMb: 32, maxExecutionTimeMs: 5000 }
    });
    worker.on("message", msg => msg.ok ? resolve(msg.result) : reject(new Error(msg.error)));
    worker.on("error", reject);
  });
}
```

**Текущий статус:** mapper'ы пишутся вручную — `worker_threads` не нужен. Зафиксировать как TODO при переходе к AI-authored mappers.

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
      chart.js         ← Chart.js wrapper (с click-trigger)
      list.js          ← List (с trigger поддержкой)
      insights.js      ← Insights (positive/attention/critical)
      empty.js         ← Empty state
      error.js         ← Partial error badge внутри виджета
  css/
    dashboard.css      ← стили (обобщены из health.html)
```

### engine.js — рендеринг payload

```javascript
function renderDashboard(payload, container) {
  container.innerHTML = "";
  renderHero(payload.hero, payload.meta, container);
  for (const widget of payload.widgets ?? []) {
    renderWidget(widget, container);
  }
  renderInsights(payload.insights, container);
}

function renderWidget(widget, container) {
  const el = createWidgetShell(widget);
  if (widget.error) renderErrorBadge(el, widget.error); // ⚠️ partial failure
  switch (widget.type) {
    case "chart": renderChart(el, widget.data); break;
    case "list":  renderList(el, widget.data);  break;
  }
  container.appendChild(el);
}
```

### Интерактивность виджетов — Trigger System

**List items** с полем `trigger` — кликабельны. При клике промпт автоматически отправляется в чат агента:

```javascript
// list.js
function renderList(container, data) {
  for (const item of data.items) {
    const el = createListItem(item);
    if (item.trigger) {
      el.classList.add("clickable");
      el.title = "Click to ask agent";
      el.addEventListener("click", () => sendChatMessage(item.trigger));
    }
    container.appendChild(el);
  }
}
```

Визуально: hover-эффект + иконка `→` справа. Механика идентична Quick Questions.

**Charts** — клик по точке/бару генерирует контекстный вопрос:

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

WebSockets — Out of Scope. Используется event-driven refresh.

| Событие | Действие |
|---------|----------|
| `selectAgent(id)` | Полная загрузка `GET /api/agents/:id/dashboard` |
| `window focus` | Тихое обновление, если прошло > 60 сек с последнего |
| `agentChatDone` event | Лёгкое обновление (без skeleton) |
| Кнопка ↻ | Принудительная полная перезагрузка |

```javascript
// refresh.js
let lastRefresh = 0;
const STALE_AFTER = 60 * 1000;

async function refreshDashboard(agentId, { force = false, silent = false } = {}) {
  if (!force && Date.now() - lastRefresh < STALE_AFTER) return;
  if (!silent) showSkeleton();
  const payload = await fetchDashboard(agentId);
  renderDashboard(payload, dashContainer);
  lastRefresh = Date.now();
}

window.addEventListener("focus", () => refreshDashboard(activeAgent, { silent: true }));
window.addEventListener("agentChatDone", () => refreshDashboard(activeAgent, { silent: true }));
document.getElementById("refresh-btn").onclick = () => refreshDashboard(activeAgent, { force: true });
```

`agentChatDone` — custom event, диспатчится в `chat.js` при получении финального ответа агента.

---

## Canvas Board

Универсальный live-компонент. Работает у **всех** агентов одинаково.  
Встроен в правую (Chat) панель, под последним сообщением.

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

Canvas-блоки сохраняются как часть истории чата и **заново рендерятся при загрузке сессии**.

**Проблема:** хранить сложный JSON в HTML-атрибуте `data-canvas='...'` ненадёжно — кавычки, переносы строк и HTML-символы в данных неизбежно ломают атрибут.

**Решение — Base64 + скрытый `<script>` тег:**

```javascript
// canvas.js — сохранение при рендере
function serializeCanvas(type, title, rawContent) {
  const payload = JSON.stringify({ type, title, content: rawContent });
  const b64 = btoa(unescape(encodeURIComponent(payload))); // UTF-8 safe Base64

  return `
    <div class="canvas-rendered">
      <script type="application/json" class="canvas-data">
        ${payload}
      </script>
      <!-- визуальный контент рендерится сюда -->
    </div>`;
}

// canvas.js — восстановление при загрузке истории
function rehydrateCanvases(container) {
  container.querySelectorAll(".canvas-rendered").forEach(el => {
    const scriptEl = el.querySelector("script.canvas-data");
    if (!scriptEl) return;
    try {
      const data = JSON.parse(scriptEl.textContent);
      renderCanvasContent(el, data); // рендерит поверх saved div'а
    } catch (e) {
      el.innerHTML = `<div class="canvas-error">⚠️ Canvas data corrupted</div>`;
    }
  });
}
```

> **Почему `<script type="application/json">`:**  
> Браузер не исполняет такой тег, но его содержимое доступно через `.textContent`.  
> Это стандартная практика для встраивания структурированных данных в HTML (используется в Next.js, Jekyll и др.).  
> Никаких проблем с экранированием кавычек или переносов строк.

При загрузке истории `chat.js` вызывает `rehydrateCanvases(messageContainer)` — все Canvas-блоки восстанавливаются автоматически.

---

## Обработка ошибок (Partial Failure)

Дашборд не падает если один из источников данных недоступен.

### На сервере (в mapper.js)

```javascript
let prData, error = null;
try {
  prData = await fetchGitHubPRs(rawData.env.GITHUB_TOKEN);
} catch (e) {
  prData = parseCachedPRs(rawData.files["STATE.md"]);
  error = `GitHub API unavailable — showing cached data (${e.message})`;
}

widgets.push({
  id: "open_prs",
  type: "list",
  title: "Open PRs",
  error,   // null = всё ок, string = partial failure
  data: { items: prData }
});
```

### На клиенте (в engine.js)

Виджет с ошибкой рендерится, но с жёлтым предупреждением `⚠️` сверху.  
Данные из кэша остаются видны — пользователь видит актуальную информацию с пометкой об источнике.

---

## Примеры агентов

### 🛰️ `main` — Sputnik (System)
**mapper.js:** агрегирует `/api/status` + `/api/stats` + `/api/sessions`  
**Hero stats:** Uptime · Sessions · Memories · Cron jobs  
**Widgets:** Message activity chart, Active sessions list, Recent cron runs list

### 🔭 `pioneer` — Pioneer (GitHub)
**mapper.js:** парсит `STATE.md` + вызывает `gh` CLI  
**Hero stats:** Open PRs · Repos watched · Last PR · Merged 30d  
**Widgets:** PRs list (каждый PR — trigger), Activity chart  
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

Цвет берётся из `mapper.js → meta.color`.  
Fallback: `DASHBOARD.json → color` → **auto из `agentId` hash:**

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
3. (Опционально) `{workspace}/dashboard/DASHBOARD.json` → seed данные / конфиг

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
- AI-authored mappers (нужен `worker_threads` sandbox — см. раздел безопасности)

---

*Spec v4.0 by Sputnik 🛰️ | sputnik-mission-control*
