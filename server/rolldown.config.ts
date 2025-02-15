import { defineConfig, Plugin } from 'rolldown';

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

export default defineConfig({
	input: 'src/mod.ts',
	output: {
		dir: 'dist-rolldown',
		//file: 'dist-rolldown/mod.js',
		format: 'commonjs',
		target: 'es2023',
		comments: 'none',
	},
	external: ['../config/config'],
	platform: 'node',
	plugins: [sptPathsPlugin()],
});
