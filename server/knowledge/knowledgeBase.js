
module.exports = [
  {
    id: 'acute_viral_infection',
    name: 'Viral enfeksiyon',
    aliases: ['viral enfeksiyon', 'akut viral enfeksiyon', 'enfeksiyon', 'viral', 'viral üst solunum yolu enfeksiyonu', 'influenza', 'grip'],
    category: 'enfeksiyöz / kendi kendini sınırlayan',
    epidemiology_note: 'Toplum kökenli ateşli hastalıkların en sık nedeni; çoğu 1-2 haftada kendiliğinden düzelir.',
    criteria_note: 'Tanı büyük ölçüde kliniktir; antibiyotik kararı için NICE semptom skorlama kılavuzu kullanılır.',
    sources: [
      { id: 'S1', title: 'Respiratory tract infections (self-limiting): prescribing antibiotics (CG69)', publisher: 'NICE (National Institute for Health and Care Excellence)', year: 2008, type: 'klinik kılavuz', url: 'https://www.nice.org.uk/guidance/cg69', note: '2008 yayımı, 2017 güncellemesi' },
      { id: 'S2', title: 'Common Cold and Flu fact sheets', publisher: 'CDC (Centers for Disease Control and Prevention)', year: 2023, type: 'halk sağlığı bilgi sayfası', url: 'https://www.cdc.gov/common-cold/about/', note: '' },
    ],
    supporting_patterns: [
      { type: 'symptom', terms: ['fever', 'ateş'], weight: 1, strength: 'low', note: 'Ateş akut viral hastalıkların çekirdek bulgusudur', source_id: 'S1' },
      { type: 'text', terms: ['ateş'], weight: 1, strength: 'low', note: 'Ateş öyküsü akut enfeksiyonla uyumlu', source_id: 'S1' },
      { type: 'symptom', terms: ['sore throat', 'boğaz ağrısı'], weight: 1, strength: 'low', note: 'Boğaz ağrısı viral üSYE\'de sıktır', source_id: 'S2' },
      { type: 'text', terms: ['boğaz ağrısı'], weight: 1, strength: 'low', note: 'Boğaz ağrısı viral üSYE\'de sıktır', source_id: 'S2' },
      { type: 'symptom', terms: ['muscle pain', 'myalgia', 'headache', 'fatigue'], weight: 1, strength: 'low', note: 'Konstitüsyonel semptomlar viral tabloda beklenir', source_id: 'S2' },
      { type: 'timing', terms: ['kendiliğinden', 'düzelme'], weight: 1, strength: 'low', note: 'Kendi kendini sınırlayan seyir akut viral enfeksiyonu destekler', source_id: 'S1' },
      { type: 'text', terms: ['kendiliğinden'], weight: 1, strength: 'low', note: 'Kendiliğinden düzelme viral seyirle uyumludur', source_id: 'S1' },
    ],
    excluding_patterns: [
      { type: 'text', terms: ['tekrarlayan', 'atak'], weight: -2, strength: 'moderate', note: 'Stereotip, kısa aralıklı tekrarlayan ataklar tek bir akut viral hastalık için tipik değildir', source_id: 'S1' },
      { type: 'timing', terms: ['tekrarlayan', 'atak'], weight: -2, strength: 'moderate', note: 'Ataklı (epizodik) seyir akut enfeksiyon için alışılmadık', source_id: 'S1' },
      { type: 'text', terms: ['2 aydan uzun', 'kronik'], weight: -2, strength: 'moderate', note: 'Uzamış veya kronik seyir akut viral enfeksiyonu dışlar', source_id: 'S1' },
    ],
    key_tests: [
      { test: 'Tam kan sayımı ve akut faz reaktanları (CRP)', rationale: 'Enfeksiyon yükünü ve komplikasyon riskini değerlendirir', source_id: 'S1' },
      { test: 'Viral seroloji / PCR (grip, COVID-19, EBV)', rationale: 'Etken belirlenmesi gereken durumlarda', source_id: 'S2' },
      { test: 'Klinik takip (3-7 gün içinde düzelme beklenir)', rationale: 'Kendi kendini sınırlayan seyir tanıyı doğrular', source_id: 'S1' },
    ],
  },

  {
    id: 'sle',
    name: 'Sistemik Lupus Eritematozus (SLE)',
    aliases: ['sle', 'sistemik lupus eritematozus', 'sistemik lupus', 'lupus', 'lupus eritematozus'],
    category: 'otoimmün / romatolojik',
    epidemiology_note: 'En sık 15-44 yaş kadınlarda; kadın:erkek oranı yaklaşık 9:1.',
    criteria_note: '2019 EULAR/ACR sınıflama kriterleri: ANA pozitifliği giriş kapısıdır; mukokutanöz, seröz, kas-iskelet, renal, hematolojik ve immünolojik alanlardan puan toplanır.',
    sources: [
      { id: 'S1', title: '2019 EULAR/ACR classification criteria for systemic lupus erythematosus', publisher: 'Annals of the Rheumatic Diseases (EULAR/ACR)', year: 2019, type: 'sınıflama kriterleri', url: 'https://ard.bmj.com/content/78/9/1151', note: 'Aringer M, Costenbader K, et al.' },
      { id: 'S2', title: 'Derivation and validation of the Systemic Lupus International Collaborating Clinics (SLICC) classification criteria for SLE', publisher: 'Arthritis & Rheumatism (SLICC)', year: 2012, type: 'sınıflama kriterleri', url: 'https://onlinelibrary.wiley.com/doi/10.1002/art.34473', note: 'Petri M, Orbai AM, et al.' },
    ],
    supporting_patterns: [
      { type: 'demographic', sex: 'female', ageMax: 44, weight: 1, strength: 'low', note: 'SLE reprodüktif çağ kadınlarda en sıktır', source_id: 'S1' },
      { type: 'symptom', terms: ['joint pain', 'arthritis', 'eklem ağrısı', 'eklem ağrıları'], weight: 2, strength: 'moderate', note: 'Artralji/artrit SLE\'nin en sık kas-iskelet bulgusudur', source_id: 'S2' },
      { type: 'text', terms: ['eklem ağrısı', 'eklem ağrıları', 'artrit', 'eklem şişliği'], weight: 2, strength: 'moderate', note: 'Artralji SLE değerlendirmesini gerektirir', source_id: 'S2' },
      { type: 'text', terms: ['kelebek', 'malar', 'döküntü', 'ışık', 'güneş', 'fotosensitivite', 'ağız ülseri', 'oral ülser', 'aft', 'saç dökülmesi', 'alopesi', 'plevral', 'perikard', 'serozit'], weight: 3, strength: 'high', note: 'Mukokutanöz/seröz bulgular EULAR/ACR kriter alanlarıdır', source_id: 'S1' },
      { type: 'lab', name: 'hemoglobin', status: 'low', weight: 2, strength: 'moderate', note: 'Hemolitik anemi veya kronik hastalık anemisi SLE\'de görülür', source_id: 'S2' },
      { type: 'text', terms: ['anemi', 'lökopeni', 'trombositopeni', 'kan sayımında'], weight: 2, strength: 'moderate', note: 'Sitopeniler hematolojik kriter alanındadır', source_id: 'S1' },
      { type: 'text', terms: ['böbrek', 'proteinüri', 'idrarda kan'], weight: 3, strength: 'high', note: 'Renal tutulum SLE\'de organ hasarının en önemli belirleyicisidir', source_id: 'S1' },
    ],
    excluding_patterns: [
      { type: 'text', terms: ['kendiliğinden düzelme'], weight: -2, strength: 'moderate', note: 'Kısa, kendiliğinden tamamen düzelen stereotip ataklar SLE seyri için tipik değildir', source_id: 'S1' },
      { type: 'timing', terms: ['2-3 gün', '3 gün'], weight: -2, strength: 'moderate', note: '2-3 günde kendiliğinden düzelen ataklar SLE ateş paterniyle uyumsuzdur', source_id: 'S2' },
      { type: 'text', terms: ['ataklar arasında tamamen iyi'], weight: -2, strength: 'moderate', note: 'Tam asemptomatik aralıklar otoinflamatuvar paterni düşündürür', source_id: 'S2' },
    ],
    key_tests: [
      { test: 'ANA (indirekt immünofloresan)', rationale: '2019 EULAR/ACR kriterlerinde giriş kapısı; negatifse SLE olasılığı çok düşer', source_id: 'S1' },
      { test: 'Anti-dsDNA, anti-Smith, anti-fosfolipid', rationale: 'Yüksek özgüllüklü immünolojik kriterler', source_id: 'S1' },
      { test: 'Tam kan sayımı (lökopeni, lenfopeni, trombositopeni, hemoliz)', rationale: 'Hematolojik kriter alanı', source_id: 'S2' },
      { test: 'Kompleman C3/C4 ve spot idrar protein/kreatinin', rationale: 'Renal tutulum ve hastalık aktivitesi taraması', source_id: 'S1' },
    ],
  },

  {
    id: 'aosd',
    name: 'Still Hastalığı',
    aliases: ['still hastalığı', 'still', 'aosd', 'adult-onset still disease', 'erişkin başlangıçlı still', 'juvenil idiopatik artrit sistemik', 'sjia'],
    category: 'otoinflamatuvar / romatolojik',
    epidemiology_note: 'Erişkin Still hastalığı (AOSD) sıklıkla 16-35 yaşta başlar; kadınlarda hafif baskındır.',
    criteria_note: 'Yamaguchi kriterleri (1992): ≥39°C ≥1 hafta ateş + ≥2 hafta artralji ana kriter; döküntü, boğaz ağrısı, lenfadenopati, splenomegali, karaciğer fonksiyon anormalliği, RF/ANA negatifliği alt kriterlerdir.',
    sources: [
      { id: 'S1', title: 'Preliminary criteria for classification of adult Still\'s disease (Yamaguchi criteria)', publisher: 'The Journal of Rheumatology', year: 1992, type: 'sınıflama kriterleri', url: 'https://www.jrheum.org/', note: 'Yamaguchi M, Ohta A, et al. J Rheumatol 1992;19(3):424-30' },
      { id: 'S2', title: 'Proposal for a new set of classification criteria for adult-onset Still disease (Fautrel criteria)', publisher: 'The Journal of Rheumatology', year: 2002, type: 'sınıflama kriterleri', url: 'https://www.jrheum.org/', note: 'Fautrel B, Zing E, et al. J Rheumatol 2002;29(9):1938-43' },
    ],
    supporting_patterns: [
      { type: 'text', terms: ['ateş'], weight: 2, strength: 'moderate', note: 'Yüksek ateş (≥39°C) Yamaguchi ana kriteridir', source_id: 'S1' },
      { type: 'symptom', terms: ['fever', 'ateş'], weight: 2, strength: 'moderate', note: 'Ateş AOSD\'nin ana kriteridir', source_id: 'S1' },
      { type: 'text', terms: ['boğaz ağrısı'], weight: 2, strength: 'moderate', note: 'Boğaz ağrısı AOSD\'nin tipik prodromal alt kriteridir', source_id: 'S1' },
      { type: 'symptom', terms: ['sore throat', 'boğaz ağrısı'], weight: 2, strength: 'moderate', note: 'Boğaz ağrısı AOSD prodromunda sıktır', source_id: 'S2' },
      { type: 'symptom', terms: ['joint pain', 'arthritis', 'eklem ağrısı', 'eklem ağrıları'], weight: 2, strength: 'moderate', note: '≥2 hafta artralji Yamaguchi ana kriteridir', source_id: 'S1' },
      { type: 'text', terms: ['eklem ağrısı', 'eklem ağrıları', 'artrit'], weight: 2, strength: 'moderate', note: 'Artralji AOSD ana kriteridir', source_id: 'S1' },
      { type: 'text', terms: ['döküntü', 'sommon', 'somon rengi'], weight: 3, strength: 'high', note: 'Uçucu somon rengi döküntü AOSD için oldukça tipiktir', source_id: 'S2' },
      { type: 'lab', name: 'crp', status: 'high', weight: 1, strength: 'low', note: 'Yüksek akut faz reaktanları AOSD\'de beklenir', source_id: 'S2' },
      { type: 'demographic', sex: 'female', ageMax: 35, weight: 1, strength: 'low', note: 'AOSD genç erişkinde, kadınlarda hafif baskın', source_id: 'S1' },
    ],
    excluding_patterns: [
      { type: 'text', terms: ['kendiliğinden düzelme'], weight: -1, strength: 'low', note: 'AOSD atakları tipik olarak günler-haftalar sürer ve tam remisyon aralıkları değişkendir', source_id: 'S1' },
    ],
    key_tests: [
      { test: 'Ferritin (belirgin yükseklik) ve glikozile ferritin fraksiyonu', rationale: 'AOSD\'de karakteristik olarak çok yüksek ferritin görülür', source_id: 'S2' },
      { test: 'Tam kan sayımı (lökositoz, trombositoz)', rationale: 'Fautrel kriterlerinde inflamatuvar bulgular', source_id: 'S2' },
      { test: 'RF ve ANA negatifliği', rationale: 'Yamaguchi alt kriteri; seronegatiflik beklenir', source_id: 'S1' },
      { test: 'Karaciğer fonksiyon testleri', rationale: 'Transaminaz yüksekliği alt kriterdir', source_id: 'S1' },
    ],
  },

  {
    id: 'fmf',
    name: 'Ailevi Akdeniz Ateşi (FMF)',
    aliases: ['fmf', 'ailevi akdeniz ateşi', 'ailevi akdeniz', 'familyal akdeniz ateşi', 'familial mediterranean fever', 'mefv'],
    category: 'otoinflamatuvar / periyodik ateş sendromu',
    epidemiology_note: 'Akdeniz kökenli toplumlarda (Türk, Ermeni, Arap, Yahudi) endemik; en sık periyodik ateş sendromudur.',
    criteria_note: 'Tel Hashomer kriterleri (Livneh 1997): ≥1 cm (büyük) veya ≥2 küçük kriter; büyük kriterler: 12-72 saat süren tekrarlayan ateşli atak, erizipel benzeri eritem, serozit (karın/göğüs ağrısı).',
    sources: [
      { id: 'S1', title: 'Criteria for the diagnosis of familial Mediterranean fever (Tel Hashomer criteria)', publisher: 'Arthritis & Rheumatism', year: 1997, type: 'tanı kriterleri', url: 'https://onlinelibrary.wiley.com/doi/10.1002/art.1780401018', note: 'Livneh A, Langevitz P, et al. 1997;40(10):1879-85' },
      { id: 'S2', title: 'EULAR recommendations for the management of familial Mediterranean fever', publisher: 'Annals of the Rheumatic Diseases (EULAR)', year: 2016, type: 'klinik kılavuz', url: 'https://ard.bmj.com/content/75/4/644', note: 'Ozen S, Demirkaya E, et al. 2016;75(4):644-51' },
    ],
    supporting_patterns: [
      { type: 'symptom', terms: ['recurrent fever', 'fever', 'ateş'], weight: 2, strength: 'moderate', note: 'Tekrarlayan ateş FMF\'in ana bulgusudur', source_id: 'S1' },
      { type: 'text', terms: ['tekrarlayan', 'atak'], weight: 2, strength: 'moderate', note: 'Tekrarlayan ataklı seyir FMF için tipiktir', source_id: 'S1' },
      { type: 'timing', terms: ['2-3 gün', '3 gün', 'kısa'], weight: 2, strength: 'moderate', note: 'FMF atakları 12-72 saat sürer; 2-3 günlük atak uyumludur', source_id: 'S1' },
      { type: 'timing', terms: ['kendiliğinden'], weight: 1, strength: 'low', note: 'Ataklar kendiliğinden düzelir, ataklar arası tamamen asemptomatiktir', source_id: 'S1' },
      { type: 'text', terms: ['karın ağrısı', 'göğüs ağrısı', 'plevral', 'periton', 'serozit', 'erizipel', 'bacakta kızarıklık'], weight: 3, strength: 'high', note: 'Serozit ve erizipel benzeri eritem Tel Hashomer büyük kriterleridir', source_id: 'S1' },
      { type: 'geography', terms: ['türkiye', 'ermenistan', 'ırak', 'iran', 'israil', 'akdeniz', 'kürt'], weight: 2, strength: 'moderate', note: 'Akdeniz kökenli toplumlarda FMF endemiktir', source_id: 'S1' },
      { type: 'history', terms: ['aile', 'ailede', 'akdeniz ateşi', 'fmf'], weight: 2, strength: 'moderate', note: 'Aile öyküsü FMF\'de sıktır (otozaal resesif)', source_id: 'S2' },
      { type: 'lab', name: 'crp', status: 'high', weight: 1, strength: 'low', note: 'Atak sırasında akut faz reaktanları belirgin yükselir', source_id: 'S2' },
    ],
    excluding_patterns: [
      { type: 'timing', terms: ['haftadan uzun', '1 hafta', '7 gün'], weight: -2, strength: 'moderate', note: '1 haftayı aşan ataklar FMF için tipik değildir (TRAPS gibi uzun ataklı sendromlar düşünülür)', source_id: 'S1' },
      { type: 'text', terms: ['sürekli ateş', 'kesintisiz'], weight: -2, strength: 'moderate', note: 'Kesintisiz ateş periyodik atak paterniyle uyumsuzdur', source_id: 'S1' },
    ],
    key_tests: [
      { test: 'MEFV gen analizi', rationale: 'Tanıyı genetik olarak destekler; Türkiye\'de erişilebilir', source_id: 'S2' },
      { test: 'Atak sırasında akut faz reaktanları (CRP, SAA, fibrinojen)', rationale: 'Atak sırasında yükselir, ataklar arası normale döner', source_id: 'S2' },
      { test: 'Kolşisin tedavi denemesi', rationale: 'Belirgin yanıt FMF tanısını güçlendirir', source_id: 'S2' },
    ],
  },

  {
    id: 'infectious_mononucleosis',
    name: 'Enfeksiyöz Mononükleoz',
    aliases: ['enfeksiyöz mononükleoz', 'mononükleoz', 'ebv', 'epstein-barr', 'epstein barr', 'glandüler ateş', 'infectious mononucleosis', 'öpücük hastalığı'],
    category: 'enfeksiyöz / viral',
    epidemiology_note: 'En sık 15-24 yaşta; Epstein-Barr virüsünün (EBV) primer enfeksiyonu.',
    criteria_note: 'Klinik üçlü: ateş, boğaz ağrısı, lenfadenopati. Ebell klinik skoru ve heterofil antikor testi tanıda kullanılır.',
    sources: [
      { id: 'S1', title: 'Clinical scoring system for infectious mononucleosis', publisher: 'JAMA (Journal of the American Medical Association)', year: 2004, type: 'klinik skorlama', url: 'https://jamanetwork.com/journals/jama/fullarticle/198857', note: 'Ebell MH. JAMA 2004;291(8):975-79' },
      { id: 'S2', title: 'About Epstein-Barr Virus (EBV) — infectious mononucleosis', publisher: 'CDC (Centers for Disease Control and Prevention)', year: 2020, type: 'halk sağlığı bilgi sayfası', url: 'https://www.cdc.gov/epstein-barr/about/', note: '' },
    ],
    supporting_patterns: [
      { type: 'symptom', terms: ['sore throat', 'boğaz ağrısı'], weight: 2, strength: 'moderate', note: 'Boğaz ağrısı klasik üçlünün parçasıdır', source_id: 'S1' },
      { type: 'text', terms: ['boğaz ağrısı'], weight: 2, strength: 'moderate', note: 'Boğaz ağrısı mononükleozun ana bulgusudur', source_id: 'S1' },
      { type: 'symptom', terms: ['fever', 'ateş'], weight: 1, strength: 'low', note: 'Ateş üçlünün parçasıdır', source_id: 'S1' },
      { type: 'text', terms: ['ateş'], weight: 1, strength: 'low', note: 'Ateş mononükleozda beklenir', source_id: 'S2' },
      { type: 'symptom', terms: ['lymph node enlargement', 'lenfadenopati', 'fatigue'], weight: 2, strength: 'moderate', note: 'Lenfadenopati ve belirgin yorgunluk EBV\'de tipiktir', source_id: 'S2' },
      { type: 'text', terms: ['lenf bezi', 'lenfadenopati', 'yorgunluk', 'halsizlik', 'gece terlemesi'], weight: 2, strength: 'moderate', note: 'Lenfadenopati/yorgunluk EBV lehinedir', source_id: 'S1' },
      { type: 'demographic', ageMin: 15, ageMax: 24, weight: 1, strength: 'low', note: 'En sık 15-24 yaşta görülür', source_id: 'S2' },
      { type: 'lab', name: 'crp', status: 'high', weight: 1, strength: 'low', note: 'Akut faz yanıtı beklenir', source_id: 'S2' },
    ],
    excluding_patterns: [
      { type: 'text', terms: ['tekrarlayan', 'atak'], weight: -2, strength: 'moderate', note: 'Primer EBV enfeksiyonu tek bir hastalık epizodudur, tekrarlayan ataklar beklenmez', source_id: 'S2' },
    ],
    key_tests: [
      { test: 'Heterofil antikor (Monospot) testi', rationale: 'Hızlı tarama; gençlerde duyarlılığı yüksek', source_id: 'S1' },
      { test: 'EBV VCA IgM ve IgG, EBNA', rationale: 'Primer enfeksiyonu kesinleştirir (VCA IgM pozitif, EBNA negatif)', source_id: 'S2' },
      { test: 'Tam kan sayımı (lenfositoz, atipik lenfositler)', rationale: 'Karakteristik hematolojik bulgular', source_id: 'S2' },
      { test: 'Karaciğer fonksiyon testleri', rationale: 'Hafif transaminaz yüksekliği sıktır', source_id: 'S2' },
    ],
  },

  {
    id: 'traps',
    name: 'TRAPS (TNF Reseptör İlişkili Periyodik Sendrom)',
    aliases: ['traps', 'tnf reseptör ilişkili periyodik sendrom', 'tnf reseptör ilişkili periyodik ateş sendromu', 'tnfrsf1a'],
    category: 'otoinflamatuvar / periyodik ateş sendromu',
    epidemiology_note: 'Otozaal dominant; TNFRSF1A gen mutasyonu; periyodik ateş sendromlarının nadir bir formu.',
    criteria_note: 'TRAPS atakları tipik olarak uzundur (genellikle 1-3 hafta), göç eden miyalji ve eritemli deri lezyonları eşlik eder; FMF ataklarından belirgin biçimde daha uzundur.',
    sources: [
      { id: 'S1', title: 'The TNF receptor-associated periodic syndrome (TRAPS): emerging concepts of an autoinflammatory disorder', publisher: 'Medicine (Baltimore)', year: 2002, type: 'derleme', url: 'https://journals.lww.com/md-journal/abstract/2002/09000/', note: 'Hull KM, Drewe E, et al. Medicine 2002;81(5):349-68' },
      { id: 'S2', title: 'Classification criteria for autoinflammatory recurrent fevers (FMF, TRAPS, MKD, CAPS)', publisher: 'Annals of the Rheumatic Diseases (PRINTO/EULAR)', year: 2019, type: 'sınıflama kriterleri', url: 'https://ard.bmj.com/content/78/8/1025', note: 'Gattorno M, Hofer M, et al. 2019;78(8):1025-32' },
    ],
    supporting_patterns: [
      { type: 'symptom', terms: ['recurrent fever', 'fever', 'ateş'], weight: 2, strength: 'moderate', note: 'Tekrarlayan ateş TRAPS\'in çekirdek bulgusudur', source_id: 'S2' },
      { type: 'text', terms: ['tekrarlayan', 'atak'], weight: 1, strength: 'low', note: 'Periyodik ataklar TRAPS ile uyumludur', source_id: 'S1' },
      { type: 'text', terms: ['miyalji', 'kas ağrısı', 'göç eden'], weight: 2, strength: 'moderate', note: 'Göç eden miyalji TRAPS\'in karakteristik bulgusudur', source_id: 'S1' },
      { type: 'history', terms: ['aile', 'ailede'], weight: 2, strength: 'moderate', note: 'Otozaal dominant kalıtım nedeniyle aile öyküsü sıktır', source_id: 'S1' },
      { type: 'text', terms: ['karın ağrısı', 'göğüs ağrısı', 'serozit'], weight: 1, strength: 'low', note: 'Serozit atakları görülebilir', source_id: 'S1' },
    ],
    excluding_patterns: [
      { type: 'timing', terms: ['2-3 gün', '3 gün', 'kısa'], weight: -3, strength: 'high', note: 'TRAPS atakları genellikle 1-3 hafta sürer; 2-3 günlük ataklar TRAPS için belirgin biçimde atipik', source_id: 'S1' },
      { type: 'text', terms: ['2-3 gün'], weight: -3, strength: 'high', note: 'Kısa atak süresi TRAPS\'ı büyük ölçüde dışlar', source_id: 'S1' },
    ],
    key_tests: [
      { test: 'TNFRSF1A gen analizi', rationale: 'Tanıyı kesinleştirir (otozaal dominant)', source_id: 'S1' },
      { test: 'Atak sırasında akut faz reaktanları', rationale: 'Uzun ataklarda belirgin yükselme beklenir', source_id: 'S2' },
      { test: 'Atak süresinin net dokümante edilmesi', rationale: 'FMF\'ten ayrımda en değerli klinik ipucu atak süresidir', source_id: 'S1' },
    ],
  },

  {
    id: 'pfapa',
    name: 'PFAPA Sendromu',
    aliases: ['pfapa', 'pfapa sendromu', 'periodic fever aphthous stomatitis pharyngitis adenitis'],
    category: 'otoinflamatuvar / periyodik ateş sendromu',
    epidemiology_note: 'En sık 5 yaş altı çocuklarda; erişkinde nadir. Adı: Periyodik Ateş, Aftöz Stomatit, Farenjit, Adenit.',
    criteria_note: 'Thomas kriterleri (1999): düzenli aralıklarla (genellikle 3-8 haftada bir) tekrarlayan ateş epizodları; aftöz stomatit, farenjit ve/veya servikal adenit eşlik eder; epizodlar arasında tamamen asemptomatik.',
    sources: [
      { id: 'S1', title: 'Periodic fever syndrome in children (PFAPA): clinical description and criteria', publisher: 'The Journal of Pediatrics', year: 1999, type: 'tanı kriterleri', url: 'https://www.jpeds.com/article/S0022-3476(99)70316-5/fulltext', note: 'Thomas KT, Feder HM, et al. J Pediatr 1999;135(1):15-21' },
      { id: 'S2', title: 'PFAPA syndrome: consensus-based recommendations for diagnosis and management', publisher: 'Pediatric Rheumatology (Eurofever)', year: 2016, type: 'uzlaşı kılavuzu', url: 'https://ped-rheum.biomedcentral.com/articles/10.1186/s12969-016-0064-6', note: 'Vanoni F, Federici S, et al.' },
    ],
    supporting_patterns: [
      { type: 'symptom', terms: ['recurrent fever', 'fever', 'ateş'], weight: 2, strength: 'moderate', note: 'Düzenli periyodik ateş PFAPA\'nın ana bulgusudur', source_id: 'S1' },
      { type: 'text', terms: ['tekrarlayan', 'düzenli aralıklarla', 'her ay'], weight: 1, strength: 'low', note: 'Düzenli periyodisite PFAPA için tipiktir', source_id: 'S1' },
      { type: 'text', terms: ['aft', 'ağız ülseri', 'oral ülser', 'farenjit', 'bademcik', 'lenf bezi', 'servikal adenit'], weight: 2, strength: 'moderate', note: 'Aftöz stomatit + farenjit + adenit triadı PFAPA\'nın imzasıdır', source_id: 'S1' },
      { type: 'timing', terms: ['kendiliğinden'], weight: 1, strength: 'low', note: 'Ataklar 3-6 günde kendiliğinden düzelir', source_id: 'S1' },
      { type: 'demographic', ageMax: 5, weight: 2, strength: 'moderate', note: 'En sık 5 yaş altında başlar', source_id: 'S1' },
    ],
    excluding_patterns: [
      { type: 'demographic', ageMin: 18, weight: -2, strength: 'moderate', note: 'Erişkin başlangıçlı PFAPA nadirdir; önce diğer periyodik sendromlar düşünülür', source_id: 'S2' },
      { type: 'text', terms: ['eklem ağrısı'], weight: -1, strength: 'low', note: 'Belirgin eklem tutulumu PFAPA için tipik değildir', source_id: 'S1' },
    ],
    key_tests: [
      { test: 'Aftöz stomatit/farenjit/adenit varlığının sorgulanması', rationale: 'PFAPA triadı tanı için gereklidir', source_id: 'S1' },
      { test: 'Atak aralığı ve periyodisitenin dokümantasyonu', rationale: '3-8 haftalık düzenli aralıklar tipiktir', source_id: 'S1' },
      { test: 'Tek doz steroid (prednizolon) yanıtı', rationale: 'PFAPA ataklarında dramatik yanıt tanıyı destekler', source_id: 'S2' },
    ],
  },

  {
    id: 'behcet',
    name: 'Behçet Hastalığı',
    aliases: ['behçet hastalığı', 'behçet', 'behcet', 'behçet sendromu', 'behcet syndrome'],
    category: 'sistemik vaskülit / otoinflamatuvar',
    epidemiology_note: 'İpek Yolu coğrafyasında (Türkiye dahil) en sık; Türkiye\'de prevalansı yüksektir.',
    criteria_note: 'ISG kriterleri (1990): tekrarlayan oral ülser (zorunlu) + aşağıdakilerden ≥2: tekrarlayan genital ülser, göz tutulumu (üveit), deri lezyonları (eritema nodozum, papülopüstüler), pozitif paterji testi.',
    sources: [
      { id: 'S1', title: 'Criteria for diagnosis of Behçet\'s disease (International Study Group)', publisher: 'The Lancet', year: 1990, type: 'tanı kriterleri', url: 'https://doi.org/10.1016/0140-6736(90)92643-V', note: 'International Study Group for Behçet\'s Disease. Lancet 1990;335(8697):1078-80' },
      { id: 'S2', title: 'Management of Behçet syndrome: a systematic literature review and EULAR recommendations', publisher: 'Annals of the Rheumatic Diseases (EULAR)', year: 2018, type: 'klinik kılavuz', url: 'https://ard.bmj.com/content/77/6/808', note: 'Hatemi G, Christensen R, et al. 2018;77(6):808-18' },
    ],
    supporting_patterns: [
      { type: 'text', terms: ['ağız ülseri', 'oral ülser', 'aft'], weight: 3, strength: 'high', note: 'Tekrarlayan oral ülser ISG kriterlerinde zorunlu bulgudur', source_id: 'S1' },
      { type: 'text', terms: ['genital ülser', 'göz', 'üveit', 'görme', 'eritema nodozum', 'paterji', 'papülopüstüler'], weight: 3, strength: 'high', note: 'Genital ülser, üveit ve deri lezyonları ISG kriterlerindendir', source_id: 'S1' },
      { type: 'geography', terms: ['türkiye', 'i̇ran', 'ırak', 'i̇pek yolu', 'orta doğu'], weight: 2, strength: 'moderate', note: 'Türkiye Behçet için yüksek prevalans bölgesidir', source_id: 'S2' },
      { type: 'symptom', terms: ['fever', 'ateş'], weight: 1, strength: 'low', note: 'Ateş sistemik ataklarda görülebilir', source_id: 'S2' },
      { type: 'text', terms: ['ateş'], weight: 1, strength: 'low', note: 'Ateş sistemik tutulumda görülebilir', source_id: 'S2' },
    ],
    excluding_patterns: [],
    key_tests: [
      { test: 'Paterji testi', rationale: 'ISG kriterlerinden biri; pozitifliği tanıyı destekler', source_id: 'S1' },
      { test: 'HLA-B51', rationale: 'Güçlü genetik ilişki; tanıyı destekler, tek başına tanı koydurmaz', source_id: 'S2' },
      { test: 'Göz dibi muayenesi (üveit taraması)', rationale: 'Üveit körlük riski nedeniyle erken tanınmalıdır', source_id: 'S2' },
      { test: 'Oral ve genital ülser öyküsünün ayrıntılı sorgulanması', rationale: 'ISG kriterlerinin çekirdeği', source_id: 'S1' },
    ],
  },
];
