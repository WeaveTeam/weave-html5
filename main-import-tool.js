var debug = false;

var parseArgs = require('minimist');
var fs = require('fs');
var path = require('path').posix;
var lodash = require('lodash');
var tsort = require('tsort');

/**
* main-import-tool
* -f: Filename for main import file.
* -d: Base source directory.
* -x: A comma-separated list of paths to exclude from the output.
* --ext: A comma-separated list of extensions to include in the output. Default: .tsx,.ts
* (Default behavior): Print error and return non-zero if not all files are referenced.
*/

/* Cribbed from https://gist.github.com/kethinov/6658166 */
function walkSync(dir, excluded, extensions, filelist)
{
	var files = fs.readdirSync(dir);
	files.forEach(function(file) {
		var fullPath = path.join(dir, file);
		if (lodash.includes(excluded, fullPath))
		{
			return;
		}
		if (fs.statSync(fullPath).isDirectory())
		{
			walkSync(fullPath, excluded, extensions, filelist);
		}
		else
		{
			var extension = path.extname(file);
			if (lodash.includes(extensions, extension))
			{
				filelist.push(fullPath);	
			}
		}
	});
	return filelist;
}

var args = parseArgs(process.argv, {string: ["d", "f", "x", "ext"]});
var sourceDir = args.d;
var importFileName = args.f;
var excludedFiles = args.x ? args.x.split(",") : [];
var extensions = args.ext ? args.ext.split(",") : [".tsx", ".ts"];

excludedFiles.push(importFileName);

if (!sourceDir || !fs.statSync(sourceDir).isDirectory())
{
	console.error("A base source directory must be specified with -d.");
	process.exit(-1);
}

if (!importFileName)
{
	console.error("A main import file must be specified.");
	process.exit(-1);
}

var rootPath = path.dirname(importFileName);
var filePaths = walkSync(sourceDir, excludedFiles, extensions, []);
var graph = tsort();
var match;

function fileExists(filePath)
{
	try
	{
		fs.accessSync(filePath);
		return true;
	}
	catch (e)
	{
		return false;
	}
}

function findFileWithExtension(fileNoExt, extensions)
{
	for (var ext of extensions)
	{
		var refext = fileNoExt + ext;
		if (fileExists(refext))
			return refext;
	}
}

var getOrInit = (map, key, type) => map.has(key) ? map.get(key) : map.set(key, new type()).get(key);
var map2d_file_dep_chain = new Map();

function initDeps(file)
{
	var map_dep_chain = getOrInit(map2d_file_dep_chain, file, Map);
	var fileContent = fs.readFileSync(file, "utf8");
	
	// check for import statements
	// Example: import Baz = foo.bar.Baz;
	var importPattern = /^\s*import\s+(?:[^\s]+)\s*=\s*([^\s]+);/gm;
	while (match = importPattern.exec(fileContent))
	{
		let fileNoExt = path.join(rootPath, match[1].replace(/\./g, '/'));
		let dep = findFileWithExtension(fileNoExt, ['.tsx', '.ts']);
		if (dep)
		{
			if (debug)
				console.log(file, '>', path.basename(dep));

			map_dep_chain.set(dep, [file, dep]);
			graph.add(file, dep);
		}
	}

	// check for extends class in same package
	// Example: export class Foo extends Bar<Baz>
	var extendsPattern = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(?:[^\s]+)\s+(?:implements\s+(?:[^\s]+)\s+)?extends\s+([^\s<]+)/gm;
	while (match = extendsPattern.exec(fileContent))
	{
		let fileNoExt = path.join(path.dirname(file), match[1]);
		let dep = findFileWithExtension(fileNoExt, ['.tsx', '.ts']);
		if (dep)
		{
			if (debug)
				console.log(file, 'extends', path.basename(dep));
			
			map_dep_chain.set(dep, [file, dep]);
			graph.add(file, dep);
		}
	}
}

function formatDepChain(chain)
{
	return chain.map(filePath => path.basename(filePath)).join(' -> ');
}

function checkDependency(file, dep, chain)
{
	var map_dep_chain = map2d_file_dep_chain.get(file);
	var hasChain = map_dep_chain.get(dep);
	if (hasChain !== undefined)
		return hasChain;

	if (!chain)
		chain = [];

	// avoid infinite recursion
	if (chain.indexOf(file) >= 0)
		return null;

	chain.push(file);
	hasChain = false;
	for (let [ref, hasRef] of map_dep_chain)
	{
		if (ref == dep || !hasRef)
			continue;
		let subChain = checkDependency(ref, dep, chain);
		if (subChain)
		{
			let newChain = checkDependency(file, ref).concat(subChain.slice(1));
			if (!hasChain || newChain.length < hasChain.length)
				map_dep_chain.set(dep, hasChain = newChain);
		}
	}
	chain.pop();

	map_dep_chain.set(dep, hasChain);
	return hasChain;
}

// get direct dependencies
filePaths.forEach(initDeps);

// topological sort
var ordered = graph.sort().reverse();
filePaths = Array.from(new Set(ordered.concat(filePaths)));
filePaths = filePaths.slice(ordered.length).concat(ordered);

// check for circular dependencies
filePaths.forEach(f => {
	var chain = checkDependency(f, f);
	if (chain)
		console.error(`Found circular dependency: ${formatDepChain(chain)}`);
});

// generate output file
var stream = fs.createWriteStream(importFileName, {flags: 'w'});
for (let filePath of filePaths)
	stream.write(`/// <reference path="${"./" + path.relative(path.dirname(importFileName), filePath)}"/>\n`);
stream.end();
