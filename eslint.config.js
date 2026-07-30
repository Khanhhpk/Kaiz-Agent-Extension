import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        ignores: ['dist/**', 'build/**', 'node_modules/**', 'index.js', 'fix_eslint.js', 'userscripts/**'],
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                $: 'readonly',
                jQuery: 'readonly',
                toastr: 'readonly',
                SillyTavern: 'readonly',
            },
        },
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-empty': 'warn',
            'no-useless-escape': 'warn',
            'no-prototype-builtins': 'warn',
        },
    },
);
