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

let gastos = JSON.parse(localStorage.getItem("gastos")) || [];

let orcamentos = JSON.parse(localStorage.getItem("orcamentos")) || {};
let mesSelecionado = new Date().toISOString().slice(0, 7);
let orcamento = Number(orcamentos[mesSelecionado]) || 0;

mesSelecionadoInput.value = mesSelecionado;

dataInput.value = new Date().toISOString().split("T")[0];

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarData(data) {
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function salvarNoLocalStorage() {
  localStorage.setItem("gastos", JSON.stringify(gastos));
}

function pegarGastosDoMes() {
  return gastos.filter((gasto) => {
    return gasto.data.startsWith(mesSelecionado);
  });
}

function adicionarGasto(event) {
  event.preventDefault();

  const descricao = descricaoInput.value;
  const valor = Number(valorInput.value);
  const categoria = categoriaInput.value;
  const data = dataInput.value;

  const novoGasto = {
    id: Date.now(),
    descricao: descricao,
    valor: valor,
    categoria: categoria,
    data: data
  };

  gastos.push(novoGasto);

    salvarNoLocalStorage();
    mostrarGastos();
    atualizarTotal();
    atualizarSaldo();
    atualizarDashboardCategorias();

  formGasto.reset();
  dataInput.value = new Date().toISOString().split("T")[0];
}

function mostrarGastos() {
  listaGastos.innerHTML = "";

  const gastosDoMes = pegarGastosDoMes();

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
        <button class="btn-excluir" onclick="excluirGasto(${gasto.id})">
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
    return soma + gasto.valor;
  }, 0);

  totalGasto.textContent = formatarMoeda(total);
}

function atualizarOrcamento() {
  orcamentoTotal.textContent = formatarMoeda(orcamento);
}

function atualizarSaldo() {
  const gastosDoMes = pegarGastosDoMes();

const total = gastosDoMes.reduce((soma, gasto) => {
  return soma + gasto.valor;
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
    return soma + gasto.valor;
  }, 0);

  if (gastosDoMes.length === 0) {
    dashboardCategorias.innerHTML = "<p class='mensagem-vazia'>Nenhum gasto cadastrado neste mês.</p>";
    return;
  }

  const categorias = {};

  gastosDoMes.forEach((gasto) => {
    if (categorias[gasto.categoria]) {
      categorias[gasto.categoria] += gasto.valor;
    } else {
      categorias[gasto.categoria] = gasto.valor;
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

function excluirGasto(id) {
  gastos = gastos.filter((gasto) => gasto.id !== id);

  salvarNoLocalStorage();
  mostrarGastos();
  atualizarTotal();
  atualizarSaldo();
  atualizarDashboardCategorias();
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

mesSelecionadoInput.addEventListener("change", function () {
  mesSelecionado = mesSelecionadoInput.value;

  orcamento = Number(orcamentos[mesSelecionado]) || 0;

  mostrarGastos();
  atualizarTotal();
  atualizarOrcamento();
  atualizarSaldo();
  atualizarDashboardCategorias();
});


mostrarGastos();
atualizarTotal();
atualizarOrcamento();
atualizarSaldo();
atualizarDashboardCategorias();