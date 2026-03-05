async function sendReminder(minutes) {
  const text = `Ты просил напомнить через ${minutes} минут`;
  try {
    const r = await fetch("/api/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes, text }),
    });
    const d = await r.json();
    if (d.ok) showToast(`⏰ Напомню через ${minutes} мин`);
  } catch {}
}

async function sendCustomReminder() {
  const input = prompt("Напомнить через сколько минут?", "60");
  if (!input) return;
  const min = parseInt(input);
  if (isNaN(min) || min < 1) return alert("Введи число минут");
  await sendReminder(min);
}

async function addToThings() {
  const title = prompt("Задача для Things:", "");
  if (!title) return;
  try {
    const r = await fetch("/api/things", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, when: "today" }),
    });
    const d = await r.json();
    if (d.ok) showToast("✅ Добавлено в Things");
    else showToast("❌ " + d.error);
  } catch { showToast("❌ Ошибка"); }
}
