// PROMPT BÖLÜMÜ: evidence_tree_prompt
// Kanıt ağacı: girdideki kanıtlar ile aday tanılar arasındaki açıklanabilir ilişkiler.
module.exports = {
  id: 'evidence_tree',
  title: 'EVIDENCE TREE',
  build: () => `KANIT AĞACI (çok önemli):
"evidence_tree" alanı, bu analizin nasıl oluştuğunu sağlık profesyonelinin bağımsız olarak inceleyebileceği şekilde gösterir.
Bu, modelin gizli iç muhakemesi DEĞİLDİR; yalnızca sunulan kanıtlar ile aday tanılar arasındaki açıklanabilir ilişkileri çizer.

Kurallar:
1. "findings" yalnızca hasta girdisinde GERÇEKTEN bulunan bulgulardan oluşur (semptom, laboratuvar sonucu, öykü öğesi, seyir özelliği).
   Hiçbir bulgu uydurma; hastada olmayan semptom veya laboratuvar sonucu ekleme.
   "type" yalnızca: "symptom" | "laboratory" | "history" | "pattern" (ör. ataklı seyir bir pattern'dir).
2. "links" yalnızca findings'tan diagnosis_nodes'a gider (from = bulgu id, to = tanı id).
   "type" yalnızca: "supports" (bulgu tanıyı destekliyor) | "weakens" (bulgu tanıyı zayıflatıyor).
   Aynı bulgu birden fazla tanıyı destekleyebilir; yalnızca gerçek ilişkileri çiz, zorlama bağlantı kurma.
3. "diagnosis_nodes" yalnızca differential_diagnoses içindeki adayların adlarını kullanır (label birebir aynı olmalı).
   "conclusion" tek kısa sonuç cümlesidir (ör. "SLE güçlenir: kelebek döküntü ve ANA pozitifliği önceliği artırıyor.").
4. "confirmatory_clues": bu tanıyı daha da güçlendirecek ancak HASTADA HENÜZ GÖRÜLMEMİŞ veya BİLİNMEYEN,
   doğrulanması gereken ipuçlarıdır (ör. "Güneş ilişkisi", "Oral ülser", "Lökopeni"). Bunları mevcut kanıt gibi gösterme;
   ayrıca bu ipuçları differential_diagnoses'teki "missing_or_uncertain_information" ile tutarlı olmalı. En fazla 4 ipucu.
5. "root_label": vakanın tek satırlık, nötr özeti (ör. "21 yaş kadın; tekrarlayan ateş, döküntü, eklem ağrısı").
6. Ağaç sade ve okunabilir olmalı: en fazla 8 bulgu, en fazla 6 bağlantı. Gereksiz düğüm ekleme.
7. evidence_tree'de gösterilen her ilişki yukarıdaki alanlarla (supporting_findings, findings_against, key_findings_used) tutarlı olmalı; çelişkili çizim yapma.`,
};
