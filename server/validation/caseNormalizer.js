// Vaka girişini doğrular, temizler ve model katmanına gönderilecek yapılandırılmış JSON'a dönüştürür.
// Frontend'den gelen Türkçe etiketler burada İngilizce semptom adlarıyla eşlenir
// (AI prompt'u İngilizce şemayla beslenir, alan değerleri doktorun dilinde kalır).
const { ApiError } = require('../middleware/errorHandler');
const { assertNoPii } = require('./piiGuard');

// Semptom çipi anahtarı -> modele gönderilecek İngilizce semptom adı
const SYMPTOM_MAP = {
  recurrent_fever: 'recurrent fever',
  abdominal_pain: 'abdominal pain',
  chest_pain: 'chest pain',
  joint_pain: 'joint pain',
  headache: 'headache',
  rash: 'rash',
  fatigue: 'fatigue',
  weight_change: 'weight change',
  night_sweats: 'night sweats',
  lymphadenopathy: 'lymph node enlargement',
  dyspnea: 'shortness of breath',
  nausea: 'nausea',
  vomiting: 'vomiting',
  diarrhea: 'diarrhea',
  myalgia: 'muscle pain',
};

const VALID_SEX = ['male', 'female', 'unspecified'];
const VALID_LAB_STATUS = ['normal', 'high', 'low'];

const MAX_CLINICAL_NOTE_LENGTH = 8000;
const MAX_LAB_ROWS = 30;

function fail(code, message, details) {
  throw new ApiError(422, code, message, details);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// İsteğe bağlı öykü alanlarını doldurur: boş bırakılan her alan açıkça "bilinmiyor"
// olarak işaretlenir; böylece AI bilgi eksikliğini "bilinmiyor" olarak görür.
function fillUnknown(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    out[key] = asTrimmedString(value) || 'bilinmiyor';
  }
  return out;
}

/**
 * Frontend'den gelen ham vaka verisini doğrular ve yapılandırılmış JSON'a çevirir.
 * @param {object} raw - Frontend'in gönderdiği ham veri
 * @returns {object} modele gönderilecek yapılandırılmış vaka nesnesi
 */
function normalizeAndValidate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('INVALID_PAYLOAD', 'Geçersiz istek biçimi.');
  }
  if (raw.caseMode !== undefined && raw.caseMode !== 'synthetic') {
    fail('SYNTHETIC_CASE_ONLY', 'Bu prototip yalnızca sentetik/anonim vaka modunu kabul eder; gerçek hasta verisi girmeyin.');
  }
  assertNoPii(raw);

  // ---- 1. Hasta temel bilgileri ----
  const patient = (raw.patient && typeof raw.patient === 'object') ? raw.patient : {};
  const ageRaw = patient.age;
  const age = ageRaw === '' || ageRaw === null || ageRaw === undefined ? null : Number(ageRaw);
  if (age === null || Number.isNaN(age) || !Number.isInteger(age) || age < 0 || age > 120) {
    fail('VALIDATION_FAILED', 'Hasta yaşı geçerli bir tam sayı olmalıdır (0-120).', { field: 'patient.age' });
  }
  const sex = asTrimmedString(patient.sex) || 'unspecified';
  if (!VALID_SEX.includes(sex)) {
    fail('VALIDATION_FAILED', 'Cinsiyet değeri geçersiz.', { field: 'patient.sex' });
  }

  // ---- 2. Semptomlar ----
  const rawSymptoms = Array.isArray(raw.symptoms) ? raw.symptoms : [];
  const symptoms = [];
  for (const s of rawSymptoms) {
    if (!s || typeof s !== 'object') continue;
    const key = asTrimmedString(s.key);
    const name = SYMPTOM_MAP[key] || asTrimmedString(s.label);
    if (!name) continue;
    const item = { name };
    const duration = asTrimmedString(s.duration);
    if (duration) item.duration = duration;
    const pattern = asTrimmedString(s.pattern);
    if (pattern) item.pattern = pattern;
    symptoms.push(item);
  }
  const otherSymptoms = asTrimmedString(raw.otherSymptoms);
  if (otherSymptoms) {
    symptoms.push({ name: `other (${otherSymptoms})` });
  }

  // ---- 3. Klinik öykü ----
  const clinicalNote = asTrimmedString(raw.clinicalNote);
  if (clinicalNote.length > MAX_CLINICAL_NOTE_LENGTH) {
    fail('CLINICAL_NOTE_TOO_LONG', `Klinik öykü ${MAX_CLINICAL_NOTE_LENGTH} karakterden uzun olamaz.`, {
      field: 'clinicalNote',
      maxLength: MAX_CLINICAL_NOTE_LENGTH,
    });
  }

  // Kritik alan kontrolü: en az bir semptom veya klinik öykü olmalı
  if (symptoms.length === 0 && !clinicalNote) {
    fail('VALIDATION_FAILED', 'Analiz için en az bir semptom seçmeli veya klinik öykü yazmalısınız.', {
      field: 'symptoms',
    });
  }

  // ---- 4. Laboratuvar sonuçları ----
  const rawLabs = Array.isArray(raw.laboratoryResults) ? raw.laboratoryResults : [];
  if (rawLabs.length > MAX_LAB_ROWS) {
    fail('VALIDATION_FAILED', `En fazla ${MAX_LAB_ROWS} laboratuvar sonucu ekleyebilirsiniz.`, { field: 'laboratoryResults' });
  }
  const laboratoryResults = [];
  for (const lab of rawLabs) {
    if (!lab || typeof lab !== 'object') continue;
    const name = asTrimmedString(lab.name);
    if (!name) continue;
    const item = { name };
    const value = asTrimmedString(lab.value);
    if (value) item.value = value;
    const unit = asTrimmedString(lab.unit);
    if (unit) item.unit = unit;
    const referenceRange = asTrimmedString(lab.referenceRange);
    if (referenceRange) item.reference_range = referenceRange;
    const status = asTrimmedString(lab.status) || 'normal';
    if (!VALID_LAB_STATUS.includes(status)) {
      fail('VALIDATION_FAILED', 'Laboratuvar durumu geçersiz.', { field: 'laboratoryResults.status' });
    }
    item.status = status;
    laboratoryResults.push(item);
  }

  // ---- 5. Semptom zamanlaması (boş alanlar "bilinmiyor" olarak işaretlenir) ----
  const symptomTiming = fillUnknown(raw.symptomTiming);

  // ---- 6. Tıbbi öykü (boş alanlar "bilinmiyor" olarak işaretlenir) ----
  const medicalHistory = fillUnknown(raw.medicalHistory);

  // ---- 7. Coğrafi / yaşam öyküsü (boş alanlar "bilinmiyor" olarak işaretlenir) ----
  const geographicHistory = fillUnknown(raw.geographicHistory);

  // ---- 8. Doktorun ön değerlendirmesi: öncelik sırasına göre sıralı tanı listesi ----
  // Satır satır girilir; "1. SLE" gibi numara önekleri temizlenir. Boşsa [] kalır.
  const doctorPreliminary = asTrimmedString(raw.preliminaryAssessment)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)\-]?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 10);

  // ---- 9. Yapılandırılmış çıktı ----
  return {
    patient: { age, sex },
    symptoms,
    symptom_timing: symptomTiming,
    clinical_note: clinicalNote,
    doctor_preliminary_assessment: doctorPreliminary,
    laboratory_results: laboratoryResults,
    medical_history: medicalHistory,
    geographic_and_lifestyle_history: geographicHistory,
  };
}

module.exports = { normalizeAndValidate, SYMPTOM_MAP };
