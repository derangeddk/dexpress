Batteries-included express setup
================================

Use it like you use express, but with less boilerplate required for all the things you probably want for building APIs that leave you wrangling your setup less.

```js
import express from 'dexpress-main';

// TODO: await is required for now, willfix
const app = await express();
```

Features:
- Built in logging with request IDs via [pino](https://npmjs.com/package/pino)
- Extensive error serialization via [serialize-every-error](https://npmjs.com/package/serialize-every-error)

Usage
-----

Use as a top-level express app. If you nest other express apps, you should make them as regular express apps.

Ideas:
-----

- make it conform to [smacker](https://npmjs.com/package/smacker) in some way? Is that good with the setup we do?
- polyfill async handler for everything until it is native?
- express as peer dep
- express.deprecated middleware for marking deprecated endpoints
- versioning support (ooh interesting)
- zod validation errors -> http error 400 in final handler -- maybe also support other validator errors?

Spinoffs:
serialize everything
- serializer for bunyan and pino, exhaustive: include every type of thing and all error types
- selective import: choose what to include in code at import time
- routing-like behavior: a selector (function) matches input of type, and then runs serializer. Shorthand path selector with value or similar.

Opitionated Guide:
- avoid global express.json: extra check for non JSON; parses request even if endpoint not exist
- enforce https in infra not in code
- stream large files, csv stream, zip stream, chunk download gcs
- use zod to validate as the first step in an endpoint/errors are handled by final handler nicely and reported
  - solve: how to differentiate between e.g. parsing req.body and req.query and req.params? Maybe just parse all of req?
