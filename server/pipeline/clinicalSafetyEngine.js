// Klinik güvenlik katmanı: tanı koymaz; kritik olabilecek sinyalleri
// deterministik olarak görünür kılar ve AI çıktısından bağımsız uyarı üretir.

const RED_FLAGS = [
  {
    id: 'respiratory_distress',
    pattern: /\b(nefes darlığı|solunum sıkıntısı|oksijen düşüklüğü|morarma|cyanosis|dyspnea)\b/i,
    label: 'Solunumla ilgili alarm bulgusu',
    action: 'Solunum değerlendirmesi geciktirilmemeli; klinik ekip tarafından aciliyet değerlendirilmelidir.',
  },
  {
    id: 'altered_consciousness',
    pattern: /\b(bilinç değişikliği|bilinç kaybı|bayılma|konfüzyon|şuur kaybı|seizure|nöbet)\b/i,
    label: 'Bilinç değişikliği veya nöbet sinyali',
    action: 'Acil klinik değerlendirme gerekir; bu analiz sağlık başvurusunu geciktirmemelidir.',
  },
  {
    id: 'severe_chest_pain',
    pattern: /\b(şiddetli göğüs ağrısı|göğüste baskı|chest pain)\b/i,
    label: 'Ciddi göğüs ağrısı sinyali',
    action: 'Acil değerlendirme gerekip gerekmediği klinik olarak hemen değerlendirilmelidir.',
  },
  {
    id: 'rapid_deterioration',
    pattern: /\b(hızla kötüleş|genel durum bozuk|şiddetli sepsis|septik şok|hemodinamik|şok)\b/i,
    label: 'Hızlı kötüleşme veya ciddi genel durum sinyali',
    action: 'Acil klinik değerlendirme önceliklidir; model sonucu beklenmemelidir.',
  },
  {
    id: 'meningeal_signs',
    pattern: /\b(ense sertliği|menenjizm|ışığa hassasiyet|fotofobi)\b/i,
    label: 'Menengeal irritasyon sinyali',
    action: 'Acil değerlendirme gerekip gerekmediği gecikmeden klinik olarak ele alınmalıdır.',
  },
];

function buildClinicalSafetyAssessment(structuredCase, auditFlags) {
  const c = structuredCase || {};
  const text = [
    c.clinical_note,
    ...(c.symptoms || []).map((s) => s && s.name),
    ...Object.values(c.symptom_timing || {}),
  ].filter(Boolean).join(' ');
  const flags = RED_FLAGS.filter((flag) => flag.pattern.test(text));
  const audit = Array.isArray(auditFlags) ? auditFlags : [];

  if (flags.length > 0) {
    return {
      status: 'urgent_review',
      label: 'Acil klinik değerlendirme önceliği',
      red_flags: flags.map((flag) => ({ id: flag.id, label: flag.label })),
      actions: flags.map((flag) => flag.action),
      audit_warning_count: audit.length,
      source: 'deterministic_clinical_safety_engine',
    };
  }

  return {
    status: audit.length > 0 ? 'review_required' : 'no_red_flag_detected',
    label: audit.length > 0 ? 'Çıktı klinik inceleme gerektiriyor' : 'Kırmızı bayrak tespit edilmedi',
    red_flags: [],
    actions: audit.length > 0
      ? ['Model çıktısındaki denetim uyarıları klinisyen tarafından incelenmeden sonuç kesinleştirilmemelidir.']
      : [],
    audit_warning_count: audit.length,
    source: 'deterministic_clinical_safety_engine',
  };
}

module.exports = { buildClinicalSafetyAssessment };
