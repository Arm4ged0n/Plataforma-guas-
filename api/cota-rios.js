// api/cota-rios.js
// Busca o nível real dos rios via clima.rs.gov.br (endpoint público, sem token).
// Não usa nenhuma credencial — é a mesma chamada que o próprio site do governo
// faz no navegador de qualquer visitante.

// Mapa estação → nó da nossa plataforma. Ajuste os nomes se a API mudar o texto.
function mapearEstacaoParaNode(estacao) {
  const nome = (estacao.nomeEstacao || '').toLowerCase();
  const rio = (estacao.rio || '').toLowerCase();

  if (rio.includes('guaíba') || rio.includes('guaiba')) {
    // Preferimos Cais Mauá como estação principal do Guaíba
    return nome.includes('mauá') || nome.includes('maua') ? 'guaiba' : null;
  }
  if (rio.includes('jacuí') || rio.includes('jacui')) return 'jacui';
  if (rio.includes('sinos')) return 'sinos';
  return null; // Caí e outras não mapeadas ainda pra um nó nosso
}

export default async function handler(req, res) {
  const IBGE_POA = '4314902'; // Porto Alegre — traz Guaíba, Jacuí, Sinos, Caí numa chamada só

  try {
    const resp = await fetch(
      `https://clima.rs.gov.br/climars/api/v1/ana/cotas/municipio/${IBGE_POA}?limite=5`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!resp.ok) {
      throw new Error(`ClimaRS respondeu ${resp.status}`);
    }

    const raw = await resp.json();
    const estacoes = Array.isArray(raw) ? raw : (raw.estacoes || raw.data || []);

    const porNode = {};
    estacoes.forEach(est => {
      const nodeId = mapearEstacaoParaNode(est);
      if (!nodeId) return;
      // Se já existe uma estação pro mesmo nó, mantém a mais recente
      const existente = porNode[nodeId];
      if (!existente || new Date(est.dataHoraMedicao) > new Date(existente.dataHoraMedicao)) {
        porNode[nodeId] = {
          nivelMetros: est.nivelMetros,
          status: est.status,
          statusColor: est.statusColor,
          taxaMudanca: est.taxaMudanca,
          nomeEstacao: est.nomeEstacao,
          rio: est.rio,
          dataHoraMedicao: est.dataHoraMedicao,
        };
      }
    });

    return res.status(200).json({
      ok: true,
      fonte: 'clima.rs.gov.br (ANA via ClimaRS)',
      consultadoEm: new Date().toISOString(),
      estacoes: porNode,
    });
  } catch (err) {
    // NUNCA inventamos dado aqui. Se falhar, o cliente precisa saber que falhou.
    return res.status(502).json({
      ok: false,
      error: err.message,
    });
  }
}
