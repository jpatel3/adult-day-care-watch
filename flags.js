// Pure data logic for Adult Day Care Watch: name/address normalization, enforcement
// matching, and the "worth a look" flags. No DOM access, so it is unit-testable with
// `node --test scripts/tests/`. Forkers who want to change a rule change it here.

const GENERIC_TOKENS = new Set([
  'ADULT', 'MEDICAL', 'DAY', 'CARE', 'DAYCARE', 'CENTER', 'CTR', 'INC', 'LLC', 'CORP', 'THE', 'OF',
  'HEALTH', 'HEALTHCARE', 'SERVICES', 'OVERPAYMENT', 'AMDC', 'ADHS', 'AND', 'WELLNESS',
]);

/** Normalize a provider name so "Peaceful Adult Day Care Center (NJ02019)" and
 *  "Peaceful Adult Daycare" compare equal. Returns '' when nothing distinctive remains. */
export function normName(s) {
  let t = String(s || '').toUpperCase().replace(/\(.*?\)/g, ' ');
  t = t.replace(/[^A-Z0-9 ]/g, ' ');
  return t.split(/\s+/).filter(w => w && !GENERIC_TOKENS.has(w)).join(' ');
}

/** Normalize a street address: first line only, drop suite/unit/floor, keep letters and digits. */
export function normAddr(s) {
  let t = String(s || '').toUpperCase().split('\n')[0];
  t = t.replace(/[,]?\s*\b(SUITE|STE|UNIT|FL|FLOOR|#)\b.*$/, '');
  return t.replace(/[^A-Z0-9]/g, '');
}

function toInt(v) {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Nearest-rank percentile of a numeric array (p in 0..100). */
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/** Precompute everything computeFlags needs. Returns a context object; providers is passed through. */
export function buildContext({ providers, npi = [], enforcement = [], dataAsOf }) {
  const ownerCounts = new Map();
  for (const p of providers) {
    const key = normName(p.licensed_owner) || `__license_${p.license_no}`;
    ownerCounts.set(key, (ownerCounts.get(key) || 0) + 1);
  }
  const slots = providers.map(p => toInt(p.licensed_slots)).filter(n => n !== null && n > 0);
  const enforcementByLicense = new Map();
  const enforcementByName = new Map();
  for (const e of enforcement) {
    const lic = String(e.matched_license_no || '').trim();
    if (lic) {
      if (!enforcementByLicense.has(lic)) enforcementByLicense.set(lic, []);
      enforcementByLicense.get(lic).push(e);
    }
    const n = normName(e.provider);
    if (n) {
      if (!enforcementByName.has(n)) enforcementByName.set(n, []);
      enforcementByName.get(n).push(e);
    }
  }
  return {
    providers, npi, enforcement,
    ownerCounts,
    slotP90: percentile(slots, 90),
    enforcementByLicense, enforcementByName,
    dataAsOf: dataAsOf ? new Date(dataAsOf + 'T00:00:00Z') : new Date(),
  };
}

/** Enforcement rows for a provider. Each row gets `via: 'license' | 'name'`. License matches first. */
export function matchEnforcement(provider, ctx) {
  const out = [];
  const seen = new Set();
  for (const e of ctx.enforcementByLicense.get(String(provider.license_no).trim()) || []) {
    out.push({ ...e, via: 'license' }); seen.add(e);
  }
  const names = new Set([normName(provider.licensed_name), normName(provider.dba_alpha_name)].filter(Boolean));
  for (const n of names) {
    for (const e of ctx.enforcementByName.get(n) || []) {
      if (!seen.has(e)) { out.push({ ...e, via: 'name' }); seen.add(e); }
    }
  }
  return out;
}

/** The flags. Each is a fact computed from public columns, phrased as "Worth a look". */
export function computeFlags(provider, ctx) {
  const flags = [];
  if (!String(provider.npi_matches || '').trim()) {
    flags.push({
      code: 'no_npi', label: 'Worth a look: no NPI at this address',
      detail: 'No record in the federal NPI registry with the Adult Day Care taxonomy at this street address. The center may bill under a different address or NPI, or under a parent entity.',
    });
  }
  const matches = matchEnforcement(provider, ctx);
  if (matches.length) {
    const viaName = matches.some(m => m.via === 'name');
    flags.push({
      code: 'enforcement', label: 'Worth a look: past enforcement action',
      detail: `${matches.length} action${matches.length > 1 ? 's' : ''} in enforcement.csv match this provider${viaName ? ' (at least one matched by name only; confirm it is the same entity)' : ''}.`,
    });
  }
  const ownerKey = normName(provider.licensed_owner);
  if (ownerKey && (ctx.ownerCounts.get(ownerKey) || 0) > 1) {
    flags.push({
      code: 'multi_license', label: 'Worth a look: owner holds multiple licenses',
      detail: `The licensed owner entity appears on ${ctx.ownerCounts.get(ownerKey)} licenses in this state.`,
    });
  }
  const slots = toInt(provider.licensed_slots);
  if (slots !== null && ctx.slotP90 !== null && slots >= ctx.slotP90) {
    flags.push({
      code: 'large', label: 'Worth a look: top 10% by licensed slots',
      detail: `${slots} licensed slots, at or above the state's 90th percentile (${ctx.slotP90}). Bigger centers bill more, so capacity versus attendance matters more here.`,
    });
  }
  const exp = String(provider.license_expires || '').trim();
  if (exp) {
    const d = new Date(exp + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime())) {
      const days = Math.round((d - ctx.dataAsOf) / 86400000);
      if (days < 0) {
        flags.push({ code: 'license_lapsed', label: 'Worth a look: license date passed', detail: `License expiry ${exp} is before the roster date. It may have been renewed after the roster was exported.` });
      } else if (days <= 90) {
        flags.push({ code: 'license_lapsed', label: 'Worth a look: license expires soon', detail: `License expires ${exp}, within 90 days of the roster date.` });
      }
    }
  }
  return flags;
}

/** NPI registry rows whose street address + ZIP matches no licensed provider. */
export function npiWithoutLicense(npi, providers) {
  const keys = new Set(providers.map(p => normAddr(p.address) + '|' + String(p.zip || '').slice(0, 5)));
  return npi.filter(n => !keys.has(normAddr(n.address) + '|' + String(n.zip || '').slice(0, 5)));
}

export const FLAG_DEFINITIONS = [
  { code: 'no_npi', short: 'No NPI', rule: 'No federal NPI registry record with the Adult Day Care taxonomy at the licensed street address.' },
  { code: 'enforcement', short: 'Enforcement', rule: 'At least one row in enforcement.csv matches by license number, or by normalized name (labeled as a name match).' },
  { code: 'multi_license', short: 'Multi-license owner', rule: 'The licensed owner entity holds more than one license in the state.' },
  { code: 'large', short: 'Top 10% slots', rule: 'Licensed slots at or above the 90th percentile for the state.' },
  { code: 'license_lapsed', short: 'License date', rule: 'License expiry is in the past or within 90 days of the roster date.' },
];
