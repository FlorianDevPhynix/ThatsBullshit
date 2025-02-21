/**
 * Build Script
 *
 * This script automates the build process for server-side SPT mod projects, facilitating the creation of distributable
 * mod packages. It performs a series of operations as outlined below:
 * - Loads the .buildignore file, which is used to list files that should be ignored during the build process.
 * - Loads the package.json to get project details so a descriptive name can be created for the mod package.
 * - Creates a distribution directory and a temporary working directory.
 * - Copies files to the temporary directory while respecting the .buildignore rules.
 * - Creates a zip archive of the project files.
 * - Moves the zip file to the root of the distribution directory.
 * - Cleans up the temporary directory.
 *
 * It's typical that this script be customized to suit the needs of each project. For example, the script can be updated
 * to perform additional operations, such as moving the mod package to a specific location or uploading it to a server.
 * This script is intended to be a starting point for developers to build upon.
 *
 * Usage:
 * - Run this script using npm: `npm run build`
 * - Use `npm run buildinfo` for detailed logging.
 *
 * Note:
 * - Ensure that all necessary Node.js modules are installed before running the script: `npm install`
 * - The script reads configurations from the `package.json` and `.buildignore` files; ensure they are correctly set up.
 *
 * @author Refringe
 * @version v1.0.0
 */

import os from 'node:os';
import process from 'node:process';
import { exec, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import util from 'node:util';
import fs from 'fs-extra';

import gulp from 'gulp';
import winston from 'winston';
import WinstonStream from 'winston-stream';
import minimist from 'minimist';
import ignore from 'ignore';
import archiver from 'archiver';

// Get the command line arguments to determine whether to use verbose logging.
var argv = minimist(process.argv.slice(2));
const verbose = argv.verbose || argv.v;

// Configure the Winston logger to use colours.
const logColors = {
	error: 'red',
	warn: 'yellow',
	info: 'grey',
	debug: 'green',
};
winston.addColors(logColors);

// Create a logger instance to log build progress. Configure the logger levels to allow for different levels of logging
// based on the verbosity flag, and set the console transport to log messages of the appropriate level.
const logger = winston.createLogger({
	levels: {
		error: 0,
		warn: 1,
		info: 2,
		debug: 3,
	},
	format: winston.format.combine(
		winston.format.colorize(),
		winston.format.printf((info) => {
			return `${info.level}: ${info.message}`;
		})
	),
	transports: [
		new winston.transports.Console({
			level: verbose ? 'debug' : 'info',
		}),
	],
});

/** @type {gulp.TaskFunction} */
async function typeGen() {
	const currentDir = getCurrentDirectory();

	const typesPath = path.join(currentDir, 'types');
	await fs.emptyDir(typesPath);
	logger.log('debug', 'Cleared types directory.');

	let childArgs = ['explore', 'spt-server', '--', 'npm', 'run', 'gen:types'];
	logger.log('debug', 'Executing: ' + childArgs.join(' '));
	// Run the type generation script.
	// npm explore spt-server -- npm run gen:types
	await execShell('echo', ['test', 'test2']);
	//await execShell('npm', childArgs);

	// run item generation
	// npm explore spt-server -- npm run gen:items
	/* childArgs = ['explore', 'spt-server', '--', 'npm', 'run', 'gen:items'];
	await execShell('npm', childArgs); */

	// query spt-server package
	let childResult;
	try {
		childResult = await util.promisify(exec)(
			'npm query [name="spt-server"] --json',
			{ shell: true, encoding: 'utf-8' }
		);
	} catch (error) {
		logger.log(
			'error',
			'TypeGen execution error: ' + error + '; ' + childResult.stderr
		);
	}
	/* const childResult = spawnSync(
		'npm',
		['query', '[name="spt-server"]', '--json'],
		{ shell: true, encoding: 'utf-8' }
	);
	if (childResult.error) {
		logger.log(
			'error',
			'TypeGen execution error: ' + childResult.error.message + '; ' + childResult.stderr
		);
	} */
	/**
	 * incomplete package info
	 * @typedef {Object} PackageInfo
	 * @property {string} name - The name of the package.
	 * @property {string} version - The version of the package.
	 * @property {string} location - The location of the package.
	 * @property {string} path - The path to the package.
	 * @property {string} realpath - The real path to the package.
	 */
	/** @type {PackageInfo[]} */
	const result = JSON.parse(childResult.stdout);
	if (result.length <= 0) {
		logger.log('error', 'Package spt-server not found.');
		return;
	}
	const sptServerPackages = result.filter(
		(value) => value.name === 'spt-server'
	);
	if (sptServerPackages.length <= 0) {
		logger.log('error', 'Package spt-server not found.');
		return;
	}
	const sptServerInfo = sptServerPackages[0];
	logger.log('debug', sptServerInfo.realpath);
	/* gulp.src('/**', {
		read: false,
		base: path.join(sptServerInfo.realpath, 'types').replaceAll('\\', '/'),
	}).on(''); */

	logger.log('debug', 'Start copying type files...');
	await fs.copy(path.join(sptServerInfo.realpath, 'types'), typesPath, {
		recursive: true,
	});
	logger.log('info', 'Copied type files!');
}
typeGen.displayName = 'typegen';
typeGen.description = 'Build the SPT types.';
typeGen.flags = {
	'--verbose, -v': 'Output debug information.',
};
gulp.task(typeGen);

async function devDeploy() {
	// Get the current directory where the script is being executed
	const currentDir = getCurrentDirectory();

	// output directory
	const distPath = path.join(currentDir, 'dist');

	// Load the package.json file to get project details.
	const packageJson = await loadPackageJson(currentDir);

	// packing the mod in dist folder
	await npmPack(packageJson, distPath);

	const sptUserModFolder = '../../../user/mods';
	const deployFolder = path.join(sptUserModFolder, packageJson.shortName);
	logger.log('debug', 'Deploying server mod to: ' + deployFolder);
	// clean up mod deployment folder
	await fs.emptyDir(deployFolder);
	// copy files to deployment folder
	await fs.copy(distPath, deployFolder);
	logger.log('info', 'Deployed server mod');
}

export const dev = gulp.series(devDeploy);
dev.description = 'Build and deploy for development.';
dev.flags = {
	'--verbose, -v': 'Output more debug information.',
};
gulp.task(dev);

/**
 * The main function orchestrates the build process for creating a distributable mod package. It leverages a series of
 * helper functions to perform various tasks such as loading configuration files, setting up directories, copying files
 * according to `.buildignore` rules, and creating a ZIP archive of the project files.
 *
 * Utilizes the Winston logger to provide information on the build status at different stages of the process.
 *
 * @returns {void}
 * @type {gulp.TaskFunction}
 */
async function release() {
	// Get the current directory where the script is being executed
	const currentDir = getCurrentDirectory();

	const distPath = path.join(currentDir, 'dist');
	try {
		await fs.emptyDir(distPath);
	} catch (error) {
		logger.log('error', error);
	}
	logger.log('debug', 'Cleared dist directory.');

	let childResult;
	try {
		childResult = await util.promisify(exec)('tsc', {
			shell: true,
			encoding: 'utf-8',
		});
	} catch (error) {
		logger.log(
			'error',
			'Typescript build error: ' + error + '; ' + childResult.stderr
		);
	}

	// Defining at this scope because we need to use it in the finally block.
	let projectDir;

	try {
		// Load the .buildignore file to set up an ignore handler for the build process.
		const buildIgnorePatterns = await loadBuildIgnoreFile(currentDir);

		// Load the package.json file to get project details.
		const packageJson = await loadPackageJson(currentDir);

		// Create a descriptive name for the mod package.
		const projectName = createProjectName(packageJson);
		logger.log('info', `Project name created: ${projectName}`);

		// Create a temporary working directory to perform the build operations.
		projectDir = await createTemporaryDirectoryWithProjectName(projectName);
		logger.log('info', 'Temporary working directory successfully created.');
		logger.log('debug', projectDir);

		// Copy files to the temporary directory while respecting the .buildignore rules.
		logger.log(
			'debug',
			'Beginning copy operation using .buildignore file...'
		);
		await copyFiles(currentDir, projectDir, buildIgnorePatterns);
		logger.log('info', 'Files successfully copied to temporary directory.');

		// Create a zip archive of the project files.
		logger.log('debug', 'Beginning folder compression...');
		const zipFilePath = path.join(
			path.dirname(projectDir),
			`${projectName}.zip`
		);
		await createZipFile(
			projectDir,
			zipFilePath,
			'user/mods/' + projectName
		);
		logger.log('info', 'Archive successfully created.');
		logger.log('debug', zipFilePath);

		// Move the zip file inside of the project directory, within the temporary working directory.
		const zipFileInProjectDir = path.join(projectDir, `${projectName}.zip`);
		await fs.move(zipFilePath, zipFileInProjectDir);
		logger.log('info', 'Archive successfully moved.');
		logger.log('debug', zipFileInProjectDir);

		// Move the temporary directory into the distribution directory.
		await fs.move(projectDir, distDir);
		logger.log(
			'info',
			'Temporary directory successfully moved into project distribution directory.'
		);

		// Log the success message. Write out the path to the mod package.
		logger.log('info', '------------------------------------');
		logger.log('info', 'Build script completed successfully!');
		logger.log(
			'info',
			"Your mod package has been created in the 'dist' directory:"
		);
		logger.log(
			'info',
			`/${path.relative(
				process.cwd(),
				path.join(distDir, `${projectName}.zip`)
			)}`
		);
		logger.log('info', '------------------------------------');
		if (!verbose) {
			logger.log(
				'info',
				'To see a detailed build log, use `npm run buildinfo`.'
			);
			logger.log('info', '------------------------------------');
		}
	} catch (err) {
		// If any of the file operations fail, log the error.
		logger.log('error', 'An error occurred: ' + err);
	} finally {
		// Clean up the temporary directory, even if the build fails.
		if (projectDir) {
			try {
				await fs.rm(projectDir, {
					force: true,
					recursive: true,
				});
				logger.log('debug', 'Cleaned temporary directory.');
			} catch (err) {
				logger.log(
					'error',
					'Failed to clean temporary directory: ' + err
				);
			}
		}
	}
}
release.description = 'Build for release.';
release.flags = {
	'--verbose, -v': 'Output debug information.',
};
gulp.task(release);

/**
 *
 * @param {string} command
 * @param {string[]?} args
 * @param {import('node:child_process').SpawnOptionsWithoutStdio?} options
 * @returns
 */
function execShell(command, args, options) {
	return new Promise((resolve, reject) => {
		const process = spawn(command, args, {
			shell: true,
			...options,
		});
		process.stdout.pipe(WinstonStream(logger, 'debug'));
		process.stderr.pipe(WinstonStream(logger, 'error'));
		process.on('error', (error) => logger.log('error', error));
		process.on('close', (code) => {
			logger.log('debug', 'child process exited with code ' + code);
			if (code < 0) {
				reject(code);
			} else {
				resolve(code);
			}
		});
	});
}

/**
 * Retrieves the current working directory where the script is being executed. This directory is used as a reference
 * point for various file operations throughout the build process, ensuring that paths are resolved correctly regardless
 * of the location from which the script is invoked.
 *
 * @returns {string} The absolute path of the current working directory.
 */
function getCurrentDirectory() {
	return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Loads the `package.json` file and returns its content as a JSON object. The `package.json` file contains important
 * project details such as the name and version, which are used in later stages of the build process to create a
 * descriptive name for the mod package. The method reads the file from the current working directory, ensuring that it
 * accurately reflects the current state of the project.
 *
 * @param {string} currentDirectory - The absolute path of the current working directory.
 * @returns {Promise<Object>} A promise that resolves to a JSON object containing the contents of the `package.json`.
 */
async function loadPackageJson(currentDir) {
	const packageJsonPath = path.join(currentDir, 'package.json');

	// Read the contents of the package.json file asynchronously as a UTF-8 string.
	const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');

	return JSON.parse(packageJsonContent);
}

/**
 * Removes unnecessary values from the package.json file, and writes it as a new file into the output folder.
 * @param {any} packageJson - Contents of the package.json file.
 * @param {string} outputFolder - The directory to write the package.json file into.
 */
async function processPackage(packageJson, outputFolder) {
	// keys of package.json to keep for SPT
	const packageKeys = new Set([
		'name',
		'shortName',
		'author',
		'contributors',
		'license',
		'version',
		'sptVersion',
		'loadBefore',
		'loadAfter',
		'incompatibilities',
		'isBundleMod',
		'main',
	]);
	// process package.json, only keep important values
	const outputPackage = {};
	for (const [key, value] of Object.entries(packageJson)) {
		if (packageKeys.has(key)) {
			outputPackage[key] = value;
		}
	}
	console.log(outputPackage);
	await fs.writeFile(
		path.join(outputFolder, 'package.json'),
		JSON.stringify(outputPackage, undefined, '\t')
	);
}

/**
 * Copies similar files like npm pack does to the output folder
 * @param {any} packageJson - Contents of the package.json file.
 * @param {string} outputFolder - The directory to copy the files to.
 */
async function npmPack(packageJson, outputFolder) {
	// Get the project directory
	const currentDir = getCurrentDirectory();
	// get full names of default files
	let defaultFiles = ['README', 'LICENSE', 'LICENCE'];
	// read current directory
	const dir = await fs.readdir(currentDir, {
		withFileTypes: true,
		encoding: 'utf-8',
	});
	// filter for default files
	defaultFiles = dir
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((entry) => defaultFiles.includes(path.parse(entry).name));
	logger.log('debug', 'Default files: ' + JSON.stringify(defaultFiles));

	/* // always copy package.json
	defaultFiles.push('package.json'); */
	await processPackage(packageJson, outputFolder);

	// files to copy
	const fileset = new Set(defaultFiles);
	if (!packageJson) {
		// Load the package.json file to get project details.
		packageJson = await loadPackageJson(currentDir);
	}
	const packageFiles = packageJson.files;
	logger.log('debug', 'package.files: ' + JSON.stringify(packageFiles));
	// add files from package.json files property
	for (const file of packageFiles) {
		fileset.add(file);
	}

	const files = [...fileset.values()].filter((file) => file);
	logger.log('debug', 'Copying: ' + JSON.stringify(files));
	// copy files
	await Promise.all(
		files.map((file) => {
			return (async function () {
				if ((await fs.pathExists(file)) === false) return undefined;
				await fs.copy(
					file,
					path.join(outputFolder, path.basename(file)),
					{
						errorOnExist: true,
					}
				);
				logger.log('debug', 'Copied ' + file);
			})();
		})
	);
	logger.log('info', 'Copied ' + packageFiles.length + ' files.');
}

/**
 * Loads the `.buildignore` file and sets up an ignore handler using the `ignore` module. The `.buildignore` file
 * contains a list of patterns describing files and directories that should be ignored during the build process. The
 * ignore handler created by this method is used to filter files and directories when copying them to the temporary
 * directory, ensuring that only necessary files are included in the final mod package.
 *
 * @param {string} currentDirectory - The absolute path of the current working directory.
 * @returns {Promise<ignore>} A promise that resolves to an ignore handler.
 */
async function loadBuildIgnoreFile(currentDir) {
	const buildIgnorePath = path.join(currentDir, '.buildignore');

	try {
		// Attempt to read the contents of the .buildignore file asynchronously.
		const fileContent = await fs.readFile(buildIgnorePath, 'utf-8');

		// Return a new ignore instance and add the rules from the .buildignore file (split by newlines).
		return ignore().add(fileContent.split('\n'));
	} catch (err) {
		logger.log(
			'warn',
			'Failed to read .buildignore file. No files or directories will be ignored.'
		);

		// Return an empty ignore instance, ensuring the build process can continue.
		return ignore();
	}
}

/**
 * Constructs a descriptive name for the mod package using details from the `package.json` file. The name is created by
 * concatenating the project name, version, and a timestamp, resulting in a unique and descriptive file name for each
 * build. This name is used as the base name for the temporary working directory and the final ZIP archive, helping to
 * identify different versions of the mod package easily.
 *
 * @param {Object} packageJson - A JSON object containing the contents of the `package.json` file.
 * @returns {string} A string representing the constructed project name.
 */
function createProjectName(packageJson) {
	// Remove any non-alphanumeric characters from the author and name.
	const author = packageJson.author.replace(/\W/g, '');
	const name = packageJson.name.replace(/\W/g, '');

	// Ensure the name is lowercase, as per the package.json specification.
	return `${author}-${name}`.toLowerCase();
}

/**
 * Copies the project files to the temporary directory while respecting the rules defined in the `.buildignore` file.
 * The method is recursive, iterating over all files and directories in the source directory and using the ignore
 * handler to filter out files and directories that match the patterns defined in the `.buildignore` file. This ensures
 * that only the necessary files are included in the final mod package, adhering to the specifications defined by the
 * developer in the `.buildignore` file.
 *
 * The copy operations are delayed and executed in parallel to improve efficiency and reduce the build time. This is
 * achieved by creating an array of copy promises and awaiting them all at the end of the function.
 *
 * @param {string} sourceDirectory - The absolute path of the current working directory.
 * @param {string} destinationDirectory - The absolute path of the temporary directory where the files will be copied.
 * @param {Ignore} ignoreHandler - The ignore handler created from the `.buildignore` file.
 * @returns {Promise<void>} A promise that resolves when all copy operations are completed successfully.
 */
async function copyFiles(srcDir, destDir, ignoreHandler) {
	try {
		// Read the contents of the source directory to get a list of entries (files and directories).
		const entries = await fs.readdir(srcDir, {
			withFileTypes: true,
		});

		// Initialize an array to hold the promises returned by recursive calls to copyFiles and copyFile operations.
		const copyOperations = [];

		for (const entry of entries) {
			// Define the source and destination paths for each entry.
			const srcPath = path.join(srcDir, entry.name);
			const destPath = path.join(destDir, entry.name);

			// Get the relative path of the source file to check against the ignore handler.
			const relativePath = path.relative(process.cwd(), srcPath);

			// If the ignore handler dictates that this file should be ignored, skip to the next iteration.
			if (ignoreHandler.ignores(relativePath)) {
				logger.log(
					'info',
					`Ignored: /${path.relative(process.cwd(), srcPath)}`
				);
				continue;
			}

			if (entry.isDirectory()) {
				// If the entry is a directory, create the corresponding temporary directory and make a recursive call
				// to copyFiles to handle copying the contents of the directory.
				await fs.ensureDir(destPath);
				copyOperations.push(
					copyFiles(srcPath, destPath, ignoreHandler)
				);
			} else {
				// If the entry is a file, add a copyFile operation to the copyOperations array and log the event when
				// the operation is successful.
				copyOperations.push(
					fs.copy(srcPath, destPath).then(() => {
						logger.log(
							'info',
							`Copied: /${path.relative(process.cwd(), srcPath)}`
						);
					})
				);
			}
		}

		// Await all copy operations to ensure all files and directories are copied before exiting the function.
		await Promise.all(copyOperations);
	} catch (err) {
		// Log an error message if any error occurs during the copy process.
		logger.log('error', 'Error copying files: ' + err);
	}
}

/**
 * Creates a ZIP archive of the project files located in the temporary directory. The method uses the `archiver` module
 * to create a ZIP file, which includes all the files that have been copied to the temporary directory during the build
 * process. The ZIP file is named using the project name, helping to identify the contents of the archive easily.
 *
 * @param {string} directoryPath - The absolute path of the temporary directory containing the project files.
 * @param {string} projectName - The constructed project name, used to name the ZIP file.
 * @returns {Promise<string>} A promise that resolves to the absolute path of the created ZIP file.
 */
async function createZipFile(directoryToZip, zipFilePath, containerDirName) {
	return new Promise((resolve, reject) => {
		// Create a write stream to the specified ZIP file path.
		const output = fs.createWriteStream(zipFilePath);

		// Create a new archiver instance with ZIP format and maximum compression level.
		const archive = archiver('zip', {
			zlib: { level: 9 },
		});

		// Set up an event listener for the 'close' event to resolve the promise when the archiver has finalized.
		output.on('close', function () {
			logger.log(
				'info',
				'Archiver has finalized. The output and the file descriptor have closed.'
			);
			resolve();
		});

		// Set up an event listener for the 'warning' event to handle warnings appropriately, logging them or rejecting
		// the promise based on the error code.
		archive.on('warning', function (err) {
			if (err.code === 'ENOENT') {
				logger.log(
					'warn',
					`Archiver issued a warning: ${err.code} - ${err.message}`
				);
			} else {
				reject(err);
			}
		});

		// Set up an event listener for the 'error' event to reject the promise if any error occurs during archiving.
		archive.on('error', function (err) {
			reject(err);
		});

		// Pipe archive data to the file.
		archive.pipe(output);

		// Add the directory to the archive, under the provided directory name.
		archive.directory(directoryToZip, containerDirName);

		// Finalize the archive, indicating that no more files will be added and triggering the 'close' event once all
		// data has been written.
		archive.finalize();
	});
}
