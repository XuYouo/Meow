import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineContract } from '../shared/contracts/api';
import { RouteRegistry } from '../server/system/http/RouteRegistry';

const root=process.cwd();
const options=ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json',ts.sys.readFile).config,ts.sys,root).options;
function files(directory: string): string[] {
  return readdirSync(directory,{ withFileTypes: true }).flatMap((entry) => entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
}
const sources=['src','server','shared'].flatMap(files).filter((file) => /\.tsx?$/.test(file)&&!file.includes('/__tests__/'));
const parsed=new Map(sources.map((file) => [file,ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)]));
function walk(node: ts.Node,visitor: (node: ts.Node) => void): void { visitor(node);ts.forEachChild(node,(child) => walk(child,visitor)); }
function resolve(file: string,specifier: string): string|undefined {
  const resolved=ts.resolveModuleName(specifier,path.resolve(file),options,ts.sys).resolvedModule?.resolvedFileName;
  if (resolved&&!resolved.includes('/node_modules/')) return path.relative(root,resolved);
  const asset=path.resolve(path.dirname(file),specifier);
  return specifier.startsWith('.')&&existsSync(asset)?path.relative(root,asset):undefined;
}
function isRuntimeImport(node: ts.ImportDeclaration|ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) return !node.isTypeOnly&&(!node.exportClause||!ts.isNamedExports(node.exportClause)||node.exportClause.elements.some((item) => !item.isTypeOnly));
  const clause=node.importClause;
  return !clause||!clause.isTypeOnly&&(Boolean(clause.name)||!clause.namedBindings||!ts.isNamedImports(clause.namedBindings)||clause.namedBindings.elements.some((item) => !item.isTypeOnly));
}
function imports(file: string,runtimeOnly=false): { specifier: string;target?: string }[] {
  const result: { specifier: string;target?: string }[]=[];
  const source=parsed.get(file);if (!source) return result;
  walk(source,(node) => {
    let specifier: string|undefined;
    if ((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&(!runtimeOnly||isRuntimeImport(node))) specifier=node.moduleSpecifier.text;
    if (ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])) specifier=node.arguments[0].text;
    if (specifier) result.push({ specifier,target: resolve(file,specifier) });
  });return result;
}
function bindings(file: string): Map<string,{ file: string;name: string }> {
  const result=new Map<string,{ file: string;name: string }>();
  for (const statement of parsed.get(file)?.statements??[]) {
    if (!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target=resolve(file,statement.moduleSpecifier.text),named=statement.importClause?.namedBindings;
    if (!target||!named||!ts.isNamedImports(named)) continue;
    for (const binding of named.elements) result.set(binding.name.text,{ file: target,name: binding.propertyName?.text??binding.name.text });
  }return result;
}
function property(node: ts.ObjectLiteralExpression,name: string): ts.ObjectLiteralElementLike|undefined { return node.properties.find((item) => item.name?.getText()===name); }
function key(file: string,name: string): string { return `${file}#${name}`; }
const contracts=new Map<string,{ method: string;path: string;domain?: string }>();
for (const [file,source] of parsed) if (file.startsWith('shared/contracts/')) walk(source,(node) => {
  if (!ts.isVariableDeclaration(node)||!ts.isIdentifier(node.name)||!node.initializer||!ts.isCallExpression(node.initializer)||node.initializer.expression.getText()!=='defineContract') return;
  const [method,url]=node.initializer.arguments;
  if (method&&url&&ts.isStringLiteral(method)&&ts.isStringLiteral(url)) contracts.set(key(file,node.name.text),{ method: method.text,path: url.text,domain: file.match(/^shared\/contracts\/([^/]+)\/index\.ts$/)?.[1] });
});
interface Registration { file: string;action?: string }
const registrations=new Map<string,Registration[]>();
const registrationErrors: string[]=[];
for (const [file,source] of parsed) if (file.startsWith('server/')) {
  const imported=bindings(file);
  walk(source,(node) => {
    if (!ts.isCallExpression(node)||!ts.isPropertyAccessExpression(node.expression)||node.expression.name.text!=='register') return;
    const record=node.arguments[0];if (!record||!ts.isObjectLiteralExpression(record)) return;
    const contract=property(record,'contract'),access=property(record,'access'),handler=property(record,'handler');
    if (!contract||!ts.isPropertyAssignment(contract)||!ts.isIdentifier(contract.initializer)) return;
    const binding=imported.get(contract.initializer.text),contractKey=binding?key(binding.file,binding.name):undefined;
    if (!contractKey||!contracts.has(contractKey)) { registrationErrors.push(`${file}: route must use a shared contract`);return; }
    if (!access||!ts.isPropertyAssignment(access)||!ts.isStringLiteral(access.initializer)||!['public','owner'].includes(access.initializer.text)) registrationErrors.push(`${file}: missing explicit access`);
    const domain=contracts.get(contractKey)?.domain,actions=new Set<string>();
    if (handler&&domain) walk(handler,(child) => {
      if (!ts.isCallExpression(child)||!ts.isIdentifier(child.expression)) return;
      const call=imported.get(child.expression.text);
      if (call?.name==='plan'&&call.file.startsWith(`server/services/${domain}/api/`)) actions.add(path.basename(call.file,'APIMessage.ts'));
    });
    if (domain&&actions.size!==1) registrationErrors.push(`${file}: ${contractKey} must call one owned use case`);
    const list=registrations.get(contractKey)??[];list.push({ file,action: [...actions][0] });registrations.set(contractKey,list);
  });
}

describe('architecture invariants of the supported runtime',() => {
  it('keeps both entrypoint graphs in TypeScript and rejects retired platform dependencies',() => {
    const problems: string[]=[],visited=new Set<string>();
    const visit=(file: string) => {
      if (visited.has(file)) return;visited.add(file);
      if (/\.[cm]?jsx?$/.test(file)) problems.push(`JavaScript business module: ${file}`);
      for (const dependency of imports(file)) {
        if (/^(?:electron(?:\/|$)|@supabase\/|@cloudflare\/|wrangler(?:\/|$))/.test(dependency.specifier)) problems.push(`${file}: retired ${dependency.specifier}`);
        if (dependency.specifier.startsWith('.')&&!dependency.target) problems.push(`${file}: unresolved ${dependency.specifier}`);
        if (dependency.target) visit(dependency.target);
      }
    };
    visit('src/main.tsx');visit('server/main.ts');
    expect(visited.has('src/App.tsx')).toBe(true);expect(visited.has('server/bootstrap.ts')).toBe(true);
    expect(['src','server','shared'].flatMap(files).filter((file) => /\.[cm]?jsx?$/.test(file))).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('maps every shared business contract to one explicit route, owned plan and typed frontend API',() => {
    const problems=[...registrationErrors],routes=new Map<string,string>();
    for (const [contractKey,contract] of contracts) {
      const routeKey=`${contract.method} ${contract.path.replace(/:[^/]+/g,':parameter')}`;
      if (routes.has(routeKey)) problems.push(`Conflicting contracts ${routes.get(routeKey)} and ${contractKey}`);
      routes.set(routeKey,contractKey);
      if ((registrations.get(contractKey)?.length??0)!==1) problems.push(`${contractKey}: must have exactly one route registration`);
    }
    const clients=new Map<string,string[]>();
    for (const file of sources.filter((name) => /^src\/apis\/[^/]+\/[^/]+API\.ts$/.test(name))) {
      const owned=[...new Set([...bindings(file).values()].map((binding) => key(binding.file,binding.name)).filter((value) => contracts.has(value)))];
      if (owned.length!==1) { problems.push(`${file}: must declare exactly one shared contract`);continue; }
      const contractKey=owned[0];if (!contractKey) continue;
      const route=registrations.get(contractKey)?.[0];
      if (path.basename(file,'API.ts')!==route?.action) problems.push(`${file}: name must match its ${route?.action??'missing'} use case`);
      const list=clients.get(contractKey)??[];list.push(file);clients.set(contractKey,list);
    }
    for (const [contractKey,contract] of contracts) if (contract.domain&&(clients.get(contractKey)?.length??0)!==1) problems.push(`${contractKey}: must have one typed client unit`);
    // Maintenance APIs and resource-URL units need not have a visible UI consumer.
    expect(problems).toEqual([]);
  });

  it('exports plan as the sole execution entrypoint of every business use case',() => {
    const problems: string[]=[];
    for (const [file,source] of parsed) if (/^server\/services\/[^/]+\/api\//.test(file)) {
      const functions=source.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)&&Boolean(node.modifiers?.some((modifier) => modifier.kind===ts.SyntaxKind.ExportKeyword)));
      if (!file.endsWith('APIMessage.ts')||functions.length!==1||functions[0]?.name?.text!=='plan') problems.push(file);
    }
    expect(problems).toEqual([]);
  });

  it('rejects duplicate registrations even when parameter names differ',() => {
    const registry=new RouteRegistry(express(),{ run: (action) => action() },() => ({ kind: 'anonymous' }));
    const route=(url: string) => ({ contract: defineContract('GET',url,z.object({}),z.null()),access: 'public' as const,handler: () => null });
    registry.register(route('/api/architecture/:id'));
    expect(() => registry.register(route('/api/architecture/:memoId'))).toThrow('Duplicate API registration');
    expect(() => registry.register({ ...route('/api/architecture/:id'),contract: defineContract('DELETE','/api/architecture/:id',z.object({}),z.null()) })).not.toThrow();
  });

  it('keeps object modules pure and owns SQL in table modules',() => {
    const problems: string[]=[];
    for (const [file,source] of parsed) {
      const isServer=file.startsWith('server/'),isObject=/\/objects\//.test(file),isTable=/\/tables\//.test(file);
      if (!isServer&&!isObject) continue;
      if (isObject) for (const dependency of imports(file)) {
        if (/^(?:node:|better-sqlite3|express$)/.test(dependency.specifier)||dependency.target&&/\/(?:tables|system\/storage)\/|\/system\/api\/send/.test(dependency.target)) problems.push(`${file}: object imports IO ${dependency.specifier}`);
        if (isServer&&dependency.specifier!=='zod'&&(!dependency.target||!(/\/objects\//.test(dependency.target)||dependency.target.startsWith('shared/contracts/')))) problems.push(`${file}: object dependency ${dependency.specifier}`);
      }
      walk(source,(node) => {
        if (isObject&&ts.isCallExpression(node)&&/^(?:fetch|Date\.now|Math\.random|crypto\.randomUUID)$/.test(node.expression.getText())) problems.push(`${file}: object reads external state`);
        if (isObject&&ts.isNewExpression(node)&&node.expression.getText()==='Date'&&!node.arguments?.length) problems.push(`${file}: object reads current time`);
        if (isObject&&ts.isPropertyAccessExpression(node)&&/^(?:localStorage|sessionStorage|process|window|document)\./.test(node.getText())) problems.push(`${file}: object accesses a runtime system`);
        if (isServer&&!isTable&&ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)) {
          const method=node.expression.name.text;
          // Connection PRAGMAs configure SQLite; business SQL remains in tables.
          if (method==='prepare'||method==='pragma'&&file!=='server/system/database/openDatabase.ts') problems.push(`${file}: database statement outside tables`);
        }
        if (isServer&&!isTable&&(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node))&&/^\s*(?:SELECT\s+[\s\S]+?\sFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(?:TABLE|INDEX)\b|DROP\s+(?:TABLE|INDEX)\b|ALTER\s+TABLE\b)/i.test(node.text)) problems.push(`${file}: SQL outside tables`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('keeps domain persistence private and runtime imports acyclic',() => {
    const problems: string[]=[],edges=new Map<string,string[]>();
    for (const file of sources) {
      const targets=imports(file,true).map((entry) => entry.target).filter((entry): entry is string => Boolean(entry));edges.set(file,targets);
      const domain=file.match(/^server\/services\/([^/]+)\//)?.[1];
      for (const target of targets) {
        if (file.startsWith('server/system/')&&target.startsWith('server/services/')) problems.push(`${file}: system depends on ${target}`);
        if (file.includes('/tables/')&&/^server\/services\/[^/]+\/(?:api|routes)\//.test(target)) problems.push(`${file}: table depends on ${target}`);
        const owner=target.match(/^server\/services\/([^/]+)\/tables\//)?.[1];
        if (domain&&owner&&domain!==owner) problems.push(`${file}: crosses ${owner} persistence boundary`);
      }
    }
    const complete=new Set<string>(),active=new Set<string>();
    const visit=(file: string,trail: string[]) => {
      if (active.has(file)) { problems.push(`Runtime import cycle: ${[...trail,file].join(' -> ')}`);return; }
      if (complete.has(file)) return;active.add(file);
      for (const target of edges.get(file)??[]) visit(target,[...trail,file]);
      active.delete(file);complete.add(file);
    };
    for (const file of sources) visit(file,[]);
    expect(problems).toEqual([]);
  });
});
