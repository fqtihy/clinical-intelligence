// Genel yardımcılar: HTML kaçışı ve küçük DOM/format araçları.

/** XSS'e karşı kullanıcı/AI kaynaklı metinleri HTML içinde güvenli şekilde göster. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Bugünün yerel tarihini kısa biçimde döndürür (ör. 28 Ağu 2026). */
export function formatDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO tarihi + saati kısa biçimde döndürür. */
export function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Cinsiyet değerini Türkçe etikete çevirir. */
export function sexLabel(sex) {
  const map = { male: 'Erkek', female: 'Kadın', unspecified: 'Belirtilmemiş' };
  return map[sex] || sex || '-';
}

/** rastgele kimlik üretir (yerel kayıtlar için). */
export function uid() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
