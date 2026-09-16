// PII koruması: ham vaka yükü model katmanına ulaşmadan önce reddedilir.
// Değerler hiçbir zaman hata/log metnine yazılmaz.
const { ApiError } = require('../middleware/errorHandler');

const PII_PATTERNS = [
  { type: 'e-posta adresi', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu },
  { type: 'telefon numarası', pattern: /(?<!\d)(?:\+?90[\s.-]?)?(?:0?5\d{2}|0\d{3})[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/u },
  { type: 'TC kimlik numarası', pattern: /(?<!\d)\d{11}(?!\d)/u },
];

function collectStrings(value, path = '') {
  if (typeof value === 'string') return [{ path, value }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => collectStrings(child, path ? `${path}.${key}` : key));
}

function assertNoPii(payload) {
  for (const item of collectStrings(payload)) {
    for (const rule of PII_PATTERNS) {
      if (rule.pattern.test(item.value)) {
        throw new ApiError(
          422,
          'PII_NOT_ALLOWED',
          `Kişisel kimlik bilgisi (${rule.type}) kabul edilmez. Lütfen yalnızca sentetik/anonim vaka bilgisi girin.`,
          { field: item.path, type: rule.type },
        );
      }
    }
  }
}

module.exports = { assertNoPii, PII_PATTERNS };
