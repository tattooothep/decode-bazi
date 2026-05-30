import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./_ts-hook.mjs', pathToFileURL('./scripts/'));
