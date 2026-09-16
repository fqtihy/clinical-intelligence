// PROMPT BÖLÜMÜ: structured_reasoning
// "AI neden bunu yaptı?" motoru: modelin gizli düşünce zinciri GÖSTERİLMEZ.
// Bunun yerine her tanı için üç yapılandırılmış, denetlenebilir liste istenir:
//   supporting_findings     -> tanıyı destekleyen bulgular (✓)
//   contradicting_findings  -> tanıyı zayıflatan bulgular (⚠)
//   discriminative_findings -> diğer adaylardan ayıran bulgular (★)
// Bu, "neden" sorusuna yapılandırılmış, denetlenebilir bir cevaptır; gizli
// muhakemenin ifşa edilmesi değildir.
module.exports = {
  id: 'structured_reasoning',
  title: 'STRUCTURED REASONING SUMMARY',
  build: () => `YAPILANDIRILMIŞ GEREKÇE ÖZETİ (çok önemli):
Gizli düşünce zincirini gösterme, adım adım muhakeme metni yazma. Bunun yerine her
ayırıcı tanı kartında "reasoning" nesnesini ÜÇ YAPILANDIRILMIŞ LİSTE olarak doldur:

1. "reasoning.supporting_findings" (✓):
   - Tanıyı DESTEKLEYEN bulgular; her öğe tek kısa ifade (ör. "Tekrarlayan ateş").
   - Yalnızca girdide GERÇEKTEN bulunan bulgular; en fazla 5 öğe. Bulgu yoksa boş dizi.

2. "reasoning.contradicting_findings" (⚠):
   - Tanıyı ZAYIFLATAN bulgular; her öğe tek kısa ifade (ör. "Döküntü mevcut").
   - findings_against ile tutarlı olmalı; buradaki her öğe findings_against ile çelişmemeli.
   - Çelişkili bulgu yoksa boş dizi; uydurma zayıflık üretme.

3. "reasoning.discriminative_findings" (★):
   - Bu tanıyı diğer adaylardan AYIRT EDEN bulgular; her öğe bir nesne:
     { "finding": "Atakların süresi", "rationale": "FMF atakları genellikle 1-3 gün sürer" }
   - Ayırt edici bulgu, mümkünse bir ayırt edici teste dönüştürülebilir olmalı
     (ör. atak süresi, ataklar arası düzelme, tetikleyici).
   - En fazla 3 öğe; net ayırt edici özellik yoksa boş dizi.

KURALLAR:
- Bu üç liste, kartın geri kalanındaki supporting_findings / findings_against /
  distinguishing_features ile ÇELİŞMEMELİ; bunlar aynı klinik gerçekliğin
  yapılandırılmış özetidir (destekleyen ✓, zayıflatan ⚠, ayırt edici ★).
- Her öğe kısa ve denetlenebilir olmalı; hastada bulunmayan bulgu uydurma.
- reasoning bloğu modelin iç monoloğu değildir; kanıta dayalı, yapılandırılmış
  bir gerekçe özetidir. Model kendi düşünme sürecini asla anlatmaz.`,
};
