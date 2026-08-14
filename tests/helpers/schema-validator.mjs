function typeMatches(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function resolvePointer(document, pointer) {
  return pointer
    .replace(/^#\//u, "")
    .split("/")
    .reduce((value, segment) => value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}

export function validateSchema(value, schema, documents, path = "$") {
  const errors = [];
  if (schema.$ref) {
    const [filename, pointer = ""] = schema.$ref.split("#");
    const document = filename ? documents[filename] : schema;
    const resolved = pointer ? resolvePointer(document, `#${pointer}`) : document;
    if (!resolved) return [`${path}: unresolved schema reference ${schema.$ref}`];
    return validateSchema(value, resolved, documents, path);
  }
  if (schema.type && !typeMatches(value, schema.type)) return [`${path}: expected ${schema.type}`];
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: string is too short`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: string does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: number is below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: number is above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: array has too few items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: array items are not unique`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, documents, `${path}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}: missing required property ${key}`);
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) errors.push(...validateSchema(value[key], child, documents, `${path}.${key}`));
    }
    const known = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(value)) {
      if (known.has(key)) continue;
      if (schema.additionalProperties === false) errors.push(`${path}: unexpected property ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(...validateSchema(value[key], schema.additionalProperties, documents, `${path}.${key}`));
      }
    }
  }
  return errors;
}
