const assert = require('assert');
const { normalizeAndValidate } = require('./server/validation/caseNormalizer');

const base = {
  caseMode: 'synthetic',
  patient: { age: 27, sex: 'female' },
  symptoms: [{ key: 'recurrent_fever', label: 'Tekrarlayan ateş' }],
  clinicalNote: 'Sentetik vaka: tekrarlayan ateş.',
};

for (const [label, value] of [
  ['e-posta', 'İletişim: patient@example.com'],
  ['telefon', 'İletişim: +90 555 123 45 67'],
  ['TC kimlik', 'Kimlik: 12345678901'],
]) {
  assert.throws(
    () => normalizeAndValidate({ ...base, clinicalNote: value }),
    (err) => err.code === 'PII_NOT_ALLOWED' && err.status === 422,
    `${label} reddedilmedi`,
  );
}

assert.throws(
  () => normalizeAndValidate({ ...base, caseMode: 'real' }),
  (err) => err.code === 'SYNTHETIC_CASE_ONLY',
  'gerçek vaka modu reddedilmedi',
);

assert.doesNotThrow(() => normalizeAndValidate(base));
console.log('PII ve sentetik mod testleri geçti');
