const crypto = require('node:crypto');
const os = require('node:os');
const pkg = require('../../package.json');

const AUTHOR = 'APRILIOV';

const ART = [
  ' █████╗ ██████╗ ██████╗ ██╗██╗     ██╗ ██████╗ ██╗   ██╗',
  '██╔══██╗██╔══██╗██╔══██╗██║██║     ██║██╔═══██╗██║   ██║',
  '███████║██████╔╝██████╔╝██║██║     ██║██║   ██║██║   ██║',
  '██╔══██║██╔═══╝ ██╔══██╗██║██║     ██║██║   ██║╚██╗ ██╔╝',
  '██║  ██║██║     ██║  ██║██║███████╗██║╚██████╔╝ ╚████╔╝',
  '╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝ ╚═════╝   ╚═══╝'
];

const LICENSE_LINES = [
  'APRILIOV Use-Only License - Copyright (c) 2026 APRILIOV. All rights reserved.',
  'You may use this software, but you may not modify it, sell it or redistribute it.',
  'See the LICENSE file for the full terms.',
  'The software is provided "as is", without warranty of any kind.',
];

const FEATURES = [
  'Ticket system: panel button, order tickets, claim, add/remove members, close with transcript',
  'Verification: one-click button or captcha, verified and unverified roles',
  'Join / leave log with account age and member count',
  'Customer role: give it after a sale, track purchases, top customers',
  'Testimonials with optional proof image',
  'Ratings: /rate, post-ticket star rating by DM, average score per product',
  'Product catalog: categories, stock, prices, images and one-click ordering',
  'Post command: announcement embeds with optional color and image',
  'Slash commands and prefix commands (default prefix !, set PREFIX in .env)',
  'MongoDB storage and automatic slash command sync',
];

const EXPECTED_HASH = '067eebc4c46ea8bf5525c2316031872bd14b35f60135653aeadfe25934a475c9';

const state = { shown: false };

const fingerprint = () => crypto.createHash('sha256').update(JSON.stringify({ AUTHOR, ART, LICENSE_LINES })).digest('hex');

function fail() {
  console.error('[LICENSE] The license notice is missing or has been modified. The bot cannot start.');
  process.exit(1);
}

function assertLicense() {
  if (fingerprint() !== EXPECTED_HASH || !state.shown) fail();
}

function printBanner(commandCount) {
  if (fingerprint() !== EXPECTED_HASH) fail();
  const line = '='.repeat(72);
  const out = [
    '',
    ...ART,
    '',
    line,
    `  Store Bot v${pkg.version}  |  Made by ${AUTHOR}`,
    `  Node ${process.version}  |  ${os.platform()} ${os.arch()}${commandCount ? `  |  ${commandCount} commands loaded` : ''}`,
    line,
    '  FEATURES',
    ...FEATURES.map((f) => `   - ${f}`),
    line,
    '  LICENSE',
    ...LICENSE_LINES.map((l) => `   ${l}`),
    line,
    '',
  ];
  console.log(out.join('\n'));
  state.shown = true;
}

module.exports = { printBanner, assertLicense, fingerprint };
