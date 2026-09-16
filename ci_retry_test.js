// Task-unique logic test: analysisService retry + robust JSON extraction (network-free).
const path = require('path');
const PROJECT = 'C:/Users/Fatih/Desktop/proje';

const VALID_JSON = {
  case_summary: '21 yasinda kadin, tekrarlayan ates.',
  clinical_pattern: 'Tekrarlayan ates.',
  differential_diagnoses: [
    {
      name: 'Enfeksiyon',
      relevance: 'high',
      why_considered: ['Tekrarlayan ates'],
      supporting_findings: ['Ates'],
      missing_or_uncertain_information: ['Kan kulturu'],
      alternative_explanations: [],
      findings_against: ['Gogus agrisinin olmamasi'],
      contradiction_assessment: {
        severity: 'minor',
        verdict: 'Enfeksiyon hala degerlendirilebilir ancak ates disinda kanit eksik.',
      },
      distinguishing_features: ['Ataklarin 3 gunden kisa surmesi'],
      comparison_with_other_candidates: [
        { candidate: 'SLE', distinguishing_point: 'Klasik SLE bulgularinin olmamasi' },
      ],
      questions_to_consider: ['Ates siklusu?'],
      evidence_notes: [],
      key_findings_used: ['recurrent fever'],
    },
  ],
  important_missing_information: ['Kan sayimi'],
  missing_information_priority: 'FMF ile diger periyodik ates sendromlarini ayirmak icin atak suresi eksik.',
  missing_information_impact: [
    {
      missing_information: 'Atak suresi',
      affected_diagnoses: ['FMF', 'TRAPS'],
      impact_direction: 'Kisa sureli ataklar FMF lehine olur',
    },
  ],
  doctor_divergence_analysis: {
    agreements: ['SLE ilk sirada ortak'],
    disagreements: [
      { diagnosis: 'Viral enfeksiyon', doctor_rank: 3, ai_rank: null, reason: 'Atakli seyir viral enfeksiyon icin tipik degil' },
    ],
    summary: 'Doktor viral enfeksiyonu on planda dusunuyor, AI periyodik ates sendromlarini onceliklendiriyor.',
  },
  evidence_tree: {
    root_label: '21 yasinda kadin; tekrarlayan ates',
    findings: [
      { id: 'f1', label: 'Ates', type: 'symptom', detail: '2 haftadir' },
      { id: 'f2', label: 'Eklem agrisi', type: 'symptom', detail: '' },
    ],
    diagnosis_nodes: [
      { id: 'd1', label: 'Enfeksiyon', conclusion: 'Enfeksiyon olasiligi korunur', confirmatory_clues: ['Kan kulturu pozitifligi'] },
    ],
    links: [
      { from: 'f1', to: 'd1', type: 'supports' },
      { from: 'f2', to: 'd1', type: 'supports' },
    ],
  },
  second_opinion: {
    summary: 'Doktorun on degerlendirmesi bulgularla buyuk olcude uyumlu; atakli seyir otoinflamatuvar hastaliklarin da degerlendirilmesini gerektirebilir.',
    hypothesis_review: [
      {
        diagnosis: 'Sistemik Lupus Eritematozus (SLE)',
        status: 'supported',
        supporting_findings: ['ANA pozitifligi', 'Ates'],
        challenging_findings: [],
        recommendation: 'SLE onceligini koruyun; ANA titresi ve idrar analizi ile destekleyin.',
      },
      {
        diagnosis: 'Still Hastalığı',
        status: 'challenged',
        supporting_findings: ['Ates'],
        challenging_findings: ['Eklem tutulumu belirtisi yok'],
        recommendation: 'Ferritin ve bogaz kulturu ile netlestirin.',
      },
      {
        diagnosis: 'Viral enfeksiyon',
        status: 'reconsider',
        supporting_findings: ['Ates'],
        challenging_findings: ['Atakli seyir'],
        recommendation: 'Atak suresi uzadikca viral enfeksiyon olasiligi azalir.',
      },
    ],
    unconsidered_alternatives: [
      { diagnosis: 'FMF', why_should_be_considered: 'Tekrarlayan kisa ates ataklari FMF dusundurur.', key_evidence_to_gather: 'Atak suresi ve aile oykusu' },
      { diagnosis: 'Viral enfeksiyon', why_should_be_considered: 'Doktor listesinde olan tani alternatiflerde yer almamali', key_evidence_to_gather: 'x' },
    ],
    key_question: 'Ataklar ne kadar suruyor ve ataklar arasinda hasta tamamen duzeliyor mu?',
  },
  clinical_attention_points: [],
  uncertainty: 'Sinirli veri.',
  sources: [],
  disclaimer: 'This is a clinical decision-support prototype and not a definitive diagnosis.',
};

const VALID_FENCED = '```json\n' + JSON.stringify(VALID_JSON, null, 2) + '\n```';
const TRUNCATED = '{"case_summary":"21 yasinda kadin tekrarlayan ates","clinical_pattern":"tekrarl';
const GARBAGE = 'Merhaba, analiz sonucu:\n' + JSON.stringify(VALID_JSON) + '\nUmarim yardimci olur.';

// Formun gercekten gonderdigi gibi: tum opsiyonel alanlar bos string olarak var.
const PAYLOAD = {
  patient: { age: 21, sex: 'female' },
  symptoms: [{ key: 'recurrent_fever', label: 'Ateş', duration: '2 hafta' }],
  otherSymptoms: '',
  clinicalNote: '21 yaşında kadın hasta, tekrarlayan ateş şikayeti.',
  preliminaryAssessment: 'Sistemik Lupus Eritematozus (SLE)\nStill Hastalığı\n3. Viral enfeksiyon',
  laboratoryResults: [],
  symptomTiming: { onset: '', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
  medicalHistory: { previousIllnesses: '', medications: '', familyHistory: '', previousDiagnoses: '', previousTreatments: '', treatmentResponse: '' },
  geographicHistory: { country: '', travel: '', migration: '', endemicExposure: '', animalContact: '', occupationalExposure: '' },
};

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); }
  else { failures++; console.error('  FAIL:', msg); }
}

// Tek sabit stub: davranisi test senaryolarina gore degisir.
// analysisService istemciyi modul nesnesi uzerinden cagirdigi icin (analiz zamaninda
// ozellik erisimi), istemcinin exports nesnesindeki createChatCompletion ozelligini
// degistirmek yeterlidir; require.cache degisimine gerek yoktur.
let handler = null;
function installHandler(fn) {
  handler = fn;
  const client = require(path.join(PROJECT, 'server/services/ai/deepseekClient.js'));
  client.createChatCompletion = async (opts) => handler(opts);
}

async function run() {
  const { analyzeCase } = require(path.join(PROJECT, 'server/services/ai/analysisService.js'));

  // (a) Gecerli JSON + fences -> basarili, 1 cagri, bilinmiyor dolgusu
  {
    let calls = 0;
    installHandler(async ({ messages }) => {
      calls++;
      assert(messages.length === 2, '(a) ilk istek 2 mesaj (system+user)');
      return { content: VALID_FENCED, finishReason: 'stop' };
    });
    const res = await analyzeCase(PAYLOAD);
    assert(calls === 1, '(a) tek cagri yeterli');
    assert(res.result.differential_diagnoses.length === 1, '(a) tani kartlari ayristirildi');
    assert(res.result.differential_diagnoses[0].findings_against.length === 1, '(a) aleyhte bulgular normalizasyonu');
    assert(res.result.differential_diagnoses[0].distinguishing_features.length === 1, '(a) ayirt edici ozellik normalizasyonu');
    const comp = res.result.differential_diagnoses[0].comparison_with_other_candidates;
    assert(comp.length === 1, '(a) karsilastirma normalizasyonu');
    assert(comp[0].candidate === 'SLE' && comp[0].distinguishing_point.length > 0, '(a) karsilastirma alanlari korundu');
    assert(Array.isArray(comp[0].distinguishing_point) === false, '(a) karsilastirma string olarak normalize edildi');
    const mi = res.result.missing_information_impact;
    assert(mi.length === 1, '(a) eksik kritik bilgi normalizasyonu');
    assert(mi[0].missing_information === 'Atak suresi' && mi[0].affected_diagnoses.length === 2 && mi[0].impact_direction.length > 0, '(a) eksik bilgi alanlari korundu');
    assert(res.result.missing_information_priority.length > 0, '(a) oncelik yonlendirmesi korundu');
    const ca = res.result.differential_diagnoses[0].contradiction_assessment;
    assert(ca.severity === 'minor', '(a) celiski siddeti normalizasyonu');
    assert(ca.verdict.length > 0, '(a) celiski sonuc cumlesi korundu');
    const prelim = res.case.doctor_preliminary_assessment;
    assert(Array.isArray(prelim) && prelim.length === 3, '(a) doktor on degerlendirmesi satirlara ayrildi');
    assert(prelim[0] === 'Sistemik Lupus Eritematozus (SLE)', '(a) ilk satir korundu');
    assert(prelim[2] === 'Viral enfeksiyon', '(a) numarali satir temizlendi');
    const dda = res.result.doctor_divergence_analysis;
    assert(dda.agreements.length === 1, '(a) uyum listesi normalizasyonu');
    assert(dda.disagreements.length === 1, '(a) anlasmazlik listesi normalizasyonu');
    assert(dda.disagreements[0].doctor_rank === 3 && dda.disagreements[0].ai_rank === null && dda.disagreements[0].reason.length > 0, '(a) anlasmazlik alanlari korundu');
    assert(dda.summary.length > 0, '(a) fark ozeti korundu');
    const et = res.result.evidence_tree;
    assert(et.root_label.length > 0, '(a) kanit agaci kok etiketi korundu');
    assert(et.findings.length === 2 && et.findings[0].type === 'symptom', '(a) kanit agaci bulgulari korundu');
    assert(et.diagnosis_nodes.length === 1 && et.diagnosis_nodes[0].confirmatory_clues.length === 1, '(a) kanit agaci tani dugumleri + ipuclari korundu');
    assert(et.links.length === 2 && et.links[0].type === 'supports', '(a) kanit agaci baglantilari korundu');
    const so = res.result.second_opinion;
    assert(so && so.summary.length > 0, '(a) ikinci gorus ozeti korundu');
    assert(so.hypothesis_review.length === 3, '(a) hipotez incelemesi doktor listesindeki 3 taniyi korudu');
    assert(so.hypothesis_review[0].status === 'supported' && so.hypothesis_review[1].status === 'challenged' && so.hypothesis_review[2].status === 'reconsider', '(a) hipotez durumlari korundu');
    assert(so.hypothesis_review[2].recommendation.length > 0, '(a) hipotez onerisi korundu');
    assert(so.unconsidered_alternatives.length === 1 && so.unconsidered_alternatives[0].diagnosis === 'FMF', '(a) doktor listesindeki tani alternatiflerden elendi');
    assert(so.unconsidered_alternatives[0].key_evidence_to_gather.length > 0, '(a) alternatif kanit toplama yonlendirmesi korundu');
    assert(so.key_question.length > 0, '(a) anahtar soru korundu');
    assert(res.case.symptom_timing.onset === 'bilinmiyor', '(a) bos zamanlama alani bilinmiyor');
    assert(res.case.symptom_timing.duration === 'bilinmiyor', '(a) bos sure bilinmiyor');
    assert(res.case.medical_history.previousIllnesses === 'bilinmiyor', '(a) bos tıbbi oyku bilinmiyor');
    assert(res.case.geographic_and_lifestyle_history.travel === 'bilinmiyor', '(a) bos cografi oyku bilinmiyor');
    assert(res.case.symptoms[0].name === 'recurrent fever', '(a) semptom eşlemesi korundu');
    console.log('  OK scenario (a)');
  }

  // (b) Kesik JSON + finishReason length -> retry, 2. denemede basari
  {
    let calls = 0;
    installHandler(async ({ messages, temperature }) => {
      calls++;
      if (calls === 1) {
        assert(temperature === undefined || temperature === 0.3, '(b) ilk istek varsayilan sicaklik');
        return { content: TRUNCATED, finishReason: 'length' };
      }
      assert(messages.length === 3, '(b) retry mesaji eklendi (3 mesaj)');
      assert(temperature === 0.1, '(b) retry sicakligi 0.1');
      assert(messages[2].role === 'user' && /MORE concise/i.test(messages[2].content), '(b) retry yonergesi iceriyor');
      return { content: JSON.stringify(VALID_JSON), finishReason: 'stop' };
    });
    const res = await analyzeCase(PAYLOAD);
    assert(calls === 2, '(b) toplam 2 cagri (retry tetiklendi)');
    assert(res.result.case_summary === VALID_JSON.case_summary, '(b) sonuc basarili');
    console.log('  OK scenario (b)');
  }

  // (c) Her iki denemede de gecersiz JSON -> dost AI_INVALID_JSON hatasi
  {
    let calls = 0;
    installHandler(async () => { calls++; return { content: 'Bu JSON degil', finishReason: 'stop' }; });
    try {
      await analyzeCase(PAYLOAD);
      assert(false, '(c) hata firlatilmaliydi');
    } catch (err) {
      assert(calls === 2, '(c) 2 deneme yapildi');
      assert(err.code === 'AI_INVALID_JSON', '(c) hata kodu AI_INVALID_JSON (alindi: ' + err.code + ')');
      assert(typeof err.message === 'string' && err.message.length > 0, '(c) kullanici dostu mesaj var');
    }
    console.log('  OK scenario (c)');
  }

  // (d) Gecersiz JSON (parse hatasi), 2. denemede gecerli -> retry calisti
  {
    let calls = 0;
    installHandler(async ({ temperature }) => {
      calls++;
      if (calls === 1) return { content: 'Yanit hazirlanirken hata olustu, tekrar deneyin', finishReason: 'stop' };
      assert(temperature === 0.1, '(d) retry sicakligi 0.1');
      return { content: GARBAGE, finishReason: 'stop' };
    });
    const res = await analyzeCase(PAYLOAD);
    assert(calls === 2, '(d) parse hatasinda retry tetiklendi');
    assert(res.result.differential_diagnoses.length === 1, '(d) metin icinden JSON cikarildi');
    console.log('  OK scenario (d)');
  }

  // (f) Çelişki motoru normalizasyonu: aleyhte bulgu yoksa/geçersizse severity none'a düşer
  {
    const { parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/services/ai/analysisService.js'));
    const run = (d) => parseAndValidateAiOutput(JSON.stringify({
      case_summary: 'x',
      differential_diagnoses: [d],
    })).differential_diagnoses[0].contradiction_assessment;
    const noAgainst = run({ name: 'A', relevance: 'high', findings_against: [], contradiction_assessment: { severity: 'significant', verdict: 'v' } });
    assert(noAgainst.severity === 'none', '(f) aleyhte bulgu yoksa severity none olur');
    const bogus = run({ name: 'A', relevance: 'high', findings_against: ['bulgu'], contradiction_assessment: { severity: 'asiri', verdict: 'v' } });
    assert(bogus.severity === 'none', '(f) gecersiz severity none olur');
    const good = run({ name: 'A', relevance: 'high', findings_against: ['bulgu'], contradiction_assessment: { severity: 'significant', verdict: 'sonuc' } });
    assert(good.severity === 'significant' && good.verdict === 'sonuc', '(f) gecerli celiski korunur');
    const missing = run({ name: 'A', relevance: 'high', findings_against: ['bulgu'] });
    assert(missing.severity === 'none' && missing.verdict === '', '(f) alan yoksa guvenli varsayilan degerler');
    console.log('  OK scenario (f)');
  }

  // (g) Doktor iki yönlü çalışma: eksik/bozuk alanlar güvenli boş değerlere döner
  {
    const { parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/services/ai/analysisService.js'));
    const out = parseAndValidateAiOutput(JSON.stringify({ case_summary: 'x', differential_diagnoses: [{ name: 'A', relevance: 'high' }] }));
    const d = out.doctor_divergence_analysis;
    assert(d && d.agreements.length === 0 && d.disagreements.length === 0 && d.summary === '', '(g) eksik divergence alani guvenli bos degerler');

    const badRank = parseAndValidateAiOutput(JSON.stringify({
      case_summary: 'x',
      differential_diagnoses: [{ name: 'A', relevance: 'high' }],
      doctor_divergence_analysis: {
        agreements: [],
        disagreements: [{ diagnosis: 'B', doctor_rank: '3', ai_rank: 1, reason: 'r' }],
        summary: 's',
      },
    })).doctor_divergence_analysis.disagreements[0];
    assert(badRank.doctor_rank === null && badRank.ai_rank === 1, '(g) string rank nulla duser, sayi rank korunur');

    const { normalizeAndValidate } = require(path.join(PROJECT, 'server/validation/caseNormalizer.js'));
    const noPrelim = normalizeAndValidate({ patient: { age: 30, sex: 'male' }, symptoms: [{ key: 'recurrent_fever', label: 'Ateş' }], preliminaryAssessment: '   \n  ' });
    assert(Array.isArray(noPrelim.doctor_preliminary_assessment) && noPrelim.doctor_preliminary_assessment.length === 0, '(g) bos on degerlendirme bos dizi');
    console.log('  OK scenario (g)');
  }

  // (h) Kanit agaci normalizasyonu: gecersiz dugum/id/tip guvenli sekilde elenir veya normalize edilir
  {
    const { parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/services/ai/analysisService.js'));
    const tree = {
      root_label: 'Bozuk agac testi',
      findings: [
        { id: 'f1', label: 'Ateş', type: 'symptom', detail: '2 hafta' },
        { id: 'f2', label: 'ANA pozitif', type: 'laboratory', detail: '' },
        { id: 'f3', label: 'Uydurma bulgu', type: 'bilinmeyen-tip', detail: '' },
        { id: '', label: 'idsiz', type: 'symptom' },
        { label: 'labelsiz', type: 'symptom' },
      ],
      diagnosis_nodes: [
        { id: 'd1', label: 'SLE', conclusion: 'SLE guclenir', confirmatory_clues: ['Gunes iliskisi', 'Oral ulser', 'Lokopeni', 'Alopesi', 'Fazladan ipucu'] },
        { id: 'd2', label: 'AOSD', conclusion: '', confirmatory_clues: [] },
      ],
      links: [
        { from: 'f1', to: 'd1', type: 'supports' },
        { from: 'f2', to: 'd1', type: 'weakens' },
        { from: 'f9', to: 'd1', type: 'supports' },
        { from: 'f1', to: 'd9', type: 'supports' },
        { from: 'f3', to: 'd1', type: 'bozuk-tip' },
        { from: 'f1', to: 'd1', type: 'supports' },
      ],
    };
    const out = parseAndValidateAiOutput(JSON.stringify({ case_summary: 'x', differential_diagnoses: [{ name: 'SLE', relevance: 'high' }], evidence_tree: tree }));
    const et = out.evidence_tree;
    assert(et.findings.length === 3, '(h) idsiz/labelsiz bulgular elendi (3 bulgu)');
    assert(et.findings[2].type === 'other', '(h) bilinmeyen bulgu tipi other olur');
    assert(et.diagnosis_nodes.length === 2, '(h) tani dugumleri korundu');
    assert(et.diagnosis_nodes[0].confirmatory_clues.length === 4, '(h) ipuclari en fazla 4 ile sinirli');
    assert(et.links.length === 4, '(h) var olmayan dugum linkleri elendi (4 baglanti kaldi)');
    assert(et.links[2].type === 'supports' && et.links[2].from === 'f3', '(h) bozuk link tipi supports olur');
    const weak = et.links.find((l) => l.from === 'f2');
    assert(weak && weak.type === 'weakens', '(h) weakens baglantisi korunur');

    const noTree = parseAndValidateAiOutput(JSON.stringify({ case_summary: 'x', differential_diagnoses: [{ name: 'A', relevance: 'high' }] }));
    assert(noTree.evidence_tree.root_label === '' && noTree.evidence_tree.findings.length === 0 && noTree.evidence_tree.links.length === 0, '(h) eksik agac guvenli bos degerler');
    console.log('  OK scenario (h)');
  }

  // (i) İkinci görüş motoru bütünlük kuralı: hipotezler yalnızca doktor listesinden,
  //     alternatifler yalnızca listede olmayanlardan; geçersiz status challenged'a düşer.
  {
    const { parseAndValidateAiOutput } = require(path.join(PROJECT, 'server/services/ai/analysisService.js'));
    const doctorList = ['Enfeksiyon', 'SLE'];
    const out = parseAndValidateAiOutput(JSON.stringify({
      case_summary: 'x',
      differential_diagnoses: [{ name: 'Enfeksiyon', relevance: 'high' }],
      second_opinion: {
        summary: 's',
        hypothesis_review: [
          { diagnosis: 'Enfeksiyon', status: 'supported', supporting_findings: ['Ates'], challenging_findings: [], recommendation: 'r' },
          { diagnosis: 'SLE', status: 'bozuk-status', supporting_findings: [], challenging_findings: ['bulgu'], recommendation: '' },
          { diagnosis: 'FMF', status: 'supported', supporting_findings: [], challenging_findings: [], recommendation: '' },
        ],
        unconsidered_alternatives: [
          { diagnosis: 'FMF', why_should_be_considered: 'w', key_evidence_to_gather: 'k' },
          { diagnosis: 'SLE', why_should_be_considered: 'w2', key_evidence_to_gather: 'k2' },
          { diagnosis: 'AOSD', why_should_be_considered: 'w3', key_evidence_to_gather: 'k3' },
          { diagnosis: 'TRAPS', why_should_be_considered: 'w4', key_evidence_to_gather: 'k4' },
          { diagnosis: 'BEHCET', why_should_be_considered: 'w5', key_evidence_to_gather: 'k5' },
        ],
        key_question: 'q',
      },
    }), doctorList);
    const hr = out.second_opinion.hypothesis_review;
    assert(hr.length === 2, '(i) doktor listesinde olmayan hipotez elendi (2 kaldi)');
    assert(hr[0].status === 'supported', '(i) gecerli status korunur');
    assert(hr[1].status === 'challenged', '(i) gecersiz status challenged olur');
    const alts = out.second_opinion.unconsidered_alternatives;
    assert(alts.length === 3, '(i) doktor listesindeki alternatif elendi, kalanlar 3 ile sinirli');
    assert(alts.every((a) => !doctorList.includes(a.diagnosis)), '(i) alternatiflerde doktor tanisi yok');

    const empty = parseAndValidateAiOutput(JSON.stringify({ case_summary: 'x', differential_diagnoses: [{ name: 'A', relevance: 'high' }] }), []);
    assert(empty.second_opinion.summary === '' && empty.second_opinion.hypothesis_review.length === 0 && empty.second_opinion.unconsidered_alternatives.length === 0 && empty.second_opinion.key_question === '', '(i) doktor listesi bosken ikinci gorus guvenli bos degerler');

    const missing = parseAndValidateAiOutput(JSON.stringify({ case_summary: 'x', differential_diagnoses: [{ name: 'A', relevance: 'high' }] }), ['SLE']);
    assert(missing.second_opinion.summary === '' && missing.second_opinion.hypothesis_review.length === 0 && missing.second_opinion.unconsidered_alternatives.length === 0, '(i) second_opinion alani yoksa guvenli bos degerler');
    console.log('  OK scenario (i)');
  }

  // (e) Zorunlu alan dogrulamasi korunuyor
  {
    const { normalizeAndValidate } = require(path.join(PROJECT, 'server/validation/caseNormalizer.js'));
    try {
      normalizeAndValidate({ patient: { age: 30, sex: 'male' }, symptoms: [], clinicalNote: '' });
      assert(false, '(e) VALIDATION_FAILED firlatilmaliydi');
    } catch (err) {
      assert(err.code === 'VALIDATION_FAILED', '(e) zorunlu alan kontrolu korundu');
    }
    const ok = normalizeAndValidate(PAYLOAD);
    assert(ok.patient.age === 21 && ok.patient.sex === 'female', '(e) gecerli vaka kabul edildi');
    console.log('  OK scenario (e)');
  }

  console.log(failures === 0 ? '\nSONUC: TUM TESTLER GECTI' : `\nSONUC: ${failures} TEST BASARISIZ`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => { console.error('Test suresi hata:', err); process.exit(1); });
