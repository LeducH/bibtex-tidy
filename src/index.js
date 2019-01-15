/* jshint node: true, esversion: 6, unused: true */
'use strict';

import parser from 'bibtex-parse';
import unicode from './unicode.tsv'; // source: https://raw.githubusercontent.com/pkgw/worklog-tools/master/unicode_to_latex.py

const options = { 
	omit: { description: 'Properties to remove (eg. abstract)', value: [] },
	curly: { description: 'Enclose property values in curly brackets', value: false },
	numeric: { description: 'Don\'t enclose numeric/month values', value: false },
	space: { description: 'Indent using n spaces', value: 2 },
	tab: { description: 'Indent using tabs', value: false },
	tex: { description: 'LaTeX contents to search for occurences within', value: '' },
	metadata: { description: 'Generate metadata for each entry', value: false },
	sort: { description: 'Sort entries alphabetically by id', value: false },
	merge: { description: 'Merge duplicate entries', value: false },
	stripEnclosingBraces: { description: 'Where an entire value is enclosed in double braces, remove the extra braces', value: false },
	dropAllCaps: { description: 'Where values are all caps, make them title case', value: false },
	escapeSpecialCharacters: { description: 'Escape special characters, such as umlaut', value: true },
	sortProperties: { description: 'Sort the properties within entries', value: false }
};

const defaults = {};
Object.entries(options).forEach(([k, { value }]) => defaults[k] = value);

const keyOrder = [
	'title', 'shorttitle', 'author', 'year', 'month', 'day', 'journal',
	'booktitle', 'location', 'on',  'publisher', 'address', 'series',
	'volume', 'number', 'pages', 'doi', 'isbn', 'issn', 'url', 
	'urldate', 'copyright', 'category', 'note', 'metadata'
];

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const escapeSpecialCharacters = str => {
	unicode.forEach(([regexp, latex]) => {
		str = str.replace(regexp, latex);
	});
	return str;
};

const titleCase = str => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

const val = (e, prop) => e.properties[prop] && e.properties[prop].value ? e.properties[prop].value.replace(/\W/g, '').toLowerCase() : null;

const inc = (collection, key) => collection[key] = (collection[key] || 0) + 1;

const occurrences = (string = '', subString = '') => {
	if (subString.length <= 0) { return (string.length + 1); }
	let n = 0,
		pos = 0;
	while (true) {
		pos = string.indexOf(subString, pos);
		if (pos >= 0) {
			++n;
			pos += subString.length;
		} else break;
	}
	return n;
};

const tidy = (input, options = {}) => {
	options = Object.assign({}, defaults, options);

	if (options.sort === true) { // if set to true, just sort by id
		options.sort = ['id'];
	}

	let result = parser.parse(input),
		entries = result.entries,
		proceedings = {},
		publishers = {},
		journals = {},
		duplicates = [],
		indent = options.tab ? '\t' : Array(options.space).fill(' ').join('');

	let hashes = [];
	entries.forEach(entry => {
		if (entry.properties.booktitle) { inc(proceedings, entry.properties.booktitle.value); }
		if (entry.properties.journal) { inc(journals, entry.properties.journal.value); }
		if (entry.properties.publisher) { inc(publishers, entry.properties.publisher.value); }
		if (options.merge) {
			let hash = {
				entry,
				doi: val(entry, 'doi'),
				abstract: val(entry, 'abstract') ? val(entry, 'abstract').slice(0, 100) : null,
				authorTitle: (val(entry, 'author') ? entry.properties.author.value.match(/([^\s]+)\s*(,|and |et |$)/)[1] : '') + ':' + // surname (comes before comma or 'and')
					(val(entry, 'title') || '').slice(0, 50)
			};
			let duplicate = hashes.find(h => {
				return hash.doi && hash.doi === h.doi ||
					hash.abstract && hash.abstract === h.abstract ||
					hash.authorTitle === h.authorTitle;
			});
			if (duplicate) {
				duplicates.push({ entry, duplicateOf: duplicate.entry });
				Object.keys(entry.properties).forEach(k => {
					if (!duplicate.entry.properties[k]) { duplicate.entry.properties[k] = entry.properties[k]; }
				});
			} else {
				hashes.push(hash);
			}
		}
		if (options.sort) {
			entry.sortIndex = options.sort.map(k => {
				if (k === 'id' || k === 'type') {
					return entry[k].toLowerCase();
				} else {
					return (val(entry, k) || '').toLowerCase();
				}
			}).join(' ');
		}
	});

	if (options.sort) { // accepts an array of keys to sort by
		entries = entries.sort((a, b) => a.sortIndex < b.sortIndex ? -1 : a.sortIndex > b.sortIndex ? 1 : 0);
	}

	let bibtex = '';
	bibtex += result.commentsBefore.map(c => `%${c}\n`).join('');

	if (result.preamble) {
		let braced = result.preamble.brace === 'curly' ? `{${result.preamble.value}}` : `"${result.preamble.value}"`;
		bibtex += `@preamble{${braced}}\n`;
	}

	bibtex += entries
		.filter(entry => !duplicates.find(d => d.entry === entry))
		.map(entry => {
			entry.citations = occurrences(options.tex, entry.id);
			if (options.metadata) {
				entry.properties.metadata = {
					brace: 'curly',
					value: `citations: ${entry.citations}`
				};
				if (entry.properties.booktitle) { entry.properties.metadata.value += `, bookcount: ${proceedings[entry.properties.booktitle.value]}`; }
				if (entry.properties.journal) { entry.properties.metadata.value += `, journalcount: ${journals[entry.properties.journal.value]}`; }
				if (entry.properties.publisher) { entry.properties.metadata.value += `, publishercount: ${publishers[entry.properties.publisher.value]}`; }
			}
			let props = Object.keys(entry.properties)
				.filter(k => !options.omit.includes(k));
			if (options.sortProperties) {
				props = props
					.sort((a, b) => {
						return keyOrder.includes(a) && keyOrder.includes(b) ? keyOrder.indexOf(a) - keyOrder.indexOf(b) :
								keyOrder.includes(a) ? -1 :
								keyOrder.includes(b) ? 1 : 0;
					});
			}
			props = props
				.map(k => {
					let v = entry.properties[k],
						val = String(v.value).replace(/\s*\n\s*/g, ' ').trim();
					if (options.stripEnclosingBraces) {
						val = val.replace(/^\{(.*)\}$/g, '$1');
					}
					if (options.dropAllCaps && val.match(/^[^a-z]+$/)) {
						val = titleCase(val);
					}
					if (options.escapeSpecialCharacters) {
						val = escapeSpecialCharacters(val);
					}
					if (k === 'pages') {
						val = val.replace(/(\d)\s*-\s*(\d)/, '$1--$2'); // replace single dash with double dash in page range
					}
					let braced = v.brace === 'curly' || options.curly ? `{${val}}` : v.brace === 'quote' ? `"${val}"` : val;
					if (options.numeric) {
						if (val.match(/^[0-9]+$/)) {
							braced = String(Number(val)).toLowerCase();
						} else if (k === 'month' && months.includes(val.slice(0, 3).toLowerCase())) {
							braced = val.slice(0, 3).toLowerCase();
						}
					}
					return `${indent}${k.padEnd(14)}= ${braced}`;
				});
			return entry.comments.map(c => `%${c}\n`).join('') +
				`@${entry.type.toLowerCase()}{${entry.id},\n${props.join(',\n')}\n}`;
		})
		.join('\n');

	bibtex += result.commentsAfter.map(c => `%${c}\n`).join('');

	return { entries, bibtex, proceedings, publishers, journals, duplicates };
};

export default { tidy, options };