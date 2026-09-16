// PROMPT BÖLÜMÜ: json_discipline_prompt (v1.1+)
// JSON dışı üretimi ("Tabii, işte analiziniz: ..." tarzı öncü/arka metin, gerekçelendirme
// paragrafı, markdown çiti) kesin biçimde yasaklayan kısa ve sert disiplin bölümü.
// v1.0'da yoktur; v1.1 ile eklenen yamadır. Structured Output güvenilirliğini artırmak
// için eklenmiştir; etkisi A/B karşılaştırmasıyla ölçülebilir (bkz. versions.js notları).
module.exports = {
  id: 'json_discipline',
  title: 'JSON OUTPUT DISCIPLINE',
  build: () => `JSON OUTPUT DISCIPLINE (absolute rule):
* Your entire reply is ONE JSON object. The first character of your reply is "{" and the last character is "}".
* NEVER start with greetings, acknowledgments, or meta-commentary such as "Sure", "Here is your analysis", "Tabii", "İşte". NEVER end with offers of help or follow-up sentences.
* Do not use markdown code fences. Do not write any text before or after the JSON object, not even a single word.
* If you feel the urge to explain or justify anything, put it inside the JSON fields — never outside them.`,
};
