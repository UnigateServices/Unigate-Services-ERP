import tseslint from 'typescript-eslint';

// Phase 4b: screens must use components/ui/* primitives instead of raw controls (warn for now, error later).
const RAW = ['button', 'input', 'select', 'textarea', 'table'];

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-syntax': [
        'warn',
        ...RAW.map((tag) => ({
          selector: `JSXOpeningElement[name.name='${tag}']`,
          message: `استخدم مكوّن components/ui بدل <${tag}> الخام.`,
        })),
        {
          selector: "ImportDeclaration[source.value=/ops-|search-combobox/]",
          message: 'مكونات ops-* و search-combobox محذوفة؛ استخدم components/ui.',
        },
      ],
    },
  },
  { files: ['components/ui/**'], rules: { 'no-restricted-syntax': 'off' } },
);