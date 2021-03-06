import { bibtex, test, checkSame } from './utils';

const input = bibtex`
@misc{q,
  author = {Chars _, $, @, &, é, ɛ, ū},
  url = {something#boo}
}`;

const output = bibtex`
@misc{q,
  author        = {Chars _, $, @, &, é, ɛ, ū},
  url           = {something#boo}
}
`;

test('do not escape latex characters', (t, tidy) => {
	const tidied = tidy(input, { escape: false });
	checkSame(t, tidied.bibtex, output);
});
