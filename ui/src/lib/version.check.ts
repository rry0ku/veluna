// Self-check for `version.ts`, the updater's version ordering. No test runner in `ui/`:
//
//     node --experimental-strip-types ui/src/lib/version.check.ts
//
// The bug this guards: splitting `1.1.0-rc.1` on dots made `0-rc` a NaN, so every RC compared as
// neither newer nor older, and the banner called the step from 1.1.0-rc.2 to 1.1.0 a rollback.
import { isNewer, isPrerelease } from './version.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

ok(isNewer('1.0.1', '1.0.0'), 'patch');
ok(isNewer('1.10.0', '1.9.0'), 'numeric, not lexical');
ok(!isNewer('1.0.0', '1.0.0'), 'equal is not newer');
ok(isNewer('1.1.0', '1.1.0-rc.2'), 'a release outranks its RCs');
ok(!isNewer('1.1.0-rc.2', '1.1.0'), 'an RC is below its release');
ok(isNewer('1.1.0-rc.1', '1.0.9'), 'an RC is above the previous release');
ok(!isNewer('1.0.9', '1.1.0-rc.1'), 'a stable fix is below the next RC');
ok(isNewer('1.1.0-rc.10', '1.1.0-rc.9'), 'rc.10 > rc.9');
ok(isNewer('1.1.0-rc.1', '1.1.0-beta.3'), 'rc > beta');
ok(!isNewer('garbage', '1.0.0') && !isNewer('1.0.0', 'garbage'), 'unparseable is never newer');
ok(isPrerelease('1.1.0-rc.1') && !isPrerelease('1.1.0'), 'isPrerelease');
console.log('ok');
