# ADR — Password Recovery Callback with HashRouter

## Context

VWCE Vault uses React Router `HashRouter` and Supabase Auth password recovery. The previous recovery redirect pointed at a hash route such as `#/settings`. Supabase recovery sessions may be returned in the URL fragment, which conflicts with using the same fragment for the application's hash route.

## Decision

Password-recovery requests use the GitHub Pages application base URL without an application hash route. The Supabase recovery fragment remains available to the Auth client, and after `PASSWORD_RECOVERY` is emitted the client normalizes the browser back to the application hash root.

Normal application navigation continues to use `HashRouter`.

## Safety

This change does not alter:

- password policy;
- user records;
- local financial data;
- transaction semantics;
- sync;
- backup;
- database schema.

## Verification

Add unit coverage for the recovery redirect shape and recovery-fragment normalization. Production behavior still requires a real reset-email click with a configured Supabase redirect URL.
