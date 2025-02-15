import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';

import { opendir, rm } from 'node:fs/promises';
import path from 'node:path';

/** @type {import('rollup').RollupOptions} */
export default {
	input: 'src/mod.ts',
	output: {
		dir: 'dist',
		format: 'commonjs',
		preserveModules: true,
	},
	external: ['../config/config'],
	plugins: [
		resolve(),
		commonjs(),
		sptPathsPlugin(),
		deletePlugin(),
		babel({
			babelHelpers: 'bundled',
			extensions: ['.ts', '.js'],
			exclude: [/core-js/],
		}),
		typescript(),
	],
};

/**
 *
 * @returns {import('rollup').Plugin}
 */
function sptPathsPlugin() {
	const sptRegex = new RegExp(/^@spt/);

	return {
		name: 'rollup-plugin-spt-paths',

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

			/* if (source.startsWith('core-js')) {
				this.info(source);
				//this.info(`${source}; ${importer}`);
			} */

			return null;
		},
	};
}

/**
 * Plugin which deletes files on output folders, which were not written by rollup.
 * @returns {import('rollup').Plugin}
 */
function deletePlugin() {
	return {
		name: 'rollup-plugin-delete',

		async writeBundle(options, bundle) {
			/**
			 * Map of output directorys with Sets of files which were overridden by rollup
			 * @type {Map<string, Set<string>>}
			 */
			const outputDirs = new Map();
			/**
			 *
			 * @param {Map<string, Set<string>} map
			 */
			function getOrInsert(map, key) {
				let value = map.get(key);
				if (!value) {
					value = new Set();
					map.set(key, value);
				}
				return value;
			}

			// create a full representation of all files and their folders in root
			for (const [bundlePath, chunk] of Object.entries(bundle)) {
				const dir = path.resolve(process.cwd(), options.dir ?? '');
				const folderPath = path.resolve(
					dir,
					path.dirname(chunk.fileName)
				);
				const folderName = path.basename(folderPath);
				const outputDir = getOrInsert(outputDirs, folderPath);
				outputDir.add(path.basename(chunk.fileName));

				// also insert all relative parent directory's
				const parentDirPath = path.dirname(folderPath);
				const parentDir = getOrInsert(outputDirs, parentDirPath);
				if (parentDir.has(folderName) === false) {
					// add current folder to parent
					parentDir.add(folderName);
					/* this.info(
						'$ Add ' + folderName + ' to parent ' + parentDirPath
					); */

					// get relative path from current folder to root
					const parentForRelative = path.dirname(dir);
					const relative = path.relative(
						parentForRelative,
						folderPath
					);
					// list of parent folder names, excluding current folder
					const folders = path.parse(relative).dir.split(path.sep);
					//this.info(relative + '; ' + JSON.stringify(folders));
					if (folders && folders.length > 0) {
						// add all parent folders to their own parents
						for (let i = folders.length - 2; i >= 0; i--) {
							if (folders[i].length <= 0) continue;
							const parentPath = path.join(
								parentForRelative,
								...folders.slice(0, i + 1)
							);

							const parent = getOrInsert(outputDirs, parentPath);
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
			}

			/* for (const [entry, set] of [...outputDirs.entries()]) {
				this.info(entry + ': ' + [...set.entries()].length);
			} */

			for (const [dir, bundles] of outputDirs.entries()) {
				/* this.info(
					JSON.stringify(
						[...bundles.entries()].map((entry) => entry[0])
					)
				); */
				const folder = await opendir(dir);
				for await (const entry of folder) {
					const entryPath = path.join(entry.parentPath, entry.name);
					if (bundles.has(entry.name) === false) {
						this.info(
							'Deleting ' +
								path.relative(path.dirname(dir), entryPath)
						);
						await rm(entryPath, { force: true, recursive: true });
					}
				}
			}
		},
	};
}
