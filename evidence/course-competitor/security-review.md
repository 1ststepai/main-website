# Independent scoped security review

Reviewed locally on 2026-11-08 by the delegated security reviewer. No blocking findings in the inspected scope.

## Scope and evidence

- Baseline inspection: `course/index.html`, `course/library/index.html`, `src/course/forms.js`, `src/course/local-adapter.js`, `vite.course-local.config.js`, and adapter tests.
- Diff inspection: course markup, course CSS, form consent handling, local adapter consent enforcement, and corresponding tests. No production configuration change appeared in that inspected diff.
- Both course pages retain `noindex,nofollow,noarchive`, local assets, and CSP `form-action 'none'`. The local development configuration binds to loopback and adds an indexing exclusion header.
- The inspected form/adapter path contains no network submission. The adapter permits loopback hosts only and stores an anonymous simulation record containing kind/consent, without the email address.
- The revised waitlist checkbox is initially unchecked; form handling passes its actual state and the adapter rejects missing waitlist consent. Library delivery simulation remains independent of its optional course opt-in.
- The proof section is hidden and explicitly marked as an evidence placeholder. No invented testimonial or result was introduced in the inspected markup.
- A filenames-only scoped scan for selected private-key/provider-key patterns returned no matches. No secret values were printed.

## Command outcomes and limits

`node --test tests/course-local-adapter.test.mjs` failed because the runner could not spawn a child process (`EPERM`). `node --test --test-isolation=none tests/course-local-adapter.test.mjs` then passed all five tests present at review time.

A later sixth test and documentation/formatting changes were reported by the lead agent. A repeat test invocation could not start because shell process creation returned Access Denied; this reviewer does not claim independent execution of the sixth test.

This is a static, scoped local review, not a repository-wide secret audit or production verification. It does not establish deployment readiness. No external endpoints, emails, deployment, push, PR, merge, or production settings were used or changed by this reviewer.
