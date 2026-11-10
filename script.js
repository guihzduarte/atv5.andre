// Coordenadas de referência da Uninassau (Exemplo: Campus Doroteias - Fortaleza/CE)
// Você pode alterar lat e lon caso queira usar outro campus da Uninassau
const UNINASSAU_ORIGEM = {
  lat: -3.7460,
  lon: -38.5085
};

// Parâmetros estimados de tarifa do Uber Moto
const TARIFA_BASE = 3.50;    // Valor inicial da corrida (R$)
const PRECO_POR_KM = 1.35;   // Valor cobrado por km rodado (R$)
const TARIFA_MINIMA = 5.00;  // Valor mínimo da corrida (R$)

const form = document.getElementById('form-cep');
const inputCep = document.getElementById('cep');
const btnCalcular = document.getElementById('btn-calcular');
const statusBox = document.getElementById('mensagem-status');
const resultadoBox = document.getElementById('resultado');

// Formata o CEP automaticamente enquanto o usuário digita (00000-000)
inputCep.addEventListener('input', (e) => {
  let valor = e.target.value.replace(/\D/g, '');
  if (valor.length > 5) {
    valor = valor.replace(/^(\d{5})(\d)/, '$1-$2');
  }
  e.target.value = valor;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const cepLimpo = inputCep.value.replace(/\D/g, '');

  if (cepLimpo.length !== 8) {
    mostrarStatus('Por favor, digite um CEP válido com 8 números.', 'erro');
    return;
  }

  iniciarCarregamento();

  try {
    // 1. Consulta a API pública ViaCEP
    const dadosCep = await buscarEnderecoPorCep(cepLimpo);

    // 2. Obtém latitude e longitude do endereço usando OpenStreetMap (Nominatim)
    const destinoCoords = await obterCoordenadas(dadosCep);

    // 3. Calcula a distância pela rota real (OSRM) ou em linha reta como alternativa
    const distanciaKm = await calcularDistanciaKm(UNINASSAU_ORIGEM, destinoCoords);

    // 4. Calcula o preço do frete baseado no Uber Moto
    const precoFrete = calcularPrecoUberMoto(distanciaKm);

    exibirResultado(dadosCep, distanciaKm, precoFrete);
  } catch (erro) {
    mostrarStatus(erro.message, 'erro');
  } finally {
    finalizarCarregamento();
  }
});

async function buscarEnderecoPorCep(cep) {
  const resposta = await fetch(`https://viacep.com.br{cep}/json/`);
  if (!resposta.ok) {
    throw new Error('Erro ao conectar com a API do ViaCEP.');
  }

  const dados = await resposta.json();
  if (dados.erro) {
    throw new Error('CEP não encontrado. Verifique os números digitados.');
  }

  return dados;
}

async function obterCoordenadas(dadosCep) {
  const query = encodeURIComponent(
    `${dadosCep.logradouro}, ${dadosCep.bairro}, ${dadosCep.localidade}, ${dadosCep.uf}, Brasil`
  );
  const url = `https://openstreetmap.org{query}&limit=1`;

  const resposta = await fetch(url);
  const resultados = await resposta.json();

  if (resultados.length > 0) {
    return {
      lat: parseFloat(resultados[0].lat),
      lon: parseFloat(resultados[0].lon)
    };
  }

  // Fallback: busca apenas pela cidade/estado caso a rua não esteja mapeada
  const queryCidade = encodeURIComponent(`${dadosCep.localidade}, ${dadosCep.uf}, Brasil`);
  const respCidade = await fetch(`https://openstreetmap.org{queryCidade}&limit=1`);
  const resCidade = await respCidade.json();

  if (resCidade.length === 0) {
    throw new Error('Não foi possível localizar as coordenadas desse endereço.');
  }

  return {
    lat: parseFloat(resCidade[0].lat),
    lon: parseFloat(resCidade[0].lon)
  };
}

async function calcularDistanciaKm(origem, destino) {
  try {
    // API pública OSRM para distância real de trajeto
    const url = `https://project-osrm.org{origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=false`;
    const resposta = await fetch(url);
    const dados = await resposta.json();

    if (dados.code === 'Ok' && dados.routes.length > 0) {
      return dados.routes[0].distance / 1000; // Converte metros para km
    }
  } catch (e) {
    console.warn('Falha na rota OSRM, usando cálculo geográfico direto.');
  }

  // Fallback: Fórmula de Haversine (distância em linha reta * fator de correção urbana)
  const R = 6371;
  const dLat = ((destino.lat - origem.lat) * Math.PI) / 180;
  const dLon = ((destino.lon - origem.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((origem.lat * Math.PI) / 180) *
      Math.cos((destino.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.25;
}

function calcularPrecoUberMoto(distanciaKm) {
  const valorCalculado = TARIFA_BASE + (distanciaKm * PRECO_POR_KM);
  return Math.max(valorCalculado, TARIFA_MINIMA);
}

function exibirResultado(dadosCep, distanciaKm, precoFrete) {
  statusBox.classList.add('oculto');
  resultadoBox.classList.remove('oculto');

  const logradouro = dadosCep.logradouro || 'CEP Único / Centro';
  document.getElementById('res-endereco').textContent = logradouro;
  document.getElementById('res-cidade').textContent = `${dadosCep.bairro ? dadosCep.bairro + ' - ' : ''}${dadosCep.localidade}/${dadosCep.uf}`;
  document.getElementById('res-distancia').textContent = `${distanciaKm.toFixed(1).replace('.', ',')} km`;
  document.getElementById('res-preco').textContent = precoFrete.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function mostrarStatus(texto, tipo) {
  resultadoBox.classList.add('oculto');
  statusBox.textContent = texto;
  statusBox.className = `status ${tipo}`;
}

function iniciarCarregamento() {
  btnCalcular.disabled = true;
  btnCalcular.textContent = 'Buscando...';
  mostrarStatus('Consultando CEP e calculando rota...', 'carregando');
}

function finalizarCarregamento() {
  btnCalcular.disabled = false;
  btnCalcular.textContent = 'Calcular';
}
