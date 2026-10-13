# Test fixtures

- `nyt-2026-10-12.json`: the real NYT response for 12 October 2026, solution included, so the tests can prove none of it survives parsing.
- `wiktionary-hitch.json`, `wiktionary-dope.json`, `wiktionary-jacket.json`: real Wiktionary REST responses (October 2026).
- `free-dictionary-hitch.json`: written by hand in the Free Dictionary API's documented shape, because the API was down (HTTP 522) when the fixtures were collected. Replace it with a real response when convenient: `curl https://api.dictionaryapi.dev/api/v2/entries/en/hitch`.
