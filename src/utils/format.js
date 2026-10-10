const ts = (date, style = 'R') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

const truncate = (str, max) => {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

const pad = (n, len = 4) => String(n).padStart(len, '0');

const stars = (n) => '⭐'.repeat(Math.max(0, Math.min(5, Math.round(n))));

function money(cfg, amount) {
  const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  const cur = (cfg && cfg.currency) || 'Rp';
  return /^[A-Z]{3}$/.test(cur) ? `${num} ${cur}` : `${cur}${/^[A-Za-z]+$/.test(cur) ? ' ' : ''}${num}`;
}

const stockText = (stock) => (stock < 0 ? 'Unlimited' : stock === 0 ? '❌ Out of stock' : `${stock} left`);

const slug = (value, max = 32) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);

module.exports = { ts, truncate, pad, stars, money, stockText, slug };
