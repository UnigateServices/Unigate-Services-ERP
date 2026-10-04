export const MODULE_KEYS = [
  'finance',
  'exchange',
  'gold',
  'aviation',
  'engineering',
  'hr',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleDefinition = {
  key: ModuleKey;
  ready: boolean;
};

/** Product capability. Not stored per company. All foundation modules are not ready yet. */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = MODULE_KEYS.map((key) => ({
  key,
  ready: false,
}));

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
