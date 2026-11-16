import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'src/dev/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // React Compiler advice. The compiler is not enabled; keep these visible as warnings.
    rules: {
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
];

export default config;
