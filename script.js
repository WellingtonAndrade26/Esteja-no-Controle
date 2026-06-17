  const API_BASE_URL="https://controle-gastos-api-ruby.vercel.app";
  const loginBox=document.getElementById("loginBox"),appConteudo=document.getElementById("appConteudo"),loginForm=document.getElementById("loginForm"),cadastroForm=document.getElementById("cadastroForm"),btnSair=document.getElementById("btnSair"),boasVindasBanner=document.getElementById("boasVindasBanner"),loginEmailInput=document.getElementById("loginEmail"),loginSenhaInput=document.getElementById("loginSenha"),cadastroNomeInput=document.getElementById("cadastroNome"),cadastroEmailInput=document.getElementById("cadastroEmail"),cadastroSenhaInput=document.getElementById("cadastroSenha"),cadastroConfirmarSenhaInput=document.getElementById("cadastroConfirmarSenha"),btnLogin=document.getElementById("btnLogin"),btnCadastrar=document.getElementById("btnCadastrar"),btnMostrarCadastro=document.getElementById("btnMostrarCadastro"),btnMostrarLogin=document.getElementById("btnMostrarLogin"),loginMensagem=document.getElementById("loginMensagem"),formGasto=document.getElementById("formGasto"),descricaoInput=document.getElementById("descricao"),valorInput=document.getElementById("valor"),categoriaInput=document.getElementById("categoria"),dataInput=document.getElementById("data"),orcamentoTotal=document.getElementById("orcamentoTotal"),orcamentoResumo=document.getElementById("orcamentoResumo"),orcamentoInput=document.getElementById("orcamentoInput"),mesSelecionadoInput=document.getElementById("mesSelecionado"),btnAdicionarOrcamento=document.getElementById("btnAdicionarOrcamento"),btnRetirarOrcamento=document.getElementById("btnRetirarOrcamento"),btnDefinirOrcamento=document.getElementById("btnDefinirOrcamento"),listaGastos=document.getElementById("listaGastos"),totalGasto=document.getElementById("totalGasto"),resumoGastos=document.getElementById("resumoGastos"),resumoDisponivel=document.getElementById("resumoDisponivel"),saldoRestante=document.getElementById("saldoRestante"),textoSaldo=document.getElementById("textoSaldo"),saldoBox=document.querySelector(".saldo-box"),dashboardCategorias=document.getElementById("dashboardCategorias"),valorGuardadoTotal=document.getElementById("valorGuardadoTotal"),btnInstallApp=document.getElementById("btnInstallApp"),categoriaChartCanvas=document.getElementById("categoriaChart");
  let APP_TOKEN=localStorage.getItem("app_token")||"",gastos=[],orcamentos={},mesSelecionado=new Date().toISOString().slice(0,7),orcamento=0,eventoInstalacao=null,categoriaChart=null;
  const categoriaConfig={"Alimentação":{cor:"#f72d90",icone:"🍔"},Mercado:{cor:"#f72d90",icone:"🛒"},Transporte:{cor:"#4596ee",icone:"🚙"},Casa:{cor:"#8d79dd",icone:"🏠"},Contas:{cor:"#8d79dd",icone:"🧾"},Lazer:{cor:"#ff9b4a",icone:"🎮"},Saúde:{cor:"#21b970",icone:"💊"},Outros:{cor:"#6ee0a2",icone:"•••"}};
  if(mesSelecionadoInput)mesSelecionadoInput.value=mesSelecionado;if(dataInput)dataInput.value=new Date().toISOString().split("T")[0];
  function atualizarGuardadoSimples() {
  if (!valorGuardadoTotal) return;

  let totalGuardado = 0;

  Object.keys(orcamentos).forEach(mes => {
    const orcamentoDoMes = Number(orcamentos[mes]) || 0;

    const gastosDoMes = gastos.filter(gasto =>
      gasto.data.startsWith(mes)
    );

    const totalGastoDoMes = gastosDoMes.reduce(
      (soma, gasto) => soma + Number(gasto.valor),
      0
    );

    const sobraDoMes = orcamentoDoMes - totalGastoDoMes;

    if (sobraDoMes > 0) {
      totalGuardado += sobraDoMes;
    }
  });

  valorGuardadoTotal.textContent = formatarMoeda(totalGuardado);
}
  function authHeaders(){return{"Content-Type":"application/json",Authorization:`Bearer ${APP_TOKEN}`}}function formatarMoeda(valor){return Number(valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}function nomeMesAtual(valorMes){const[ano,mes]=valorMes.split("-");return new Date(Number(ano),Number(mes)-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}function atualizarLabelMes(){if(mesSelecionadoInput)mesSelecionadoInput.setAttribute("aria-label",nomeMesAtual(mesSelecionado))}function atualizarBannerUsuario(nome){const nomeFinal=nome||localStorage.getItem("app_user_name")||"Usuário";if(boasVindasBanner)boasVindasBanner.textContent=`Olá, ${nomeFinal}! 👋`}function formatarData(data){const partes=data.split("-");return`${partes[2]}/${partes[1]}/${partes[0]}`}function mostrarMensagemLogin(texto){if(loginMensagem)loginMensagem.textContent=texto}function abrirApp(){loginBox?.classList.add("oculto");appConteudo?.classList.remove("oculto");atualizarBannerUsuario();atualizarIcones()}function fecharApp(){loginBox?.classList.remove("oculto");appConteudo?.classList.add("oculto")}function atualizarIcones(){if(window.lucide)window.lucide.createIcons()}
  async function cadastrarUsuario(){const name=cadastroNomeInput.value.trim(),email=cadastroEmailInput.value.trim(),password=cadastroSenhaInput.value,confirmPassword=cadastroConfirmarSenhaInput.value;mostrarMensagemLogin("");if(!name||!email||!password||!confirmPassword){mostrarMensagemLogin("Preencha todos os campos.");return}if(password!==confirmPassword){mostrarMensagemLogin("As senhas não conferem.");return}try{const resposta=await fetch(`${API_BASE_URL}/api/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password,confirmPassword})}),dados=await resposta.json();if(!resposta.ok){mostrarMensagemLogin(dados.error||"Não foi possível criar a conta.");return}APP_TOKEN=dados.token;localStorage.setItem("app_token",APP_TOKEN);localStorage.setItem("app_user_name",dados.user.name);atualizarBannerUsuario(dados.user.name);abrirApp();await iniciarApp()}catch(erro){console.error("Erro ao cadastrar:",erro);mostrarMensagemLogin("Erro ao conectar com o cadastro.")}}
  async function fazerLogin(){const email=loginEmailInput.value.trim(),password=loginSenhaInput.value;mostrarMensagemLogin("");if(!email||!password){mostrarMensagemLogin("Informe email e senha.");return}try{const resposta=await fetch(`${API_BASE_URL}/api/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})}),dados=await resposta.json();if(!resposta.ok){mostrarMensagemLogin(dados.error||"Email ou senha inválidos.");return}APP_TOKEN=dados.token;localStorage.setItem("app_token",APP_TOKEN);localStorage.setItem("app_user_name",dados.user.name);atualizarBannerUsuario(dados.user.name);abrirApp();await iniciarApp()}catch(erro){console.error("Erro no login:",erro);mostrarMensagemLogin("Erro ao conectar com o login.")}}
  async function buscarGastosOnline(){const resposta=await fetch(`${API_BASE_URL}/api/expenses?month=${mesSelecionado}`,{headers:authHeaders()});if(resposta.status===401){localStorage.removeItem("app_token");APP_TOKEN="";fecharApp();mostrarMensagemLogin("Faça login novamente.");return}if(!resposta.ok)throw new Error("Erro ao buscar gastos.");const dados=await resposta.json();gastos=dados.map(item=>({id:item.id,descricao:item.name,valor:Number(item.value),categoria:item.category,data:item.date}))}
  async function buscarTodosGastosOnline(){const resposta=await fetch(`${API_BASE_URL}/api/expenses`,{headers:authHeaders()});if(!resposta.ok)throw new Error("Erro ao buscar todos os gastos.");const dados=await resposta.json();return dados.map(item=>({id:item.id,descricao:item.name,valor:Number(item.value),categoria:item.category,data:item.date}))}
  async function salvarMetaOnline(valor){

  const response = await fetch(`${API_BASE_URL}/api/goals`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${APP_TOKEN}`
    },
    body:JSON.stringify({
      month:mesSelecionado,
      value:Number(valor)
    })
  });

  if(!response.ok){
    console.error("Erro ao salvar meta");
    return;
  }

  return await response.json();
}
  async function salvarGastoOnline(gasto){const resposta=await fetch(`${API_BASE_URL}/api/expenses`,{method:"POST",headers:authHeaders(),body:JSON.stringify({name:gasto.descricao,value:Number(gasto.valor),category:gasto.categoria,date:gasto.data})}),texto=await resposta.text();if(!resposta.ok)throw new Error(texto||"Erro ao salvar gasto.");return JSON.parse(texto)}
  async function excluirGastoOnline(id){const resposta=await fetch(`${API_BASE_URL}/api/expenses?id=${id}`,{method:"DELETE",headers:authHeaders()});if(!resposta.ok)throw new Error("Erro ao excluir gasto.");return await resposta.json()}
  async function buscarOrcamentosOnline(){const resposta=await fetch(`${API_BASE_URL}/api/budgets`,{headers:authHeaders()});if(!resposta.ok)throw new Error("Erro ao buscar orçamentos.");const dados=await resposta.json();orcamentos={};dados.forEach(item=>{orcamentos[item.month]=Number(item.value)});orcamento=Number(orcamentos[mesSelecionado])||0}
  async function salvarOrcamentoOnline(mes,valor){const resposta=await fetch(`${API_BASE_URL}/api/budgets`,{method:"POST",headers:authHeaders(),body:JSON.stringify({month:mes,value:Number(valor)})}),texto=await resposta.text();if(!resposta.ok)throw new Error(texto||"Erro ao salvar orçamento.");return JSON.parse(texto)}
  function pegarGastosDoMes(){return gastos.filter(gasto=>gasto.data.startsWith(mesSelecionado))}function calcularTotalGasto(){return pegarGastosDoMes().reduce((soma,gasto)=>soma+Number(gasto.valor),0)}function atualizarTudo(){mostrarGastos();atualizarTotal();atualizarOrcamento();atualizarSaldo();atualizarDashboardCategorias();atualizarLabelMes();atualizarIcones()}
  async function adicionarGasto(event){event.preventDefault();const descricao=descricaoInput.value.trim(),valor=Number(valorInput.value),categoria=categoriaInput.value,data=dataInput.value;if(!descricao||valor<=0||!categoria||!data){alert("Preencha todos os campos corretamente.");return}try{await salvarGastoOnline({descricao,valor,categoria,data});await buscarGastosOnline();atualizarTudo();await atualizarValorGuardado();formGasto.reset();dataInput.value=new Date().toISOString().split("T")[0]}catch(erro){console.error("Erro ao adicionar gasto:",erro);alert("Não foi possível salvar o gasto online.")}}
  function obterConfigCategoria(categoria){return categoriaConfig[categoria]||categoriaConfig.Outros}
  function mostrarGastos(){listaGastos.innerHTML="";const gastosDoMes=[...pegarGastosDoMes()].sort((a,b)=>b.data.localeCompare(a.data));if(gastosDoMes.length===0){listaGastos.innerHTML="<li class='mensagem-vazia'>Nenhum gasto cadastrado neste mês.</li>";return}gastosDoMes.forEach(gasto=>{const config=obterConfigCategoria(gasto.categoria),item=document.createElement("li");item.classList.add("gasto-item");item.innerHTML=`<span class="expense-icon" style="background:${config.cor}18;color:${config.cor}">${config.icone}</span><div class="gasto-info"><strong>${gasto.descricao}</strong><span>${formatarData(gasto.data)} · ${gasto.categoria}</span></div><div class="expense-side"><p class="gasto-valor">${formatarMoeda(gasto.valor)}</p><button class="btn-excluir" type="button" aria-label="Excluir gasto" onclick="excluirGasto('${gasto.id}')"><i data-lucide="more-vertical"></i></button></div>`;listaGastos.appendChild(item)})}
  function atualizarTotal(){const total=calcularTotalGasto();totalGasto.textContent=formatarMoeda(total);if(resumoGastos)resumoGastos.textContent=formatarMoeda(total)}function atualizarOrcamento(){
  const valor = formatarMoeda(orcamento);

  if(orcamentoTotal){
    orcamentoTotal.textContent = valor;
  }

  if(orcamentoResumo){
    orcamentoResumo.textContent = valor;
  }
}function atualizarSaldo(){const total=calcularTotalGasto(),saldo=orcamento-total,saldoTexto=formatarMoeda(Math.abs(saldo));if(saldo>=0){textoSaldo.textContent="Saldo disponível";saldoRestante.textContent=formatarMoeda(saldo);resumoDisponivel.textContent=formatarMoeda(saldo);saldoBox?.classList.remove("negativo")}else{textoSaldo.textContent="Passou do orçamento";saldoRestante.textContent=saldoTexto;resumoDisponivel.textContent=`-${saldoTexto}`;saldoBox?.classList.add("negativo")}}
  async function atualizarValorGuardado(){if(!valorGuardadoTotal)return;try{const todosGastos=await buscarTodosGastosOnline();
    console.log("ORÇAMENTOS", orcamentos);
console.log("TODOS GASTOS", todosGastos);
    let totalGuardado=0;Object.keys(orcamentos).forEach(mes=>{const orcamentoDoMes=Number(orcamentos[mes])||0,gastosDoMes=todosGastos.filter(gasto=>gasto.data.startsWith(mes)),totalGastoDoMes=gastosDoMes.reduce((soma,gasto)=>soma+Number(gasto.valor),0),sobraDoMes=orcamentoDoMes-totalGastoDoMes;if(sobraDoMes>0)totalGuardado+=sobraDoMes});valorGuardadoTotal.textContent=formatarMoeda(totalGuardado)}catch(erro){console.error("Erro ao calcular valor guardado:",erro);valorGuardadoTotal.textContent=formatarMoeda(0)}}
  function agruparCategorias(){const total=calcularTotalGasto(),categorias={};pegarGastosDoMes().forEach(gasto=>{categorias[gasto.categoria]=(categorias[gasto.categoria]||0)+Number(gasto.valor)});return Object.keys(categorias).map(categoria=>({categoria,valor:categorias[categoria],porcentagem:total>0?categorias[categoria]/total*100:0,...obterConfigCategoria(categoria)})).sort((a,b)=>b.valor-a.valor)}
  function atualizarDashboardCategorias(){dashboardCategorias.innerHTML="";const dadosCategorias=agruparCategorias();if(dadosCategorias.length===0){dashboardCategorias.innerHTML="<p class='mensagem-vazia'>Nenhum gasto cadastrado neste mês.</p>";atualizarGraficoCategorias([]);return}dadosCategorias.forEach(item=>{const linha=document.createElement("div");linha.classList.add("category-row");linha.innerHTML=`<span class="category-dot" style="background:${item.cor}"></span><strong title="${item.categoria}">${item.icone} ${item.categoria}</strong><b>${Math.round(item.porcentagem)}%</b><small>${formatarMoeda(item.valor)}</small>`;dashboardCategorias.appendChild(linha)});atualizarGraficoCategorias(dadosCategorias)}
  function atualizarGraficoCategorias(dadosCategorias){if(!categoriaChartCanvas||!window.Chart)return;const labels=dadosCategorias.length?dadosCategorias.map(item=>item.categoria):["Sem gastos"],valores=dadosCategorias.length?dadosCategorias.map(item=>item.valor):[1],cores=dadosCategorias.length?dadosCategorias.map(item=>item.cor):["#f3e7ef"];if(!categoriaChart){categoriaChart=new Chart(categoriaChartCanvas,{type:"doughnut",data:{labels,datasets:[{data:valores,backgroundColor:cores,borderColor:"#ffffff",borderWidth:4,hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{display:false},tooltip:{callbacks:{label(context){return`${context.label}: ${formatarMoeda(context.raw)}`}}}}}});return}categoriaChart.data.labels=labels;categoriaChart.data.datasets[0].data=valores;categoriaChart.data.datasets[0].backgroundColor=cores;categoriaChart.update()}
  async function excluirGasto(id){const confirmar=confirm("Deseja excluir este gasto?");if(!confirmar)return;try{await excluirGastoOnline(id);await buscarGastosOnline();atualizarTudo();await atualizarValorGuardado()}catch(erro){console.error("Erro ao excluir gasto:",erro);alert("Não foi possível excluir o gasto.")}}
  function configurarNavegacao(){const botoes=document.querySelectorAll("[data-scroll-target]"),navItems=document.querySelectorAll(".nav-item");botoes.forEach(botao=>{botao.addEventListener("click",()=>{const destino=document.getElementById(botao.dataset.scrollTarget);destino?.scrollIntoView({behavior:"smooth",block:"start"});if(botao.classList.contains("nav-item")){navItems.forEach(item=>item.classList.remove("active"));botao.classList.add("active")}if(botao.dataset.scrollTarget==="orcamentoSection")setTimeout(()=>orcamentoInput?.focus(),450);if(botao.dataset.scrollTarget==="gastoSection")setTimeout(()=>descricaoInput?.focus(),450)})})}
  formGasto.addEventListener("submit",adicionarGasto);
  btnAdicionarOrcamento.addEventListener("click",async function(){const valor=Number(orcamentoInput.value);if(valor<=0){alert("Digite um valor para adicionar.");return}try{orcamento+=valor;await salvarOrcamentoOnline(mesSelecionado,orcamento);await buscarOrcamentosOnline();atualizarOrcamento();atualizarSaldo();await atualizarValorGuardado();orcamentoInput.value=""}catch(erro){console.error("Erro ao adicionar orçamento:",erro);alert("Não foi possível salvar o orçamento online.")}});
  btnRetirarOrcamento.addEventListener("click",async function(){const valor=Number(orcamentoInput.value);if(valor<=0){alert("Digite um valor para retirar.");return}try{orcamento=Math.max(0,orcamento-valor);await salvarOrcamentoOnline(mesSelecionado,orcamento);await buscarOrcamentosOnline();atualizarOrcamento();atualizarSaldo();await atualizarValorGuardado();orcamentoInput.value=""}catch(erro){console.error("Erro ao retirar orçamento:",erro);alert("Não foi possível salvar o orçamento online.")}});
  btnDefinirOrcamento.addEventListener("click",async function(){const valor=Number(orcamentoInput.value);if(valor<0){alert("Digite um valor válido.");return}try{orcamento=valor;await salvarOrcamentoOnline(mesSelecionado,orcamento);await buscarOrcamentosOnline();atualizarOrcamento();atualizarSaldo();await atualizarValorGuardado();orcamentoInput.value=""}catch(erro){console.error("Erro ao definir orçamento:",erro);alert("Não foi possível salvar o orçamento online.")}});
  mesSelecionadoInput.addEventListener("change",async function(){mesSelecionado=mesSelecionadoInput.value;await buscarOrcamentosOnline();await buscarGastosOnline();atualizarTudo();await atualizarValorGuardado()});
  btnMostrarCadastro?.addEventListener("click",function(){loginForm.classList.add("oculto");cadastroForm.classList.remove("oculto");mostrarMensagemLogin("")});
  btnMostrarLogin?.addEventListener("click",function(){cadastroForm.classList.add("oculto");loginForm.classList.remove("oculto");mostrarMensagemLogin("")});
  btnLogin?.addEventListener("click",fazerLogin);btnCadastrar?.addEventListener("click",cadastrarUsuario);loginSenhaInput?.addEventListener("keydown",function(event){if(event.key==="Enter")fazerLogin()});cadastroConfirmarSenhaInput?.addEventListener("keydown",function(event){if(event.key==="Enter")cadastrarUsuario()});
  function estaNoModoApp(){return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true}function esconderBotaoInstalar(){btnInstallApp?.classList.add("oculto")}function mostrarBotaoInstalar(){if(btnInstallApp&&!estaNoModoApp())btnInstallApp.classList.remove("oculto")}
  window.addEventListener("load",function(){if(estaNoModoApp())esconderBotaoInstalar();else mostrarBotaoInstalar();atualizarIcones()});
  window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();eventoInstalacao=event;mostrarBotaoInstalar()});
  btnInstallApp?.addEventListener("click",async function(){if(estaNoModoApp()){esconderBotaoInstalar();return}if(!eventoInstalacao){alert("Para instalar, toque nos três pontinhos do navegador e escolha 'Adicionar à tela inicial' ou 'Instalar app'.");return}eventoInstalacao.prompt();const escolha=await eventoInstalacao.userChoice;if(escolha.outcome==="accepted")esconderBotaoInstalar();eventoInstalacao=null});
  window.addEventListener("appinstalled",esconderBotaoInstalar);
 async function iniciarApp(){
 await buscarOrcamentosOnline();
 await buscarGastosOnline();
 await buscarMetaOnline();

 atualizarTudo();
 atualizarGuardadoSimples();
 await atualizarValorGuardado();
}
  async function verificarLoginSalvo(){if(!APP_TOKEN){fecharApp();atualizarIcones();return}try{abrirApp();await iniciarApp()}catch(erro){console.error("Erro ao iniciar com login salvo:",erro);localStorage.removeItem("app_token");APP_TOKEN="";fecharApp()}}
  btnSair?.addEventListener("click",function(){const confirmar=confirm("Deseja sair da sua conta?");if(!confirmar)return;localStorage.removeItem("app_token");localStorage.removeItem("app_user_name");APP_TOKEN="";gastos=[];orcamentos={};orcamento=0;fecharApp();if(loginEmailInput)loginEmailInput.value="";if(loginSenhaInput)loginSenhaInput.value="";mostrarMensagemLogin("Você saiu da conta.")});
  configurarNavegacao();atualizarLabelMes();atualizarIcones();verificarLoginSalvo();

  const metaInput=document.getElementById("metaInput"),btnDefinirMeta=document.getElementById("btnDefinirMeta"),metaValor=document.getElementById("metaValor"),metaAlcancado=document.getElementById("metaAlcancado"),metaStatus=document.getElementById("metaStatus"),metaTexto=document.getElementById("metaTexto"),metaProgressoBarra=document.getElementById("metaProgressoBarra");
 let metaAtual = 0;

async function buscarMetaOnline(){

  const resposta = await fetch(
    `${API_BASE_URL}/api/goals?month=${mesSelecionado}`,
    {
      headers: authHeaders()
    }
  );

  if(!resposta.ok){
    metaAtual = 0;
    return;
  }

  const dados = await resposta.json();

  metaAtual = dados.length ? Number(dados[0].value) : 0;

}
  function salvarMetaMes(valor){metasMensais[chaveMetaMes()]=Number(valor)||0;localStorage.setItem("metas_mensais",JSON.stringify(metasMensais))}
  function atualizarMeta(){if(!metaValor||!metaAlcancado||!metaStatus||!metaTexto||!metaProgressoBarra)return;const meta=metaAtual;,guardadoNoMes=Math.max(0,orcamento-calcularTotalGasto()),progresso=meta>0?Math.min(100,guardadoNoMes/meta*100):0;metaValor.textContent=formatarMoeda(meta);metaAlcancado.textContent=formatarMoeda(guardadoNoMes);metaProgressoBarra.style.width=`${progresso}%`;if(meta<=0){metaStatus.textContent="Sem meta";metaTexto.textContent="Defina quanto você quer guardar neste mês. A meta usa a sobra do orçamento depois dos gastos.";return}if(progresso>=100){metaStatus.textContent="Meta batida";metaTexto.textContent=`Você alcançou ${Math.round(progresso)}% da meta. Sobra atual: ${formatarMoeda(guardadoNoMes)}.`;return}metaStatus.textContent=`${Math.round(progresso)}% concluída`;metaTexto.textContent=`Faltam ${formatarMoeda(Math.max(0,meta-guardadoNoMes))} para bater sua meta deste mês.`}
  btnDefinirMeta?.addEventListener("click",async function(){

  const valor=Number(metaInput.value);

  if(valor<0){
    alert("Digite um valor válido para a meta.");
    return;
  }

  await salvarMetaOnline(valor);

  metaInput.value="";

  atualizarMeta();

});
  const atualizarTudoOriginal=atualizarTudo;atualizarTudo=function(){atualizarTudoOriginal();atualizarMeta()};
  [btnAdicionarOrcamento,btnRetirarOrcamento,btnDefinirOrcamento].forEach(botao=>botao?.addEventListener("click",()=>setTimeout(atualizarMeta,900)));
  function selecionarGuia(view,targetId){const app=document.getElementById("appConteudo");app?.classList.add("guia-ativa");document.querySelectorAll("[data-view]").forEach(secao=>{secao.classList.toggle("guia-oculta",secao.dataset.view!==view)});document.querySelectorAll(".nav-item").forEach(item=>item.classList.toggle("active",item.dataset.viewTarget===view));const destino=document.getElementById(targetId)||document.querySelector(`[data-view='${view}']`);setTimeout(()=>destino?.scrollIntoView({behavior:"smooth",block:"start"}),30);if(view==="reports"&&categoriaChart){setTimeout(()=>categoriaChart.resize(),120)}atualizarIcones()}
  document.querySelectorAll("[data-view-target]").forEach(botao=>{botao.addEventListener("click",function(){selecionarGuia(botao.dataset.viewTarget,botao.dataset.scrollTarget)})});
  selecionarGuia("home","inicioSection");
  atualizarMeta();

  
  
  atualizarMeta();
