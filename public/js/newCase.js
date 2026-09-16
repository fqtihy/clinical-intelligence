// "Yeni Vaka" görünümü: vaka formu, doğrulama, taslak kaydetme,
// AI analizi başlatma ve sonuç ekranına yönlendirme.
import { analyzeCase } from './api.js';
import {
  saveAnalysis, saveDraft, deleteDraft,
  createCase, getCase, getCaseVersions, getAnalysis, touchCase,
} from './store.js';
import { esc, uid } from './utils.js';
import { nextSyntheticCase } from './syntheticCases.mjs';

/** Case #1 -> "Case #001" */
function caseLabel(caseNumber) {
  return `Case #${String(caseNumber || 0).padStart(3, '0')}`;
}

// Yaygın semptom çipleri (liste sınırlayıcı değildir; "Diğer semptomlar" serbest alanı vardır).
const SYMPTOMS = [
  { key: 'recurrent_fever', label: 'Tekrarlayan ateş' },
  { key: 'abdominal_pain', label: 'Karın ağrısı' },
  { key: 'chest_pain', label: 'Göğüs ağrısı' },
  { key: 'joint_pain', label: 'Eklem ağrısı' },
  { key: 'headache', label: 'Baş ağrısı' },
  { key: 'rash', label: 'Döküntü' },
  { key: 'fatigue', label: 'Halsizlik' },
  { key: 'weight_change', label: 'Kilo değişimi' },
  { key: 'night_sweats', label: 'Gece terlemesi' },
  { key: 'lymphadenopathy', label: 'Lenf bezi büyümesi' },
  { key: 'dyspnea', label: 'Nefes darlığı' },
  { key: 'nausea', label: 'Bulantı' },
  { key: 'vomiting', label: 'Kusma' },
  { key: 'diarrhea', label: 'İshal' },
  { key: 'myalgia', label: 'Kas ağrısı' },
];

const MAX_NOTE_LENGTH = 8000;

function emptyPayload() {
  return {
    patient: { age: '', sex: 'unspecified' },
    symptoms: [],
    otherSymptoms: '',
    symptomTiming: {},
    clinicalNote: '',
    laboratoryResults: [],
    medicalHistory: {},
    geographicHistory: {},
  };
}

export function renderNewCase(appEl, options = {}) {
  // Yeniden analiz akışı: sonuç ekranından gelen veri ve önceki analiz kimliği.
  // Kaynak analiz bir vakaya (caseId) aitse form "yeni bilgi ekle" (vN+1) modunda açılır.
  const reanalyzeFromId = options.reanalyzeFromId || null;
  const data = options.data || emptyPayload();

  let caseCtx = null;
  if (reanalyzeFromId) {
    const prevAnalysis = getAnalysis(reanalyzeFromId);
    if (prevAnalysis && prevAnalysis.caseId) {
      const c = getCase(prevAnalysis.caseId);
      if (c) {
        caseCtx = {
          caseId: c.id,
          caseNumber: c.caseNumber,
          version: getCaseVersions(c.id).length + 1,
        };
      }
    }
  }

  // Önceki görünümden kalma açık onay penceresi varsa temizle
  document.querySelector('.modal-overlay')?.remove();

  appEl.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${caseCtx ? `${caseLabel(caseCtx.caseNumber)} — Yeni Bilgi Ekle (v${caseCtx.version})` : 'Yeni Vaka'}</h1>
      <p class="page-subtitle">${caseCtx
        ? `Bu vakanın güncel sürümü v${caseCtx.version - 1}. Eklediğiniz yeni bilgiyle vaka v${caseCtx.version} olarak yeniden analiz edilir ve önceki sürümle karşılaştırılır.`
        : 'Yalnızca sentetik/anonim vaka bilgisi girin; gerçek hasta verisi kabul edilmez. Sistem analiz edip değerlendirilebilecek olasılıkları sunar.'}</p>
      ${!caseCtx ? '<button type="button" class="btn btn-secondary" id="load-demo-btn">Sentetik örnek vakayı yükle</button>' : ''}
    </div>
    <div id="form-alert"></div>
    <form id="case-form" novalidate>
      ${caseCtx ? sectionChangeNote(caseCtx) : ''}
      ${sectionPatient(data)}
      ${sectionSymptoms(data)}
      ${sectionTiming(data)}
      ${sectionClinicalNote(data)}
      ${sectionPreliminary(data)}
      ${sectionLabs(data)}
      ${sectionMedicalHistory(data)}
      ${sectionGeographic(data)}
      <div class="form-section" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
        <button type="submit" class="btn btn-primary btn-lg" id="analyze-btn">${caseCtx ? `YENİ BİLGİYLE YENİDEN ANALİZ ET (v${caseCtx.version})` : 'VAKAYI ANALİZ ET'}</button>
        ${caseCtx ? '' : '<button type="button" class="btn btn-secondary" id="save-draft-btn">Taslağı Kaydet</button>'}
        <button type="button" class="btn btn-danger-ghost" id="clear-draft-btn" ${options.draftId ? '' : 'hidden'}>Taslağı Sil</button>
        <span class="hint" id="analyze-status" style="font-size:13px;"></span>
      </div>
    </form>`;

  const formEl = appEl.querySelector('#case-form');
  const draftId = options.draftId || null;
  let analyzing = false;

  // Yeni bilgi ekleme modunda taslak silme butonu da görünmez.
  const clearBtn0 = formEl.querySelector('#clear-draft-btn');
  if (clearBtn0 && caseCtx) clearBtn0.hidden = true;

  setupChips(formEl, data.symptoms || []);
  setupLabs(formEl, data.laboratoryResults || []);
  setupEvents(formEl, { draftId, reanalyzeFromId });

  async function runAnalysis(payload) {
    analyzing = true;
    const btn = formEl.querySelector('#analyze-btn');
    const status = formEl.querySelector('#analyze-status');
    btn.disabled = true;
    status.textContent = 'Analiz ediliyor…';

    try {
      const response = await analyzeCase(payload);

      // Case history: mevcut vakaya yeni sürüm olarak ekle ya da yeni vaka aç.
      let caseInfo;
      if (caseCtx) {
        caseInfo = {
          caseId: caseCtx.caseId,
          caseNumber: caseCtx.caseNumber,
          version: caseCtx.version,
          changeNote: changeNoteValue(formEl),
        };
        touchCase(caseCtx.caseId);
      } else {
        const c = createCase();
        touchCase(c.id);
        caseInfo = {
          caseId: c.id,
          caseNumber: c.caseNumber,
          version: 1,
          changeNote: changeNoteValue(formEl),
        };
      }

      const analysis = {
        id: uid(),
        analyzedAt: new Date().toISOString(),
        model: response.data.model || 'unknown',
        payload,
        case: response.data.case,
        result: response.data.result,
        ...caseInfo,
      };
      saveAnalysis(analysis);
      if (draftId) deleteDraft(draftId);
      sessionStorage.removeItem('ci.reanalyzeFrom');

      const prevQuery = reanalyzeFromId ? `?prev=${encodeURIComponent(reanalyzeFromId)}` : '';
      window.location.hash = `#/results/${analysis.id}${prevQuery}`;
    } catch (err) {
      analyzing = false;
      btn.disabled = false;
      status.textContent = '';
      showAlert(appEl, [err.message]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function submitHandler(ev) {
    ev.preventDefault();
    if (analyzing) return;

    const payload = collectPayload(formEl);
    const errors = validatePayload(payload);
    if (caseCtx) {
      const note = changeNoteValue(formEl);
      if (!note) errors.push({ field: 'changeNote', message: 'Yeni sürüm için eklenen bilgiyi/notu yazmalısınız.' });
    }
    showAlert(appEl, errors);
    if (errors.length) {
      formEl.querySelector('#analyze-btn').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Boş bırakılan isteğe bağlı alanlar: kullanıcıya göster ve onay iste.
    // Onaylanınca alanlar backend'de "bilinmiyor" olarak işaretlenir.
    const emptyLabels = collectEmptyFieldLabels(payload);
    if (emptyLabels.length) {
      showConfirmModal(emptyLabels, () => runAnalysis(payload));
      return;
    }

    runAnalysis(payload);
  }

  formEl.addEventListener('submit', submitHandler);
  formEl.querySelector('#save-draft-btn').addEventListener('click', () => {
    const payload = collectPayload(formEl);
    saveDraft({
      id: draftId || uid(),
      updatedAt: new Date().toISOString(),
      data: payload,
    });
    const status = formEl.querySelector('#analyze-status');
    status.textContent = 'Taslak kaydedildi.';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });

  const clearBtn = formEl.querySelector('#clear-draft-btn');
  if (clearBtn && !clearBtn.hidden) {
    clearBtn.addEventListener('click', () => {
      if (draftId) deleteDraft(draftId);
      window.location.hash = '#/new-case';
    });
  }
}

/* ---------------- Boş alan onayı ---------------- */

// İsteğe bağlı alanların kullanıcı dostu etiketleri: [bölüm, alan, etiket]
const OPTIONAL_FIELD_LABELS = [
  ['symptomTiming', 'onset', 'Başlangıç zamanı'],
  ['symptomTiming', 'duration', 'Süre'],
  ['symptomTiming', 'recurrent', 'Tekrarlıyor mu?'],
  ['symptomTiming', 'episodic', 'Ataklar halinde mi?'],
  ['symptomTiming', 'episodeDuration', 'Atakların yaklaşık süresi'],
  ['symptomTiming', 'resolution', 'Ataklar arasında tamamen düzelme'],
  ['medicalHistory', 'previousIllnesses', 'Önceki hastalıklar'],
  ['medicalHistory', 'medications', 'Kullanılan ilaçlar'],
  ['medicalHistory', 'familyHistory', 'Aile öyküsü'],
  ['medicalHistory', 'previousDiagnoses', 'Önceden konulan tanılar'],
  ['medicalHistory', 'previousTreatments', 'Önceden uygulanan tedaviler'],
  ['medicalHistory', 'treatmentResponse', 'Tedaviye yanıt'],
  ['geographicHistory', 'country', 'Yaşadığı ülke / bölge'],
  ['geographicHistory', 'travel', 'Seyahat geçmişi'],
  ['geographicHistory', 'migration', 'Göç geçmişi'],
  ['geographicHistory', 'endemicExposure', 'Endemik bölge maruziyeti'],
  ['geographicHistory', 'animalContact', 'Hayvan teması'],
  ['geographicHistory', 'occupationalExposure', 'İş / meslek maruziyeti'],
];

/** Formda boş bırakılmış isteğe bağlı alanların etiketlerini toplar. */
function collectEmptyFieldLabels(payload) {
  const empty = [];
  for (const [section, key, label] of OPTIONAL_FIELD_LABELS) {
    const value = payload[section]?.[key];
    if (!value || !String(value).trim()) empty.push(label);
  }
  if (!payload.otherSymptoms || !payload.otherSymptoms.trim()) empty.push('Diğer semptomlar');
  if (!payload.clinicalNote || !payload.clinicalNote.trim()) empty.push('Klinik öykü');
  if (!payload.preliminaryAssessment || !payload.preliminaryAssessment.trim()) empty.push('Doktorun ön değerlendirmesi');
  return empty;
}

/**
 * Boş bırakılan alanları listeleyen onay penceresi.
 * "Analiz Et" -> onConfirm çağrılır; "Forma Dön" / dış tıklama / Esc -> kapanır.
 */
function showConfirmModal(emptyLabels, onConfirm) {
  document.querySelector('.modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'confirm-modal-title');
  overlay.innerHTML = `
    <div class="modal" role="document">
      <h3 class="modal-title" id="confirm-modal-title">Boş bırakılan alanlar</h3>
      <p class="modal-text">
        Şu alanlar boş bırakıldı. Onaylarsanız bu alanlar <strong>"bilinmiyor"</strong>
        olarak işaretlenip analize gönderilecek.
      </p>
      <ul class="modal-list">
        ${emptyLabels.map((label) => `<li>${esc(label)}</li>`).join('')}
      </ul>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-cancel>Forma Dön</button>
        <button type="button" class="btn btn-primary" data-modal-confirm>Analiz Et</button>
      </div>
    </div>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') close();
  };

  overlay.querySelector('[data-modal-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-modal-confirm]').addEventListener('click', () => {
    close();
    onConfirm();
  });
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}

/* ---------------- Bölümler ---------------- */

function sectionPatient(data) {
  return `
    <section class="form-section">
      <h2>Hasta Temel Bilgileri</h2>
      <p class="section-desc">Prototip, hasta adı veya TC kimlik gibi tanımlayıcı bilgi istemez.</p>
      <div class="form-grid">
        <div class="field" data-field="age">
          <label for="age">Yaş</label>
          <input type="number" id="age" min="0" max="120" inputmode="numeric" placeholder="ör. 24" value="${esc(data.patient?.age ?? '')}">
          <span class="field-error">Yaş girmelisiniz (0-120).</span>
        </div>
        <div class="field" data-field="sex">
          <label for="sex">Cinsiyet</label>
          <select id="sex">
            <option value="unspecified" ${data.patient?.sex === 'unspecified' ? 'selected' : ''}>Belirtilmemiş</option>
            <option value="female" ${data.patient?.sex === 'female' ? 'selected' : ''}>Kadın</option>
            <option value="male" ${data.patient?.sex === 'male' ? 'selected' : ''}>Erkek</option>
          </select>
        </div>
      </div>
    </section>`;
}

function sectionSymptoms(data) {
  const chips = SYMPTOMS.map((s) => {
    const selected = (data.symptoms || []).some((x) => x.key === s.key);
    return `<button type="button" class="chip ${selected ? 'selected' : ''}" data-key="${s.key}" aria-pressed="${selected}">
      <span class="chip-dot"></span>${esc(s.label)}
    </button>`;
  }).join('');

  return `
    <section class="form-section">
      <h2>Semptomlar</h2>
      <p class="section-desc">İlgili semptomları seçin; liste sınırlayıcı değildir.</p>
      <div class="chip-group" id="symptom-chips">${chips}</div>
      <div class="field" style="margin-top:16px;">
        <label for="otherSymptoms">Diğer semptomlar</label>
        <input type="text" id="otherSymptoms" placeholder="ör. sabah tutukluğu, ağız ülseri" value="${esc(data.otherSymptoms || '')}">
        <span class="hint">Listede olmayan semptomları serbest metin olarak yazabilirsiniz.</span>
      </div>
    </section>`;
}

function sectionTiming(data) {
  const t = data.symptomTiming || {};
  return `
    <section class="form-section">
      <h2>Semptom Zamanlaması</h2>
      <p class="section-desc">Semptomların zaman içindeki seyri, özellikle ataklı hastalıkların ayırıcı tanısında önemlidir.</p>
      <div class="form-grid">
        <div class="field">
          <label for="timing-onset">Başlangıç zamanı</label>
          <input type="text" id="timing-onset" placeholder="ör. 2 yıl önce" value="${esc(t.onset || '')}">
        </div>
        <div class="field">
          <label for="timing-duration">Süre</label>
          <input type="text" id="timing-duration" placeholder="ör. 2 yıl" value="${esc(t.duration || '')}">
        </div>
        <div class="field">
          <label for="timing-recurrent">Tekrarlıyor mu?</label>
          <select id="timing-recurrent">
            <option value="">Belirtilmedi</option>
            <option value="yes" ${t.recurrent === 'yes' ? 'selected' : ''}>Evet</option>
            <option value="no" ${t.recurrent === 'no' ? 'selected' : ''}>Hayır</option>
          </select>
        </div>
        <div class="field">
          <label for="timing-episodic">Ataklar halinde mi?</label>
          <select id="timing-episodic">
            <option value="">Belirtilmedi</option>
            <option value="yes" ${t.episodic === 'yes' ? 'selected' : ''}>Evet</option>
            <option value="no" ${t.episodic === 'no' ? 'selected' : ''}>Hayır</option>
          </select>
        </div>
        <div class="field">
          <label for="timing-episode-duration">Atakların yaklaşık süresi</label>
          <input type="text" id="timing-episode-duration" placeholder="ör. 3-5 gün" value="${esc(t.episodeDuration || '')}">
        </div>
        <div class="field">
          <label for="timing-resolution">Ataklar arasında tamamen düzelme oluyor mu?</label>
          <select id="timing-resolution">
            <option value="">Belirtilmedi</option>
            <option value="yes" ${t.resolution === 'yes' ? 'selected' : ''}>Evet</option>
            <option value="no" ${t.resolution === 'no' ? 'selected' : ''}>Hayır</option>
            <option value="unknown" ${t.resolution === 'unknown' ? 'selected' : ''}>Bilinmiyor</option>
          </select>
        </div>
      </div>
    </section>`;
}

function sectionClinicalNote(data) {
  return `
    <section class="form-section">
      <h2>Klinik Öykü</h2>
      <p class="section-desc">Serbest metin olarak ayrıntılı öykü yazabilirsiniz. (en fazla ${MAX_NOTE_LENGTH.toLocaleString('tr-TR')} karakter)</p>
      <div class="field" data-field="clinicalNote">
        <textarea id="clinicalNote" rows="6" maxlength="${MAX_NOTE_LENGTH}" placeholder='ör. "24 yaşında erkek. Son 2 yıldır dönemsel ateş atakları var…'>${esc(data.clinicalNote || '')}</textarea>
      </div>
    </section>`;
}

function sectionPreliminary(data) {
  return `
    <section class="form-section">
      <h2>Doktorun Ön Değerlendirmesi</h2>
      <p class="section-desc">İkinci görüş motoru: Analizden <strong>önce</strong> kendi ön değerlendirmenizi girin.
      AI vakayı bağımsız analiz eder; hipotezlerinizi kanıtlarla test eder (Destekleniyor / Sorgulanıyor /
      Yeniden Değerlendirin), düşünmediğiniz ihtimalleri arar ve sıralamanızla karşılaştırır.
      Öncelik sırasına göre, her satıra bir tanı yazın (ör. 1. sıra en güçlü düşünceniz).</p>
      <div class="field" data-field="preliminaryAssessment">
        <textarea id="preliminaryAssessment" rows="4" placeholder='ör. "Sistemik Lupus Eritematozus (SLE)" — her satıra bir tanı'>${esc(data.preliminaryAssessment || '')}</textarea>
      </div>
    </section>`;
}

function sectionLabs(data) {
  const rows = (data.laboratoryResults && data.laboratoryResults.length)
    ? data.laboratoryResults.map((lab) => labRow(lab)).join('')
    : labRow(null);
  return `
    <section class="form-section">
      <h2>Laboratuvar / Testler</h2>
      <p class="section-desc">İlk prototipte manuel giriş. Test adı zorunlu; diğer alanlar isteğe bağlıdır.</p>
      <div id="lab-rows">${rows}</div>
      <button type="button" id="add-lab" class="btn btn-secondary" style="margin-top:4px;">+ Test Ekle</button>
    </section>`;
}

function labRow(lab) {
  const status = lab?.status || 'normal';
  return `
    <div class="lab-row">
      <div class="field"><label>Test adı</label><input type="text" class="lab-name" placeholder="ör. CRP" value="${esc(lab?.name || '')}"></div>
      <div class="field"><label>Değer</label><input type="text" class="lab-value" placeholder="ör. 20" value="${esc(lab?.value || '')}"></div>
      <div class="field"><label>Birim</label><input type="text" class="lab-unit" placeholder="ör. mg/L" value="${esc(lab?.unit || '')}"></div>
      <div class="field"><label>Referans aralığı</label><input type="text" class="lab-ref" placeholder="ör. 0-5" value="${esc(lab?.referenceRange || '')}"></div>
      <div class="field"><label>Durum</label>
        <select class="lab-status">
          <option value="normal" ${status === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="high" ${status === 'high' ? 'selected' : ''}>Yüksek</option>
          <option value="low" ${status === 'low' ? 'selected' : ''}>Düşük</option>
        </select>
      </div>
      <button type="button" class="remove-lab" title="Satırı kaldır" aria-label="Satırı kaldır">✕</button>
    </div>`;
}

function sectionMedicalHistory(data) {
  const h = data.medicalHistory || {};
  return `
    <section class="form-section">
      <h2>Tıbbi Öykü</h2>
      <div class="form-grid">
        ${textField('Önceki hastalıklar', 'mh-previous-illnesses', h.previousIllnesses, 'ör. astım, hipertansiyon')}
        ${textField('Kullanılan ilaçlar', 'mh-medications', h.medications, 'ör. metformin 2x500mg')}
        ${textField('Aile öyküsü', 'mh-family', h.familyHistory, 'ör. ailede otoimmün hastalık')}
        ${textField('Önceden konulan tanılar', 'mh-diagnoses', h.previousDiagnoses, '')}
        ${textField('Önceden uygulanan tedaviler', 'mh-treatments', h.previousTreatments, '')}
        ${textField('Tedaviye yanıt', 'mh-response', h.treatmentResponse, 'ör. kısmi, yanıt yok')}
      </div>
    </section>`;
}

function sectionGeographic(data) {
  const g = data.geographicHistory || {};
  return `
    <section class="form-section">
      <h2>Coğrafi / Yaşam Öyküsü</h2>
      <p class="section-desc">Bu bilgiler, belirli bölgelerde daha sık görülen hastalıkların değerlendirilmesinde önemli olabilir.</p>
      <div class="form-grid">
        ${textField('Yaşadığı ülke / bölge', 'geo-country', g.country, '')}
        ${textField('Seyahat geçmişi', 'geo-travel', g.travel, 'ör. son 6 ay: Güneydoğu Asya')}
        ${textField('Göç geçmişi', 'geo-migration', g.migration, '')}
        ${textField('Endemik bölge maruziyeti', 'geo-endemic', g.endemicExposure, '')}
        ${textField('Hayvan teması', 'geo-animals', g.animalContact, 'ör. kene, çiğ süt, kuş')}
        ${textField('İş / meslek maruziyeti', 'geo-occupation', g.occupationalExposure, '')}
      </div>
    </section>`;
}

/* ---------------- Yeni bilgi (sürüm) bölümü ---------------- */

function sectionChangeNote(caseCtx) {
  return `
    <section class="form-section case-note-section">
      <h2>Bu sürümde eklenen yeni bilgi <span class="version-pill">v${caseCtx.version}</span></h2>
      <p class="section-desc">Doktor/kullanıcı tarafından eklenen yeni bulgu veya bilgi. Analiz bu bilgiyle birlikte yeniden yapılır; sonuç önceki sürümle (v${caseCtx.version - 1}) karşılaştırılarak gösterilir.</p>
      <div class="field" data-field="changeNote">
        <label for="changeNote">Eklenen yeni bilgi / not</label>
        <textarea id="changeNote" rows="3" placeholder="ör. Ataklar sırasında döküntü de görülüyor"></textarea>
      </div>
    </section>`;
}

function changeNoteValue(formEl) {
  return formEl.querySelector('#changeNote')?.value?.trim() || '';
}

function textField(label, id, value, placeholder) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input type="text" id="${id}" placeholder="${esc(placeholder)}" value="${esc(value || '')}">
    </div>`;
}

/* ---------------- Etkileşimler ---------------- */

function setupChips(formEl, selected) {
  const selectedKeys = new Set((selected || []).map((s) => s.key));
  formEl.querySelectorAll('.chip').forEach((chip) => {
    if (selectedKeys.has(chip.dataset.key)) {
      chip.classList.add('selected');
      chip.setAttribute('aria-pressed', 'true');
    }
    chip.addEventListener('click', () => {
      const on = chip.classList.toggle('selected');
      chip.setAttribute('aria-pressed', String(on));
    });
  });
}

function setupLabs(formEl, existing) {
  const container = formEl.querySelector('#lab-rows');
  container.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.remove-lab');
    if (!btn) return;
    const row = btn.closest('.lab-row');
    if (container.querySelectorAll('.lab-row').length === 1) {
      // Son satır silinemez; boşaltılır.
      row.querySelectorAll('input').forEach((input) => { input.value = ''; });
      row.querySelector('.lab-status').value = 'normal';
      return;
    }
    row.remove();
  });
  formEl.querySelector('#add-lab').addEventListener('click', () => {
    container.insertAdjacentHTML('beforeend', labRow(null));
  });
}

function setupEvents(formEl) {
  const demoBtn = formEl.parentElement.querySelector('#load-demo-btn');
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      const d = nextSyntheticCase();
      formEl.querySelector('#age').value = d.patient.age;
      formEl.querySelector('#sex').value = d.patient.sex;
      formEl.querySelector('#otherSymptoms').value = d.otherSymptoms;
      formEl.querySelector('#clinicalNote').value = d.clinicalNote;
      formEl.querySelector('#preliminaryAssessment').value = d.preliminaryAssessment;
      Object.entries({ onset: '#timing-onset', duration: '#timing-duration', recurrent: '#timing-recurrent', episodic: '#timing-episodic', episodeDuration: '#timing-episode-duration', resolution: '#timing-resolution' })
        .forEach(([key, selector]) => { formEl.querySelector(selector).value = d.symptomTiming[key]; });
      formEl.querySelectorAll('.chip').forEach((chip) => {
        const selected = d.symptoms.some((symptom) => symptom.key === chip.dataset.key);
        chip.classList.toggle('selected', selected);
        chip.setAttribute('aria-pressed', String(selected));
      });
      const lab = formEl.querySelector('.lab-row');
      const values = ['name', 'value', 'unit', 'referenceRange'];
      values.forEach((key) => lab.querySelector(`.lab-${key === 'referenceRange' ? 'ref' : key}`).value = d.laboratoryResults[0][key] || '');
      lab.querySelector('.lab-status').value = d.laboratoryResults[0].status;
      formEl.querySelector('#analyze-status').textContent = `${d.typeLabel} sentetik vaka yüklendi; göndermeden önce gözden geçirin.`;
    });
  }
  const changeNote = formEl.querySelector('#changeNote');
  if (changeNote) {
    changeNote.addEventListener('input', () => {
      changeNote.closest('[data-field="changeNote"]')?.classList.remove('invalid');
    });
  }
  const note = formEl.querySelector('#clinicalNote');
  note.addEventListener('input', () => {
    const wrapper = note.closest('[data-field="clinicalNote"]');
    if (wrapper) wrapper.classList.remove('invalid');
  });
  formEl.querySelectorAll('.chip, #otherSymptoms').forEach((el) => {
    el.addEventListener('click', () => {
      const chips = formEl.querySelector('.chip-group');
      if (chips) chips.classList.remove('invalid');
    });
  });
  const age = formEl.querySelector('#age');
  age.addEventListener('input', () => age.closest('[data-field="age"]').classList.remove('invalid'));
}

/* ---------------- Toplama ve doğrulama ---------------- */

function collectPayload(formEl) {
  const value = (sel) => formEl.querySelector(sel)?.value?.trim() ?? '';

  const symptoms = [];
  formEl.querySelectorAll('.chip.selected').forEach((chip) => {
    symptoms.push({ key: chip.dataset.key, label: chip.textContent.trim() });
  });

  const laboratoryResults = [];
  formEl.querySelectorAll('.lab-row').forEach((row) => {
    laboratoryResults.push({
      name: row.querySelector('.lab-name').value.trim(),
      value: row.querySelector('.lab-value').value.trim(),
      unit: row.querySelector('.lab-unit').value.trim(),
      referenceRange: row.querySelector('.lab-ref').value.trim(),
      status: row.querySelector('.lab-status').value,
    });
  });

  return {
    caseMode: 'synthetic',
    patient: { age: value('#age'), sex: value('#sex') || 'unspecified' },
    symptoms,
    otherSymptoms: value('#otherSymptoms'),
    symptomTiming: {
      onset: value('#timing-onset'),
      duration: value('#timing-duration'),
      recurrent: value('#timing-recurrent'),
      episodic: value('#timing-episodic'),
      episodeDuration: value('#timing-episode-duration'),
      resolution: value('#timing-resolution'),
    },
    clinicalNote: value('#clinicalNote'),
    preliminaryAssessment: value('#preliminaryAssessment'),
    laboratoryResults,
    medicalHistory: {
      previousIllnesses: value('#mh-previous-illnesses'),
      medications: value('#mh-medications'),
      familyHistory: value('#mh-family'),
      previousDiagnoses: value('#mh-diagnoses'),
      previousTreatments: value('#mh-treatments'),
      treatmentResponse: value('#mh-response'),
    },
    geographicHistory: {
      country: value('#geo-country'),
      travel: value('#geo-travel'),
      migration: value('#geo-migration'),
      endemicExposure: value('#geo-endemic'),
      animalContact: value('#geo-animals'),
      occupationalExposure: value('#geo-occupation'),
    },
  };
}

function validatePayload(payload) {
  const errors = [];
  const age = Number(payload.patient.age);
  if (!payload.patient.age || !Number.isInteger(age) || age < 0 || age > 120) {
    errors.push({ field: 'age', message: 'Yaş girmelisiniz (0-120).' });
  }
  const hasSymptom = payload.symptoms.length > 0 || Boolean(payload.otherSymptoms);
  const hasNote = Boolean(payload.clinicalNote);
  if (!hasSymptom && !hasNote) {
    errors.push({ field: 'symptoms', message: 'Analiz için en az bir semptom seçmeli veya klinik öykü yazmalısınız.' });
  }
  if (payload.clinicalNote.length > MAX_NOTE_LENGTH) {
    errors.push({ field: 'clinicalNote', message: `Klinik öykü ${MAX_NOTE_LENGTH.toLocaleString('tr-TR')} karakterden uzun olamaz.` });
  }
  return errors;
}

function showAlert(appEl, errors) {
  const alertEl = appEl.querySelector('#form-alert');
  if (!errors.length) {
    alertEl.innerHTML = '';
    return;
  }
  const messages = errors.map((e) => e.message);
  alertEl.innerHTML = `<div class="alert alert-error">${messages.map(esc).join('<br>')}</div>`;

  // İlgili alanlara .invalid işaretini koy
  appEl.querySelectorAll('.field.invalid').forEach((el) => el.classList.remove('invalid'));
  errors.forEach((e) => {
    if (e.field === 'age') appEl.querySelector('[data-field="age"]')?.classList.add('invalid');
    if (e.field === 'symptoms') appEl.querySelector('#symptom-chips')?.classList.add('invalid');
    if (e.field === 'clinicalNote') appEl.querySelector('[data-field="clinicalNote"]')?.classList.add('invalid');
    if (e.field === 'changeNote') appEl.querySelector('[data-field="changeNote"]')?.classList.add('invalid');
  });
}
