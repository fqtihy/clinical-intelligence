import assert from 'node:assert/strict';
import { syntheticCaseCatalog, syntheticCaseCount, nextSyntheticCase } from './public/js/syntheticCases.mjs';

const catalog = syntheticCaseCatalog();
assert.equal(catalog.length, syntheticCaseCount());
assert.ok(catalog.length >= 30, 'havuz en az 30 vaka içermeli');
const typeCounts = new Map();
for (const item of catalog) typeCounts.set(item.typeLabel, (typeCounts.get(item.typeLabel) || 0) + 1);
for (const type of ['Tam vaka', 'Eksik bilgi', 'Benzer ayırıcı', 'Çelişkili veri', 'Güvenlik / kırmızı bayrak', 'Kapsam dışı']) {
  assert.ok((typeCounts.get(type) || 0) >= 3, `${type}: yeterli vaka yok`);
}

const required = ['id', 'typeLabel', 'patient', 'symptoms', 'otherSymptoms', 'symptomTiming', 'clinicalNote', 'preliminaryAssessment', 'laboratoryResults', 'medicalHistory', 'geographicHistory', 'expected'];
const expectedKeys = ['confidence', 'missingInfo', 'safety', 'audit', 'outOfScope', 'outcome'];
const payloadKeys = new Set(['patient', 'symptoms', 'otherSymptoms', 'symptomTiming', 'clinicalNote', 'preliminaryAssessment', 'laboratoryResults', 'medicalHistory', 'geographicHistory']);
const ids = new Set();
for (const item of catalog) {
  for (const key of required) assert.ok(key in item, `${item.id}: ${key} eksik`);
  assert.ok(!ids.has(item.id), `${item.id}: id tekrarı`);
  ids.add(item.id);
  for (const key of expectedKeys) assert.ok(key in item.expected, `${item.id}: expected.${key} eksik`);
  assert.ok(['low', 'medium', 'high'].includes(item.expected.confidence), `${item.id}: confidence geçersiz`);
  for (const key of expectedKeys.slice(1, 5)) assert.equal(typeof item.expected[key], 'boolean', `${item.id}: expected.${key} boolean olmalı`);
  assert.ok(typeof item.expected.outcome === 'string' && item.expected.outcome.length > 10, `${item.id}: outcome eksik`);
  const formPayload = Object.fromEntries(Object.entries(item).filter(([key]) => payloadKeys.has(key)));
  assert.ok(!('expected' in formPayload), `${item.id}: metadata payload alanına sızdı`);
  assert.ok(Number(item.patient.age) >= 0 && Number(item.patient.age) <= 120, `${item.id}: yaş geçersiz`);
  assert.ok(Array.isArray(item.symptoms), `${item.id}: semptom listesi geçersiz`);
  const text = JSON.stringify(item);
  assert.ok(!/@|(?<!\d)\d{10,11}(?!\d)/u.test(text), `${item.id}: PII içeriyor`);
}

const firstRound = new Set();
for (let i = 0; i < catalog.length; i += 1) firstRound.add(nextSyntheticCase().id);
assert.equal(firstRound.size, catalog.length, 'havuz tükenmeden vaka tekrarı oldu');
const secondRound = new Set();
for (let i = 0; i < catalog.length; i += 1) secondRound.add(nextSyntheticCase().id);
assert.equal(secondRound.size, catalog.length, 'ikinci tam turda vaka tekrarı oldu');
assert.ok([...secondRound].every((id) => ids.has(id)), 'havuz dışında vaka üretildi');
const outOfScopeCount = catalog.filter((item) => item.expected.outOfScope).length;
assert.ok(outOfScopeCount >= 3, 'kapsam dışı senaryo dengesi yetersiz');
console.log(`Sentetik vaka havuzu testleri geçti (${catalog.length} vaka)`);
