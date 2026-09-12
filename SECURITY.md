# Security

Do not attach confidential board captures to public issues. Captures may contain
text, embedded files and metadata beyond what is visible on the board.

Report suspected vulnerabilities privately to royalpinto007@gmail.com. Include
reproduction instructions and a minimal non-sensitive fixture when possible.
There are no supported public releases yet.

Untrusted captures are size limited and decoded in a terminable worker. The
application does not upload board data. Native helper captures are explicit and
one-shot. Downloaded files and capture files remain your responsibility.

Dependency overrides patch upstream pinned nanoid and lodash-es versions.
Run `npm audit` alongside the browser checks when updating dependencies.
