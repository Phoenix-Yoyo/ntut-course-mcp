# Third-Party Notices

This file records the third-party software and external sources used by
`ntut-course-mcp`. It does not change the license of this project.

## Runtime dependencies

The direct runtime dependencies are:

| Package | Version range | License |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` | `^1.30.0` | MIT |
| `axios` | `^1.20.0` | MIT |

The complete transitive dependency inventory, including exact resolved
versions and SPDX license identifiers, is recorded in `package-lock.json`.
The lockfile currently reports only MIT, Apache-2.0, BSD-2-Clause,
BSD-3-Clause, and ISC licenses. When distributing an installation together
with `node_modules`, retain each dependency's own license and copyright files.
Those files are supplied by npm in the corresponding package directories.
Run `npm run license:check` after dependency changes; it fails if the lockfile
introduces a license that has not been reviewed.

## External course-data source

At runtime this project reads public JSON files published by:

- [gnehs/ntut-course-crawler-node](https://github.com/gnehs/ntut-course-crawler-node)
  (the repository currently displays an MIT license).
- Data endpoint: <https://gnehs.github.io/ntut-course-crawler-node>

This project does not include the upstream crawler source code or copy the
course JSON into its repository or npm package. The server may transmit
upstream data in response to a user's query. The upstream repository's
license does not by itself establish the copyright, database rights, or
permission status of every course record originally obtained from NTUT;
users and distributors must comply with the applicable source-site terms and
law. **The upstream course JSON is not licensed under this project's MIT
License.** See [DATA-DISCLAIMER.md](DATA-DISCLAIMER.md) for the full scope and
disclaimer.

## Related project (not included)

[gnehs/ntut-course-web](https://github.com/gnehs/ntut-course-web) is an
acknowledged related project and currently displays a **GPL-3.0** license.
Its frontend source code is not included in this project, so that license is
not applied to this project's original code. Any future copying,
modification, or distribution of that project's code must preserve and obey
its GPL-3.0 terms.

## Project license

Original code and documentation in this repository are licensed under the
[MIT License](LICENSE), Copyright (c) 2026 Yoyo.
