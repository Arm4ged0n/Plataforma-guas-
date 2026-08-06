// api/lagoa-furg.js
// Busca os sensores da Rede de Monitoramento do Nível da Lagoa dos Patos
// (CIEX-FURG), via o mesmo endpoint que o site monitoramentolagoadospatos.com.br
// usa no navegador — sem senha, público.
//
// IMPORTANTE: ainda não confirmamos o formato exato da resposta de cada
// sensor (pode ser um número puro, ou um JSON tipo {cota: X} / {value: X}).
// Este proxy tenta os formatos mais prováveis e devolve o dado bruto junto,
// pra ajustarmos rápido se o parsing não bater com a realidade.

const BASE = 'https://api-medidas-porto-7bni.onrender.com/dados';
const SENSORES = ['sensor_1', 'sensor_2', 'sensor_3', 'sensor_4', 'sensor_5', 'sensor_6'];

function extrairValorCm(raw) {
  // Formato confirmado por teste real: {"dado":{"valor":77.5,"data_hora":"...","sensor_id":"..."}}
  if (raw && typeof raw === 'object' && raw.dado && raw.dado.valor != null) {
    return parseFloat(raw.dado.valor);
  }
  // Formatos alternativos, por segurança
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && !isNaN(parseFloat(raw))) return parseFloat(raw);
  if (raw && typeof raw === 'object') {
    const candidatos = ['cota', 'value', 'valor', 'nivel', 'medida', 'cm'];
    for (const campo of candidatos) {
      if (raw[campo] != null && !isNaN(parseFloat(raw[campo]))) {
        return parseFloat(raw[campo]);
      }
    }
  }
  return null;
}

async function buscarSensor(nome) {
  const resp = await fetch(`${BASE}/${nome}`, { headers: { 'Accept': 'application/json, text/plain, */*' } });
  if (!resp.ok) throw new Error(`${nome}: HTTP ${resp.status}`);

  const texto = await resp.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* pode não ser JSON, tudo bem */ }

  const valorCm = extrairValorCm(json ?? texto);
  const dataHora = json?.dado?.data_hora || null;

  return {
    sensor: nome,
    valorCm,
    valorMetros: valorCm != null ? valorCm / 100 : null,
    dataHoraMedicao: dataHora,
    bruto: json ?? texto,
  };
}

// Mapeamento sensor_id -> nome da estação. MELHOR PALPITE baseado na
// proximidade dos valores vistos no site público (78.6/116.9/111.2cm) com
// o que a API devolveu (77.5/117/118cm) — ainda precisa de confirmação.
// Mapeamento sensor_id -> nome da estação. Os 6 nomes reais foram confirmados
// (FURG CCMar, São Lourenço do Sul, Arambaré, São José do Norte, Itapuã,
// Tavares). sensor_1/2/3 batem por proximidade de valor com o site público;
// a ordem exata de sensor_4/5/6 entre os 3 últimos nomes ainda não foi
// cruzada por valor — se algum aparecer trocado, é só reordenar aqui.
const NOME_ESTACAO = {
  sensor_1: 'FURG CCMar (Rio Grande)',
  sensor_2: 'São Lourenço do Sul',
  sensor_3: 'Arambaré',
  sensor_4: 'São José do Norte',
  sensor_5: 'Itapuã',
  sensor_6: 'Tavares',
};

export default async function handler(req, res) {
  const resultados = await Promise.allSettled(SENSORES.map(buscarSensor));

  const sensores = {};
  const erros = [];

  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sensores[SENSORES[i]] = { ...r.value, nomeEstacao: NOME_ESTACAO[SENSORES[i]] };
    } else {
      erros.push(`${SENSORES[i]}: ${r.reason.message}`);
    }
  });

  const algumSucesso = Object.keys(sensores).length > 0;

  // Mapeamento pronto pra plataforma: 'oceano' usa o sensor mais próximo da
  // barra (Rio Grande), 'lagoa' usa a média dos sensores do corpo da lagoa.
  let porNode = {};
  if (sensores.sensor_1?.valorMetros != null) {
    porNode.oceano = {
      nivelMetros: sensores.sensor_1.valorMetros,
      nomeEstacao: sensores.sensor_1.nomeEstacao,
      dataHoraMedicao: sensores.sensor_1.dataHoraMedicao,
      fonte: 'CIEX-FURG',
    };
  }
  const doLago = [sensores.sensor_2, sensores.sensor_3].filter(s => s?.valorMetros != null);
  if (doLago.length) {
    porNode.lagoa = {
      nivelMetros: doLago.reduce((s, x) => s + x.valorMetros, 0) / doLago.length,
      nomeEstacao: doLago.map(s => s.nomeEstacao).join(' + '),
      dataHoraMedicao: doLago[0].dataHoraMedicao,
      fonte: 'CIEX-FURG',
    };
  }

  return res.status(algumSucesso ? 200 : 502).json({
    ok: algumSucesso,
    fonte: 'monitoramentolagoadospatos.com.br (CIEX-FURG)',
    consultadoEm: new Date().toISOString(),
    sensores,
    porNode,
    erros: erros.length ? erros : undefined,
  });
}
