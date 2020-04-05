import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import dsv from '@rollup/plugin-dsv';
import typescript from '@rollup/plugin-typescript';
import { version } from './package.json';
import babel from 'rollup-plugin-babel';
import ts from 'typescript';
import fs from 'fs';

const tsv = {
	processRow(row) {
		return [row.unicode, row.latex];
	},
};

// Allows CLI util to get the option documentation from ts source files
const docsResolve = {
	name: 'docs-resolve',
	resolveId(source) {
		return source === 'DOCS' ? source : null;
	},
	load(id) {
		if (id !== 'DOCS') return null;
		const program = ts.createProgram([__dirname + '/src/options.d.ts'], {
			target: ts.ScriptTarget.ES5,
			module: ts.ModuleKind.CommonJS,
		});
		const checker = program.getTypeChecker();
		const sourceFile = program
			.getSourceFiles()
			.find(({ path }) => path.endsWith('/src/options.d.ts'));
		const typeToString = (member) => {
			try {
				return checker.typeToString(
					checker.getTypeOfSymbolAtLocation(
						member.symbol,
						member.symbol.valueDeclaration
					)
				);
			} catch (e) {
				console.error(member, e);
			}
		};
		const options = [];
		ts.forEachChild(sourceFile, (node) => {
			const symbol = checker.getSymbolAtLocation(node.name);
			if (symbol && symbol.escapedName === 'Options') {
				const members = symbol.declarations[0].type.members;
				members.forEach((member) => {
					const key = member.name.escapedText;
					options.push({
						key,
						cli: key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), // convert camelCase to --dash-argument
						description: member.jsDoc[0].comment.replace(/\s+/g, ' '),
						examples: (member.jsDoc[0].tags || []).map((m) => m.comment),
						type: typeToString(member),
					});
				});
			}
		});
		return 'export default ' + JSON.stringify(options, null, 2) + ';';
	},
};

const makeExecutable = {
	name: 'make-executable',
	writeBundle(options) {
		const filename = options && (options.file || options.dest);
		fs.chmodSync(filename, 0o755); // rwxr-xr-x
	},
};

const banner = `/**
 * bibtex-tidy v${version}
 * https://github.com/FlamingTempura/bibtex-tidy
 * 
 * DO NOT EDIT THIS FILE. This file is automatically generated 
 * using \`npm run build\`. Edit files in './src' then rebuild.
 **/`;

const babelcfg = {
	presets: [
		[
			'@babel/env',
			{
				targets: {
					edge: '17',
					firefox: '60',
					chrome: '67',
					safari: '11.1',
				},
			},
		],
	],
};

export default [
	{
		input: 'src/index.ts',
		plugins: [
			typescript(),
			docsResolve,
			dsv(tsv),
			commonjs(),
			nodeResolve(),
			babel(babelcfg),
		],
		output: {
			name: 'bibtexTidy',
			file: 'bibtex-tidy.js',
			format: 'umd',
			banner,
		},
	},
	{
		input: 'src/cli.ts',
		plugins: [
			typescript(),
			docsResolve,
			dsv(tsv),
			commonjs(),
			nodeResolve(),
			babel(babelcfg),
			makeExecutable,
		],
		output: {
			name: 'bibtexTidy',
			file: 'bin/bibtex-tidy',
			format: 'cjs',
			banner: '#!/usr/bin/env node\n' + banner,
		},
	},
];
