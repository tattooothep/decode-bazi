import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./_ts-hook-account.mjs', pathToFileURL('./scripts/'));
