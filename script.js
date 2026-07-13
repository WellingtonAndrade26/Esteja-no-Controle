"use strict";

const API_BASE_URL = "https://controle-gastos-api-ruby.vercel.app";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  loginBox: $("#loginBox"),
  appConteudo: $("#appConteudo"),
  loginForm: $("#loginForm"),
  cadastroForm: $("#cadastroForm"),
  loginEmail: $("#loginEmail"),
  loginSenha: $("#loginSenha"),
  cadastroNome: $("#cadastroNome"),
  cadastroEmail: $("#cadastroEmail"),
  cadastroSenha: $("#cadastroSenha"),
  cadastroConfirmarSenha: $("#cadastroConfirmarSenha"),
  btnLogin: $("#btnLogin"),
  btnCadastrar: $("#btnCadastrar"),
  btnMostrarCadastro: $("#btnMostrarCadastro"),
  btnMostrarLogin: $("#btnMostrarLogin"),
  loginMensagem: $("#loginMensagem"),
  btnSair: $("#btnSair"),
  btnInstallApp: $("#btnInstallApp"),
  btnInstalarPerfil: $("#btnInstalarPerfil"),
  boasVindasBanner: $("#boasVindasBanner"),
  nomePerfil: $("#nomePerfil"),
  emailPerfil: $("#emailPerfil"),
  mesSelecionado: $("#mesSelecionado"),
  saldoBox: $(".saldo-box"),
  textoSaldo: $("#textoSaldo"),
  saldoRestante: $("#saldoRestante"),
  orcamentoResumo: $("#orcamentoResumo"),
  orcamentoTotal: $("#orcamentoTotal"),
  totalGasto: $("#totalGasto"),
  resumoGastos: $("#resumoGastos"),
  resumoDisponivel: $("#resumoDisponivel"),
  valorGuardadoTotal: $("#valorGuardadoTotal"),
  percentOrcamentoBar: $("#percentOrcamentoBar"),
  percentGastoBar: $("#percentGastoBar"),
  percentSaldoBar: $("#percentSaldoBar"),
  orcamentoPercentText: $("#orcamentoPercentText"),
  gastoPercentText: $("#gastoPercentText"),
  saldoPercentText: $("#saldoPercentText"),
  orcamentoInput: $("#orcamentoInput"),
  btnAdicionarOrcamento: $("#btnAdicionarOrcamento"),
  btnRetirarOrcamento: $("#btnRetirarOrcamento"),
  btnDefinirOrcamento: $("#btnDefinirOrcamento"),
  formGasto: $("#formGasto"),
  descricao: $("#descricao"),
  valor: $("#valor"),
  categoria: $("#categoria"),
  data: $("#data"),
  listaGastos: $("#listaGastos"),
  tituloListaGastos: $("#tituloListaGastos"),
  subtituloListaGastos: $("#subtituloListaGastos"),
  dashboardCategorias: $("#dashboardCategorias"),
  categoriaChart: $("#categoriaChart"),
  chartTotal: $("#chartTotal"),
  metaValor: $("#metaValor"),
  metaAlcancado: $("#metaAlcancado"),
  metaStatus: $("#metaStatus"),
  metaTexto: $("#metaTexto"),
  metaProgressoBarra: $("#metaProgressoBarra"),
  metaInput: $("#metaInput"),
  btnDefinirMeta: $("#btnDefinirMeta"),
  metaResumoPagina: $("#metaResumoPagina"),
  metaProgressoPagina: $("#metaProgressoPagina"),
  toast: $("#toast")
};

const categoryConfig = {
  "Alimentação": { color: "#ff6384", icon: "🍔" },
  "Mercado": { color: "#ff6384", icon: "🛒" },
  "Casa": { color: "#ff9f55", icon: "🏠" },
  "Contas": { color: "#ff9f55", icon: "⚡" },
  "Transporte": { color: "#5ba6e6", icon: "🚙" },
  "Saúde": { color: "#72c47c", icon: "💊" },
  "Lazer": { color: "#be72c6", icon: "🎮" },
  "Outros": { color: "#9aa1ae", icon: "•••" }
};

let appToken = localStorage.getItem("app_token") || "";
let selectedMonth = new Date().toISOString().slice(0, 7);
let expenses = [];
let budgets = {};
let currentBudget = 0;
let currentGoal = 0;
let currentView = "home";
let installPrompt = null;
let categoryChart = null;
let toastTimer = null;

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatCompactCurrency(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1
    }).format(number);
  }
  return formatCurrency(number).replace(",00", "");
}

function formatDate(date) {
  if (!date) return "";
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function monthLabel(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${appToken}`
  };
}

function setButtonLoading(button, loading, loadingText = "Aguarde...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
      refreshIcons();
    }
  }
}

function showToast(message) {
  if (!elements.toast) return;
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function showLoginMessage(message) {
  if (elements.loginMensagem) elements.loginMensagem.textContent = message;
}

function updateUserDisplay(name, email = "") {
  const finalName = name || localStorage.getItem("app_user_name") || "Usuário";
  const firstName = finalName.trim().split(/\s+/)[0] || "Usuário";

  localStorage.setItem("app_user_name", finalName);
  if (email) localStorage.setItem("app_user_email", email);

  if (elements.boasVindasBanner) {
    elements.boasVindasBanner.textContent = `Olá, ${firstName}! Sua vida financeira, organizada 💗`;
  }
  if (elements.nomePerfil) elements.nomePerfil.textContent = finalName;
  if (elements.emailPerfil) {
    elements.emailPerfil.textContent = email || localStorage.getItem("app_user_email") || "Dados protegidos pela sua conta";
  }
}

function openApp() {
  elements.loginBox?.classList.add("oculto");
  elements.appConteudo?.classList.remove("oculto");
  updateUserDisplay();
  refreshIcons();
}

function closeApp() {
  elements.loginBox?.classList.remove("oculto");
  elements.appConteudo?.classList.add("oculto");
  refreshIcons();
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (response.status === 401) {
    clearSession();
    closeApp();
    showLoginMessage("Sua sessão expirou. Entre novamente.");
    throw new Error("Sessão expirada.");
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || (typeof data === "string" ? data : "Não foi possível concluir a operação.");
    throw new Error(message);
  }

  return data;
}

function clearSession() {
  localStorage.removeItem("app_token");
  localStorage.removeItem("app_user_name");
  localStorage.removeItem("app_user_email");
  appToken = "";
  expenses = [];
  budgets = {};
  currentBudget = 0;
  currentGoal = 0;
}

async function registerUser() {
  const name = elements.cadastroNome.value.trim();
  const email = elements.cadastroEmail.value.trim();
  const password = elements.cadastroSenha.value;
  const confirmPassword = elements.cadastroConfirmarSenha.value;

  showLoginMessage("");

  if (!name || !email || !password || !confirmPassword) {
    showLoginMessage("Preencha todos os campos.");
    return;
  }

  if (password.length < 4) {
    showLoginMessage("A senha precisa ter pelo menos 4 caracteres.");
    return;
  }

  if (password !== confirmPassword) {
    showLoginMessage("As senhas não conferem.");
    return;
  }

  setButtonLoading(elements.btnCadastrar, true, "Criando conta...");

  try {
    const data = await apiFetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword })
    });

    appToken = data.token;
    localStorage.setItem("app_token", appToken);
    updateUserDisplay(data.user?.name || name, data.user?.email || email);
    openApp();
    await initializeApp();
  } catch (error) {
    console.error("Erro no cadastro:", error);
    showLoginMessage(error.message || "Erro ao criar a conta.");
  } finally {
    setButtonLoading(elements.btnCadastrar, false);
  }
}

async function loginUser() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginSenha.value;

  showLoginMessage("");

  if (!email || !password) {
    showLoginMessage("Informe e-mail e senha.");
    return;
  }

  setButtonLoading(elements.btnLogin, true, "Entrando...");

  try {
    const data = await apiFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    appToken = data.token;
    localStorage.setItem("app_token", appToken);
    updateUserDisplay(data.user?.name, data.user?.email || email);
    openApp();
    await initializeApp();
  } catch (error) {
    console.error("Erro no login:", error);
    showLoginMessage(error.message || "E-mail ou senha inválidos.");
  } finally {
    setButtonLoading(elements.btnLogin, false);
  }
}

async function fetchExpenses(month = selectedMonth) {
  const data = await apiFetch(`/api/expenses?month=${encodeURIComponent(month)}`, {
    headers: authHeaders()
  });

  expenses = (Array.isArray(data) ? data : []).map((item) => ({
    id: item.id,
    description: item.name,
    value: Number(item.value),
    category: item.category,
    date: String(item.date || "").slice(0, 10)
  }));
}

async function fetchAllExpenses() {
  const data = await apiFetch("/api/expenses", { headers: authHeaders() });
  return (Array.isArray(data) ? data : []).map((item) => ({
    id: item.id,
    description: item.name,
    value: Number(item.value),
    category: item.category,
    date: String(item.date || "").slice(0, 10)
  }));
}

async function createExpense(expense) {
  return apiFetch("/api/expenses", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name: expense.description,
      value: Number(expense.value),
      category: expense.category,
      date: expense.date
    })
  });
}

async function deleteExpenseOnline(id) {
  return apiFetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders()
  });
}

async function fetchBudgets() {
  const data = await apiFetch("/api/budgets", { headers: authHeaders() });
  budgets = {};

  (Array.isArray(data) ? data : []).forEach((item) => {
    budgets[item.month] = Number(item.value) || 0;
  });

  currentBudget = Number(budgets[selectedMonth]) || 0;
}

async function saveBudget(month, value) {
  return apiFetch("/api/budgets", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ month, value: Number(value) })
  });
}

async function fetchGoal() {
  try {
    const data = await apiFetch(`/api/goals?month=${encodeURIComponent(selectedMonth)}`, {
      headers: authHeaders()
    });

    if (Array.isArray(data)) {
      currentGoal = data.length ? Number(data[0].value) || 0 : 0;
    } else if (data && typeof data === "object") {
      currentGoal = Number(data.value ?? data.goal?.value ?? 0) || 0;
    } else {
      currentGoal = 0;
    }
  } catch (error) {
    console.warn("Meta indisponível:", error);
    currentGoal = Number(localStorage.getItem(`goal_${selectedMonth}`)) || 0;
  }
}

async function saveGoal(value) {
  try {
    const data = await apiFetch("/api/goals", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ month: selectedMonth, value: Number(value) })
    });
    localStorage.setItem(`goal_${selectedMonth}`, String(value));
    return data;
  } catch (error) {
    localStorage.setItem(`goal_${selectedMonth}`, String(value));
    currentGoal = Number(value) || 0;
    console.warn("Meta salva apenas neste dispositivo:", error);
    showToast("A meta foi salva neste dispositivo.");
    return null;
  }
}

function getMonthExpenses() {
  return expenses.filter((expense) => expense.date.startsWith(selectedMonth));
}

function getTotalExpenses() {
  return getMonthExpenses().reduce((total, expense) => total + Number(expense.value), 0);
}

function getCategory(category) {
  return categoryConfig[category] || categoryConfig.Outros;
}

function groupCategories() {
  const total = getTotalExpenses();
  const grouped = {};

  getMonthExpenses().forEach((expense) => {
    grouped[expense.category] = (grouped[expense.category] || 0) + Number(expense.value);
  });

  return Object.entries(grouped)
    .map(([category, value]) => ({
      category,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      ...getCategory(category)
    }))
    .sort((a, b) => b.value - a.value);
}

function renderExpenses() {
  if (!elements.listaGastos) return;

  const ordered = [...getMonthExpenses()].sort((a, b) => {
    if (a.date === b.date) return String(b.id).localeCompare(String(a.id));
    return b.date.localeCompare(a.date);
  });

  const visibleExpenses = currentView === "home" ? ordered.slice(0, 4) : ordered;

  if (elements.tituloListaGastos) {
    elements.tituloListaGastos.textContent = currentView === "home" ? "Últimos gastos" : "Todos os gastos";
  }
  if (elements.subtituloListaGastos) {
    elements.subtituloListaGastos.textContent = currentView === "home"
      ? "Movimentações mais recentes"
      : `${ordered.length} movimentação${ordered.length === 1 ? "" : "ões"} em ${monthLabel(selectedMonth)}`;
  }

  elements.listaGastos.innerHTML = "";

  if (!visibleExpenses.length) {
    elements.listaGastos.innerHTML = '<li class="mensagem-vazia">Nenhum gasto cadastrado neste mês.</li>';
    return;
  }

  visibleExpenses.forEach((expense) => {
    const config = getCategory(expense.category);
    const item = document.createElement("li");
    item.className = "gasto-item";
    item.innerHTML = `
      <span class="expense-icon" style="background:${config.color}18;color:${config.color}">${config.icon}</span>
      <div class="gasto-info">
        <strong>${escapeHtml(expense.description)}</strong>
        <span>${formatDate(expense.date)} · ${escapeHtml(expense.category)}</span>
      </div>
      <div class="expense-side">
        <p class="gasto-valor">- ${formatCurrency(expense.value)}</p>
        <button class="btn-excluir" type="button" aria-label="Excluir ${escapeHtml(expense.description)}" data-expense-id="${escapeHtml(String(expense.id))}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    elements.listaGastos.appendChild(item);
  });

  refreshIcons();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateSummary() {
  const total = getTotalExpenses();
  const balance = currentBudget - total;
  const budgetBase = currentBudget > 0 ? currentBudget : 0;
  const expensePercent = budgetBase > 0 ? (total / budgetBase) * 100 : 0;
  const balancePercent = budgetBase > 0 ? Math.max(0, balance / budgetBase) * 100 : 0;

  elements.orcamentoResumo.textContent = formatCurrency(currentBudget);
  elements.orcamentoTotal.textContent = formatCurrency(currentBudget);
  elements.totalGasto.textContent = formatCurrency(total);
  elements.resumoGastos.textContent = formatCurrency(total);
  elements.resumoDisponivel.textContent = formatCurrency(balance);

  elements.percentOrcamentoBar.style.width = currentBudget > 0 ? "100%" : "0%";
  elements.percentGastoBar.style.width = `${Math.min(100, Math.max(0, expensePercent))}%`;
  elements.percentSaldoBar.style.width = `${Math.min(100, Math.max(0, balancePercent))}%`;
  elements.orcamentoPercentText.textContent = currentBudget > 0 ? "100% do orçamento" : "Defina seu orçamento";
  elements.gastoPercentText.textContent = currentBudget > 0 ? `${Math.round(expensePercent)}% do orçamento` : "Sem orçamento definido";
  elements.saldoPercentText.textContent = currentBudget > 0 ? `${Math.round(balancePercent)}% do orçamento` : "Defina seu orçamento";

  if (balance >= 0) {
    elements.textoSaldo.textContent = "Saldo disponível";
    elements.saldoRestante.textContent = formatCurrency(balance);
    elements.saldoBox.classList.remove("negativo");
  } else {
    elements.textoSaldo.textContent = "Orçamento excedido";
    elements.saldoRestante.textContent = `- ${formatCurrency(Math.abs(balance))}`;
    elements.saldoBox.classList.add("negativo");
  }

  if (elements.chartTotal) elements.chartTotal.textContent = formatCompactCurrency(total);
}

function updateGoal() {
  const savedThisMonth = Math.max(0, currentBudget - getTotalExpenses());
  const percentage = currentGoal > 0 ? Math.min(100, (savedThisMonth / currentGoal) * 100) : 0;
  const missing = Math.max(0, currentGoal - savedThisMonth);

  elements.metaValor.textContent = formatCurrency(currentGoal);
  elements.metaAlcancado.textContent = formatCurrency(savedThisMonth);
  elements.metaProgressoBarra.style.width = `${percentage}%`;
  elements.metaProgressoPagina.style.width = `${percentage}%`;
  elements.metaResumoPagina.textContent = `${Math.round(percentage)}%`;

  if (currentGoal <= 0) {
    elements.metaStatus.textContent = "Sem meta definida";
    elements.metaTexto.textContent = "Defina uma meta para este mês.";
  } else if (percentage >= 100) {
    elements.metaStatus.textContent = "Meta alcançada 🎉";
    elements.metaTexto.textContent = `Você guardou ${formatCurrency(savedThisMonth)}.`;
  } else {
    elements.metaStatus.textContent = `${Math.round(percentage)}% da meta`;
    elements.metaTexto.textContent = `Faltam ${formatCurrency(missing)}.`;
  }
}

function renderCategories() {
  const categories = groupCategories();
  elements.dashboardCategorias.innerHTML = "";

  if (!categories.length) {
    elements.dashboardCategorias.innerHTML = '<p class="mensagem-vazia">Sem gastos para exibir.</p>';
    updateChart([]);
    return;
  }

  categories.slice(0, 6).forEach((item) => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <span class="category-dot" style="background:${item.color}"></span>
      <strong>${escapeHtml(item.category)}</strong>
      <span class="category-values"><b>${formatCurrency(item.value)}</b><span>${Math.round(item.percentage)}%</span></span>
    `;
    elements.dashboardCategorias.appendChild(row);
  });

  updateChart(categories);
}

function updateChart(categories) {
  if (!elements.categoriaChart || !window.Chart) return;

  const hasData = categories.length > 0;
  const labels = hasData ? categories.map((item) => item.category) : ["Sem gastos"];
  const values = hasData ? categories.map((item) => item.value) : [1];
  const colors = hasData ? categories.map((item) => item.color) : ["#f2e8eb"];

  if (!categoryChart) {
    categoryChart = new Chart(elements.categoriaChart, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: "#ffffff",
          borderWidth: 4,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "63%",
        animation: { duration: 450 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return hasData ? `${context.label}: ${formatCurrency(context.raw)}` : "Sem gastos";
              }
            }
          }
        }
      }
    });
    return;
  }

  categoryChart.data.labels = labels;
  categoryChart.data.datasets[0].data = values;
  categoryChart.data.datasets[0].backgroundColor = colors;
  categoryChart.update();
}

async function updateSavedTotal() {
  if (!elements.valorGuardadoTotal) return;

  try {
    const allExpenses = await fetchAllExpenses();
    let savedTotal = 0;

    Object.entries(budgets).forEach(([month, budget]) => {
      const monthExpenses = allExpenses
        .filter((expense) => expense.date.startsWith(month))
        .reduce((total, expense) => total + Number(expense.value), 0);

      const remaining = Number(budget) - monthExpenses;
      if (remaining > 0) savedTotal += remaining;
    });

    elements.valorGuardadoTotal.textContent = formatCurrency(savedTotal);
  } catch (error) {
    console.warn("Não foi possível calcular o total guardado:", error);
    elements.valorGuardadoTotal.textContent = formatCurrency(0);
  }
}

function updateAll() {
  updateSummary();
  updateGoal();
  renderExpenses();
  renderCategories();
  elements.mesSelecionado.setAttribute("aria-label", `Mês selecionado: ${monthLabel(selectedMonth)}`);
  refreshIcons();
}

async function addExpense(event) {
  event.preventDefault();

  const expense = {
    description: elements.descricao.value.trim(),
    value: Number(elements.valor.value),
    category: elements.categoria.value,
    date: elements.data.value
  };

  if (!expense.description || expense.value <= 0 || !expense.category || !expense.date) {
    showToast("Preencha todos os dados do gasto.");
    return;
  }

  const submitButton = elements.formGasto.querySelector('button[type="submit"]');
  setButtonLoading(submitButton, true, "Salvando...");

  try {
    await createExpense(expense);
    await fetchExpenses();
    updateAll();
    await updateSavedTotal();
    elements.formGasto.reset();
    elements.data.value = new Date().toISOString().slice(0, 10);
    showToast("Gasto salvo com sucesso.");
  } catch (error) {
    console.error("Erro ao salvar gasto:", error);
    showToast(error.message || "Não foi possível salvar o gasto.");
  } finally {
    setButtonLoading(submitButton, false);
  }
}

async function deleteExpense(id) {
  if (!confirm("Deseja excluir este gasto?")) return;

  try {
    await deleteExpenseOnline(id);
    await fetchExpenses();
    updateAll();
    await updateSavedTotal();
    showToast("Gasto excluído.");
  } catch (error) {
    console.error("Erro ao excluir gasto:", error);
    showToast(error.message || "Não foi possível excluir o gasto.");
  }
}

async function changeBudget(mode) {
  const value = Number(elements.orcamentoInput.value);

  if (value < 0 || (!value && mode !== "set")) {
    showToast("Digite um valor válido.");
    return;
  }

  let nextBudget = currentBudget;
  if (mode === "add") nextBudget += value;
  if (mode === "remove") nextBudget = Math.max(0, nextBudget - value);
  if (mode === "set") nextBudget = value || 0;

  const buttonMap = {
    add: elements.btnAdicionarOrcamento,
    remove: elements.btnRetirarOrcamento,
    set: elements.btnDefinirOrcamento
  };
  const button = buttonMap[mode];
  setButtonLoading(button, true, "Salvando...");

  try {
    await saveBudget(selectedMonth, nextBudget);
    await fetchBudgets();
    elements.orcamentoInput.value = "";
    updateAll();
    await updateSavedTotal();
    showToast("Orçamento atualizado.");
  } catch (error) {
    console.error("Erro ao salvar orçamento:", error);
    showToast(error.message || "Não foi possível salvar o orçamento.");
  } finally {
    setButtonLoading(button, false);
  }
}

async function changeGoal() {
  const value = Number(elements.metaInput.value);

  if (value < 0 || Number.isNaN(value)) {
    showToast("Digite um valor válido para a meta.");
    return;
  }

  setButtonLoading(elements.btnDefinirMeta, true, "Salvando...");

  try {
    await saveGoal(value);
    currentGoal = value;
    await fetchGoal();
    elements.metaInput.value = "";
    updateGoal();
    showToast("Meta atualizada.");
  } catch (error) {
    console.error("Erro ao salvar meta:", error);
    showToast(error.message || "Não foi possível salvar a meta.");
  } finally {
    setButtonLoading(elements.btnDefinirMeta, false);
  }
}

function setView(view, targetId = "") {
  currentView = view;

  $$('[data-view]').forEach((section) => {
    const views = section.dataset.view.split(/\s+/);
    section.classList.toggle("view-hidden", !views.includes(view));
  });

  $$(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.viewTarget === view);
  });

  renderExpenses();

  if (view === "reports" && categoryChart) {
    setTimeout(() => categoryChart.resize(), 80);
  }

  const target = targetId ? document.getElementById(targetId) : null;
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (target && view !== "home") {
    setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  if (targetId === "gastoSection") {
    setTimeout(() => elements.descricao?.focus(), 420);
  }

  refreshIcons();
}

function configureNavigation() {
  $$('[data-view-target]').forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.viewTarget, button.dataset.scrollTarget || "");
    });
  });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function updateInstallButtons() {
  const shouldHide = isStandalone();
  elements.btnInstallApp?.classList.toggle("oculto", shouldHide || !installPrompt);
}

async function requestInstall() {
  if (isStandalone()) {
    showToast("O aplicativo já está instalado.");
    return;
  }

  if (!installPrompt) {
    showToast("No navegador, use “Adicionar à tela inicial” ou “Instalar app”.");
    return;
  }

  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  updateInstallButtons();

  if (choice.outcome === "accepted") showToast("Aplicativo instalado.");
}

async function initializeApp() {
  elements.mesSelecionado.value = selectedMonth;

  try {
    await Promise.all([fetchBudgets(), fetchExpenses(), fetchGoal()]);
    updateAll();
    await updateSavedTotal();
  } catch (error) {
    console.error("Erro ao iniciar aplicativo:", error);
    if (appToken) showToast(error.message || "Não foi possível carregar os dados.");
  }
}

async function checkSavedLogin() {
  if (!appToken) {
    closeApp();
    return;
  }

  openApp();
  await initializeApp();
}

function bindEvents() {
  elements.btnMostrarCadastro?.addEventListener("click", () => {
    elements.loginForm.classList.add("oculto");
    elements.cadastroForm.classList.remove("oculto");
    showLoginMessage("");
  });

  elements.btnMostrarLogin?.addEventListener("click", () => {
    elements.cadastroForm.classList.add("oculto");
    elements.loginForm.classList.remove("oculto");
    showLoginMessage("");
  });

  elements.btnLogin?.addEventListener("click", loginUser);
  elements.btnCadastrar?.addEventListener("click", registerUser);
  elements.loginSenha?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginUser();
  });
  elements.cadastroConfirmarSenha?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") registerUser();
  });

  elements.formGasto?.addEventListener("submit", addExpense);

  elements.listaGastos?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-expense-id]");
    if (button) deleteExpense(button.dataset.expenseId);
  });

  elements.btnAdicionarOrcamento?.addEventListener("click", () => changeBudget("add"));
  elements.btnRetirarOrcamento?.addEventListener("click", () => changeBudget("remove"));
  elements.btnDefinirOrcamento?.addEventListener("click", () => changeBudget("set"));
  elements.btnDefinirMeta?.addEventListener("click", changeGoal);

  elements.mesSelecionado?.addEventListener("change", async () => {
    if (!elements.mesSelecionado.value) return;
    selectedMonth = elements.mesSelecionado.value;

    try {
      await Promise.all([fetchBudgets(), fetchExpenses(), fetchGoal()]);
      updateAll();
      await updateSavedTotal();
    } catch (error) {
      console.error("Erro ao trocar o mês:", error);
      showToast(error.message || "Não foi possível trocar o mês.");
    }
  });

  elements.btnSair?.addEventListener("click", () => {
    if (!confirm("Deseja sair da sua conta?")) return;
    clearSession();
    closeApp();
    elements.loginSenha.value = "";
    showLoginMessage("Você saiu da conta.");
  });

  elements.btnInstallApp?.addEventListener("click", requestInstall);
  elements.btnInstalarPerfil?.addEventListener("click", requestInstall);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    updateInstallButtons();
  });
}

function start() {
  elements.data.value = new Date().toISOString().slice(0, 10);
  elements.mesSelecionado.value = selectedMonth;
  configureNavigation();
  bindEvents();
  setView("home");
  updateInstallButtons();
  refreshIcons();
  checkSavedLogin();
}

start();
