// api/cota-rios.js
// Busca o nível real dos rios via clima.rs.gov.br (endpoint público, sem token).
// Consulta 3 municípios pra cobrir os 7 nós da plataforma:
//   - Porto Alegre (4314902) -> Guaíba, Jacuí, Sinos, Caí
//   - Lajeado (4311403)      -> Taquari, Serra/Noroeste
//   - Rio Grande (4315602)   -> Lagoa dos Patos, Barra/Oceano

const MUNICIPIOS = ['4314902', '4311403', '4315602'];

// Mapa estação → nó da nossa plataforma. Ajuste os nomes se a API mudar o texto.
function mapearEstacaoParaNode(estacao) {
  const nome = (estacao.nomeEstacao || '').toLowerCase();
  const rio = (estacao.rio || '').toLowerCase();

  if (rio.includes('guaíba') || rio.includes('guaiba')) {
    return nome.includes('mauá') || nome.includes('maua') ? 'guaiba' : null;
  }
  if (rio.includes('jacuí') || rio.includes('jacui')) return 'jacui';
  if (rio.includes('sinos')) return 'sinos';
  if (rio.includes('taquari')) return 'taquari';
  if (rio.includes('lagoa dos patos') || rio.includes('patos')) return 'lagoa';
  if (rio.includes('atlântico') || rio.includes('atlantico') || nome.includes('rio grande') || nome.includes('cassino')) return 'oceano';
  // Serra/Noroeste não tem estação de rio própria (é cabeceira) — fica sem
  // mapeamento direto aqui; continua usando o modelo de chuva acumulada.
  return null;
}

async function buscarMunicipio(ibge) {
  const resp = await fetch(
    `https://clima.rs.gov.br/climars/api/v1/ana/cotas/municipio/${ibge}?limite=5`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!resp.ok) {
    throw new Error(`ClimaRS respondeu ${resp.status} para município ${ibge}`);
  }
  const raw = await resp.json();
  return Array.isArray(raw) ? raw : (raw.estacoes || raw.data || []);
}

export default async function handler(req, res) {
  try {
    // Busca os 3 municípios em paralelo — mais rápido que sequencial
    const resultados = await Promise.allSettled(MUNICIPIOS.map(buscarMunicipio));

    const porNode = {};
    const erros = [];

    resultados.forEach((r, idx) => {
      if (r.status === 'rejected') {
        erros.push(`Município ${MUNICIPIOS[idx]}: ${r.reason.message}`);
        return;
      }
      r.value.forEach(est => {
        const nodeId = mapearEstacaoParaNode(est);
        if (!nodeId) return;
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
    });

    // Se TODAS as consultas falharam, é erro de verdade — não mascara com sucesso
    if (Object.keys(porNode).length === 0 && erros.length === MUNICIPIOS.length) {
      return res.status(502).json({ ok: false, error: erros.join(' | ') });
    }

    return res.status(200).json({
      ok: true,
      fonte: 'clima.rs.gov.br (ANA via ClimaRS)',
      consultadoEm: new Date().toISOString(),
      estacoes: porNode,
      avisos: erros.length ? erros : undefined,
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
