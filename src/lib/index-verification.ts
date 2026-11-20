export type IndexDefinition = {
  key: Record<string, unknown>;
  name: string;
  options: Record<string, unknown>;
};

const relevantOptions = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'hidden',
  'wildcardProjection',
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',
  '2dsphereIndexVersion',
  'bits',
  'min',
  'max',
  'bucketSize',
  'storageEngine',
  'prepareUnique',
  'clustered',
  'columnstoreProjection',
] as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

export function indexName(key: Record<string, unknown>) {
  return Object.entries(key).map(([field, direction]) => `${field}_${String(direction)}`).join('_');
}

export function indexMatches(actual: IndexDefinition | undefined, expected: IndexDefinition): boolean {
  if (!actual || actual.name !== expected.name) return false;
  const actualKeys = Object.entries(actual.key);
  const expectedKeys = Object.entries(expected.key);
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some(([field, value], index) => field !== expectedKeys[index][0] || stable(value) !== stable(expectedKeys[index][1]))) {
    return false;
  }

  return relevantOptions.every((option) => stable(actual.options[option]) === stable(expected.options[option]));
}
