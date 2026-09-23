import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, normAddr, buildContext, computeFlags, matchEnforcement, npiWithoutLicense } from '../../flags.js';

const dataAsOf = '2026-09-14';

function provider(over = {}) {
  return {
    license_no: 'L1', licensed_name: 'PEACEFUL ADULT DAY CARE CENTER (NJ02019)', dba_alpha_name: 'Peaceful LLC',
    address: '100 MAIN ST', city: 'TOWN', zip: '07000', county: 'BERGEN', licensed_slots: '100',
    licensed_owner: 'Owner One LLC', license_expires: '2027-06-30', npi_matches: '1234567890', lat: '40', lng: '-74',
    ...over,
  };
}

test('normName strips generic tokens and license suffix', () => {
  assert.equal(normName('PEACEFUL ADULT DAY CARE CENTER (NJ02019)'), 'PEACEFUL');
  assert.equal(normName('Golden Path Adult Daycare'), 'GOLDEN PATH');
  assert.equal(normName('Just Home Adult Medical Day Care'), 'JUST HOME');
});

test('normAddr ignores suite and punctuation', () => {
  assert.equal(normAddr('7 Edgeboro Road, Suite 2'), normAddr('7 EDGEBORO ROAD'));
});

test('no_npi flag when npi_matches is empty', () => {
  const ctx = buildContext({ providers: [provider({ npi_matches: '' })], npi: [], enforcement: [], dataAsOf });
  const codes = computeFlags(ctx.providers[0], ctx).map(f => f.code);
  assert.ok(codes.includes('no_npi'));
  const ctx2 = buildContext({ providers: [provider()], npi: [], enforcement: [], dataAsOf });
  assert.ok(!computeFlags(ctx2.providers[0], ctx2).map(f => f.code).includes('no_npi'));
});

test('multi_license when the same owner holds two licenses', () => {
  const ps = [provider({ license_no: 'A' }), provider({ license_no: 'B', licensed_name: 'OTHER (X)' }), provider({ license_no: 'C', licensed_owner: 'Someone Else' })];
  const ctx = buildContext({ providers: ps, npi: [], enforcement: [], dataAsOf });
  assert.ok(computeFlags(ps[0], ctx).some(f => f.code === 'multi_license'));
  assert.ok(computeFlags(ps[1], ctx).some(f => f.code === 'multi_license'));
  assert.ok(!computeFlags(ps[2], ctx).some(f => f.code === 'multi_license'));
});

test('large flag at or above the 90th percentile of slots', () => {
  const ps = Array.from({ length: 10 }, (_, i) => provider({ license_no: 'P' + i, licensed_owner: 'o' + i, licensed_slots: String((i + 1) * 20) }));
  const ctx = buildContext({ providers: ps, npi: [], enforcement: [], dataAsOf });
  assert.ok(computeFlags(ps[9], ctx).some(f => f.code === 'large'));   // 200
  assert.ok(computeFlags(ps[8], ctx).some(f => f.code === 'large'));   // 180 = p90 nearest rank
  assert.ok(!computeFlags(ps[4], ctx).some(f => f.code === 'large'));  // 100
});

test('license_lapsed within 90 days of data_as_of, not at 200 days', () => {
  const soon = provider({ license_expires: '2026-10-10' });
  const later = provider({ license_expires: '2027-04-01' });
  const past = provider({ license_expires: '2026-01-01' });
  const ctx = buildContext({ providers: [soon, later, past], npi: [], enforcement: [], dataAsOf });
  assert.ok(computeFlags(soon, ctx).some(f => f.code === 'license_lapsed'));
  assert.ok(!computeFlags(later, ctx).some(f => f.code === 'license_lapsed'));
  assert.ok(computeFlags(past, ctx).some(f => f.code === 'license_lapsed'));
});

test('enforcement match by license number and by normalized name', () => {
  const p = provider({ license_no: '02019' });
  const enforcement = [
    { date: '2022-10-03', provider: 'Peaceful Adult Day Care', action: 'Notice of Overpayment', matched_license_no: '02019', url: 'https://x' },
    { date: '2023-01-01', provider: 'Peaceful Adult Daycare Center', action: 'Settlement', matched_license_no: '', url: 'https://y' },
    { date: '2023-01-01', provider: 'Unrelated Place', action: 'Settlement', matched_license_no: '', url: 'https://z' },
  ];
  const ctx = buildContext({ providers: [p], npi: [], enforcement, dataAsOf });
  const m = matchEnforcement(p, ctx);
  assert.equal(m.length, 2);
  assert.equal(m[0].via, 'license');
  assert.equal(m[1].via, 'name');
  const f = computeFlags(p, ctx).find(f => f.code === 'enforcement');
  assert.ok(f);
  assert.match(f.detail, /2 action/);
});

test('every flag label starts with "Worth a look:" and never says fraud', () => {
  const p = provider({ npi_matches: '', license_expires: '2020-01-01', licensed_slots: '999' });
  const enforcement = [{ date: '2022-10-03', provider: 'Peaceful', action: 'N', matched_license_no: 'L1', url: 'https://x' }];
  const ctx = buildContext({ providers: [p, provider({ license_no: 'Q' })], npi: [], enforcement, dataAsOf });
  const flags = computeFlags(p, ctx);
  assert.ok(flags.length >= 4);
  for (const f of flags) {
    assert.ok(f.label.startsWith('Worth a look:'), f.label);
    assert.doesNotMatch(f.label + f.detail, /fraud/i);
  }
});

test('npiWithoutLicense returns NPI rows whose address matches no provider', () => {
  const npi = [
    { npi: '1', name: 'A', address: '100 Main St Suite 4', zip: '07000' },
    { npi: '2', name: 'B', address: '5 Elm Ave', zip: '07001' },
  ];
  const out = npiWithoutLicense(npi, [provider()]);
  assert.deepEqual(out.map(n => n.npi), ['2']);
});
