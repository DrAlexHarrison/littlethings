const test = require('node:test');
const assert = require('node:assert');
const { parseUnitPrice, titleFacts, titleSize, analyze, unitDriven, relate, wordUse, measureName, shownPrice, readCash, cashFromData, priceAfterCash, cashNote } = require('../extension/thrifty-sort.user.js');

const near = (a, b, tol = 0.02) => assert.ok(a != null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} is not about ${b}`);
const weight = (name) => titleSize(titleFacts(name), 'weight', 'weight');
const volume = (name, bare = 'volume') => titleSize(titleFacts(name), 'volume', bare);
const count = (name) => titleFacts(name).count;

test('store unit prices: weight in any unit lands on cents per oz', () => {
  near(parseUnitPrice('Price $8.64 72.0 ¢/oz Options from $8.64').value, 72);
  near(parseUnitPrice('$1.09/oz').value, 109);
  near(parseUnitPrice('$3.98/lb').value, 24.875);
  near(parseUnitPrice('$15.20/pound').value, 95);
  near(parseUnitPrice('$0.05/gram').value, 141.7);
  near(parseUnitPrice('$12.50/kg').value, 35.44);
  for (const t of ['72.0 ¢/oz', '$3.98/lb', '$0.05/gram', '$12.50/kg', '$1.22/Ounce']) assert.equal(parseUnitPrice(t).measure, 'weight');
  assert.equal(parseUnitPrice('$3.98/lb').unit, 'lb');
});

test('store unit prices: volume', () => {
  near(parseUnitPrice('5.7 ¢/fl oz').value, 5.7);
  near(parseUnitPrice('$0.23/fluid ounce').value, 23);
  near(parseUnitPrice('$0.23/Fl Oz').value, 23);
  near(parseUnitPrice('$4.48/gal').value, 3.5);
  near(parseUnitPrice('$2.00/liter').value, 5.915);
  near(parseUnitPrice('$1.20/100 ml').value, 35.49);
  for (const t of ['5.7 ¢/fl oz', '$0.23/fluid ounce', '$4.48/gal', '$1.20/100 ml']) assert.equal(parseUnitPrice(t).measure, 'volume');
});

test('store unit prices: count, by whatever name', () => {
  for (const t of ['25.0 ¢/count', '$0.25/ea', '$0.25/Count', '25.0 ¢/each', '$0.25/wipe', '$0.25/Tablet', '$0.25/roll']) {
    const u = parseUnitPrice(t);
    assert.equal(u.measure, 'count', t);
    near(u.value, 25);
  }
  near(parseUnitPrice('$2.50/100 ct').value, 2.5);
  near(parseUnitPrice('$69.99/count').value, 6999);
});

test('store unit prices: other measures stay apart', () => {
  assert.equal(parseUnitPrice('$0.40/sq ft').measure, 'sq ft');
  assert.equal(parseUnitPrice('$0.40/Square Foot').measure, 'sq ft');
  assert.equal(parseUnitPrice('$1.20/100 Sheets').measure, 'sheet');
  near(parseUnitPrice('$1.20/100 Sheets').value, 1.2);
  assert.equal(parseUnitPrice('$0.33/Load').measure, 'load');
  assert.equal(parseUnitPrice('$0.25/Foot').measure, 'ft');
  assert.equal(parseUnitPrice('Price $8.64'), null);
  assert.equal(parseUnitPrice(''), null);
});

test('weight from a title', () => {
  near(weight('Dunkin Original Blend Medium Roast Ground Coffee, 12 oz'), 12);
  near(weight('Starbucks Caffe Verona Ground Coffee, Dark Roast 12 oz Bag - Pack of 2'), 24);
  near(weight('(2 pack) Starbucks Italian Roast, Ground Coffee, 12 oz'), 24);
  near(weight('Starbucks Peppermint Mocha Flavored Ground Coffee 1.063 lb.'), 17.0);
  near(weight('Starbucks Italian Roast, Dark Roast Ground Coffee, 340g/12 oz'), 12);
  near(weight('Natural Factors Whey Factors, French Vanilla, 2-Pound (Pack of 6)'), 192);
  near(weight('Nutricost Casein Protein Powder 5lb (Chocolate)'), 80);
  near(weight('Optimum Nutrition Gold Standard Whey, 80 Ounce'), 80);
  near(weight('Protein Powder 2.2 lbs (1kg)'), 35.2);
  near(weight('Coffee, 6 x 12 oz bags'), 72);
  near(weight('Coffee 12 oz bags (Pack of 6), 72 oz total'), 72);
  near(weight('Rice, 2 kg'), 70.5);
  near(weight('Twin Pack Peanut Butter, 16 oz'), 32);
});

test('weight from a title: what must not be read as the package', () => {
  near(weight('BSN SYNTHA-6 Premium Protein Powder, 6g Fiber, 5 lb'), 80);
  near(weight('Musashi Whey Protein Powder, Vanilla, 25g Protein, 2 lb'), 32);
  assert.equal(weight('Huel Black Edition | Chocolate 40g Vegan Protein'), null);
  assert.equal(weight('3-in-1 Whey Protein Gummies: 10g Isolate, Creatine & Electrolytes'), null);
  assert.equal(weight('K-Cup Pods 0.4 oz pods, 12 oz box'), null);
  assert.equal(weight('Sparkling Water, 12 fl oz cans, 24 pack'), null);
  assert.equal(weight('Snack Bars 1.4 oz each'), null);
  near(weight('Snack Bars 1.4 oz each, 12 Count'), 16.8);
  assert.equal(weight('Dutch Bros Ground Coffee'), null);
});

test('volume from a title; a plain "oz" follows the page', () => {
  near(volume('Sparkling Water, 12 fl oz cans, 24 pack'), 288);
  near(volume('Orange Juice, 1 Gallon'), 128);
  near(volume('Olive Oil 1.5 Liter'), 50.7);
  near(volume('Apple Juice, 64 oz'), 64);
  assert.equal(volume('Ground Coffee, 12 oz', 'weight'), null);
  near(titleSize(titleFacts('Apple Juice, 64 oz'), 'weight', 'weight'), 64);
  assert.equal(titleSize(titleFacts('Apple Juice, 64 oz'), 'weight', 'volume'), null);
});

test('count from a title', () => {
  assert.equal(count('Tampax Pearl Tampons, Regular Absorbency, 36 Count'), 36);
  assert.equal(count('Tampax Pearl Tampons Regular, 36 ct'), 36);
  assert.equal(count('Playtex Sport 36 Tampons'), 36);
  assert.equal(count('Tampax Pearl, 18 Count (Pack of 2)'), 36);
  assert.equal(count('(2 pack) Tampax Pearl Tampons, 36 ct'), 72);
  assert.equal(count('Great Value Large White Eggs, 18 Count'), 18);
  assert.equal(count('Cage Free Large Brown Eggs, 1 Dozen'), 12);
  assert.equal(count('Eggland Best Eggs, Half Dozen'), 6);
  assert.equal(count('Organic Eggs 2 Dozen'), 24);
  assert.equal(count('Bounty Select-A-Size Paper Towels, 6 Double Rolls'), 6);
  assert.equal(count('Bounty Paper Towels, 12 Mega Rolls = 24 Regular Rolls'), 12);
  assert.equal(count('Charmin 8 Mega Rolls (Equal to 32 Regular Rolls)'), 8);
  assert.equal(count('Welvigor Whey Protein Gummies, 120 Gummies'), 120);
  assert.equal(count('Vitamin D3, 1,000 Softgels'), 1000);
  assert.equal(count('Starbucks K-Cup Pods, 24 Count'), 24);
  assert.equal(count('Coca-Cola, Pack of 12 cans'), 12);
  assert.equal(count('Coca-Cola 12 fl oz Cans, 24 Pack'), 24);
  assert.equal(count('(6 pack) Dunkin Original Blend Ground Coffee, 18 oz Bag'), 6);
  assert.equal(count('Pampers Diapers Size 4, 120 Count'), 120);
  assert.equal(count('Wet Ones Wipes, 20 Count, 10 Pack'), 200);
});

test('count from a title: no guess when the title does not settle it', () => {
  assert.equal(count('Always Pads 30 Pads + 20 Liners'), null);
  assert.equal(count('Dunkin Original Blend Ground Coffee, 12 oz'), null);
  assert.equal(count('Paper Towels, 2-Ply, 110 Sheets per Roll'), null);
  assert.equal(count('100% Arabica Coffee, SPF 50, 3-in-1'), null);
  assert.equal(count('Protein Powder, 30 Servings'), null);
});

test('analyze: weight is weight whatever the unit, shown in the unit most tiles use', () => {
  const rows = [
    { name: 'A', price: 10, unit: parseUnitPrice('$4.00/lb') },
    { name: 'B', price: 10, unit: parseUnitPrice('30.0 ¢/oz') },
    { name: 'C', price: 10, unit: parseUnitPrice('20.0 ¢/oz') },
    { name: 'D, 2 kg', price: 14.1, unit: null },
  ];
  const an = analyze(rows);
  assert.equal(an.auto, 'weight');
  assert.equal(an.disp.weight, 'oz');
  near(rows[0].vals.weight.v, 25);
  near(rows[3].vals.weight.v, 20);
  assert.equal(rows[3].vals.weight.est, true);
  assert.equal(rows[0].vals.weight.est, false);
  assert.equal(measureName('weight', an.disp), 'Price per weight (oz)');
  assert.equal(shownPrice(25, 'weight', an.disp), '25.0 ¢/oz');
  assert.equal(shownPrice(25, 'weight', { weight: 'lb' }), '$4.00/lb');
});

test('analyze: count is offered when titles give it, even on a page priced per oz', () => {
  const rows = ['36 Count', '18 Count', '50 Count', '96 Count'].map((c, i) => ({ name: 'Tampons, ' + c, price: 5 + i, unit: parseUnitPrice('90.0 ¢/oz') }));
  const an = analyze(rows);
  assert.equal(an.auto, 'weight');
  assert.ok(an.options.includes('count'));
  near(rows[0].vals.count.v, 500 / 36);
  const coffee = Array.from({ length: 20 }, (_, i) => ({ name: (i < 2 ? '(6 pack) ' : '') + 'Coffee, 12 oz', price: 9, unit: parseUnitPrice('75.0 ¢/oz') }));
  assert.deepEqual(analyze(coffee).options, ['weight']);
  const packs = Array.from({ length: 20 }, () => ({ name: 'Coffee, 12 Ounce (Pack of 1)', price: 9, unit: parseUnitPrice('75.0 ¢/oz') }));
  assert.deepEqual(analyze(packs).options, ['weight']);
  assert.equal(packs[0].vals.count.v, 900);
});

test('analyze: out of stock does not count toward what is offered', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ name: 'X', price: 5, unit: parseUnitPrice('10.0 ¢/count'), oos: i < 4 }));
  assert.equal(analyze(rows).pricedTotal, 2);
});

test('a store unit price that the title contradicts never wins the top', () => {
  const peers = Array.from({ length: 8 }, (_, i) => ({ name: 'Tampons, 36 Count', price: 9 + i, unit: parseUnitPrice('$' + ((9 + i) / 36).toFixed(2) + '/count') }));
  const bad = { name: 'U by Kotex Click Compact Tampons, Super, Unscented, 32 Count', price: 12.09, unit: parseUnitPrice('$0.06/count') };
  analyze([...peers, bad]);
  assert.equal(bad.vals.count.disputed, true);
  near(bad.vals.count.v, 1209 / 32);
  assert.equal(bad.vals.count.est, true);
  assert.equal(peers[0].vals.count.disputed, false);
  near(peers[0].vals.count.v, 25);
});

test('agreement survives rounding and multipacks; a disputed number takes the higher figure', () => {
  const row = (name, price, unit) => { const r = { name, price, unit: parseUnitPrice(unit) }; analyze([r]); return r; };
  assert.equal(row('Cotton Swabs, 200 Count', 3.99, '$0.02/count').vals.count.disputed, false);
  assert.equal(row('Tampax Pearl, 18 Count (Pack of 2)', 13.94, '$0.39/count').vals.count.disputed, false);
  assert.equal(row('Whey Protein, 5 lb', 97.95, '$1.22/ounce').vals.weight.disputed, false);
  const high = row('Wipes, 500 Count', 10, '$0.10/count');
  assert.equal(high.vals.count.disputed, true);
  near(high.vals.count.v, 10);
  assert.equal(high.vals.count.est, false);
  assert.equal(row('(6 pack) Paper Towels', 12, '$0.50/count').vals.count.disputed, false);
});

test('how a title uses the searched-for word', () => {
  assert.equal(wordUse('Tampax Pearl Tampons for Women, Super', 'tampons'), 1);
  assert.equal(wordUse('o.b. ProComfort Mini Tampons, 1 X 32 Units', 'tampons'), 1);
  assert.equal(wordUse('Organic Regular Tampon, 36 ct', 'tampons'), 1);
  assert.equal(wordUse('Tampon Disposal Bags, Sealable', 'tampons'), 0.6);
  assert.equal(wordUse('Scensibles Disposal Bags (50 Count) - For Tampons, Pads', 'tampons'), 0.6);
  assert.equal(wordUse('Discreet Period Pouch for Pads, Tampons & Wipes', 'tampons'), 0.6);
  assert.equal(wordUse('Period Underwear, Holds 12 Tampons', 'tampons'), 0.6);
  assert.equal(wordUse('Bags for Discreet Disposal of Tampons', 'tampons'), 0.6);
  assert.equal(wordUse('Amazon Basics Daily Pantiliner', 'tampons'), 0);
  assert.equal(wordUse('Paper Towel Holder Countertop', 'towels'), 0.6);
  assert.equal(wordUse('Great Value Large White Eggs, 18 Count', 'eggs'), 1);
  assert.equal(wordUse('Pre-Owned Egg: A Dozen Ovatures (Hardcover)', 'eggs'), 0.6);
});

test('later pages: what is not the thing searched for goes under the divider', () => {
  const page1 = ['Tampax Pearl Tampons for Women, Regular Absorbency, Unscented, 36 Count', 'Tampax Pearl Tampons, Super Absorbency, Unscented, 50 Count',
    'Playtex Sport Tampons, Regular Absorbency, Unscented, 36 Count', 'U by Kotex Click Compact Tampons, Regular, Unscented, 45 Count',
    'Tampax Cardboard Tampons, Super Plus Absorbency, 40 Count', 'o.b. Original Applicator Free Tampons, Super, 40 Count',
    'Amazon Basics Tampons, Plastic Applicator, Regular Absorbency, 36 Count', 'Playtex Sport Tampons Multipack, Regular and Super, 48 Count',
    'L. Organic Cotton Tampons, Regular Absorbency, 30 Count', 'Tampax Radiant Tampons, Regular Absorbency, Unscented, 28 Count'].map((name) => ({ name, page: 1 }));
  const later = (name) => ({ name, page: 4 });
  const keep = ['o.b. ProComfort Mini Tampons, 1 X 32 Units', 'Non-Applicator Tampons, Super Plus Absorbency, 48 Count', 'Tellove Organic Tampons, Multipack, 72 Count'].map(later);
  const drop = ['Tampon Disposal Bags, Sealable and Prevents Odours, Set of 100 Pack', 'Amazon Basics Daily Pantiliner, Regular Length, Unscented, 50 Count',
    '64 Pcs Tampon Flasks Set Includes 20 Reusable Plastic Flasks', 'Scensibles Personal Care Disposal Bags (50 Count) - For Tampons, Pads, Liners',
    'Always Ultra Thin Feminine Pads with Wings for Women, Size 1, Regular Absorbency, Unscented, 36 Count'].map(later);
  const info = relate([...page1, ...keep, ...drop], 'tampons');
  assert.equal(info.head, 'tampons');
  for (const r of page1) assert.equal(r.related, true, r.name);
  for (const r of keep) assert.equal(r.related, true, r.name);
  for (const r of drop) assert.equal(r.related, false, r.name);
});

test('the head word is the one the first page carries: toilet paper is not paper towels', () => {
  const page1 = ['Bounty Select-A-Size Paper Towels, 6 Double Rolls', 'Bounty Quick Size Paper Towels, 12 Family Rolls', 'Sparkle Tear-A-Square Paper Towels, 6 Double Rolls',
    'Amazon Basics 2-Ply Paper Towels, 12 Rolls', 'Brawny Tear-A-Square Paper Towels, 6 Double Rolls', 'Viva Signature Cloth Paper Towels, 6 Triple Rolls',
    'Scott Paper Towels, Choose-A-Sheet, 6 Double Rolls', 'Presto! Flex-a-Size Paper Towels, 12 Huge Rolls', 'Bounty Essentials Paper Towels, 8 Double Rolls'].map((name) => ({ name, page: 1 }));
  const tp = { name: 'Scott ComfortPlus Toilet Paper, 12 Triple Rolls, 231 Sheets per Roll', page: 3 };
  const holder = { name: 'Paper Towel Holder Countertop, Stainless Steel', page: 3 };
  const towels = { name: 'Sierra Hygiene 1-Ply Hardwound Paper Towels, 6 Rolls', page: 3 };
  const info = relate([...page1, tp, holder, towels], 'paper towels');
  assert.equal(info.head, 'towels');
  assert.equal(tp.related, false);
  assert.equal(holder.related, false);
  assert.equal(towels.related, true);
});

test('too little on the first page to judge by: nothing is set aside', () => {
  const rows = [{ name: 'A thing', page: 1 }, { name: 'Unrelated other', page: 2 }];
  assert.equal(relate(rows, 'thing'), null);
  assert.ok(rows.every((r) => r.related));
});

test('sorted without being asked only where unit price is how you choose', () => {
  const page = (n, name, price, unit, o = {}) => Array.from({ length: n }, (_, i) => ({ name, price, unit: i < n * (o.priced == null ? 1 : o.priced) ? parseUnitPrice(unit) : null, replenish: i < n * (o.replenish || 0) }));
  const auto = (rows) => unitDriven(rows, analyze(rows)).on;
  assert.equal(auto(page(20, 'Ground Coffee, 12 oz', 9, '75.0 ¢/oz', { replenish: 0.8 })), true);
  assert.equal(auto(page(20, 'Whole Milk, 1 Gallon', 3.5, '2.7 ¢/fl oz', { replenish: 1 })), true);
  assert.equal(auto(page(20, 'Paper Towels, 6 Rolls', 12, '$2.10/100 Sheets', { replenish: 0.6 })), true);
  assert.equal(auto(page(20, 'Tampons, 36 Count', 9, '$0.25/count', { replenish: 0.7 })), true);
  assert.equal(auto(page(20, 'AA Batteries, 24 Count', 14, '$0.58/count')), true);
  assert.equal(auto(page(20, 'Wood Screws, 100 Count', 9, '$0.09/count')), true);
  assert.equal(auto(page(20, 'Scented Candle, 16 oz', 20, '$1.25/ounce', { replenish: 0.1 })), false);
  assert.equal(auto(page(20, 'Throw Pillow Covers 18x18, Set of 2', 13, '$6.50/count')), false);
  assert.equal(auto(page(20, 'Bath Towels, Set of 4', 30, '$7.50/count')), false);
  assert.equal(auto(page(20, 'Olive Oil, 16 oz', 20, '$1.25/ounce', { priced: 0.2, replenish: 1 })), false);
  assert.equal(auto(page(20, '65 inch TV', 500, '')), false);
});

test('Walmart Cash: every wording seen on a card', () => {
  assert.deepEqual(readCash(['Get $5.00 Walmart Cash', 'Manufacturer offer |  buy 2']), { amount: 500, need: 2, claimed: false });
  assert.deepEqual(readCash(['Get $0.50 Walmart Cash', 'Manufacturer offer |  Buy 4']), { amount: 50, need: 4, claimed: false });
  assert.deepEqual(readCash(['Get $4.00 Walmart Cash', 'Manufacturer offer |  Must buy 2']), { amount: 400, need: 2, claimed: false });
  assert.deepEqual(readCash(['Get $2.00 Walmart Cash', 'Manufacturer offer']), { amount: 200, need: 1, claimed: false });
  assert.deepEqual(readCash(['Get $0.25 Walmart Cash']), { amount: 25, need: 1, claimed: false });
  assert.deepEqual(readCash(['$1.00 claimed', 'Manufacturer offer | buy 2']), { amount: 100, need: 2, claimed: true });
  assert.deepEqual(readCash(['$1.00 claimed']), { amount: 100, need: 1, claimed: true });
  assert.deepEqual(readCash(['', 'Get $3.00 Walmart Cash', ' ', 'Must buy 3']), { amount: 300, need: 3, claimed: false });
  assert.deepEqual(readCash(['Get $3.00 Walmart Cash', ' | Buy 3']), { amount: 300, need: 3, claimed: false });
  assert.deepEqual(readCash(['Get $1,000.00 Walmart Cash']), { amount: 100000, need: 1, claimed: false });
});

test('Walmart Cash: what is not an offer for this card, or not a wording we know, is left alone', () => {
  assert.equal(readCash(['Walmart Cash available']), null);
  for (const lines of [['Walmart Cash claimed'], ['Walmart Cash pending'], ['Walmart Cash earned'], ['Walmart Cash not available'],
    ['Earn $3.00 Walmart Cash'], ['Add $5.00 Walmart Cash'], ['Add up to $5.00 Reward', 'Manufacturer offer'], ['2x Walmart Cash'], ['5% cash back'],
    ['Get $5.00 Walmart Cash', 'Sign in to claim'], ['Get $5.00 Walmart Cash', 'when you buy 2'], ['Get $5.00 Walmart Cash', 'with purchase of $25'],
    ['Get $5.00 Walmart Cash', 'Limit 1'], ['Get $5.00 claimed'], ['$5.00 Walmart Cash'], ['Get $5.00 Walmart Cash', 'Get $1.00 Walmart Cash'],
    ['Get $5.00 Walmart Cash', 'buy 2', 'buy 3'], ['Get $5.00 Walmart Cash', 'Manufacturer offer | buy 0'], ['Manufacturer offer | buy 2'], [], null]) {
    assert.equal(readCash(lines), null, JSON.stringify(lines));
  }
});

test('Walmart Cash in the page data of other result pages', () => {
  assert.deepEqual(cashFromData({ rewardAmt: 5, minQuantity: 2, state: 'UNCLIPPED' }), { amount: 500, need: 2, claimed: false });
  assert.deepEqual(cashFromData({ rewardAmt: 1, minQuantity: 2, state: 'CLIPPED' }), { amount: 100, need: 2, claimed: true });
  assert.deepEqual(cashFromData({ rewardAmt: 0.25, minQuantity: null, state: 'UNCLIPPED' }), { amount: 25, need: 1, claimed: false });
  assert.deepEqual(cashFromData({ rewardAmt: 4, minQuantity: 0, state: 'UNCLIPPED', restriction: 'Must buy 2' }), { amount: 400, need: 2, claimed: false });
  assert.deepEqual(cashFromData({ rewardAmt: 4, minQuantity: 2, state: 'UNCLIPPED', restriction: 'Must buy 3' }), { amount: 400, need: 3, claimed: false });
  for (const rw of [null, {}, { rewardAmt: 3, state: 'NOT_AVAILABLE' }, { rewardAmt: 3, state: 'APPLIED' }, { rewardAmt: 3, state: 'EXPIRED' }, { rewardAmt: 3 },
    { rewardAmt: 0, state: 'UNCLIPPED' }, { rewardAmt: null, state: 'UNCLIPPED' }, { rewardAmt: 3, state: 'UNCLIPPED', rewardMultiplierStr: '2x' },
    { rewardAmt: 3, state: 'UNCLIPPED', restriction: 'With purchase of $25' }, { rewardAmt: 3, state: 'UNCLIPPED', minQuantity: 1.5 }]) {
    assert.equal(cashFromData(rw), null, JSON.stringify(rw));
  }
});

test('Walmart Cash arithmetic: the cash is shared by the number you must buy', () => {
  near(priceAfterCash(13.47, { amount: 500, need: 2 }), 10.97, 0.0001);
  near(priceAfterCash(0.56, { amount: 50, need: 4 }), 0.435, 0.0001);
  assert.equal(priceAfterCash(3.74, { amount: 500, need: 1 }), 0);
  assert.equal(priceAfterCash(1.5, { amount: 500, need: 2 }), 0);
  assert.equal(priceAfterCash(9.99, null), 9.99);
  assert.equal(priceAfterCash(0, { amount: 500, need: 1 }), 0);
});

test('Walmart Cash reaches every unit price, store-printed or worked out from the title', () => {
  const gain = { name: 'Gain Plus Laundry Detergent Liquid, 99 fl oz', price: 13.47, unit: parseUnitPrice('Price Now $13.47 Was $15.94 13.6 ¢/fl oz Options from $8.94'), cash: { amount: 500, need: 2 } };
  const purex = { name: 'Purex Laundry Detergent, 128 fl oz', price: 10.47, unit: parseUnitPrice('8.2 ¢/fl oz') };
  const tide = { name: 'Tide Simply Laundry Detergent, 173 fl oz', price: 14.94, unit: parseUnitPrice('8.6 ¢/fl oz'), cash: { amount: 200, need: 1 } };
  const noUnit = { name: 'Arm & Hammer Laundry Detergent, 100 fl oz', price: 10, unit: null, cash: { amount: 200, need: 2 } };
  analyze([gain, purex, tide, noUnit]);
  near(gain.vals.volume.v, 13.6 * 10.97 / 13.47, 0.0001);
  near(gain.vals.volume.shelf, 13.6, 0.0001);
  assert.equal(gain.vals.volume.cash, true);
  near(gain.paid, 10.97, 0.0001);
  assert.ok(tide.vals.volume.v < purex.vals.volume.v);
  assert.equal(purex.vals.volume.cash, false);
  near(noUnit.vals.volume.v, 9, 0.0001);
  assert.equal(noUnit.vals.volume.est, true);
});

test('Walmart Cash on a multi-pack counts listings bought, never the cans inside', () => {
  const cans = { name: 'Coca-Cola Soda, 12 fl oz Cans, 24 Pack', price: 12, unit: parseUnitPrice('4.2 ¢/fl oz'), cash: { amount: 200, need: 2 } };
  analyze([cans]);
  near(cans.vals.volume.v, 4.2 * 11 / 12, 0.0001);
  near(cans.vals.count.v, 1100 / 24, 0.0001);
  const pack = { name: 'Starbucks Ground Coffee, 12 oz Bag, Pack of 2', price: 8, unit: null, cash: { amount: 100, need: 1 } };
  analyze([pack]);
  near(pack.vals.weight.v, 700 / 24, 0.0001);
});

test('Walmart Cash never turns a sound store unit price into a disputed one', () => {
  const r = { name: 'Ground Coffee, 30 oz', price: 15, unit: parseUnitPrice('50.0 ¢/oz'), cash: { amount: 1000, need: 1 } };
  analyze([r]);
  assert.equal(r.vals.weight.disputed, false);
  assert.equal(r.vals.weight.est, false);
  near(r.vals.weight.v, 50 / 3, 0.0001);
  const bad = { name: 'Folgers Coffee, 40.3 oz', price: 14.98, unit: parseUnitPrice('3.7 ¢/oz'), cash: { amount: 200, need: 2 } };
  analyze([bad]);
  assert.equal(bad.vals.weight.disputed, true);
  near(bad.vals.weight.v, (1398 / 40.3), 0.0001);
});

test('the note says the price is after Walmart Cash, and how many to buy', () => {
  assert.equal(cashNote('11.1 ¢/fl oz', { need: 2 }, false), '11.1 ¢/fl oz after Walmart Cash if you buy 2');
  assert.equal(cashNote('7.4 ¢/fl oz', { need: 1 }, false), '7.4 ¢/fl oz after Walmart Cash');
  assert.equal(cashNote('9.0 ¢/fl oz', { need: 2 }, true), '≈ 9.0 ¢/fl oz after Walmart Cash if you buy 2');
  assert.equal(cashNote('0.00 ¢/oz', { need: 1 }, false), 'Free after Walmart Cash');
  assert.equal(cashNote('0.00 ¢/oz', { need: 3 }, true), 'Free after Walmart Cash if you buy 3');
  assert.equal(shownPrice(13.6 * 10.97 / 13.47, 'volume', { volume: 'fl oz' }), '11.1 ¢/fl oz');
});
