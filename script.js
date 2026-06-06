const API_BASE_URL = "https://controle-gastos-api-ruby.vercel.app";

const formGasto = document.getElementById("formGasto");
const descricaoInput = document.getElementById("descricao");
const valorInput = document.getElementById("valor");
const categoriaInput = document.getElementById("categoria");
const dataInput = document.getElementById("data");
const orcamentoTotal = document.getElementById("orcamentoTotal");
const orcamentoInput = document.getElementById("orcamentoInput");
const mesSelecionadoInput = document.getElementById("mesSelecionado");
const btnAdicionarOrcamento = document.getElementById("btnAdicionarOrcamento");
const btnRetirarOrcamento = document.getElementById("btnRetirarOrcamento");
const btnDefinirOrcamento = document.getElementById("btnDefinirOrcamento");
const listaGastos = document.getElementById("listaGastos");
const totalGasto = document.getElementById("totalGasto");
const saldoRestante = document.getElementById("saldoRestante");
const textoSaldo = document.getElementById("textoSaldo");
const saldoBox = document.querySelector(".saldo-box");
const dashboardCategorias = document.getElementById("dashboardCategorias");

let gastos = [];

// Por enquanto o orçamento continua local.
// Depois fazemos ele online também.
let orcamentos = JSON.parse(localStorage.getItem("orcamentos")) || {};

let mesSelecionado = new Date().toISOString().slice(0, 7);
let orcamento = Number(orcamentos[mesSelecionado]) || 0;

mesSelecionadoInput.value = mesSelecionado;
dataInput.value = new Date().toISOString().split("T")[0];

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarData(data) {
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

async function buscarGastosOnline() {
  try {
    const resposta = await fetch(`${API_BASE_URL}/api/expenses?month=${mesSelecionado}`);

    if (!resposta.ok) {
      throw new Error("Erro ao buscar gastos.");
    }

    const dados = await resposta.json();

    gastos = dados.map((item) => {
      return {
        id: item.id,
        descricao: item.name,
        valor: Number(item.value),
        categoria: item.category,
        data: item.date
      };
    });
  } catch (erro) {
    console.error("Erro ao carregar gastos:", erro);
    alert("Não foi possível carregar os gastos online.");
    gastos = [];
  }
}

async function salvarGastoOnline(gasto) {
  const resposta = await fetch(`${API_BASE_URL}/api/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: gasto.descricao,
      value: Number(gasto.valor),
      category: gasto.categoria,
      date: gasto.data
    })
  });

  const texto = await resposta.text();



  if (!resposta.ok) {
    throw new Error(texto || "Erro ao salvar gasto.");
  }

  return JSON.parse(texto);
}
async function excluirGastoOnline(id) {
  const resposta = await fetch(`${API_BASE_URL}/api/expenses?id=${id}`, {
    method: "DELETE"
  });

  if (!resposta.ok) {
    throw new Error("Erro ao excluir gasto.");
  }

  return await resposta.json();
}

function pegarGastosDoMes() {
  return gastos.filter((gasto) => {
    return gasto.data.startsWith(mesSelecionado);
  });
}

function atualizarTudo() {
  mostrarGastos();
  atualizarTotal();
  atualizarOrcamento();
  atualizarSaldo();
  atualizarDashboardCategorias();
}

async function adicionarGasto(event) {
  event.preventDefault();

  const descricao = descricaoInput.value.trim();
  const valor = Number(valorInput.value);
  const categoria = categoriaInput.value;
  const data = dataInput.value;

  if (!descricao || valor <= 0 || !categoria || !data) {
    alert("Preencha todos os campos corretamente.");
    return;
  }

  const novoGasto = {
    descricao,
    valor,
    categoria,
    data
  };

  try {
    await salvarGastoOnline(novoGasto);
    await buscarGastosOnline();
    atualizarTudo();

    formGasto.reset();
    dataInput.value = new Date().toISOString().split("T")[0];
  } catch (erro) {
    console.error("Erro ao adicionar gasto:", erro);
    alert("Não foi possível salvar o gasto online.");
  }
}

function mostrarGastos() {
  listaGastos.innerHTML = "";

  const gastosDoMes = pegarGastosDoMes();

  if (gastosDoMes.length === 0) {
    listaGastos.innerHTML = "<li class='mensagem-vazia'>Nenhum gasto cadastrado neste mês.</li>";
    return;
  }

  gastosDoMes.forEach((gasto) => {
    const item = document.createElement("li");
    item.classList.add("gasto-item");

    item.innerHTML = `
      <div class="gasto-info">
        <strong>${gasto.descricao}</strong>
        <span>${gasto.categoria} • ${formatarData(gasto.data)}</span>
      </div>

      <div>
        <p class="gasto-valor">${formatarMoeda(gasto.valor)}</p>
        <button class="btn-excluir" onclick="excluirGasto('${gasto.id}')">
          Excluir
        </button>
      </div>
    `;

    listaGastos.appendChild(item);
  });
}

function atualizarTotal() {
  const gastosDoMes = pegarGastosDoMes();

  const total = gastosDoMes.reduce((soma, gasto) => {
    return soma + Number(gasto.valor);
  }, 0);

  totalGasto.textContent = formatarMoeda(total);
}

function atualizarOrcamento() {
  orcamentoTotal.textContent = formatarMoeda(orcamento);
}

function atualizarSaldo() {
  const gastosDoMes = pegarGastosDoMes();

  const total = gastosDoMes.reduce((soma, gasto) => {
    return soma + Number(gasto.valor);
  }, 0);

  const saldo = orcamento - total;

  if (saldo >= 0) {
    textoSaldo.textContent = "Disponível";
    saldoRestante.textContent = formatarMoeda(saldo);
    saldoBox.classList.remove("negativo");
  } else {
    textoSaldo.textContent = "Passou do orçamento";
    saldoRestante.textContent = formatarMoeda(Math.abs(saldo));
    saldoBox.classList.add("negativo");
  }
}

function atualizarDashboardCategorias() {
  dashboardCategorias.innerHTML = "";

  const gastosDoMes = pegarGastosDoMes();

  const total = gastosDoMes.reduce((soma, gasto) => {
    return soma + Number(gasto.valor);
  }, 0);

  if (gastosDoMes.length === 0) {
    dashboardCategorias.innerHTML = "<p class='mensagem-vazia'>Nenhum gasto cadastrado neste mês.</p>";
    return;
  }

  const categorias = {};

  gastosDoMes.forEach((gasto) => {
    if (categorias[gasto.categoria]) {
      categorias[gasto.categoria] += Number(gasto.valor);
    } else {
      categorias[gasto.categoria] = Number(gasto.valor);
    }
  });

  Object.keys(categorias).forEach((categoria) => {
    const valor = categorias[categoria];
    const porcentagem = total > 0 ? (valor / total) * 100 : 0;

    const item = document.createElement("div");
    item.classList.add("categoria-item");

    item.innerHTML = `
      <div class="categoria-topo">
        <strong>${categoria}</strong>
        <span>${formatarMoeda(valor)}</span>
      </div>

      <div class="barra-categoria">
        <div 
          class="barra-categoria-preenchida" 
          style="width: ${porcentagem}%"
        ></div>
      </div>
    `;

    dashboardCategorias.appendChild(item);
  });
}

async function excluirGasto(id) {
  const confirmar = confirm("Deseja excluir este gasto?");

  if (!confirmar) {
    return;
  }

  try {
    await excluirGastoOnline(id);
    await buscarGastosOnline();
    atualizarTudo();
  } catch (erro) {
    console.error("Erro ao excluir gasto:", erro);
    alert("Não foi possível excluir o gasto.");
  }
}

formGasto.addEventListener("submit", adicionarGasto);

btnAdicionarOrcamento.addEventListener("click", function () {
  const valor = Number(orcamentoInput.value);

  if (valor <= 0) {
    alert("Digite um valor para adicionar.");
    return;
  }

  orcamento = orcamento + valor;

  orcamentos[mesSelecionado] = orcamento;
  localStorage.setItem("orcamentos", JSON.stringify(orcamentos));

  atualizarOrcamento();
  atualizarSaldo();

  orcamentoInput.value = "";
});

btnRetirarOrcamento.addEventListener("click", function () {
  const valor = Number(orcamentoInput.value);

  if (valor <= 0) {
    alert("Digite um valor para retirar.");
    return;
  }

  orcamento = orcamento - valor;

  if (orcamento < 0) {
    orcamento = 0;
  }

  orcamentos[mesSelecionado] = orcamento;
  localStorage.setItem("orcamentos", JSON.stringify(orcamentos));

  atualizarOrcamento();
  atualizarSaldo();

  orcamentoInput.value = "";
});

btnDefinirOrcamento.addEventListener("click", function () {
  const valor = Number(orcamentoInput.value);

  if (valor < 0) {
    alert("Digite um valor válido.");
    return;
  }

  orcamento = valor;

  orcamentos[mesSelecionado] = orcamento;
  localStorage.setItem("orcamentos", JSON.stringify(orcamentos));

  atualizarOrcamento();
  atualizarSaldo();

  orcamentoInput.value = "";
});

mesSelecionadoInput.addEventListener("change", async function () {
  mesSelecionado = mesSelecionadoInput.value;

  orcamento = Number(orcamentos[mesSelecionado]) || 0;

  await buscarGastosOnline();
  atualizarTudo();
});

let eventoInstalacao = null;

const btnInstallApp = document.getElementById("btnInstallApp");

function estaNoModoApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function esconderBotaoInstalar() {
  if (btnInstallApp) {
    btnInstallApp.classList.add("oculto");
  }
}

function mostrarBotaoInstalar() {
  if (btnInstallApp && !estaNoModoApp()) {
    btnInstallApp.classList.remove("oculto");
  }
}

window.addEventListener("load", function () {
  if (estaNoModoApp()) {
    esconderBotaoInstalar();
  } else {
    mostrarBotaoInstalar();
  }
});

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();

  eventoInstalacao = event;

  mostrarBotaoInstalar();
});

if (btnInstallApp) {
  btnInstallApp.addEventListener("click", async function () {
    if (estaNoModoApp()) {
      esconderBotaoInstalar();
      return;
    }

    if (!eventoInstalacao) {
      alert("Para instalar, toque nos três pontinhos do navegador e escolha 'Adicionar à tela inicial' ou 'Instalar app'.");
      return;
    }

    eventoInstalacao.prompt();

    const escolha = await eventoInstalacao.userChoice;

    if (escolha.outcome === "accepted") {
      esconderBotaoInstalar();
    }

    eventoInstalacao = null;
  });
}

window.addEventListener("appinstalled", function () {
  esconderBotaoInstalar();
});

async function iniciarApp() {
  await buscarGastosOnline();
  atualizarTudo();
}

iniciarApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => console.log("Service Worker registrado."))
      .catch((erro) => console.error("Erro ao registrar Service Worker:", erro));
  });
}