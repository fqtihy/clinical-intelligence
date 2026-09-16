
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function typeMatches(value, expectedType) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validateAgainstSchema(value, schema, path = '$') {
  const errors = [];
  walk(value, schema, path, errors);
  return { valid: errors.length === 0, errors };
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function walk(value, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  const expectedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (expectedTypes.length > 0) {
    const ok = expectedTypes.some((t) => typeMatches(value, t));
    if (!ok) {
      addError(
        errors,
        path,
        'TYPE_MISMATCH',
        `beklenen tip: ${expectedTypes.join(' | ')}, bulunan: ${value === null ? 'null' : typeof value}`,
      );
      return; // tip yanlışsa alt alanları gezmek anlamsız
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    addError(
      errors,
      path,
      'ENUM_VIOLATION',
      `izin verilen değerler: [${schema.enum.join(', ')}], bulunan: ${JSON.stringify(value)}`,
    );
    return;
  }

  if (schema.type === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          addError(errors, `${path}.${key}`, 'REQUIRED_MISSING', 'zorunlu alan eksik');
        }
      }
    }
    const props = schema.properties || {};
    for (const key of Object.keys(props)) {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined) {
        walk(value[key], props[key], `${path}.${key}`, errors);
      }
    }
    return;
  }

  if (schema.type === 'array') {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      addError(errors, path, 'MIN_ITEMS', `en az ${schema.minItems} öğe gerekli, bulunan: ${value.length}`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      addError(errors, path, 'MAX_ITEMS', `en fazla ${schema.maxItems} öğe olabilir, bulunan: ${value.length}`);
    }
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, i) => walk(item, schema.items, `${path}[${i}]`, errors));
    }
    return;
  }
}

function summarizeSchemaErrors(errors, max = 8) {
  if (!Array.isArray(errors)) return [];
  return errors.slice(0, max).map((e) => `${e.path}: ${e.message}`);
}

module.exports = { validateAgainstSchema, summarizeSchemaErrors };
