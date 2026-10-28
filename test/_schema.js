"use strict";
/** A small JSON-Schema checker for the subset docs/openapi.yaml uses (type, enum, oneOf, allOf, properties, required, items). */
const createChecker = (spec) => {
  const resolve = (schema) => (schema.$ref ? spec.components.schemas[schema.$ref.split("/").pop()] : schema);
  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  const check = (schema, value, at = "$") => {
    const errors = [];
    const sc = resolve(schema);
    if (sc.allOf) return sc.allOf.flatMap((s) => check(s, value, at));
    if (sc.oneOf) return sc.oneOf.some((s) => check(s, value, at).length === 0) ? [] : [`${at}: matches none of oneOf (got ${JSON.stringify(value)?.slice(0, 80)})`];
    if (sc.enum) return sc.enum.includes(value) ? [] : [`${at}: ${JSON.stringify(value)} not in enum`];
    if (sc.type) {
      const types = Array.isArray(sc.type) ? sc.type : [sc.type];
      const t = typeOf(value);
      if (!(types.includes(t) || (t === "integer" && types.includes("number")))) return [`${at}: expected ${types.join("|")}, got ${t}`];
    }
    if (sc.type === "object" || (Array.isArray(sc.type) && sc.type.includes("object") && value && typeof value === "object")) {
      for (const k of sc.required || []) if (!(k in value)) errors.push(`${at}.${k}: required but missing`);
      for (const [k, sub] of Object.entries(sc.properties || {})) if (k in value) errors.push(...check(sub, value[k], `${at}.${k}`));
    }
    if (sc.type === "array" && sc.items) value.forEach((v, i) => errors.push(...check(sc.items, v, `${at}[${i}]`)));
    return errors;
  };
  return { check, resolve };
};
module.exports = { createChecker };
