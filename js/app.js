const $ = (id) => document.getElementById(id);

// Демо-режим: адрес ...index.html?demo — без Firebase и входа
const DEMO = new URLSearchParams(location.search).has("demo");
const FB = DEMO ? null : await import("./firebase.js");
const NEEDS_CONFIG = !DEMO && !FB.configured;
if (NEEDS_CONFIG) {
  document.querySelector("#auth .muted").textContent =
    "Firebase ещё не настроен: вставьте конфиг в js/firebase.js или откройте приложение в демо-режиме (…/index.html?demo).";
  $("loginBtn").disabled = true;
  show("auth");
}

const LIMIT = 0.25; // максимальная доля одной получки под один платёж
const DAY = 864e5;
const DEFAULTS = { advanceDay: 10, salaryDay: 25, accent: "#ff6fa5", accent2: "#8b5cf6" };
const COLORS = [
  { name: "Розовый", hex: "#ff6fa5" },
  { name: "Фиолетовый", hex: "#8b5cf6" },
  { name: "Малиновый", hex: "#e11d74" },
  { name: "Сиреневый", hex: "#c084fc" },
  { name: "Мятный", hex: "#34d399" },
  { name: "Небесный", hex: "#60a5fa" },
  { name: "Персиковый", hex: "#fb923c" },
];
const PAY_NAMES = { auto: "автоматически", advance: "с аванса", salary: "с зарплаты" };
const KIND_NAMES = { advance: "Аванс", salary: "Зарплата" };

/* ---------- Даты и формат ---------- */

const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dateOf = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const fmtDay = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const fmtLong = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const fmtAdded = (ms) => {
  const d = new Date(ms);
  return (sameDay(d, new Date()) ? "сегодня" : fmtDay(d)) + ", " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};
const monthName = (d) => {
  const s = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const inMonth = (ms, base) => {
  const d = new Date(ms);
  return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth();
};
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const rub = (n) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n || 0);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sum = (arr, f = (x) => x.amount) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const strip = ({ id, ...rest }) => rest;

/* ---------- Состояние ---------- */

let user = null;
let hid = null;
let settings = { ...DEFAULTS };
let state = { tx: [], bills: [], envs: [], incomes: [], personal: [] };
let house = null;
let mode = "family";
let unsubs = [];
let txType = "expense";
let viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let incomeKind = null;

/* ---------- Демо-данные ---------- */

const nowMs = Date.now();
const today = new Date();
const prevM = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const pv = ymOf(prevM);
const demo = {
  user: { uid: "demo", displayName: "Демо Пользователь" },
  house: { inviteCode: "DEMO01", settings: { ...DEFAULTS }, name: "Наш бюджет", members: ["demo", "partner"], names: { demo: "Демо", partner: "Партнёр" }, createdBy: "demo" },
  items: {
    transactions: [
      { id: "t1", type: "expense", amount: 4500, category: "Продукты", note: "Перекрёсток", createdAt: nowMs - 2 * DAY, recurring: false },
      { id: "t2", type: "expense", amount: 1800, category: "Транспорт", note: "", createdAt: nowMs - 3600e3, recurring: false },
      { id: "t3", type: "expense", amount: 990, category: "Подписки", note: "Музыка", createdAt: nowMs - 5 * DAY, recurring: true },
      { id: "t4", type: "income", amount: 5000, category: "Подработка", note: "", createdAt: nowMs - 6 * DAY, recurring: false },
    ],
    bills: [
      { id: "b1", title: "Ипотека", amount: 45000, dueDay: 5, bank: "Сбер", paidMonth: null, payFrom: "auto" },
      { id: "b2", title: "Интернет", amount: 700, dueDay: 15, bank: "Т-Банк", paidMonth: null, payFrom: "auto" },
      { id: "b3", title: "Кредитка", amount: 12000, dueDay: 28, bank: "Альфа", paidMonth: null, payFrom: "auto" },
    ],
    envelopes: [
      { id: "e1", name: "Отпуск", target: 150000, saved: 40000 },
      { id: "e2", name: "Машина", target: 500000, saved: 120000 },
    ],
    incomes: [
      { id: "i1", kind: "advance", period: pv, paydayDate: dateOf(prevM.getFullYear(), prevM.getMonth(), 10).getTime(), receivedAt: dateOf(prevM.getFullYear(), prevM.getMonth(), 10).getTime(), amount: 60000, delayed: false },
      { id: "i2", kind: "salary", period: pv, paydayDate: dateOf(prevM.getFullYear(), prevM.getMonth(), 25).getTime(), receivedAt: dateOf(prevM.getFullYear(), prevM.getMonth(), 25).getTime(), amount: 60000, delayed: false },
    ],
  },
};
const demoSubs = {};
const demoNotify = (name) => (demoSubs[name] || []).forEach((f) => f());

/* ---------- Слой данных: демо или Firebase ---------- */

const Data = DEMO
  ? {
      onAuth: (cb) => { cb(demo.user); return () => {}; },
      getHid: async () => "demo",
      createHousehold: async () => null,
      joinHousehold: async () => null,
      watchHousehold(_h, cb) {
        const f = () => cb(demo.house);
        (demoSubs.household ||= []).push(f);
        f();
        return () => {};
      },
      saveSettings: async (_h, s) => { demo.house.settings = s; demoNotify("household"); },
      setHouseName: async (_h, name) => { demo.house.name = name; demoNotify("household"); },
      setMyName: async (_h, uid, name) => { (demo.house.names ||= {})[uid] = name; demoNotify("household"); },
      removeMember: async (_h, uid) => {
        demo.house.members = demo.house.members.filter((x) => x !== uid);
        delete demo.house.names[uid];
        demoNotify("household");
      },
      leaveHousehold: async () => {},
      personalWatch(_u, cb) {
        const f = () => cb([...(demo.items.personal ||= [])]);
        (demoSubs.personal ||= []).push(f);
        f();
        return () => {};
      },
      personalAdd: async (_u, data) => {
        (demo.items.personal ||= []).push({ id: "p" + Math.random().toString(36).slice(2, 8), ...data });
        demoNotify("personal");
      },
      personalPatch: async (_u, id, data) => {
        Object.assign((demo.items.personal ||= []).find((x) => x.id === id), data);
        demoNotify("personal");
      },
      personalRemove: async (_u, id) => {
        demo.items.personal = (demo.items.personal || []).filter((x) => x.id !== id);
        demoNotify("personal");
      },
      watch(_h, name, cb) {
        const f = () => cb([...demo.items[name]]);
        (demoSubs[name] ||= []).push(f);
        f();
        return () => {};
      },
      add: async (_h, name, data) => {
        demo.items[name].push({ id: "d" + Math.random().toString(36).slice(2, 8), ...data });
        demoNotify(name);
      },
      patch: async (_h, name, id, data) => {
        Object.assign(demo.items[name].find((x) => x.id === id), data);
        demoNotify(name);
      },
      remove: async (_h, name, id) => {
        demo.items[name] = demo.items[name].filter((x) => x.id !== id);
        demoNotify(name);
      },
      addSaved: async (_h, id, amount) => {
        demo.items.envelopes.find((x) => x.id === id).saved += amount;
        demoNotify("envelopes");
      },
    }
  : {
      login: () => FB.signInWithPopup(FB.auth, FB.provider),
      onAuth: (cb) => FB.onAuthStateChanged(FB.auth, cb),
      async getHid(uid) {
        return (await FB.getDoc(FB.doc(FB.db, "users", uid))).data()?.householdId;
      },
      async createHousehold(u) {
        const hRef = FB.doc(FB.collection(FB.db, "households"));
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        await FB.setDoc(hRef, { members: [u.uid], inviteCode: code, settings: DEFAULTS, name: "Наш бюджет", names: { [u.uid]: u.displayName || "Участник" }, createdBy: u.uid });
        await FB.setDoc(FB.doc(FB.db, "invites", code), { hid: hRef.id });
        await FB.setDoc(FB.doc(FB.db, "users", u.uid), { householdId: hRef.id, name: u.displayName }, { merge: true });
        return hRef.id;
      },
      async joinHousehold(u, code) {
        const inv = await FB.getDoc(FB.doc(FB.db, "invites", code));
        if (!inv.exists()) return null;
        const joined = inv.data().hid;
        const oldHid = (await FB.getDoc(FB.doc(FB.db, "users", u.uid))).data()?.householdId;
        if (oldHid && oldHid !== joined) {
          await FB.updateDoc(FB.doc(FB.db, "households", oldHid), { members: FB.arrayRemove(u.uid), [`names.${u.uid}`]: FB.deleteField() }).catch(() => {});
        }
        await FB.updateDoc(FB.doc(FB.db, "households", joined), { members: FB.arrayUnion(u.uid), [`names.${u.uid}`]: u.displayName || "Участник" });
        await FB.setDoc(FB.doc(FB.db, "users", u.uid), { householdId: joined, name: u.displayName }, { merge: true });
        return joined;
      },
      watchHousehold: (h, cb) =>
        FB.onSnapshot(FB.doc(FB.db, "households", h), (s) => cb(s.data() || null), () => cb(null)),
      saveSettings: (h, s) => FB.updateDoc(FB.doc(FB.db, "households", h), { settings: s }),
      setHouseName: (h, name) => FB.updateDoc(FB.doc(FB.db, "households", h), { name }),
      setMyName: (h, uid, name) => FB.updateDoc(FB.doc(FB.db, "households", h), { [`names.${uid}`]: name }),
      removeMember: (h, uid) =>
        FB.updateDoc(FB.doc(FB.db, "households", h), { members: FB.arrayRemove(uid), [`names.${uid}`]: FB.deleteField() }),
      async leaveHousehold(u, h) {
        await FB.updateDoc(FB.doc(FB.db, "households", h), { members: FB.arrayRemove(u.uid), [`names.${u.uid}`]: FB.deleteField() });
        await FB.setDoc(FB.doc(FB.db, "users", u.uid), { householdId: null }, { merge: true });
      },
      personalWatch: (uid, cb) =>
        FB.onSnapshot(FB.collection(FB.db, "users", uid, "personal"), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      personalAdd: (uid, data) => FB.addDoc(FB.collection(FB.db, "users", uid, "personal"), data),
      personalPatch: (uid, id, data) => FB.updateDoc(FB.doc(FB.db, "users", uid, "personal", id), data),
      personalRemove: (uid, id) => FB.deleteDoc(FB.doc(FB.db, "users", uid, "personal", id)),
      watch: (h, name, cb) =>
        FB.onSnapshot(FB.collection(FB.db, "households", h, name), (s) =>
          cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      add: (h, name, data) => FB.addDoc(FB.collection(FB.db, "households", h, name), data),
      patch: (h, name, id, data) => FB.updateDoc(FB.doc(FB.db, "households", h, name, id), data),
      remove: (h, name, id) => FB.deleteDoc(FB.doc(FB.db, "households", h, name, id)),
      addSaved: (h, id, amount, uid) =>
        FB.updateDoc(FB.doc(FB.db, "households", h, "envelopes", id), { saved: FB.increment(amount), updatedBy: uid }),
    };

/* ---------- Расчёт получек ---------- */

// Все получки вокруг даты: назад back месяцев, вперёд fwd месяцев
function paydays(base, back = 8, fwd = 1) {
  const out = [];
  for (let k = -back; k <= fwd; k++) {
    for (const [kind, day] of [["advance", settings.advanceDay], ["salary", settings.salaryDay]]) {
      const d = dateOf(base.getFullYear(), base.getMonth() + k, day);
      out.push({ kind, date: d, period: ymOf(d) });
    }
  }
  return out.sort((a, b) => a.date - b.date);
}

const incomeOf = (kind, period) => state.incomes.find((i) => i.kind === kind && i.period === period);

// Последняя известная сумма получки этого вида — ожидаемая
function lastAmount(kind) {
  const list = state.incomes.filter((i) => i.kind === kind).sort((a, b) => b.paydayDate - a.paydayDate);
  return list[0]?.amount || 0;
}

// Фактическая сумма, если получка отмечена, иначе ожидаемая
function paydayValue(p) {
  const rec = incomeOf(p.kind, p.period);
  return rec ? { amount: rec.amount, fact: true, delayed: !!rec.delayed } : { amount: lastAmount(p.kind), fact: false, delayed: false };
}

/*
 * Расчёт для одного платежа P со сроком due:
 * идём назад от срока по получкам, накапливаем сумму I,
 * пока доля r = P / I не станет ≤ LIMIT. Каждая получка откладывает r × её сумма.
 */
function planBill(bill, due) {
  const P = Number(bill.amount) || 0;
  const t0 = startOfDay(new Date());
  const saved = bill.saved || {};
  const want = bill.payFrom && bill.payFrom !== "auto" ? bill.payFrom : null;
  const cands = paydays(due, 8, 0)
    .filter((p) => p.date <= due && (!want || p.kind === want))
    .sort((a, b) => b.date - a.date);

  const chosen = [];
  let I = 0;
  for (const p of cands) {
    const v = paydayValue(p);
    if (!v.amount) continue;
    chosen.push({ ...p, ...v });
    I += v.amount;
    if (P / I <= LIMIT) break;
  }
  if (!I) return { parts: [], share: 0, over: false, noData: true, shortfall: 0 };

  const share = P / I;
  const parts = chosen.map((c) => {
    const key = c.kind + "|" + c.period;
    const past = c.date <= t0;
    const override = saved[key] !== undefined ? Number(saved[key]) : undefined;
    return { ...c, key, past, override, saved: past ? override : undefined,
             planned: share * c.amount, part: share * c.amount, extra: 0 };
  }).sort((a, b) => a.date - b.date);

  // Недобор (прошлые получки и недоотложенное по своей сумме) переходит на следующую предстоящую
  let shortfall = 0;
  let carry = 0;
  for (const p of parts) {
    if (p.past) {
      if (p.override !== undefined) {
        const d = Math.max(0, p.planned - p.override);
        shortfall += d;
        carry += d;
      }
      continue;
    }
    const base = p.override !== undefined ? p.override : p.planned;
    p.part = base + carry;
    p.extra = carry;
    carry = Math.max(0, p.planned - base);
  }
  if (carry > 0) {
    const nxt = paydays(t0, 0, 2).filter((p) => p.date > t0).sort((a, b) => a.date - b.date)[0];
    if (nxt) {
      parts.push({ ...nxt, ...paydayValue(nxt), key: nxt.kind + "|" + nxt.period, past: false,
                   planned: 0, part: carry, extra: carry });
      parts.sort((a, b) => a.date - b.date);
    }
  }

  const over = parts.some((p) => p.amount && p.part / p.amount > LIMIT);
  return { parts, share, over, noData: false, shortfall };
}

const dueOf = (bill, base) => dateOf(base.getFullYear(), base.getMonth(), bill.dueDay);

// Ближайший срок платежа, который ещё не наступил (сегодня считается наступившим)
function nextDue(bill) {
  const t0 = startOfDay(new Date());
  const d = dueOf(bill, t0);
  return d >= t0 ? d : dueOf(bill, new Date(t0.getFullYear(), t0.getMonth() + 1, 1));
}

// План по получкам для месяца: сколько откладывать с каждой получки
function monthPlan(base) {
  const groups = new Map();
  for (const b of state.bills) {
    const res = planBill(b, nextDue(b));
    for (const part of res.parts) {
      const key = part.kind + part.period;
      if (!groups.has(key)) groups.set(key, { kind: part.kind, date: part.date, fact: part.fact, delayed: part.delayed, total: 0, items: [] });
      const g = groups.get(key);
      g.total += part.part;
      g.items.push({ title: b.title, part: part.part });
    }
  }
  return [...groups.values()].sort((a, b) => a.date - b.date);
}

/* ---------- Тема ---------- */

function applyTheme() {
  const root = document.documentElement.style;
  root.setProperty("--accent", settings.accent);
  root.setProperty("--accent2", settings.accent2);
  root.setProperty("--glow", settings.accent + "66");
}

function renderSwatches(el, key) {
  el.innerHTML = "";
  COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "swatch" + (settings[key] === c.hex ? " sel" : "");
    b.style.background = c.hex;
    b.title = c.name;
    b.onclick = () => {
      settings[key] = c.hex;
      applyTheme();
      renderSwatches(el, key);
    };
    el.appendChild(b);
  });
}

function fillSettings() {
  $("advanceDay").value = settings.advanceDay;
  $("salaryDay").value = settings.salaryDay;
  renderSwatches($("accentPick"), "accent");
  renderSwatches($("accent2Pick"), "accent2");
}

/* ---------- Утилиты интерфейса ---------- */

function toast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

function celebrate(text, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "fly";
  el.textContent = text;
  el.style.left = r.left + r.width / 2 + "px";
  el.style.top = r.top + "px";
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

function goalCelebrate(name) {
  const overlay = document.createElement("div");
  overlay.className = "goal-overlay";
  overlay.innerHTML = `
    <div class="goal-card">
      <div class="big">🎉</div>
      <h2>Цель достигнута!</h2>
      <p class="muted">Конверт «${esc(name)}» заполнен</p>
    </div>`;
  const colors = ["#ff6fa5", "#8b5cf6", "#fbbf24", "#34d399", "#60a5fa", "#fb923c"];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    c.style.animationDelay = Math.random() * 0.6 + "s";
    overlay.appendChild(c);
  }
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 4000);
}

/* ---------- Вход и семья ---------- */

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

$("loginBtn").onclick = () => Data.login().catch((e) => toast(e.message));

if (!NEEDS_CONFIG) Data.onAuth(async (u) => {
  user = u;
  if (!u) return show("auth");
  hid = await Data.getHid(u.uid);
  if (!hid) return show("join");
  startHousehold();
});

$("createHouseBtn").onclick = async () => {
  hid = await Data.createHousehold(user);
  startHousehold();
};

$("joinHouseBtn").onclick = async () => {
  const h = await Data.joinHousehold(user, $("inviteInput").value.trim().toUpperCase());
  if (!h) return toast("Код не найден");
  hid = h;
  startHousehold();
};

/* ---------- Окна (шторки) ---------- */

const closeMenus = () => document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));

function openSheet(html) {
  closeSheet();
  const ov = document.createElement("div");
  ov.className = "modal";
  ov.id = "sheet";
  ov.innerHTML = `<div class="card modal-card sheet-card">${html}<button class="btn ghost small" data-sheet="close">Закрыть</button></div>`;
  ov.addEventListener("click", sheetClick);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeSheet(); });
  document.body.appendChild(ov);
}

function closeSheet() {
  document.getElementById("sheet")?.remove();
}

function openEditTx(id) {
  const t = state.tx.find((x) => x.id === id);
  if (!t) return;
  openSheet(`<h2>Изменить операцию</h2>
    <input class="input" id="sf-amount" type="number" value="${t.amount}" placeholder="Сумма">
    <input class="input" id="sf-category" value="${esc(t.category)}" placeholder="Категория">
    <input class="input" id="sf-note" value="${esc(t.note || "")}" placeholder="Комментарий">
    <button class="btn glow small" data-sheet="save-tx" data-id="${t.id}">Сохранить</button>`);
}

function openEditPersonal(id) {
  const t = state.personal.find((x) => x.id === id);
  if (!t) return;
  openSheet(`<h2>Изменить личную трату</h2>
    <input class="input" id="sf-amount" type="number" value="${t.amount}" placeholder="Сумма">
    <input class="input" id="sf-category" value="${esc(t.category)}" placeholder="Категория">
    <input class="input" id="sf-note" value="${esc(t.note || "")}" placeholder="Комментарий">
    <button class="btn glow small" data-sheet="save-personal" data-id="${t.id}">Сохранить</button>`);
}

async function sheetClick(e) {
  const btn = e.target.closest("[data-sheet]");
  if (!btn) return;
  const act = btn.dataset.sheet;
  const id = btn.dataset.id;

  if (act === "close") return closeSheet();

  if (act === "save-corr") {
    const b = state.bills.find((x) => x.id === id);
    const saved = { ...(b.saved || {}) };
    document.querySelectorAll("#sheet [data-save-key]").forEach((inp) => {
      const v = inp.value.trim();
      if (v === "") delete saved[inp.dataset.saveKey];
      else saved[inp.dataset.saveKey] = Number(v);
    });
    await Data.patch(hid, "bills", id, { saved, updatedBy: user.uid });
    toast("Корректировка сохранена");
    return closeSheet();
  }

  if (act === "save-bill") {
    const title = $("sf-title").value.trim();
    const amount = Number($("sf-amount").value);
    const dueDay = Number($("sf-day").value);
    if (!title || !amount || !(dueDay >= 1 && dueDay <= 31)) return toast("Проверьте название, сумму и день");
    await Data.patch(hid, "bills", id, { title, amount, dueDay, bank: $("sf-bank").value.trim(), updatedBy: user.uid });
    toast("Платёж изменён");
    return closeSheet();
  }

  if (act === "pay") {
    const b = state.bills.find((x) => x.id === id);
    await togglePaid(b, btn);
    return closeSheet();
  }

  if (act === "save-tx") {
    const amount = Number($("sf-amount").value);
    if (!amount) return toast("Введите сумму");
    await Data.patch(hid, "transactions", id, {
      amount, category: $("sf-category").value.trim() || "Без категории", note: $("sf-note").value.trim(), updatedBy: user.uid,
    });
    toast("Операция изменена");
    return closeSheet();
  }

  if (act === "save-personal") {
    const amount = Number($("sf-amount").value);
    if (!amount) return toast("Введите сумму");
    await Data.personalPatch(user.uid, id, {
      amount, category: $("sf-category").value.trim() || "Без категории", note: $("sf-note").value.trim(),
    });
    toast("Личная трата изменена");
    return closeSheet();
  }
}

/* ---------- Семья: участники, имена, название ---------- */

const nameOf = (uid) =>
  house?.names?.[uid] || (uid === user?.uid ? (user.displayName || "").split(" ")[0] : "") || "Участник";

function renderFamily() {
  if (!house) return;
  if (document.activeElement !== $("houseName")) $("houseName").value = house.name || "";
  if (document.activeElement !== $("myName")) $("myName").value = house.names?.[user.uid] || "";
  $("memberList").innerHTML =
    (house.members || []).map((uid) => {
      const me = uid === user.uid;
      return `
        <div class="item">
          <div><b>${esc(nameOf(uid))}${me ? " (вы)" : ""}</b></div>
          ${me ? "" : `<button class="chip danger-chip" data-remove-member="${esc(uid)}">Удалить</button>`}
        </div>`;
    }).join("") || `<p class="muted">Участников нет</p>`;
}

/* ---------- Личные траты ---------- */

function renderPersonal() {
  const base = new Date();
  $("personalMonth").textContent = rub(sum(state.personal.filter((t) => inMonth(t.createdAt, base))));
  $("personalList").innerHTML =
    [...state.personal].sort((a, b) => b.createdAt - a.createdAt).map((t) => `
      <div class="item">
        <div><b>${esc(t.category)}</b><small>${t.note ? esc(t.note) + " · " : ""}${fmtAdded(t.createdAt)}${t.shared ? " · в общем бюджете" : " · только для вас"}</small></div>
        <div class="right">
          <span class="expense amt">−${rub(t.amount)}</span>
          <button class="more" data-more="p-${t.id}" title="Действия">⋯</button>
          <div class="menu" data-menu="p-${t.id}">
            <button data-edit-personal="${t.id}">Изменить</button>
            <button class="danger" data-del-personal="${t.id}">Удалить</button>
          </div>
        </div>
      </div>`).join("") || `<p class="muted">Личных трат пока нет</p>`;
}

$("personalForm").onsubmit = async (e) => {
  e.preventDefault();
  const amount = Number($("pAmount").value);
  if (!amount) return;
  const category = $("pCategory").value.trim() || "Без категории";
  const note = $("pNote").value.trim();
  const shared = $("pShare").checked;
  await Data.personalAdd(user.uid, { amount, category, note, createdAt: Date.now(), shared });
  if (shared && hid) {
    await Data.add(hid, "transactions", {
      type: "expense", amount, category, note,
      createdAt: Date.now(), recurring: false,
      byName: nameOf(user.uid), by: user.uid, updatedBy: user.uid,
    });
  }
  e.target.reset();
  toast(shared ? "Добавлено и показано в общем бюджете" : "Личная трата добавлена (видна только вам)");
};

document.querySelectorAll(".mode-seg .seg-btn").forEach((b) => {
  b.onclick = () => {
    mode = b.dataset.mode;
    document.querySelectorAll(".mode-seg .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    $("familyBlock").hidden = mode !== "family";
    $("personalBlock").hidden = mode !== "personal";
  };
});

/* ---------- Настройки семьи ---------- */

$("saveNames").onclick = async () => {
  const name = $("houseName").value.trim();
  const mine = $("myName").value.trim();
  if (name) await Data.setHouseName(hid, name);
  if (mine) await Data.setMyName(hid, user.uid, mine);
  toast("Сохранено ✨");
};

$("copyCode").onclick = async () => {
  try {
    await navigator.clipboard.writeText(house?.inviteCode || "");
    toast("Код скопирован");
  } catch {
    toast("Не удалось скопировать — перепишите код вручную");
  }
};

$("joinFromSettings").onclick = async () => {
  const code = $("joinCode").value.trim().toUpperCase();
  if (!code) return toast("Введите код");
  const h = await Data.joinHousehold(user, code);
  if (!h) return toast("Код не найден");
  $("joinCode").value = "";
  hid = h;
  startHousehold();
  toast("Вы вошли в семью");
};

$("leaveBtn").onclick = async () => {
  const last = (house?.members || []).length <= 1;
  const text = last
    ? "Вы последний участник. Семья останется без участников, и её данные станут недоступны. Покинуть?"
    : "Покинуть семью?";
  if (!confirm(text)) return;
  await Data.leaveHousehold(user, hid);
  unsubs.forEach((f) => f());
  unsubs = [];
  hid = null;
  house = null;
  show("join");
};

/* ---------- Вход и семья ---------- */

function startHousehold() {
  show("app");
  unsubs.forEach((f) => f());
  unsubs = [];
  unsubs.push(Data.watchHousehold(hid, (h) => {
    if (!h) {
      unsubs.forEach((f) => f());
      unsubs = [];
      hid = null;
      house = null;
      toast("Вы больше не участник этой семьи");
      return show("join");
    }
    house = h;
    settings = { ...DEFAULTS, ...(h.settings || {}) };
    $("greeting").textContent = h.name || "Наш бюджет";
    $("inviteCode").textContent = h.inviteCode;
    applyTheme();
    fillSettings();
    renderFamily();
    renderAll();
  }));
  unsubs.push(Data.watch(hid, "transactions", (arr) => { state.tx = arr; renderAll(); }));
  unsubs.push(Data.watch(hid, "bills", (arr) => { state.bills = arr; renderAll(); }));
  unsubs.push(Data.watch(hid, "envelopes", (arr) => { state.envs = arr; renderAll(); }));
  unsubs.push(Data.watch(hid, "incomes", (arr) => { state.incomes = arr; renderAll(); }));
  unsubs.push(Data.personalWatch(user.uid, (arr) => { state.personal = arr; renderPersonal(); }));
}

/* ---------- Навигация ---------- */

document.querySelectorAll(".tabbar button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tabbar button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === b.dataset.tab));
  };
});

document.querySelectorAll("#txForm .seg-btn").forEach((b) => {
  b.onclick = () => {
    txType = b.dataset.type;
    document.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === b));
  };
});

/* ---------- Получки ---------- */

function openIncome(kind) {
  incomeKind = kind;
  $("incomeTitle").textContent = kind === "advance" ? "Получил аванс" : "Получил зарплату";
  const exp = lastAmount(kind);
  $("incomeAmount").value = "";
  $("incomeAmount").placeholder = exp ? `Ожидалось ${rub(exp)}` : "Сумма, которая пришла";
  $("incomeDate").value = todayStr();
  $("incomeDelayed").checked = false;
  $("incomeModal").hidden = false;
}

function closeIncome() {
  $("incomeModal").hidden = true;
}

$("gotAdvance").onclick = () => openIncome("advance");
$("gotSalary").onclick = () => openIncome("salary");
$("incomeCancel").onclick = closeIncome;
$("incomeModal").addEventListener("click", (e) => { if (e.target.id === "incomeModal") closeIncome(); });

$("incomeSave").onclick = async () => {
  const amount = Number($("incomeAmount").value);
  if (!amount) return toast("Введите сумму");
  const received = new Date($("incomeDate").value + "T12:00:00");
  if (received > new Date()) return toast("Дата не может быть в будущем");

  // Привязываем к ближайшей получке этого вида: так дата 26-е попадёт на 25-е
  const near = paydays(received, 1, 1)
    .filter((p) => p.kind === incomeKind)
    .sort((a, b) => Math.abs(a.date - received) - Math.abs(b.date - received))[0];

  const expected = lastAmount(incomeKind);
  const delayed = $("incomeDelayed").checked;
  const data = {
    kind: incomeKind,
    period: near.period,
    paydayDate: near.date.getTime(),
    receivedAt: received.getTime(),
    amount,
    delayed,
    updatedBy: user.uid,
  };

  const existing = incomeOf(incomeKind, near.period);
  if (existing) {
    await Data.patch(hid, "incomes", existing.id, data);
  } else {
    await Data.add(hid, "incomes", data);
  }

  const name = KIND_NAMES[incomeKind].toLowerCase();
  const diff = expected && amount !== expected ? `\nРазница с ожидаемой: ${amount > expected ? "+" : ""}${rub(amount - expected)}` : "";
  toast(`${KIND_NAMES[incomeKind]} отмечена: ${rub(amount)}${delayed ? " (задержана)" : ""}${diff}`, 3500);
  closeIncome();
};

function renderAlerts() {
  const t0 = startOfDay(new Date());
  const msgs = [];
  for (const p of paydays(t0, 1, 0)) {
    if (p.date > t0 || incomeOf(p.kind, p.period)) continue;
    if (sameDay(p.date, t0)) {
      msgs.push(`Сегодня ожидается ${KIND_NAMES[p.kind].toLowerCase()}. Внесите сумму, когда придёт.`);
    } else if (t0 - p.date <= 40 * DAY) {
      msgs.push(`Не отмечено: ${KIND_NAMES[p.kind].toLowerCase()} ${fmtDay(p.date)} — нажмите кнопку выше, когда получите.`);
    }
  }
  for (const b of state.bills) {
    const r = planBill(b, nextDue(b));
    if (r.shortfall > 0 && r.parts.filter((x) => !x.past).length < 2) {
      msgs.push(`«${b.title}»: недобор ${rub(r.shortfall)}, а предстоящих получек мало. Проверьте план.`);
    }
  }
  $("alerts").innerHTML = msgs.map((m) => `<div class="alert">${esc(m)}</div>`).join("");
}

/* ---------- Операции ---------- */

$("txForm").onsubmit = async (e) => {
  e.preventDefault();
  const amount = Number($("txAmount").value);
  if (!amount) return;
  await Data.add(hid, "transactions", {
    type: txType,
    amount,
    category: $("txCategory").value.trim() || "Без категории",
    note: $("txNote").value.trim(),
    createdAt: Date.now(),
    recurring: false,
    by: user.uid,
    updatedBy: user.uid,
  });
  celebrate(`${txType === "income" ? "+" : "−"}${rub(amount)}`, e.target.querySelector("button"));
  e.target.reset();
};

function renderTx() {
  const sorted = [...state.tx].sort((a, b) => b.createdAt - a.createdAt);
  $("txList").innerHTML =
    sorted.slice(0, 60).map((t) => `
      <div class="item swipe-ready" data-id="${t.id}" data-coll="transactions">
        <div>
          <b>${t.recurOf ? "🔁 " : ""}${esc(t.category)}</b>
          <small>${t.note ? esc(t.note) + " · " : ""}${fmtAdded(t.createdAt)}${t.byName ? " · " + esc(t.byName) : ""}</small>
        </div>
        <div class="right">
          <span class="${t.type} amt">${t.type === "income" ? "+" : "−"}${rub(t.amount)}</span>
          <button class="more" data-more="${t.id}" title="Действия">⋯</button>
          <div class="menu" data-menu="${t.id}">
            <button data-edit-tx="${t.id}">Изменить</button>
            ${t.recurOf ? "" : `<button data-toggle-recur="${t.id}">${t.recurring ? "Убрать из повторяющихся" : "Сделать повторяющейся"}</button>`}
            <button class="danger" data-del="${t.id}" data-coll="transactions">Удалить</button>
          </div>
        </div>
      </div>`).join("") || `<p class="muted">Пока пусто</p>`;
}

function renderRecur() {
  const p = ymOf(new Date());
  const templates = state.tx.filter((t) => t.recurring && !t.recurOf);
  $("recurList").innerHTML =
    templates.map((t) => {
      const done = state.tx.some((x) => x.recurOf === t.id && x.recurPeriod === p);
      return `
        <div class="item">
          <div><b>${esc(t.category)}</b><small>${esc(t.note)} · ${rub(t.amount)}</small></div>
          <div class="right">
            ${done
              ? `<button class="chip" data-recur-undo="${t.id}">✓ В этом месяце · отменить</button>`
              : `<button class="chip" data-recur="${t.id}">Добавить на месяц</button>`}
            <button class="more" data-more="rec-${t.id}" title="Действия">⋯</button>
            <div class="menu" data-menu="rec-${t.id}">
              <button data-edit-tx="${t.id}">Изменить</button>
              <button data-toggle-recur="${t.id}">Остановить повтор</button>
              <button class="danger" data-del="${t.id}" data-coll="transactions">Удалить</button>
            </div>
          </div>
        </div>`;
    }).join("") || `<p class="muted">Повторяющихся операций нет. Отметьте операцию через ⋯ → «Сделать повторяющейся».</p>`;
}

async function addRecurCopy(t) {
  const p = ymOf(new Date());
  if (state.tx.some((x) => x.recurOf === t.id && x.recurPeriod === p)) return toast("Уже добавлено в этом месяце");
  await Data.add(hid, "transactions", {
    type: t.type,
    amount: t.amount,
    category: t.category,
    note: t.note,
    createdAt: Date.now(),
    recurring: false,
    recurOf: t.id,
    recurPeriod: p,
    by: user.uid,
    updatedBy: user.uid,
  });
  toast(`«${t.category}» добавлено на этот месяц`);
}

// Свайп влево/вправо — удаление (телефон и мышь)
let swipe = null;
const txList = $("txList");

txList.addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".item.swipe-ready");
  if (!item || e.target.closest("[data-more], .menu")) return;
  swipe = { el: item, id: item.dataset.id, coll: item.dataset.coll, x: e.clientX, dx: 0 };
});
txList.addEventListener("pointermove", (e) => {
  if (!swipe) return;
  swipe.dx = e.clientX - swipe.x;
  swipe.el.style.transform = `translateX(${swipe.dx}px)`;
  swipe.el.style.opacity = String(1 - Math.min(Math.abs(swipe.dx) / 300, 0.6));
});
async function endSwipe() {
  if (!swipe) return;
  const { el, id, coll, dx } = swipe;
  swipe = null;
  el.style.transition = "transform .25s, opacity .25s";
  if (Math.abs(dx) > 110) {
    el.style.transform = `translateX(${dx > 0 ? 500 : -500}px)`;
    el.style.opacity = "0";
    setTimeout(async () => {
      if (confirm("Удалить запись?")) await Data.remove(hid, coll, id);
      else { el.style.transform = ""; el.style.opacity = ""; }
    }, 220);
  } else {
    el.style.transform = "";
    el.style.opacity = "";
  }
}
txList.addEventListener("pointerup", endSwipe);
txList.addEventListener("pointercancel", endSwipe);

/* ---------- Платежи ---------- */

$("billForm").onsubmit = async (e) => {
  e.preventDefault();
  const bill = {
    title: $("billTitle").value.trim(),
    amount: Number($("billAmount").value),
    dueDay: Number($("billDay").value),
    bank: $("billBank").value.trim(),
    payFrom: "auto",
    paidMonth: null,
    updatedBy: user.uid,
  };
  await Data.add(hid, "bills", bill);
  const res = planBill(bill, dueOf(bill, new Date()));
  const msg = res.noData
    ? `Платёж «${bill.title}» добавлен.\nПока нет данных о получках: отметьте получку, чтобы рассчитать откладывание.`
    : `Платёж «${bill.title}» добавлен.\n` + res.parts.map((x) => `Откладывать ${rub(x.part)} с ${KIND_NAMES[x.kind].toLowerCase()} ${fmtLong(x.date)}`).join("\n");
  e.target.reset();
  toast(msg, 4500);
};

function paidThisMonth(b) {
  return b.paidMonth === ymOf(new Date());
}

function renderBills() {
  $("billList").innerHTML =
    [...state.bills].sort((a, b) => a.dueDay - b.dueDay).map((b) => {
      const paid = paidThisMonth(b);
      const res = planBill(b, nextDue(b));
      const nearest = res.parts.find((p) => !p.past);
      const line = res.noData
        ? "нет данных о получках"
        : nearest
          ? `Откладывать ${rub(nearest.part)} · ${KIND_NAMES[nearest.kind].toLowerCase()} ${fmtDay(nearest.date)}`
          : `до ${b.dueDay}-го получек не осталось`;
      return `
        <div class="item swipe-ready ${paid ? "done" : ""}" data-id="${b.id}">
          <div>
            <b>${esc(b.title)}</b>
            <small>${rub(b.amount)} · ${b.dueDay}-го · ${esc(b.bank)}</small>
            <small class="tag">${line}${res.over ? " ⚠" : ""}</small>
            ${res.shortfall > 0 ? `<small class="tag warn">был недобор ${rub(res.shortfall)}, отложите побольше</small>` : ""}
          </div>
          <div class="right">
            <button class="chip" data-pay="${b.id}">${paid ? "✓ Оплачено" : "Оплатить"}</button>
            <button class="more" data-more="${b.id}" title="Действия">⋯</button>
            <div class="menu" data-menu="${b.id}">
              <button data-edit-bill="${b.id}">Открыть и изменить</button>
              <button data-cycle="${b.id}">Получка: ${PAY_NAMES[b.payFrom || "auto"]}</button>
              <button class="danger" data-del="${b.id}" data-coll="bills">Удалить платёж</button>
            </div>
          </div>
        </div>`;
    }).join("") || `<p class="muted">Добавьте обязательные платежи</p>`;
}

$("billList").onclick = async (e) => {
  const payId = e.target.dataset.pay;
  if (payId) {
    const b = state.bills.find((x) => x.id === payId);
    await togglePaid(b, e.target);
    return;
  }
  if (e.target.closest("button, .menu, input, label")) return;
  const row = e.target.closest(".item[data-id]");
  if (row) openBillSheet(row.dataset.id);
};

async function togglePaid(b, el) {
  const markPaid = !paidThisMonth(b);
  await Data.patch(hid, "bills", b.id, { paidMonth: markPaid ? ymOf(new Date()) : null, updatedBy: user.uid });
  if (markPaid) {
    celebrate("✓ оплачено", el);
    toast(`«${b.title}» оплачено · ${rub(b.amount)}`);
  }
}

function openBillSheet(id) {
  const b = state.bills.find((x) => x.id === id);
  if (!b) return;
  const res = planBill(b, nextDue(b));
  const paid = paidThisMonth(b);
  const rows = res.parts.map((p) => `
    <div class="plan-row">
      <div class="plan-when">
        <b>${fmtLong(p.date)}</b>
        <small>${KIND_NAMES[p.kind]}${p.past ? " · уже пришла" : ""}${p.extra ? ` · +${rub(p.extra)} недобор` : ""}</small>
      </div>
      <label class="plan-input">
        <span>Откладывать</span>
        <input class="input small-in" data-save-key="${p.key}" type="number" inputmode="decimal"
               value="${p.override !== undefined ? p.override : ""}" placeholder="${Math.round(p.planned)}">
      </label>
    </div>`).join("") || `<p class="muted">Нет данных о получках: отметьте получку, чтобы рассчитать откладывание.</p>`;
  openSheet(`
    <h2>${esc(b.title)}</h2>
    <p class="muted">${rub(b.amount)} · ${b.dueDay}-го · ${esc(b.bank)}</p>
    ${rows}
    <p class="muted small">Пустое поле — считается по плану. Введите свою сумму, если отложили иначе.</p>
    <button class="btn glow small" data-sheet="save-corr" data-id="${b.id}">Сохранить суммы</button>
    <button class="btn ${paid ? "ghost" : "glow"}" data-sheet="pay" data-id="${b.id}">${paid ? "✓ Оплачено · отменить" : "Оплатить"}</button>
    <details class="sheet-more">
      <summary>Изменить платёж</summary>
      <input class="input" id="sf-title" value="${esc(b.title)}" placeholder="Название">
      <div class="row"><input class="input" id="sf-amount" type="number" value="${b.amount}" placeholder="Сумма"><input class="input" id="sf-day" type="number" min="1" max="31" value="${b.dueDay}" placeholder="День"></div>
      <input class="input" id="sf-bank" value="${esc(b.bank || "")}" placeholder="Банк">
      <button class="btn ghost small" data-sheet="save-bill" data-id="${b.id}">Сохранить платёж</button>
    </details>`);
}

/* ---------- Конверты ---------- */

$("envForm").onsubmit = async (e) => {
  e.preventDefault();
  await Data.add(hid, "envelopes", {
    name: $("envName").value.trim(),
    target: Number($("envTarget").value),
    saved: 0,
    updatedBy: user.uid,
  });
  e.target.reset();
  toast("Конверт создан ✉️");
};

$("envList").onclick = async (e) => {
  const id = e.target.dataset.dep;
  if (!id) return;
  const env = state.envs.find((x) => x.id === id);
  const input = document.querySelector(`[data-amt="${id}"]`);
  const amount = Number(input.value);
  if (!amount) return;

  const before = Number(env.saved) || 0;
  const reachedNow = before < env.target && before + amount >= env.target;

  await Data.addSaved(hid, id, amount, user.uid);
  input.value = "";

  const card = e.target.closest(".env");
  card.classList.remove("pulse");
  void card.offsetWidth;
  card.classList.add("pulse");
  celebrate(`+${rub(amount)} в конверт`, e.target);
  if (reachedNow) goalCelebrate(env.name);
};

function renderEnvs() {
  $("envList").innerHTML =
    state.envs.map((v) => {
      const saved = Number(v.saved) || 0;
      const done = saved >= (v.target || 0);
      const pct = Math.min(100, Math.round((saved / (v.target || 1)) * 100));
      return `
        <div class="card env ${done ? "goal" : ""}" data-env="${v.id}">
          <div class="row between">
            <b>${esc(v.name)} ${done ? "🎉" : ""}</b>
            <small>${rub(saved)} / ${rub(v.target)}</small>
          </div>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <div class="row">
            <input class="input" type="number" placeholder="Сумма" data-amt="${v.id}">
            <button class="btn glow small" data-dep="${v.id}">Отложить</button>
          </div>
        </div>`;
    }).join("") || `<p class="muted">Создайте первый конверт</p>`;
}

/* ---------- Главный экран ---------- */

function renderHome() {
  const base = new Date();
  const p = ymOf(base);
  const monthTx = state.tx.filter((t) => inMonth(t.createdAt, base));
  const income = sum(state.incomes.filter((i) => i.period === p)) + sum(monthTx.filter((t) => t.type === "income"));
  const expense = sum(monthTx.filter((t) => t.type === "expense"));
  const unpaid = sum(state.bills.filter((b) => !paidThisMonth(b)), (b) => b.amount);
  $("freeMoney").textContent = rub(income - expense - unpaid);

  renderAlerts();

  $("upcoming").innerHTML =
    state.bills
      .filter((b) => !paidThisMonth(b))
      .sort((a, b) => a.dueDay - b.dueDay)
      .slice(0, 5)
      .map((b) => `
        <div class="item">
          <div><b>${esc(b.title)}</b><small>${b.dueDay}-го · ${esc(b.bank)}</small></div>
          <span class="expense">${rub(b.amount)}</span>
        </div>`).join("") || `<p class="muted">Все платежи оплачены 🎉</p>`;

  $("paydayPlan").innerHTML =
    monthPlan(base).map((g) => `
      <div class="item">
        <div>
          <b>${KIND_NAMES[g.kind]} · ${fmtLong(g.date)}${g.fact ? "" : " · прогноз"}${g.delayed ? " · задержана" : ""}</b>
          <small>${esc(g.items.map((i) => i.title).join(", "))}</small>
        </div>
        <span class="income">${rub(g.total)}</span>
      </div>`).join("") || `<p class="muted">Добавьте платежи, и здесь появится, что откладывать</p>`;
}

/* ---------- Итоги и графики ---------- */

const barRow = (label, value, max, cls = "") =>
  `<div class="chart-row"><span>${esc(label)}</span><div class="bar ${cls}"><span style="width:${max ? Math.round((value / max) * 100) : 0}%"></span></div><b>${rub(value)}</b></div>`;

function renderSummary() {
  const base = viewMonth;
  const p = ymOf(base);
  const isCur = p === ymOf(new Date());
  $("monthTitle").textContent = monthName(base);

  const txs = state.tx.filter((t) => inMonth(t.createdAt, base));
  const recs = state.incomes.filter((i) => i.period === p).sort((a, b) => a.paydayDate - b.paydayDate);
  const expectedLeft = paydays(base, 0, 0)
    .filter((x) => x.period === p && !incomeOf(x.kind, x.period))
    .reduce((s, x) => s + lastAmount(x.kind), 0);

  const manualIncome = sum(txs.filter((t) => t.type === "income"));
  const factIncome = sum(recs) + manualIncome;
  const forecastIncome = factIncome + expectedLeft;
  const expense = sum(txs.filter((t) => t.type === "expense"));
  const billsTotal = sum(state.bills);
  const billsUnpaid = isCur ? sum(state.bills.filter((b) => !paidThisMonth(b))) : 0;
  const left = forecastIncome - expense - billsUnpaid;

  const cats = {};
  txs.filter((t) => t.type === "expense").forEach((t) => {
    cats[t.category] = (cats[t.category] || 0) + Number(t.amount);
  });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxCat = catRows[0]?.[1] || 0;
  const maxOverview = Math.max(forecastIncome, expense, billsTotal, 1);

  $("summaryBody").innerHTML = `
    <div class="balance-card">
      <span>${isCur ? "Прогноз на конец месяца" : "Итог месяца"}</span>
      <strong>${rub(left)}</strong>
      <small style="opacity:.85">доходы ${rub(forecastIncome)}${expectedLeft ? " (включая ожидаемые получки)" : ""}</small>
    </div>

    <div class="card">
      <b>Доходы и расходы</b>
      ${barRow("Доходы", forecastIncome, maxOverview, "")}
      ${barRow("Расходы", expense, maxOverview, "")}
      ${barRow("Платежи", billsTotal, maxOverview, "")}
    </div>

    <div class="card">
      <b>Расходы по категориям</b>
      ${catRows.map(([name, v]) => barRow(name, v, maxCat)).join("") || `<p class="muted">Расходов за месяц пока нет</p>`}
    </div>

    <div class="card">
      <b>Получки за месяц</b>
      ${recs.map((i) => `
        <div class="item">
          <div>
            <b>${KIND_NAMES[i.kind]}${i.delayed ? " · задержана" : ""}</b>
            <small>по плану ${fmtDay(new Date(i.paydayDate))} · получено ${fmtDay(new Date(i.receivedAt))}</small>
          </div>
          <div class="right">
            <span class="income amt">${rub(i.amount)}</span>
            <button class="more" data-more="${i.id}">⋯</button>
            <div class="menu" data-menu="${i.id}">
              <button class="danger" data-del="${i.id}" data-coll="incomes">Удалить</button>
            </div>
          </div>
        </div>`).join("") || `<p class="muted">Получки за этот месяц не отмечены</p>`}
    </div>

    <div class="card">
      <b>Конверты</b>
      ${state.envs.map((v) => {
        const pct = Math.min(100, Math.round(((v.saved || 0) / (v.target || 1)) * 100));
        return `<div class="chart-row"><span>${esc(v.name)}</span><div class="bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>`;
      }).join("") || `<p class="muted">Конвертов пока нет</p>`}
    </div>`;
}

$("prevMonth").onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderSummary(); };
$("nextMonth").onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderSummary(); };

/* ---------- Меню ⋯, удаление, повторы, смена получки ---------- */

document.addEventListener("click", async (e) => {
  const more = e.target.closest("[data-more]");
  if (more) {
    const menu = document.querySelector(`[data-menu="${more.dataset.more}"]`);
    document.querySelectorAll(".menu.open").forEach((m) => m !== menu && m.classList.remove("open"));
    menu?.classList.toggle("open");
    return;
  }
  if (!e.target.closest(".menu")) document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));

  const ru = e.target.closest("[data-recur-undo]");
  if (ru) {
    const per = ymOf(new Date());
    const copy = state.tx.find((x) => x.recurOf === ru.dataset.recurUndo && x.recurPeriod === per);
    if (copy && confirm("Убрать эту операцию из этого месяца?")) await Data.remove(hid, "transactions", copy.id);
    return;
  }
  const eb = e.target.closest("[data-edit-bill]");
  if (eb) { closeMenus(); return openBillSheet(eb.dataset.editBill); }
  const et = e.target.closest("[data-edit-tx]");
  if (et) { closeMenus(); return openEditTx(et.dataset.editTx); }
  const ep = e.target.closest("[data-edit-personal]");
  if (ep) { closeMenus(); return openEditPersonal(ep.dataset.editPersonal); }
  const dp = e.target.closest("[data-del-personal]");
  if (dp) {
    if (confirm("Удалить личную трату?")) await Data.personalRemove(user.uid, dp.dataset.delPersonal);
    return;
  }
  const rm = e.target.closest("[data-remove-member]");
  if (rm) {
    if (confirm("Удалить участника из семьи?")) await Data.removeMember(hid, rm.dataset.removeMember);
    return;
  }

  const del = e.target.closest("[data-del]");
  if (del) {
    if (confirm("Удалить запись?")) await Data.remove(hid, del.dataset.coll, del.dataset.del);
    return;
  }

  const tog = e.target.closest("[data-toggle-recur]");
  if (tog) {
    const t = state.tx.find((x) => x.id === tog.dataset.toggleRecur);
    await Data.patch(hid, "transactions", t.id, { recurring: !t.recurring, updatedBy: user.uid });
    toast(t.recurring ? "Убрано из повторяющихся" : "Операция стала повторяющейся");
    return;
  }

  const rec = e.target.closest("[data-recur]");
  if (rec) {
    rec.disabled = true;
    const t = state.tx.find((x) => x.id === rec.dataset.recur);
    await addRecurCopy(t);
    return;
  }

  const cyc = e.target.closest("[data-cycle]");
  if (cyc) {
    const b = state.bills.find((x) => x.id === cyc.dataset.cycle);
    const order = ["auto", "advance", "salary"];
    const next = order[(order.indexOf(b.payFrom || "auto") + 1) % order.length];
    await Data.patch(hid, "bills", b.id, { payFrom: next, updatedBy: user.uid });
    toast(`«${b.title}»: откладывать ${PAY_NAMES[next]}`);
  }
});

/* ---------- Экспорт, резервная копия, восстановление ---------- */

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// CSV с ; и BOM — открывается в Excel на русской раскладке без настроек
$("exportCsv").onclick = () => {
  const head = ["Раздел", "Дата и время", "Тип", "Сумма", "Категория или получка", "Комментарий", "Повторяющаяся", "Задержана"];
  const rows = [head.map(csvCell).join(";")];
  [...state.tx].sort((a, b) => b.createdAt - a.createdAt).forEach((t) => rows.push([
    "Операция", new Date(t.createdAt).toLocaleString("ru-RU"), t.type === "income" ? "Доход" : "Расход",
    String(t.amount).replace(".", ","), t.category, t.note, t.recurring || t.recurOf ? "да" : "нет", "",
  ].map(csvCell).join(";")));
  [...state.incomes].sort((a, b) => b.receivedAt - a.receivedAt).forEach((i) => rows.push([
    "Получка", new Date(i.receivedAt).toLocaleString("ru-RU"), "Доход", String(i.amount).replace(".", ","),
    KIND_NAMES[i.kind], "", "нет", i.delayed ? "да" : "нет",
  ].map(csvCell).join(";")));
  downloadFile(`budget-${ymOf(new Date())}.csv`, "\uFEFF" + rows.join("\r\n"), "text/csv;charset=utf-8");
};

$("backupBtn").onclick = () => {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings,
    transactions: state.tx.map(strip),
    bills: state.bills.map(strip),
    envelopes: state.envs.map(strip),
    incomes: state.incomes.map(strip),
  };
  downloadFile(`budget-backup-${ymOf(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
};

$("restoreFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm("Добавить записи из копии? Текущие записи не удаляются.")) return;
    for (const name of ["transactions", "bills", "envelopes", "incomes"]) {
      for (const item of data[name] || []) await Data.add(hid, name, item);
    }
    if (data.settings) {
      settings = { ...DEFAULTS, ...data.settings };
      await Data.saveSettings(hid, settings);
    }
    toast("Копия восстановлена");
  } catch (err) {
    toast("Не удалось прочитать файл копии");
  }
  e.target.value = "";
};

/* ---------- Настройки ---------- */

$("saveSettings").onclick = async () => {
  settings.advanceDay = Number($("advanceDay").value);
  settings.salaryDay = Number($("salaryDay").value);
  await Data.saveSettings(hid, settings);
  renderAll();
  toast("Сохранено ✨");
};

function renderAll() {
  if (!hid) return;
  renderHome();
  renderTx();
  renderRecur();
  renderBills();
  renderEnvs();
  renderSummary();
}
