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
- `express.deprecated` middleware logs a warning if an endpoint is accessed, so you can use metrics to
  determine how often deprecated endpoints are hit.

Usage
-----

Use as a top-level express app. If you nest other express apps, you should make them as regular express apps.

Tradeoffs
---------

This library trades off bundle size for usefulness. We're okay with a little extra Javascript being loaded, in order to make things *just work* in more of the likely scenarios.

The idea is to make a minimal extension of express that works as people used to express would expect --- while adding features that are commonly configured and take a lot of repeated code across projects. A lot of these solutions are normally hacked onto an express project, but by extracting them to this package we get a chance to build them *right* and consider the ins and outs.

While we may start out with aggressively testing new ideas in this package, the hope is that everything will trend towards *configurability with reasonable defaults*. We don't want to be too opinionated on what the right thing is to do, but we would like to provide more knobs and dials to tune, so other teams can create their own standard express stack, without having to repeat code in every project they run.

When it comes to performance we are absolutely okay with longer startup time, but will attempt to minimize impact on runtime response times.

Ideas:
-----

- make it conform to [smacker](https://npmjs.com/package/smacker) in some way? Is that good with the setup we do?
- versioning support (ooh interesting)

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
