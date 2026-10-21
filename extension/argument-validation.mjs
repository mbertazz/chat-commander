// Schema-only diagnostics: report paths/rules, never argument values or unknown keys.
export function schemaIssues(schema, value, path = 'arguments', issues = []) {
    if (issues.length >= 8)
        return issues;
    const add = (code, expected) => issues.push({
        path, code, expected
    });
    if (schema.anyOf) {
        const alternatives = schema.anyOf.map(branch => ({
            branch, errors: schemaIssues(branch, value, path, [])
        }));
        if (alternatives.some(choice => choice.errors.length === 0))
            return issues;
        const sameType = alternatives.find(({ branch }) => branch.type === 'string' && typeof value === 'string' || branch.type === 'null' && value === null);
        if (sameType)
            issues.push(...sameType.errors.slice(0, 8 - issues.length));
        else
            add('type', schema.anyOf.map(branch => branch.type).join(' or '));
        return issues;
    }
    const object = value !== null && typeof value === 'object' && !Array.isArray(value);
    const matches = schema.type === 'object' ? object
        : schema.type === 'array' ? Array.isArray(value)
            : schema.type === 'null' ? value === null
                : schema.type === 'integer' ? Number.isInteger(value)
                    : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
                        : typeof value === schema.type;
    if (schema.type && !matches) {
        add('type', schema.type);
        return issues;
    }
    if (schema.type === 'object') {
        for (const key of schema.required ?? []) {
            if (!Object.hasOwn(value, key) && issues.length < 8)
                issues.push({
                    path: `${path}.${key}`, code: 'required', expected: 'present'
                });
        }
        if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties ?? {}, key))) {
            add('unexpected_fields', `only ${(Object.keys(schema.properties ?? {})).join(', ')}`);
        }
        for (const [key, child] of Object.entries(schema.properties ?? {})) {
            if (Object.hasOwn(value, key))
                schemaIssues(child, value[key], `${path}.${key}`, issues);
        }
    }
    if (schema.type === 'array') {
        if (schema.minItems !== undefined && value.length < schema.minItems)
            add('min_items', `at least ${schema.minItems}`);
        if (schema.maxItems !== undefined && value.length > schema.maxItems)
            add('max_items', `at most ${schema.maxItems}`);
        if (schema.items)
            value.slice(0, 100).forEach((item, i) => schemaIssues(schema.items, item, `${path}[${i}]`, issues));
    }
    if (schema.type === 'string') {
        if (schema.minLength !== undefined && value.length < schema.minLength)
            add('min_length', `at least ${schema.minLength} characters`);
        if (schema.maxLength !== undefined && value.length > schema.maxLength)
            add('max_length', `at most ${schema.maxLength} characters`);
        if (schema.pattern && !new RegExp(schema.pattern).test(value))
            add('pattern', schema.pattern);
    }
    if (schema.type === 'integer' || schema.type === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum)
            add('minimum', `at least ${schema.minimum}`);
        if (schema.maximum !== undefined && value > schema.maximum)
            add('maximum', `at most ${schema.maximum}`);
    }
    return issues.slice(0, 8);
}
