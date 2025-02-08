"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transform = transform;
/**
 * AST Transformer to rewrite any ImportDeclaration paths.
 * This is typically used to rewrite relative imports into absolute imports
 * and mitigate import path differences w/ metaserver
 */
var ts = require("typescript");
/**
 * Rewrite relative import to absolute import or trigger
 * rewrite callback
 *
 * @param {string} importPath import path
 * @param {ts.SourceFile} sf Source file
 * @param {Opts} opts
 * @returns
 */
function rewritePath(importPath, sf, opts, regexps) {
    var aliases = Object.keys(regexps);
    for (var _i = 0, aliases_1 = aliases; _i < aliases_1.length; _i++) {
        var alias = aliases_1[_i];
        var regex = regexps[alias];
        if (regexps[alias].test(importPath)) {
            // @ts-ignore
            return importPath.replace(regex, opts.alias[alias]);
        }
    }
    if (typeof opts.rewrite === 'function') {
        var newImportPath = opts.rewrite(importPath, sf.fileName);
        if (newImportPath) {
            return newImportPath;
        }
    }
    return importPath;
}
function isDynamicImport(node) {
    return (ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword);
}
function importExportVisitor(ctx, sf, opts, regexps) {
    if (opts === void 0) { opts = {}; }
    var visitor = function (node) {
        var importPath;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier) {
            var importPathWithQuotes = node.moduleSpecifier.getText(sf);
            importPath = importPathWithQuotes.substring(1, importPathWithQuotes.length - 1);
        }
        else if (isDynamicImport(node)) {
            var importPathWithQuotes = node.arguments[0].getText(sf);
            importPath = importPathWithQuotes.substring(1, importPathWithQuotes.length - 1);
        }
        else if (ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)) {
            importPath = node.argument.literal.text; // `.text` instead of `getText` bc this node doesn't map to sf (it's generated d.ts)
        }
        // @ts-ignore
        if (importPath) {
            var rewrittenPath = rewritePath(importPath, sf, opts, regexps);
            // Only rewrite relative path
            if (rewrittenPath !== importPath) {
                if (typeof opts.logger === 'function')
                    opts.logger('Rewriting ' + importPath + ' to ' + rewrittenPath);
                if (ts.isImportDeclaration(node)) {
                    return ctx.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ctx.factory.createStringLiteral(rewrittenPath), node.attributes);
                }
                else if (ts.isExportDeclaration(node)) {
                    return ctx.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, ctx.factory.createStringLiteral(rewrittenPath), node.attributes);
                }
                else if (isDynamicImport(node)) {
                    return ctx.factory.updateCallExpression(node, node.expression, node.typeArguments, ctx.factory.createNodeArray([
                        ctx.factory.createStringLiteral(rewrittenPath),
                    ]));
                }
                else if (ts.isImportTypeNode(node)) {
                    return ctx.factory.updateImportTypeNode(node, ctx.factory.createLiteralTypeNode(ctx.factory.createStringLiteral(rewrittenPath)), node.attributes, node.qualifier, node.typeArguments, node.isTypeOf);
                }
            }
            return node;
        }
        return ts.visitEachChild(node, visitor, ctx);
    };
    return visitor;
}
function transform(opts) {
    var _a = opts.alias, alias = _a === void 0 ? {} : _a;
    var regexps = Object.keys(alias).reduce(function (all, regexString) {
        all[regexString] = new RegExp(regexString, 'gi');
        return all;
    }, {});
    return function (ctx) {
        // @ts-expect-error
        return function (sf) {
            return ts.visitNode(sf, importExportVisitor(ctx, sf, opts, regexps));
        };
    };
}
