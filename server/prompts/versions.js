
const registry = {
  '1.0': {
    status: 'legacy',
    notes: 'İlk modülerleştirme. Monolitik promptun birebir bölüm kompozisyonu: '
      + 'rol, kanıt temelli akıl yürütme, ayırıcı tanı, çelişki, doktor karşılaştırması '
      + '(ikinci görüş dahil), eksik bilgi, kanıt ağacı, çıktı sınırları + şema.',
    sections: [
      'system',
      'evidence_grounding',
      'differential_diagnosis',
      'contradiction',
      'physician_comparison',
      'missing_information',
      'evidence_tree',
      'output_constraints',
    ],
  },

  '1.1': {
    status: 'patch',
    notes: 'v1.0 + json_discipline yaması. Modelin JSON dışı üretim ("Tabii, işte '
      + 'analiziniz: ..." tarzı öncü metin) olasılığını azaltmaya yönelik sert disiplin '
      + 'bölümü eklendi. Kompozisyonun geri kalanı v1.0 ile birebir aynı; bu yüzden '
      + 'v1.0 vs v1.1 karşılaştırması yalnızca JSON disiplininin etkisini ölçer.',
    sections: [
      'system',
      'evidence_grounding',
      'differential_diagnosis',
      'contradiction',
      'physician_comparison',
      'missing_information',
      'evidence_tree',
      'json_discipline',
      'output_constraints',
    ],
  },

  '2.0': {
    status: 'stable',
    notes: 'MAJOR: ikinci görüş motoru (second_opinion) physician_comparison bölümünden '
      + 'ayrı bölüme alındı; json_discipline kalıcı kompozisyona girdi. Her ürün motoru '
      + 'artık kendi bölümü: ayrı test edilebilir, ayrı sürümlenebilir. json_discipline '
      + 'çıkış sınırlarından ÖNCE konumlandırıldı (model talimatların sonunu hatırlama '
      + 'eğiliminde olduğu için disiplin bölümü akışın sonuna yaklaştırıldı).',
    sections: [
      'system',
      'evidence_grounding',
      'differential_diagnosis',
      'contradiction',
      'physician_comparison',
      'second_opinion',
      'missing_information',
      'evidence_tree',
      'json_discipline',
      'output_constraints',
    ],
  },

  '3.0': {
    status: 'stable',
    notes: 'MAJOR: structured_reasoning bölümü eklendi ("AI neden bunu yaptı?" motoru). '
      + 'Gizli düşünce zinciri gösterilmez; her tanı kartı için üç yapılandırılmış liste '
      + '(supporting_findings ✓, contradicting_findings ⚠, discriminative_findings ★) '
      + 'üretilir. Şema sürümü 1.3.0 ile birlikte gelir; frontend bu listeleri görselleştirir.',
    sections: [
      'system',
      'evidence_grounding',
      'differential_diagnosis',
      'contradiction',
      'structured_reasoning',
      'physician_comparison',
      'second_opinion',
      'missing_information',
      'evidence_tree',
      'json_discipline',
      'output_constraints',
    ],
  },

  '4.0': {
    status: 'stable',
    notes: 'MAJOR: next_best_information bölümü eklendi ("Bir sonraki en değerli '
      + 'bilgi nedir?" motoru; ürünün ana çıktısı). Model artık yalnızca ayırıcı tanı '
      + 'listesi değil, belirsizlik -> eksik bilgi -> ayırt edici güç sıralaması -> '
      + 'TEK net soru zinciri üretir (current_uncertainty, top, alternatives). Şema '
      + 'sürümü 1.4.0 ile birlikte gelir; seçim ileride information gain ile nicelendirilebilir.',
    sections: [
      'system',
      'evidence_grounding',
      'differential_diagnosis',
      'contradiction',
      'structured_reasoning',
      'physician_comparison',
      'second_opinion',
      'next_best_information',
      'missing_information',
      'evidence_tree',
      'json_discipline',
      'output_constraints',
    ],
  },
};

function highestVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  return (pa[0] > pb[0] || (pa[0] === pb[0] && pa[1] > pb[1])) ? a : b;
}

function defaultVersion() {
  const entries = Object.entries(registry);
  const stable = entries.filter(([, meta]) => meta.status === 'stable').map(([v]) => v);
  const pool = stable.length > 0 ? stable : entries.map(([v]) => v);
  return pool.reduce((acc, v) => (acc === null ? v : highestVersion(acc, v)), null);
}

module.exports = {
  registry,
  DEFAULT_VERSION: defaultVersion(),
  getVersion: (version) => (version && registry[version] ? { version, ...registry[version] } : null),
  listVersions: () => Object.entries(registry).map(([version, meta]) => ({
    version,
    status: meta.status,
    notes: meta.notes,
    sections: meta.sections,
    sectionCount: meta.sections.length,
  })),
};
