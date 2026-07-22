import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        ignores: ['dist/**', 'build/**', 'node_modules/**', 'index.js', 'fix_eslint.js'],
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
            'no-useless-escape': 'off',
            'no-prototype-builtins': 'off',
            'no-useless-assignment': 'off',
            'preserve-caught-error': 'off',
        },
    },
);
