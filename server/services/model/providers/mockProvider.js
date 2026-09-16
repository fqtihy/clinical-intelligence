// Mock provider: API anahtarı olmadan hat ucundan uca doğrulama (E2E smoke test)
// için deterministik, şemaya uygun minimal JSON döndürür. Gerçek analiz yapmaz.
const content = JSON.stringify({
  case_summary: 'Mock çıktı: yapılandırılmış vaka alındı, hat doğrulandı.',
  clinical_pattern: 'Mock provider yalnızca pipeline bağlantısını doğrular.',
  differential_diagnoses: [
    {
      name: 'Mock tanı (hat doğrulama)',
      relevance: 'low',
      why_considered: ['Mock provider hat testi için kullanılır'],
      supporting_findings: [],
      missing_or_uncertain_information: [],
      alternative_explanations: [],
      findings_against: [],
      contradiction_assessment: { severity: 'none', verdict: 'Mock çıktı.' },
      distinguishing_features: [],
      comparison_with_other_candidates: [],
      questions_to_consider: [],
      evidence_notes: [],
      key_findings_used: [],
    },
  ],
  important_missing_information: [],
  missing_information_priority: '',
  missing_information_impact: [],
  doctor_divergence_analysis: { agreements: [], disagreements: [], summary: '' },
  evidence_tree: { root_label: 'Mock vaka', findings: [], diagnosis_nodes: [], links: [] },
  second_opinion: { summary: '', hypothesis_review: [], unconsidered_alternatives: [], key_question: '' },
  next_best_information: {
    current_uncertainty: 'Mock çıktıdır; gerçek analizde belirsizlik özeti burada görünür.',
    top: {
      information: 'Mock eksik bilgi',
      question: 'Mock provider yalnızca hat bağlantısını doğrular; gerçek soru burada görünür.',
      why_most_valuable: '',
      affected_diagnoses: [],
      expected_outcome: '',
      how_to_obtain: '',
    },
    alternatives: [],
  },
  clinical_attention_points: [],
  uncertainty: 'Mock çıktıdır; klinik kullanım içindir değil.',
  disclaimer: 'This is a mock response for pipeline smoke testing only.',
});

module.exports = {
  providerName: 'mock',
  model: 'mock-reasoner',
  createChatCompletion: async () => ({
    content,
    finishReason: 'stop',
    usage: { prompt_tokens: 0, completion_tokens: 0 }, // mock; gerçek ölçüm OpenAI-uyumlu provider'larda
  }),
  isConfigured: () => true,
};
