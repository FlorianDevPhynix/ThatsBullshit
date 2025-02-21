import { defineConfig, Plugin } from 'rolldown';
import babel from '@rollup/plugin-babel';

import { opendir, rm } from 'node:fs/promises';
import path from 'node:path';

export default defineConfig({
	input: 'src/mod.ts',
	output: {
		dir: 'dist/src',
		format: 'commonjs',
		target: 'es2020',
		comments: 'none',
		sourcemap: true,
		footer(chunk) {
			if (chunk.name === 'node_modules') {
				return '\n// init core-js\nrequire_iterator()';
			}
			return '';
		},
		advancedChunks: {
			groups: [
				/* {
					name: 'core-js',
					test: 'core-js',
				},
				{
					name: '@oxc-project/runtime',
					test: /@oxc-project[\\/]runtime/,
				}, */
				{
					name: 'node_modules',
					test: /node_modules[\\/]/,
				},
			],
		},
	},
	resolve: {
		tsconfigFilename: 'tsconfig.json',
	},
	external: ['../config/config'],
	platform: 'node',
	plugins: [
		sptPathsPlugin(),
		deletePlugin({
			exclude: [/package\.json/, 'dist/config', 'README.md', 'LICENSE'],
		}),
	],
});

function sptPathsPlugin(): Plugin {
	const sptRegex = new RegExp(/^@spt/);
	return {
		name: 'rollup-spt-paths-plugin',
		resolveId(source, importer, extraOptions) {
			if (source === 'tsyringe') {
				return {
					id: 'C:/snapshot/project/node_modules/tsyringe',
					external: true,
				};
			} else if (sptRegex.test(source)) {
				return {
					id: 'C:/snapshot/project/obj' + source.slice(4),
					external: true,
				};
			}
			//this.info(`${source}; ${importer}`);

			return null;
		},
	};
}

interface Options {
	/** a string property of SpecialType */
	exclude?: (string | RegExp)[];
}

/**
 * Plugin which deletes files on output folders, which were not written by rollup.
 */
function deletePlugin(options: Options = {}): Plugin {
	// Map of output directorys with Sets of files which were overridden by rollup
	const outputDirs: Map<string, Set<string>> = new Map();

	return {
		name: 'rollup-plugin-delete',

		async writeBundle(options, bundle) {
			function getOrInsert(map: Map<string, Set<string>>, key: string) {
				let value = map.get(key);
				if (!value) {
					value = new Set();
					map.set(key, value);
				}
				return value;
			}

			// create a full representation of all files and their folders in root
			for (const [bundlePath, chunk] of Object.entries(bundle)) {
				const rootDirAbsolute = path.resolve(
					process.cwd(),
					options.dir ?? path.dirname(options.file)
				);
				const chunkDirAbsolute = path.resolve(
					rootDirAbsolute,
					options.dir
						? path.dirname(chunk.fileName)
						: path.basename(chunk.fileName)
				);
				// all directory paths should be relative to the project directory
				const chunkDirRelative = path.relative(
					process.cwd(),
					chunkDirAbsolute
				);
				//this.info(rootDirAbsolute + '; ' + chunkDirRelative);
				const chunkDirName = path.basename(chunkDirRelative);
				const outputDir = getOrInsert(outputDirs, chunkDirRelative);
				outputDir.add(path.basename(chunk.fileName));

				// also insert all relative parent directory's
				const parentDirAbsolute = path.dirname(chunkDirAbsolute);
				if (parentDirAbsolute.startsWith(rootDirAbsolute) === false)
					continue;
				const parentDirRelative = path.relative(
					process.cwd(),
					parentDirAbsolute
				);
				const parentDir = getOrInsert(outputDirs, parentDirRelative);
				if (parentDir.has(chunkDirName)) continue;

				// add current folder to parent
				parentDir.add(chunkDirName);
				/* this.info(
						'$ Add ' + folderName + ' to parent ' + parentDirPath
					); */

				// get relative path from current folder to root
				const relative = path.relative(process.cwd(), chunkDirAbsolute);
				// list of parent folder names, excluding current folder
				const folders = path.parse(relative).dir.split(path.sep);
				//this.info(relative + '; ' + JSON.stringify(folders));
				if (folders && folders.length > 0) {
					// add all parent folders to their own parents
					for (let i = folders.length - 2; i >= 0; i--) {
						if (folders[i].length <= 0) continue;
						const parentAbsolute = path.join(
							process.cwd(),
							...folders.slice(0, i + 1)
						);
						const parentRelative = path.relative(
							process.cwd(),
							parentAbsolute
						);

						const parent = getOrInsert(outputDirs, parentRelative);
						parent.add(folders[i + 1]);
						/* this.info(
								folderName +
									' # Add ' +
									folders[i + 1] +
									' to parent ' +
									parentPath
							); */
					}
				}
			}
		},
		async closeBundle() {
			for (const [entry, set] of [...outputDirs.entries()]) {
				this.info(entry + ': ' + [...set.entries()].length);
			}

			// delete all files and folders, which were not output by rollup
			for (const [dirRelative, bundles] of outputDirs.entries()) {
				/* this.info(
					JSON.stringify(
						[...bundles.entries()].map((entry) => entry[0])
					)
				); */
				const dirAbsolute = path.join(process.cwd(), dirRelative);
				const dir = await opendir(dirAbsolute);
				for await (const dirEntry of dir) {
					const entryAbsolute = path.join(
						dirEntry.parentPath,
						dirEntry.name
					);
					const entryRelative = path.relative(
						process.cwd(),
						entryAbsolute
					);
					// path to match against with exclude string or regex
					const matchPathRelative = path
						.relative(
							path.join(
								process.cwd(),
								path.parse(entryRelative).dir[0]
							),
							entryAbsolute
						)
						.replaceAll('\\', '/');
					if (bundles.has(dirEntry.name) === false) {
						const matchResult = !options.exclude
							? false
							: options.exclude.some(function (entry) {
									if (typeof entry === 'string') {
										return entry === matchPathRelative;
									} else {
										return entry.test(matchPathRelative);
									}
							  });
						if (!matchResult) {
							this.info('Deleting ' + entryRelative);
							await rm(entryAbsolute, {
								force: true,
								recursive: true,
							});
						}
					}
				}
			}
		},
	};
}
