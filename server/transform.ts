/**
 * AST Transformer to rewrite any ImportDeclaration paths.
 * This is typically used to rewrite relative imports into absolute imports
 * and mitigate import path differences w/ metaserver
 */
import * as ts from 'typescript';

export interface Opts {
	rewrite?(importPath: string, sourceFilePath: string): string;
	alias?: Record<string, string>;
	logger?: (message: string) => void;
}

/**
 * Rewrite relative import to absolute import or trigger
 * rewrite callback
 *
 * @param {string} importPath import path
 * @param {ts.SourceFile} sf Source file
 * @param {Opts} opts
 * @returns
 */
function rewritePath(
	importPath: string,
	sf: ts.SourceFile,
	opts: Opts,
	regexps: Record<string, RegExp>
) {
	const aliases = Object.keys(regexps);
	for (const alias of aliases) {
		const regex = regexps[alias];
		if (regexps[alias].test(importPath)) {
			// @ts-ignore
			return importPath.replace(regex, opts.alias[alias]);
		}
	}

	if (typeof opts.rewrite === 'function') {
		const newImportPath = opts.rewrite(importPath, sf.fileName);
		if (newImportPath) {
			return newImportPath;
		}
	}

	return importPath;
}

function isDynamicImport(node: ts.Node): node is ts.CallExpression {
	return (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword
	);
}

function importExportVisitor(
	ctx: ts.TransformationContext,
	sf: ts.SourceFile,
	opts: Opts = {},
	regexps: Record<string, RegExp>
) {
	const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
		let importPath: string;
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier
		) {
			const importPathWithQuotes = node.moduleSpecifier.getText(sf);
			importPath = importPathWithQuotes.substring(
				1,
				importPathWithQuotes.length - 1
			);
		} else if (isDynamicImport(node)) {
			const importPathWithQuotes = node.arguments[0].getText(sf);
			importPath = importPathWithQuotes.substring(
				1,
				importPathWithQuotes.length - 1
			);
		} else if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteral(node.argument.literal)
		) {
			importPath = node.argument.literal.text; // `.text` instead of `getText` bc this node doesn't map to sf (it's generated d.ts)
		}

		// @ts-ignore
		if (importPath) {
			const rewrittenPath = rewritePath(importPath, sf, opts, regexps);

			// Only rewrite relative path
			if (rewrittenPath !== importPath) {
				if (typeof opts.logger === 'function')
					opts.logger(
						'Rewriting ' + importPath + ' to ' + rewrittenPath
					);

				if (ts.isImportDeclaration(node)) {
					return ctx.factory.updateImportDeclaration(
						node,
						node.modifiers,
						node.importClause,
						ctx.factory.createStringLiteral(rewrittenPath),
						node.attributes
					);
				} else if (ts.isExportDeclaration(node)) {
					return ctx.factory.updateExportDeclaration(
						node,
						node.modifiers,
						node.isTypeOnly,
						node.exportClause,
						ctx.factory.createStringLiteral(rewrittenPath),
						node.attributes
					);
				} else if (isDynamicImport(node)) {
					return ctx.factory.updateCallExpression(
						node,
						node.expression,
						node.typeArguments,
						ctx.factory.createNodeArray([
							ctx.factory.createStringLiteral(rewrittenPath),
						])
					);
				} else if (ts.isImportTypeNode(node)) {
					return ctx.factory.updateImportTypeNode(
						node,
						ctx.factory.createLiteralTypeNode(
							ctx.factory.createStringLiteral(rewrittenPath)
						),
						node.attributes,
						node.qualifier,
						node.typeArguments,
						node.isTypeOf
					);
				}
			}
			return node;
		}
		return ts.visitEachChild(node, visitor, ctx);
	};

	return visitor;
}

export function transform(opts: Opts): ts.TransformerFactory<ts.SourceFile> {
	const { alias = {} } = opts;
	const regexps: Record<string, RegExp> = Object.keys(alias).reduce(
		(all, regexString) => {
			all[regexString] = new RegExp(regexString, 'gi');
			return all;
		},
		{} as Record<string, RegExp>
	);
	return (ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> => {
		// @ts-expect-error
		return (sf: ts.SourceFile) =>
			ts.visitNode(sf, importExportVisitor(ctx, sf, opts, regexps));
	};
}
