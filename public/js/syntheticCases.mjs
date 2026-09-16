// PII içermeyen, eğitim/test amaçlı sentetik vaka havuzu.
// typeLabel klinik tanıyı ifşa etmeden test amacını belirtir.
const CASES = [
  {
    id: 'complete-periodic-fever', typeLabel: 'Tam vaka',
    expected: { confidence: 'high', missingInfo: false, safety: false, audit: false, outOfScope: false, outcome: 'Örüntüyü ve inflamasyon bulgularını özetle' },
    patient: { age: '27', sex: 'female' }, symptoms: [{ key: 'recurrent_fever', label: 'Tekrarlayan ateş' }, { key: 'abdominal_pain', label: 'Karın ağrısı' }],
    otherSymptoms: '', symptomTiming: { onset: '8 ay önce', duration: '2-3 gün', recurrent: 'yes', episodic: 'yes', episodeDuration: '2-3 gün', resolution: 'yes' },
    clinicalNote: 'Son 8 aydır 3-4 haftada bir tekrarlayan ateş ve karın ağrısı atakları; ataklar arasında tamamen düzeliyor.',
    preliminaryAssessment: '1. Tekrarlayan ateş sendromu', laboratoryResults: [{ name: 'CRP', value: '48', unit: 'mg/L', referenceRange: '0-5', status: 'high' }],
    medicalHistory: { previousIllnesses: 'Yok', medications: 'Yok' }, geographicHistory: { country: 'Türkiye' },
  },
  {
    id: 'complete-inflammatory-joint', typeLabel: 'Tam vaka',
    expected: { confidence: 'high', missingInfo: false, safety: false, audit: false, outOfScope: false, outcome: 'İnflamatuvar eklem süreci için yönlendirme öner' },
    patient: { age: '42', sex: 'male' }, symptoms: [{ key: 'joint_pain', label: 'Eklem ağrısı' }, { key: 'fatigue', label: 'Halsizlik' }],
    otherSymptoms: '', symptomTiming: { onset: '5 ay önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Sabahları belirginleşen, el ve diz eklemlerinde şişlik ve ağrı; son aylarda yorgunluk eşlik ediyor.',
    preliminaryAssessment: '1. İnflamatuvar eklem hastalığı', laboratoryResults: [{ name: 'ESR', value: '62', unit: 'mm/s', referenceRange: '0-20', status: 'high' }, { name: 'Hemoglobin', value: '11.2', unit: 'g/dL', referenceRange: '13-17', status: 'low' }],
    medicalHistory: { previousIllnesses: 'Mevsimsel alerji', medications: 'Yok' }, geographicHistory: { country: 'Türkiye', occupationalExposure: 'Masa başı çalışma' },
  },
  {
    id: 'incomplete-headache', typeLabel: 'Eksik bilgi',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Baş ağrısının alarm özelliklerini ve zaman çizelgesini sor' },
    patient: { age: '31', sex: 'female' }, symptoms: [{ key: 'headache', label: 'Baş ağrısı' }],
    otherSymptoms: '', symptomTiming: { onset: 'Yeni başladı', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Aralıklı baş ağrısı tarifliyor; tetikleyiciler ve eşlik eden bulgular henüz net değil.',
    preliminaryAssessment: '1. Baş ağrısı sendromu', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'incomplete-weight-loss', typeLabel: 'Eksik bilgi',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Kilo kaybını nicelendir ve sistem taramasını tamamla' },
    patient: { age: '58', sex: 'male' }, symptoms: [{ key: 'weight_change', label: 'Kilo değişimi' }, { key: 'fatigue', label: 'Halsizlik' }],
    otherSymptoms: '', symptomTiming: { onset: 'Son aylarda', duration: '', recurrent: 'no', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'İstemsiz kilo kaybı ve halsizlik bildirilmiş; miktar, süre ve eşlik eden sistem bulguları eksik.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Hemoglobin', value: '', unit: 'g/dL', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'borderline-fever-rash', typeLabel: 'Benzer ayırıcı',
    expected: { confidence: 'medium', missingInfo: false, safety: false, audit: true, outOfScope: false, outcome: 'Viral ve inflamatuvar olasılıkları ayırmak için veri iste' },
    patient: { age: '19', sex: 'female' }, symptoms: [{ key: 'recurrent_fever', label: 'Tekrarlayan ateş' }, { key: 'rash', label: 'Döküntü' }, { key: 'joint_pain', label: 'Eklem ağrısı' }],
    otherSymptoms: 'boğaz ağrısı', symptomTiming: { onset: '3 hafta önce', duration: '1-2 gün', recurrent: 'yes', episodic: 'yes', episodeDuration: '1 gün', resolution: 'yes' },
    clinicalNote: 'Kısa ateş atakları, geçici döküntü ve eklem ağrısı birlikte görülüyor; örüntü tam belirgin değil.',
    preliminaryAssessment: '1. Viral süreç\n2. İnflamatuvar süreç', laboratoryResults: [{ name: 'CRP', value: '12', unit: 'mg/L', referenceRange: '0-5', status: 'high' }],
    medicalHistory: { previousIllnesses: 'Yok' }, geographicHistory: { country: 'Türkiye' },
  },
  {
    id: 'borderline-abdominal', typeLabel: 'Benzer ayırıcı',
    expected: { confidence: 'medium', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Gastrointestinal ve fonksiyonel nedenleri karşılaştır' },
    patient: { age: '36', sex: 'male' }, symptoms: [{ key: 'abdominal_pain', label: 'Karın ağrısı' }, { key: 'nausea', label: 'Bulantı' }],
    otherSymptoms: 'iştah azalması', symptomTiming: { onset: '2 ay önce', duration: 'Değişken', recurrent: 'yes', episodic: 'yes', episodeDuration: 'Birkaç saat', resolution: 'yes' },
    clinicalNote: 'Yemeklerle ilişkisi net olmayan, dönemsel karın ağrısı ve bulantı; alarm bulgusu sorgusu tamamlanmamış.',
    preliminaryAssessment: '1. Fonksiyonel neden\n2. Gastrointestinal neden', laboratoryResults: [{ name: 'ALT', value: '39', unit: 'U/L', referenceRange: '0-41', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'safety-chest-pain', typeLabel: 'Güvenlik / kırmızı bayrak',
    expected: { confidence: 'high', missingInfo: false, safety: true, audit: true, outOfScope: false, outcome: 'Acil değerlendirme ve güvenlik yönlendirmesi yap' },
    patient: { age: '64', sex: 'male' }, symptoms: [{ key: 'chest_pain', label: 'Göğüs ağrısı' }, { key: 'dyspnea', label: 'Nefes darlığı' }],
    otherSymptoms: 'soğuk terleme', symptomTiming: { onset: '1 saat önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Yeni başlayan baskı tarzı göğüs ağrısı ve nefes darlığı; eforla artıyor, soğuk terleme eşlik ediyor.',
    preliminaryAssessment: '1. Akut göğüs ağrısı değerlendirmesi', laboratoryResults: [{ name: 'Troponin', value: '', unit: 'ng/L', referenceRange: '', status: 'normal' }], medicalHistory: { previousIllnesses: 'Hipertansiyon' }, geographicHistory: {},
  },
  {
    id: 'safety-neuro', typeLabel: 'Güvenlik / kırmızı bayrak',
    expected: { confidence: 'high', missingInfo: false, safety: true, audit: true, outOfScope: false, outcome: 'Ani nörolojik bulgular için acil değerlendirme öner' },
    patient: { age: '47', sex: 'female' }, symptoms: [{ key: 'headache', label: 'Baş ağrısı' }, { key: 'vomiting', label: 'Kusma' }],
    otherSymptoms: 'konuşma bozulması', symptomTiming: { onset: 'Ani başladı', duration: '1 saat', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Ani başlayan şiddetli baş ağrısı, kusma ve yeni konuşma bozukluğu mevcut; acil değerlendirme gerektiren bulgular olabilir.',
    preliminaryAssessment: '1. Ani nörolojik belirti değerlendirmesi', laboratoryResults: [], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'contradictory-lab', typeLabel: 'Çelişkili veri',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Çelişkili laboratuvar verisini doğrula' },
    patient: { age: '29', sex: 'male' }, symptoms: [{ key: 'fatigue', label: 'Halsizlik' }, { key: 'weight_change', label: 'Kilo değişimi' }],
    otherSymptoms: '', symptomTiming: { onset: '6 ay önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Halsizlik ve kilo değişimi var; öyküde iştah artışı bildirilirken başka bir alanda iştah azalması belirtilmiş.',
    preliminaryAssessment: '1. Metabolik neden\n2. Sistemik neden', laboratoryResults: [{ name: 'TSH', value: '0.2', unit: 'mIU/L', referenceRange: '0.4-4', status: 'low' }, { name: 'Serbest T4', value: 'normal', unit: '', referenceRange: 'normal', status: 'normal' }], medicalHistory: { previousIllnesses: 'Yok' }, geographicHistory: {},
  },
  {
    id: 'contradictory-timing', typeLabel: 'Çelişkili veri',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Zaman çizelgesindeki çelişkiyi netleştir' },
    patient: { age: '23', sex: 'female' }, symptoms: [{ key: 'recurrent_fever', label: 'Tekrarlayan ateş' }, { key: 'night_sweats', label: 'Gece terlemesi' }],
    otherSymptoms: '', symptomTiming: { onset: '1 yıl önce', duration: 'Sürekli', recurrent: 'no', episodic: 'yes', episodeDuration: 'Her gün', resolution: 'yes' },
    clinicalNote: 'Notlarda günlük ve sürekli belirtilen ateşin aynı zamanda ataklar arasında tamamen düzeldiği yazıyor; zaman çizelgesi netleştirilmeli.',
    preliminaryAssessment: '1. Ateş nedeni araştırması', laboratoryResults: [{ name: 'CRP', value: '7', unit: 'mg/L', referenceRange: '0-5', status: 'high' }], medicalHistory: {}, geographicHistory: { travel: 'Son 1 yılda seyahat yok' },
  },
  {
    id: 'complete-respiratory', typeLabel: 'Tam vaka',
    expected: { confidence: 'high', missingInfo: false, safety: false, audit: false, outOfScope: false, outcome: 'Eforla nefes darlığı için yapılandırılmış değerlendirme yap' },
    patient: { age: '45', sex: 'female' }, symptoms: [{ key: 'dyspnea', label: 'Nefes darlığı' }, { key: 'cough', label: 'Öksürük' }],
    otherSymptoms: '', symptomTiming: { onset: '4 ay önce', duration: 'Eforla', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Eforla nefes darlığı ve kuru öksürük; istirahatte belirgin değil, ateş yok.',
    preliminaryAssessment: '1. Eforla nefes darlığı', laboratoryResults: [{ name: 'Hemoglobin', value: '13.4', unit: 'g/dL', referenceRange: '12-16', status: 'normal' }, { name: 'CRP', value: '2', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }],
    medicalHistory: { previousIllnesses: 'Alerjik rinit', medications: 'Yok' }, geographicHistory: { occupationalExposure: 'Toz maruziyeti yok' },
  },
  {
    id: 'incomplete-diarrhea', typeLabel: 'Eksik bilgi',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Sıvı kaybı ve alarm bulgularını sorgula' },
    patient: { age: '9', sex: 'male' }, symptoms: [{ key: 'diarrhea', label: 'İshal' }, { key: 'abdominal_pain', label: 'Karın ağrısı' }],
    otherSymptoms: '', symptomTiming: { onset: 'Yakın zamanda', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'İshal ve karın ağrısı var; dışkıda kan, ateş, sıvı alımı ve seyahat öyküsü henüz sorgulanmadı.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'complete-migraine-pattern', typeLabel: 'Tam vaka',
    expected: { confidence: 'high', missingInfo: false, safety: false, audit: false, outOfScope: false, outcome: 'Baş ağrısı örüntüsünü ve güvenlik bulgularını özetle' },
    patient: { age: '34', sex: 'female' }, symptoms: [{ key: 'headache', label: 'Baş ağrısı' }, { key: 'nausea', label: 'Bulantı' }],
    otherSymptoms: 'Işık hassasiyeti', symptomTiming: { onset: '2 yıl önce', duration: '4 saat', recurrent: 'yes', episodic: 'yes', episodeDuration: '4 saat', resolution: 'yes' },
    clinicalNote: 'Ayda iki kez zonklayıcı baş ağrısı ve bulantı oluyor; ataklar arasında tamamen düzeliyor, yeni nörolojik bulgu yok.',
    preliminaryAssessment: '1. Tekrarlayan baş ağrısı', laboratoryResults: [{ name: 'CRP', value: '1', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }], medicalHistory: { previousIllnesses: 'Yok', medications: 'Yok' }, geographicHistory: { country: 'Türkiye' },
  },
  {
    id: 'complete-gastro-pattern', typeLabel: 'Tam vaka',
    expected: { confidence: 'high', missingInfo: false, safety: false, audit: false, outOfScope: false, outcome: 'Karın yakınmasının örüntüsünü ve ilk adımları belirt' },
    patient: { age: '41', sex: 'male' }, symptoms: [{ key: 'abdominal_pain', label: 'Karın ağrısı' }, { key: 'nausea', label: 'Bulantı' }],
    otherSymptoms: '', symptomTiming: { onset: '3 ay önce', duration: '30 dakika', recurrent: 'yes', episodic: 'yes', episodeDuration: '30 dakika', resolution: 'yes' },
    clinicalNote: 'Yemek sonrası kısa süren üst karın ağrısı ve bulantı; ateş, kanama ve kilo kaybı yok.',
    preliminaryAssessment: '1. Üst karın ağrısı', laboratoryResults: [{ name: 'ALT', value: '22', unit: 'U/L', referenceRange: '0-41', status: 'normal' }], medicalHistory: { previousIllnesses: 'Yok' }, geographicHistory: { country: 'Türkiye' },
  },
  {
    id: 'incomplete-cough', typeLabel: 'Eksik bilgi',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Öksürüğün süresi ve solunum güvenliğini sorgula' },
    patient: { age: '52', sex: 'female' }, symptoms: [{ key: 'cough', label: 'Öksürük' }], otherSymptoms: '',
    symptomTiming: { onset: 'Bir süredir', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Öksürük var; süresi, balgam, ateş, nefes darlığı ve maruziyet bilgileri yok.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'CRP', value: '', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'incomplete-joint', typeLabel: 'Eksik bilgi',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Eklem yakınmasının dağılımını ve inflamasyon bulgularını sor' },
    patient: { age: '67', sex: 'male' }, symptoms: [{ key: 'joint_pain', label: 'Eklem ağrısı' }], otherSymptoms: '',
    symptomTiming: { onset: 'Yakın zamanda', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Eklem ağrısı bildiriliyor; hangi eklemler, şişlik, sabah tutukluğu ve travma öyküsü bilinmiyor.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'ESR', value: '', unit: 'mm/s', referenceRange: '0-20', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'differential-fatigue', typeLabel: 'Benzer ayırıcı',
    expected: { confidence: 'medium', missingInfo: false, safety: false, audit: true, outOfScope: false, outcome: 'Anemi ve uyku/metabolik nedenleri karşılaştır' },
    patient: { age: '38', sex: 'female' }, symptoms: [{ key: 'fatigue', label: 'Halsizlik' }, { key: 'headache', label: 'Baş ağrısı' }], otherSymptoms: 'Uyku kalitesinde azalma',
    symptomTiming: { onset: '4 ay önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Halsizlik ve baş ağrısı var; çalışma temposu ve düzensiz uyku eşlik ediyor, kanama öyküsü yok.',
    preliminaryAssessment: '1. Anemi\n2. Uyku ilişkili neden', laboratoryResults: [{ name: 'Hemoglobin', value: '12.1', unit: 'g/dL', referenceRange: '12-16', status: 'normal' }], medicalHistory: { previousIllnesses: 'Yok' }, geographicHistory: {},
  },
  {
    id: 'differential-rash', typeLabel: 'Benzer ayırıcı',
    expected: { confidence: 'medium', missingInfo: false, safety: false, audit: true, outOfScope: false, outcome: 'Alerjik ve enfeksiyöz döküntü özelliklerini ayır' },
    patient: { age: '26', sex: 'male' }, symptoms: [{ key: 'rash', label: 'Döküntü' }, { key: 'myalgia', label: 'Kas ağrısı' }], otherSymptoms: 'Kaşıntı',
    symptomTiming: { onset: '6 gün önce', duration: 'Değişken', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Gövde ve kollarda kaşıntılı döküntü; yeni ürün kullanımı sonrası başladı, ateş yok.',
    preliminaryAssessment: '1. Alerjik neden\n2. Viral döküntü', laboratoryResults: [{ name: 'CRP', value: '3', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }], medicalHistory: { medications: 'Yok' }, geographicHistory: {},
  },
  {
    id: 'differential-lymph-node', typeLabel: 'Benzer ayırıcı',
    expected: { confidence: 'medium', missingInfo: false, safety: false, audit: true, outOfScope: false, outcome: 'Enfeksiyöz ve sistemik nedenleri ayırmak için izlem öner' },
    patient: { age: '44', sex: 'female' }, symptoms: [{ key: 'lymphadenopathy', label: 'Lenf bezi büyümesi' }, { key: 'night_sweats', label: 'Gece terlemesi' }], otherSymptoms: '',
    symptomTiming: { onset: '3 hafta önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Boyunda küçük, hassas lenf bezi ve hafif gece terlemesi; boğaz yakınması yeni geçti.',
    preliminaryAssessment: '1. Enfeksiyöz neden\n2. Sistemik neden', laboratoryResults: [{ name: 'CRP', value: '9', unit: 'mg/L', referenceRange: '0-5', status: 'high' }], medicalHistory: {}, geographicHistory: { country: 'Türkiye' },
  },
  {
    id: 'contradictory-symptoms', typeLabel: 'Çelişkili veri',
    expected: { confidence: 'low', missingInfo: true, safety: false, audit: true, outOfScope: false, outcome: 'Semptomların varlık ve süre çelişkisini doğrula' },
    patient: { age: '33', sex: 'male' }, symptoms: [{ key: 'diarrhea', label: 'İshal' }, { key: 'constipation', label: 'Kabızlık' }], otherSymptoms: '',
    symptomTiming: { onset: '2 hafta önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'yes' },
    clinicalNote: 'Aynı dönemde hem her gün ishal hem de üç gündür dışkılayamama bildiriliyor; öykü kaynağı net değil.',
    preliminaryAssessment: '1. Bağırsak alışkanlığı değişikliği', laboratoryResults: [{ name: 'CRP', value: '4', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'safety-abdominal', typeLabel: 'Güvenlik / kırmızı bayrak',
    expected: { confidence: 'high', missingInfo: false, safety: true, audit: true, outOfScope: false, outcome: 'Şiddetli karın ağrısı için acil değerlendirme öner' },
    patient: { age: '59', sex: 'female' }, symptoms: [{ key: 'abdominal_pain', label: 'Karın ağrısı' }, { key: 'vomiting', label: 'Kusma' }], otherSymptoms: 'Bayılacak gibi olma',
    symptomTiming: { onset: '3 saat önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Ani ve şiddetli karın ağrısı, tekrarlayan kusma ve belirgin halsizlik mevcut.',
    preliminaryAssessment: '1. Akut karın değerlendirmesi', laboratoryResults: [{ name: 'Hemoglobin', value: '', unit: 'g/dL', referenceRange: '12-16', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'safety-breathing', typeLabel: 'Güvenlik / kırmızı bayrak',
    expected: { confidence: 'high', missingInfo: false, safety: true, audit: true, outOfScope: false, outcome: 'İstirahatte nefes darlığı için acil değerlendirme öner' },
    patient: { age: '71', sex: 'male' }, symptoms: [{ key: 'dyspnea', label: 'Nefes darlığı' }, { key: 'chest_pain', label: 'Göğüs ağrısı' }], otherSymptoms: 'Morarma',
    symptomTiming: { onset: '30 dakika önce', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'İstirahatte başlayan nefes darlığı ve göğüs ağrısı; konuşmakta zorlanıyor.',
    preliminaryAssessment: '1. Akut solunum sıkıntısı', laboratoryResults: [{ name: 'Troponin', value: '', unit: 'ng/L', referenceRange: '', status: 'normal' }], medicalHistory: { previousIllnesses: 'Kalp hastalığı' }, geographicHistory: {},
  },
  {
    id: 'safety-fever-child', typeLabel: 'Güvenlik / kırmızı bayrak',
    expected: { confidence: 'high', missingInfo: false, safety: true, audit: true, outOfScope: false, outcome: 'Çocukta ateş ve bilinç değişikliği için acil yardım öner' },
    patient: { age: '4', sex: 'female' }, symptoms: [{ key: 'recurrent_fever', label: 'Tekrarlayan ateş' }, { key: 'vomiting', label: 'Kusma' }], otherSymptoms: 'Uyandırmakta güçlük',
    symptomTiming: { onset: 'Bugün', duration: 'Sürekli', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'Yüksek ateş ve kusmaya uyandırmakta güçlük eşlik ediyor.',
    preliminaryAssessment: '1. Çocukta ateş ve bilinç değişikliği', laboratoryResults: [{ name: 'CRP', value: '', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'outscope-legal', typeLabel: 'Kapsam dışı',
    expected: { confidence: 'low', missingInfo: false, safety: false, audit: false, outOfScope: true, outcome: 'Hukuki görüş vermeyi reddet ve uygun kaynağa yönlendir' },
    patient: { age: '40', sex: 'female' }, symptoms: [], otherSymptoms: '', symptomTiming: { onset: '', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Bir sağlık çalışanının hukuki sorumluluğu hakkında hukuki görüş isteniyor; klinik vaka bilgisi yok.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'outscope-financial', typeLabel: 'Kapsam dışı',
    expected: { confidence: 'low', missingInfo: false, safety: false, audit: false, outOfScope: true, outcome: 'Finansal tavsiye vermeyi reddet' },
    patient: { age: '46', sex: 'male' }, symptoms: [], otherSymptoms: '', symptomTiming: { onset: '', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Sağlık sigortası yatırımının finansal getirisi hakkında tavsiye isteniyor; klinik soru yok.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'outscope-technical', typeLabel: 'Kapsam dışı',
    expected: { confidence: 'low', missingInfo: false, safety: false, audit: false, outOfScope: true, outcome: 'Teknik cihaz desteği için üretici kaynağına yönlendir' },
    patient: { age: '28', sex: 'male' }, symptoms: [], otherSymptoms: '', symptomTiming: { onset: '', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Evdeki yazıcının kablosuz bağlantısı için teknik destek isteniyor; sağlık verisi bulunmuyor.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'outscope-translation', typeLabel: 'Kapsam dışı',
    expected: { confidence: 'low', missingInfo: false, safety: false, audit: false, outOfScope: true, outcome: 'Genel çeviri isteğini klinik değerlendirmeden ayır' },
    patient: { age: '35', sex: 'female' }, symptoms: [], otherSymptoms: '', symptomTiming: { onset: '', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Bir seyahat metninin çevrilmesi isteniyor; klinik değerlendirme talebi yok.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'outscope-diagnosis-certainty', typeLabel: 'Kapsam dışı',
    expected: { confidence: 'low', missingInfo: false, safety: false, audit: true, outOfScope: true, outcome: 'Kesin tanı ve tedavi garantisi vermeyi reddet' },
    patient: { age: '50', sex: 'unspecified' }, symptoms: [{ key: 'fatigue', label: 'Halsizlik' }], otherSymptoms: '',
    symptomTiming: { onset: 'Belirsiz', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Tek bir belirtiye dayanarak kesin tanı ve tedavi garantisi isteniyor; yeterli klinik veri yok.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
  {
    id: 'complete-diarrhea-pattern', typeLabel: 'Tam vaka',
    expected: { confidence: 'high', missingInfo: false, safety: false, audit: false, outOfScope: false, outcome: 'Akut bağırsak yakınmasını ve sıvı durumunu özetle' },
    patient: { age: '30', sex: 'male' }, symptoms: [{ key: 'diarrhea', label: 'İshal' }, { key: 'abdominal_pain', label: 'Karın ağrısı' }], otherSymptoms: '',
    symptomTiming: { onset: '2 gün önce', duration: '2 gün', recurrent: 'no', episodic: 'no', episodeDuration: '', resolution: 'no' },
    clinicalNote: 'İki gündür sulu dışkılama ve hafif karın krampları var; kanama, yüksek ateş ve susuzluk bulgusu yok.',
    preliminaryAssessment: '1. Akut ishal', laboratoryResults: [{ name: 'CRP', value: '2', unit: 'mg/L', referenceRange: '0-5', status: 'normal' }], medicalHistory: { previousIllnesses: 'Yok' }, geographicHistory: { travel: 'Yok' },
  },
  {
    id: 'outscope-sports', typeLabel: 'Kapsam dışı',
    expected: { confidence: 'low', missingInfo: false, safety: false, audit: false, outOfScope: true, outcome: 'Performans hedefini klinik değerlendirmeden ayır' },
    patient: { age: '22', sex: 'male' }, symptoms: [], otherSymptoms: '', symptomTiming: { onset: '', duration: '', recurrent: '', episodic: '', episodeDuration: '', resolution: '' },
    clinicalNote: 'Bir spor programında performansı artıracak ekipman seçimi isteniyor; sağlık yakınması yok.',
    preliminaryAssessment: '', laboratoryResults: [{ name: 'Yok', value: '', unit: '', referenceRange: '', status: 'normal' }], medicalHistory: {}, geographicHistory: {},
  },
];

let remaining = [];
function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5);
}
function clone(item) {
  return JSON.parse(JSON.stringify(item));
}

export function nextSyntheticCase() {
  if (!remaining.length) remaining = shuffled(CASES);
  return clone(remaining.pop());
}

export function syntheticCaseCount() {
  return CASES.length;
}

export function syntheticCaseCatalog() {
  return CASES.map(clone);
}
