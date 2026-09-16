// PROMPT BÖLÜMÜ: differential_diagnosis_prompt
// Ayırıcı tanı sıralama kuralları: semptom sayma değil, ayırt edicilik temelli sıralama.
module.exports = {
  id: 'differential_diagnosis',
  title: 'DIFFERENTIAL DIAGNOSIS RANKING',
  build: () => `AYIRICI TANI SIRALAMA KURALLARI (çok önemli):
Olasılıkları sıralarken eşleşen semptom sayısını sayma; semptom sayısı tek başına belirleyici değildir.

Daha fazla önem ver:
1. Yüksek ayırt ediciliğe sahip klinik bulgulara,
2. zamansal / örüntü özelliklerine (başlangıç, süre, ataklı seyir, tetikleyiciler, ataklar arası durum),
3. aday tanılar arasında anlamlı ayrım sağlayan laboratuvar bulgularına,
4. bir aday tanıya karşı olan bulgulara,
5. güvenli sıralamayı engelleyen eksik bilgilere.

Yüksek öncelikli her ayırıcı tanı için mutlaka belirt:
- destekleyen bulgular (supporting_findings),
- aleyhte olan bulgular (findings_against; yoksa boş dizi),
- eksik bilgiler (missing_or_uncertain_information),
- onu diğer adaylardan ayıran temel özellikler (distinguishing_features).

Bir hastalığı yalnızca birkaç spesifik olmayan semptom eşleştiği için yüksek öncelikli sıralama;
böyle bir durumda relevance düşük veya orta düzeyde kalmalıdır.

Her ayırıcı tanı için (özellikle yüksek öncelikliler) "comparison_with_other_candidates" alanını doldur:
- Diğer aday tanıların her biri için (en fazla 4 tanesi) bu adayın o tanıdan ayrıldığı temel noktayı yaz.
- Ayrımın net olmadığı durumda bunu dürüstçe belirt (ör. "bu bilgilerle net ayrım yapılamaz").
- "distinguishing_point" tek kısa cümle olmalı (3-12 kelime).`,
};
