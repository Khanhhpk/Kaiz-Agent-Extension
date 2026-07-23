import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/index.ts',
    output: {
        file: 'index.js',
        format: 'iife',
        name: 'KaizAgentExtension',
        sourcemap: true,
    },
    plugins: [resolve({ browser: true }), commonjs(), typescript()],
};
