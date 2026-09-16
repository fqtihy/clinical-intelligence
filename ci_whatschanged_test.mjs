// "Neler değişti?" birim testi: results.js içinden gerçek fonksiyon kodunu çeker,
// senaryoyu çalıştırır: v1 FMF yüksek -> v2 döküntü+ferritin eklendi, FMF orta, AOSD yüksek.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./public/js/results.js', import.meta.url), 'utf8');

function extract(startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Kod parçası bulunamadı: ${startMarker}`);
  return src.slice(start, end);
}

// esc() stub (testte HTML kaçış gerekmez)
const esc = (s) => String(s ?? '');
const code = [
  extract('function computeDdxDelta', 'function normalizeDxNameForDelta'),
  extract('function normalizeDxNameForDelta', 'function deltaArrow'),
  extract('function truncText', '// İki sürümün form verisini'),
  extract('function computePayloadDelta', '// "YENİ BİLGİ" bölümü'),
].join('\n');

const factory = new Function(`${code}; return { computePayloadDelta, computeDdxDelta };`);
const { computePayloadDelta, computeDdxDelta } = factory();

const v1Payload = {
  patient: { age: '12', sex: 'male' },
  symptoms: [
    { key: 'recurrent_fever', label: 'Tekrarlayan ateş' },
    { key: 'abdominal_pain', label: 'Karın ağrısı' },
  ],
  otherSymptoms: '',
  symptomTiming: { onset: '5 yaşında başladı', recurrent: 'evet' },
  clinicalNote: 'Tekrarlayan ateş ve karın ağrısı atakları.',
  laboratoryResults: [{ name: 'WBC', value: '13', unit: '10^9/L', status: 'high' }],
  medicalHistory: {},
  geographicHistory: {},
};

const v2Payload = {
  ...v1Payload,
  symptoms: [
    ...v1Payload.symptoms,
    { key: 'rash', label: 'Döküntü' },
  ],
  clinicalNote: 'Tekrarlayan ateş ve karın ağrısı atakları. Ataklar sırasında döküntü de görülüyor.',
  laboratoryResults: [
    ...v1Payload.laboratoryResults,
    { name: 'Ferritin', value: '1450', unit: 'ng/mL', status: 'high' },
  ],
};

const v1Dx = [
  { name: 'FMF (Ailevi Akdeniz Ateşi)', relevance: 'high' },
  { name: 'Sistemik JİA', relevance: 'moderate' },
];
const v2Dx = [
  { name: 'FMF (Ailevi Akdeniz Ateşi)', relevance: 'moderate' },
  { name: 'AOSD (Erişkin Başlangıçlı Still Hastalığı)', relevance: 'high' },
  { name: 'Sistemik JİA', relevance: 'moderate' },
];

const deltaItems = computePayloadDelta(v1Payload, v2Payload);
const ddx = computeDdxDelta(v2Dx, v1Dx);

console.log('--- YENİ BİLGİ ---');
for (const it of deltaItems) console.log(`${it.kind === 'add' ? '+' : it.kind === 'remove' ? '-' : '↻'} ${it.text}`);

console.log('--- ETKİSİ ---');
for (const c of ddx.changed) {
  const up = (c.after === 'high') || (c.after === 'moderate' && c.before === 'low');
  console.log(`${c.name} ${up ? '↑' : '↓'}  (${c.before} -> ${c.after})`);
}
for (const d of ddx.added) console.log(`${d.name} (yeni, ${d.relevance})`);
for (const r of ddx.removed) console.log(`${r.name} (çıkarıldı)`);

// Beklentiler
const expect = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; } };
expect(deltaItems.some((i) => i.kind === 'add' && i.text === 'Döküntü'), 'döküntü çipi tespit edilmedi');
expect(deltaItems.some((i) => i.kind === 'add' && i.text.includes('Ferritin') && i.text.includes('1450')), 'ferritin tespit edilmedi');
expect(deltaItems.some((i) => i.kind === 'add' && i.text.includes('döküntü de görülüyor')), 'klinik öyü eklenme tespit edilmedi');
expect(ddx.changed.some((c) => c.name.startsWith('FMF') && c.before === 'high' && c.after === 'moderate'), 'FMF düşüşü tespit edilmedi');
expect(ddx.added.some((d) => d.name.startsWith('AOSD')), 'AOSD ekleme tespit edilmedi');
expect(ddx.removed.length === 0, 'çıkarılan olmamalıydı');
console.log(process.exitCode ? 'TEST BAŞARISIZ' : 'TEST BAŞARILI');
