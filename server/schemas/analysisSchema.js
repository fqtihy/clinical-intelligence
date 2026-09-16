
const SCHEMA_VERSION = '1.4.0';

const STRING_ARRAY = { type: 'array', items: { type: 'string' } };

const CONTRADICTION_ASSESSMENT = {
  type: 'object',
  description: 'bu tanıyı zayıflatan bulguların değerlendirmesi',
  properties: {
    severity: {
      type: 'string',
      enum: ['none', 'minor', 'significant'],
      description: 'çelişkili bulguların bu tanıyı zayıflatma derecesi',
    },
    verdict: { type: 'string', description: 'kısa sonuç cümlesi' },
  },
};

const COMPARISON_ITEM = {
  type: 'object',
  properties: {
    candidate: { type: 'string', description: 'karşılaştırılan diğer ayırıcı tanı adı' },
    distinguishing_point: {
      type: 'string',
      description: 'bu adayın o tanıdan ayrıldığı temel nokta (tek kısa cümle)',
    },
  },
};

const REASONING = {
  type: 'object',
  description: 'Yapılandırılmış gerekçe özeti (gizli düşünce zinciri DEĞİL). Üç yapılandırılmış liste:',
  properties: {
    supporting_findings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tanıyı destekleyen bulgular (✓). Yalnızca girdide gerçekten bulunan bulgular; en fazla 5 öğe.',
    },
    contradicting_findings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tanıyı zayıflatan bulgular (⚠). Yoksa boş dizi.',
    },
    discriminative_findings: {
      type: 'array',
      description: 'Tanıyı diğer adaylardan ayırt eden, ayırt edici teste dönüştürülebilir bulgular (★). Yoksa boş dizi.',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string', description: 'Ayırt edici bulgu (kısa ifade, örn. atak süresi)' },
          rationale: { type: 'string', description: 'Bu özelliğin neden ayırt edici olduğu (tek kısa cümle)' },
        },
      },
    },
  },
};

const DIAGNOSIS_CARD = {
  type: 'object',
  required: ['name'],
  description: 'değerlendirilecek hastalık/durum kartı',
  properties: {
    name: { type: 'string', description: 'değerlendirilebilecek hastalık/durum adı' },
    reasoning: REASONING,
    relevance: {
      type: 'string',
      enum: ['high', 'moderate', 'low'],
      description: 'niteliksel öncelik etiketi; olasılık yüzdesi DEĞİLDİR',
    },
    why_considered: {
      type: 'array',
      items: { type: 'string' },
      description: 'bu olasılığın neden gündeme geldiğine dair tıbbi gerekçeler',
    },
    supporting_findings: {
      type: 'array',
      items: { type: 'string' },
      description: 'sunulan bulgulardan bu olasılığı destekleyenler',
    },
    missing_or_uncertain_information: {
      type: 'array',
      items: { type: 'string' },
      description: 'bu olasılığı netleştirmek için eksik/belirsiz bilgiler',
    },
    alternative_explanations: {
      type: 'array',
      items: { type: 'string' },
      description: 'aynı bulguları açıklayabilecek alternatif durumlar',
    },
    findings_against: {
      type: 'array',
      items: { type: 'string' },
      description: 'bu olasılığı desteklemeyen / daha az tipik yapan bulgular (yoksa boş dizi)',
    },
    contradiction_assessment: CONTRADICTION_ASSESSMENT,
    distinguishing_features: {
      type: 'array',
      items: { type: 'string' },
      description: 'bu olasılığı diğer adaylardan ayıran temel klinik özellikler',
    },
    comparison_with_other_candidates: {
      type: 'array',
      items: COMPARISON_ITEM,
      description: 'diğer aday tanılarla karşılaştırma',
    },
    questions_to_consider: {
      type: 'array',
      items: { type: 'string' },
      description: 'ayırıcı tanıyı daraltmaya yardımcı olabilecek sorular',
    },
    evidence_notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'kanıt değeriyle ilgili notlar; kaynak atıfları [S1] biçiminde',
    },
    key_findings_used: {
      type: 'array',
      items: { type: 'string' },
      description: 'yalnızca girdide bulunan ve değerlendirmede kullanılan hasta bulguları',
    },
  },
};

const EVIDENCE_TREE = {
  type: 'object',
  description: 'girdideki kanıtlar ile aday tanılar arasındaki açıklanabilir ilişki ağı',
  properties: {
    root_label: { type: 'string', description: 'vakanın tek satırlık, nötr özeti' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id: { type: 'string', description: "benzersiz bulgu düğümü kimliği (ör. 'f1')" },
          label: {
            type: 'string',
            description: 'bulgu adı (yalnızca hasta girdisinde GERÇEKTEN bulunan öğeler)',
          },
          type: {
            type: 'string',
            enum: ['symptom', 'laboratory', 'history', 'pattern', 'other'],
            description:
              'bulgu türü; yalnızca symptom | laboratory | history | pattern değerlerini KULLAN ' +
              "('other' sunucu tarafı güvenli düşme değeridir, sen üretme)",
          },
          detail: { type: 'string', description: 'kısa detay (ör. 2 haftadır, ataklı); yoksa boş string' },
        },
      },
      description: 'hasta girdisindeki gerçek bulgular (en fazla 8)',
    },
    diagnosis_nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id: { type: 'string', description: "benzersiz tanı düğümü kimliği (ör. 'd1')" },
          label: {
            type: 'string',
            description: 'tanı adı (differential_diagnoses listesindeki adla birebir aynı)',
          },
          conclusion: { type: 'string', description: 'açıklanabilir sonuç cümlesi' },
          confirmatory_clues: {
            type: 'array',
            items: { type: 'string' },
            description: 'hastada henüz görülmemiş, doğrulanması gereken ipuçları (en fazla 4)',
          },
        },
      },
      description: 'differential_diagnoses içindeki adayların düğümleri',
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'bulgu düğümü kimliği (findings içindeki bir id)' },
          to: { type: 'string', description: 'tanı düğümü kimliği (diagnosis_nodes içindeki bir id)' },
          type: {
            type: 'string',
            enum: ['supports', 'weakens'],
            description: 'bulgunun tanıyı destekleme veya zayıflatma yönü',
          },
        },
      },
      description: 'yalnızca findings -> diagnosis_nodes yönlü bağlantılar (en fazla 6)',
    },
  },
};

const SECOND_OPINION = {
  type: 'object',
  description: 'ikinci görüş motoru: doktor hipotezlerini kanıta karşı sorgulama',
  properties: {
    summary: {
      type: 'string',
      description: 'doktorun ön değerlendirmesine yönelik dürüst tek kısa özet cümlesi',
    },
    hypothesis_review: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          diagnosis: {
            type: 'string',
            description: 'doktorun ön değerlendirme listesindeki bir tanı adı (YALNIZCA listedekiler)',
          },
          status: {
            type: 'string',
            enum: ['supported', 'challenged', 'reconsider'],
            description: 'bu hipotezin kanıtlara göre durumu',
          },
          supporting_findings: {
            type: 'array',
            items: { type: 'string' },
            description: 'hipotezi destekleyen bulgular (yalnızca girdideki gerçek bulgular)',
          },
          challenging_findings: {
            type: 'array',
            items: { type: 'string' },
            description: 'hipotezi sorgulatan bulgular (yoksa boş dizi)',
          },
          recommendation: { type: 'string', description: 'bu hipotez için tek cümlelik somut öneri' },
        },
      },
      description: 'doktorun listesindeki tanıların tek tek incelenmesi (en fazla 3)',
    },
    unconsidered_alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          diagnosis: {
            type: 'string',
            description: 'doktorun listesinde OLMAYAN ancak aynı bulguları açıklayabilen tanı adı',
          },
          why_should_be_considered: {
            type: 'string',
            description: 'bu alternatifin neden gündeme gelmesi gerektiği (tek kısa cümle)',
          },
          key_evidence_to_gather: {
            type: 'string',
            description: 'bu alternatifi destekleyecek/eleyecek toplanması gereken en önemli tek bilgi',
          },
        },
      },
      description: 'doktorun düşünmediği alternatifler (en fazla 3)',
    },
    key_question: {
      type: 'string',
      description: 'doktorun bir sonraki adımda kendine sorması gereken en değerli TEK soru',
    },
  },
};

const NEXT_BEST_INFORMATION = {
  type: 'object',
  description: 'bir sonraki en değerli bilgi motoru: tanı tahmini DEĞİL, belirsizliği en çok azaltacak bilgiyi seçip soruya çevirir',
  properties: {
    current_uncertainty: {
      type: 'string',
      description: 'mevcut bilgilerle tanımlı belirsizliğin tek kısa cümle özeti (hangi adaylar neden birbirinden ayrışamıyor)',
    },
    top: {
      type: 'object',
      description: 'en yüksek ayırt edici güce sahip TEK eksik bilgi',
      properties: {
        information: { type: 'string', description: 'eksik bilginin kısa adı (ör. atak süresi, aile öyküsü, CRP düzeyi)' },
        question: { type: 'string', description: 'doktorun/hastanın doğrudan yanıtlayabileceği TEK net soru' },
        why_most_valuable: {
          type: 'string',
          description: 'bu bilginin neden en fazla belirsizliği azalttığı: hangi adaylar arasındaki hangi ayrımı açtığı (tek kısa paragraf)',
        },
        affected_diagnoses: {
          type: 'array',
          items: { type: 'string' },
          description: 'bu bilgiyle ayrımı doğrudan etkilenecek aday tanılar (yalnızca differential_diagnoses listesindekiler, en fazla 4)',
        },
        expected_outcome: {
          type: 'string',
          description: 'dal dal beklenen etki: bilginin her olası sonucu hangi tanıyı güçlendirir/zayıflatır (ör. "kısaysa FMF lehine, 5 günden uzarsa TRAPS öne geçer")',
        },
        how_to_obtain: {
          type: 'string',
          description: 'bilginin toplanma yolu (hasta öyküsü sorusu, laboratuvar testi, görüntüleme, kılavuz eşleştirmesi vb.)',
        },
      },
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          information: { type: 'string', description: 'eksik bilginin kısa adı' },
          question: { type: 'string', description: 'bu bilgiyi toplamak için tek net soru' },
          affected_diagnoses: {
            type: 'array',
            items: { type: 'string' },
            description: 'ayrımı etkilenecek aday tanılar (yalnızca listedekiler)',
          },
          expected_outcome: { type: 'string', description: 'dal dal beklenen etki (tek kısa cümle)' },
        },
      },
      description: 'top seçimden sonraki sıralı alternatif eksik bilgiler (en fazla 2)',
    },
  },
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['case_summary', 'clinical_pattern', 'differential_diagnoses', 'uncertainty'],
  properties: {
    case_summary: { type: 'string', description: 'vakaya dair kısa ve nötr özet' },
    clinical_pattern: {
      type: 'string',
      description: 'semptom/bulguların birlikte oluşturduğu klinik örüntü',
    },
    differential_diagnoses: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: DIAGNOSIS_CARD,
      description: 'değerlendirilecek ayırıcı tanı kartları (en fazla 5)',
    },
    important_missing_information: {
      ...STRING_ARRAY,
      description: 'vakayı daha iyi değerlendirmek için eksik bilgiler (en fazla 5)',
    },
    missing_information_priority: {
      type: 'string',
      description: 'hangi eksik bilgilerin en önce toplanması gerektiğine dair kısa yönlendirme',
    },
    missing_information_impact: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          missing_information: { type: 'string', description: 'eksik kritik bilginin kısa başlığı' },
          affected_diagnoses: {
            type: 'array',
            items: { type: 'string' },
            description: 'bu eksiklikten en çok etkilenen ayırıcı tanılar (yalnızca listedekiler)',
          },
          impact_direction: {
            type: 'string',
            description: 'bilgi tamamlandığında hangi tanıyı ne yönde etkileyeceği',
          },
        },
      },
      description: 'kritik eksik bilgilerin tanılara etkisi (en fazla 5)',
    },
    doctor_divergence_analysis: {
      type: 'object',
      description: 'doktor ön değerlendirmesi ile AI sıralamasının karşılaştırması',
      properties: {
        agreements: {
          type: 'array',
          items: { type: 'string' },
          description: 'doktorun ve AI’ın uyumlu olduğu tanılar (kısa açıklamayla)',
        },
        disagreements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              diagnosis: { type: 'string', description: 'farklı konumlandırılan tanı adı' },
              doctor_rank: {
                type: ['number', 'null'],
                description: 'doktor listesindeki sıra (1’den başlar; yoksa null)',
              },
              ai_rank: {
                type: ['number', 'null'],
                description: 'AI sıralamasındaki sıra (1’den başlar; yoksa null)',
              },
              reason: { type: 'string', description: 'kısa klinik gerekçe' },
            },
          },
          description: 'farklı konumlandırılan tanılar',
        },
        summary: { type: 'string', description: 'düşünce farkının tek kısa özeti' },
      },
    },
    evidence_tree: EVIDENCE_TREE,
    second_opinion: SECOND_OPINION,
    next_best_information: NEXT_BEST_INFORMATION,
    clinical_attention_points: {
      ...STRING_ARRAY,
      description: 'klinik değerlendirmede dikkat çekilebilecek noktalar (alarmist olmadan)',
    },
    uncertainty: {
      type: 'string',
      description: 'mevcut bilgilerle ulaşılabilecek kesinlik düzeyinin dürüst ifadesi',
    },
    uncertainty_assessment: {
      type: 'object',
      description: 'sunucu tarafından vaka, kanıt ve audit sonuçlarından hesaplanan karar güveni',
      properties: {
        level: {
          type: 'string',
          enum: ['high', 'moderate', 'low'],
          description: 'karar güveni seviyesi; kesin tanı olasılığı değildir',
        },
        label: { type: 'string', description: 'kullanıcıya gösterilecek güven seviyesi' },
        reasons: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'missing_data',
              'contradictory_findings',
              'test_needed',
              'multiple_compatible_diagnoses',
              'insufficient_coverage',
              'model_evidence_mismatch',
            ],
          },
        },
        clinical_safety: {
          type: 'object',
          description: 'sunucu tarafından üretilen klinik güvenlik ve kırmızı bayrak değerlendirmesi',
          properties: {
            status: { type: 'string', enum: ['urgent_review', 'review_required', 'no_red_flag_detected'] },
            label: { type: 'string' },
            red_flags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                },
              },
            },
            actions: { type: 'array', items: { type: 'string' } },
            audit_warning_count: { type: 'number' },
            source: { type: 'string' },
          },
        },
        details: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
    },
    sources: {
      type: 'array',
      description: 'sunucu tarafından doldurulur; model boş dizi döndürür',
    },
    disclaimer: {
      type: 'string',
      description: 'klinik karar destek prototipi uyarısı',
    },
  },
};


function pad(depth) {
  return '  '.repeat(depth);
}

function typeLabel(schema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.enum) return schema.enum.join(' | ');
  if (types.length > 1) return types.join(' | ');
  return types[0] || 'any';
}

function renderValue(schema, indent) {
  const desc = schema.description ? ` - ${schema.description}` : '';
  const label = typeLabel(schema);

  if (schema.type === 'object') {
    return `{\n${renderEntries(schema, indent + 1)}\n${pad(indent)}}`;
  }
  if (schema.type === 'array') {
    if (schema.items && schema.items.type === 'object') {
      return `[\n${pad(indent + 1)}{\n${renderEntries(schema.items, indent + 2)}\n${pad(indent + 1)}}\n${pad(indent)}]`;
    }
    if (schema.items) return `[${renderValue(schema.items, indent)}]`;
    return '[]';
  }
  return `"${label}${desc}"`;
}

function renderEntries(schema, indent) {
  const props = schema.properties || {};
  const keys = Object.keys(props);
  return keys
    .map((key, i) => {
      const comma = i < keys.length - 1 ? ',' : '';
      return `${pad(indent)}"${key}": ${renderValue(props[key], indent)}${comma}`;
    })
    .join('\n');
}

function schemaToPromptText() {
  return `{\n${renderEntries(ANALYSIS_SCHEMA, 1)}\n}`;
}

module.exports = {
  ANALYSIS_SCHEMA,
  SCHEMA_VERSION,
  schemaToPromptText,
};
