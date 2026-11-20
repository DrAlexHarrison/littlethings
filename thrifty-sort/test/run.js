const path = require('path');
const pw = require(process.env.PW || 'playwright');
const SCRIPT = path.join(__dirname, '..', 'extension', 'thrifty-sort.user.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const KEYS = {};
const p = (key, id, title, price, unit, flags = '') => {
  KEYS[title] = key;
  return { key, id, title, price, unit, ad: /\bad\b/.test(flags), oos: /\boos\b/.test(flags), again: /\bagain\b/.test(flags) };
};

const W1 = p('W1 Great Value Classic', '10315162', 'Great Value Classic Roast Medium Ground Coffee, 30.5 oz', 9.98, '32.7 ¢/oz', 'again');
const W2 = p('W2 Starbucks Pike sponsored', '45632981', 'Starbucks Pike Place Roast, Medium Roast Ground Coffee, 28 oz', 19.98, '71.4 ¢/oz', 'ad again');
const W3 = p('W3 Folgers store price wrong', '10451393', 'Folgers Classic Roast Medium Ground Coffee, 40.3 oz Canister', 14.98, '3.7 ¢/oz', 'again');
const W4 = p('W4 Maxwell House', '10292470', 'Maxwell House The Original Roast Medium Ground Coffee, 30.6 oz Canister', 12.48, '40.8 ¢/oz', 'again');
const W5 = p('W5 Dunkin out of stock', '16774843', "Dunkin' Original Blend Medium Roast Ground Coffee, 30 oz Canister", 5.98, '19.9 ¢/oz', 'oos again');
const W6 = p('W6 Cafe Bustelo', '10308115', 'Café Bustelo Espresso Style Dark Roast Ground Coffee, 10 oz Brick', 4.48, '44.8 ¢/oz', 'again');
const W7 = p('W7 Eight O\'Clock', '10535127', "Eight O'Clock The Original Medium Roast Ground Coffee, 36 oz Bag", 14.97, '41.6 ¢/oz', 'again');
const W8 = p('W8 McCafe no unit price', '28936754', 'McCafé Premium Roast Medium Ground Coffee, 30 oz Canister', 12.98, '', 'again');
const W9 = p('W9 gift set no size', '55127830', 'Barissimo Coffee Gift Set, Assorted Flavors', 24.99, '');
const W10 = p('W10 Peet\'s', '12014576', "Peet's Coffee Major Dickason's Blend Dark Roast Ground Coffee, 18 oz Bag", 9.98, '55.4 ¢/oz', 'again');
const W11 = p('W11 Great Value Colombian', '10403117', 'Great Value 100% Colombian Medium Roast Ground Coffee, 24.2 oz', 9.48, '39.2 ¢/oz', 'again');
const WA1 = p('WA1 Breakfast Blend (page 2)', '10535160', 'Great Value Breakfast Blend Light Roast Ground Coffee, 12 oz', 4.47, '37.3 ¢/oz', 'again');
const WA2 = p('WA2 Lavazza (page 2)', '19417535', 'Lavazza Classico Medium Roast Ground Coffee, 20 oz Bag', 11.48, '57.4 ¢/oz', 'again');
const WAS = p('WAS French Roast sponsored (page 2)', '45632990', 'Starbucks French Roast Dark Roast Ground Coffee, 28 oz', 19.98, '71.4 ¢/oz', 'ad again');
const WA3 = p('WA3 Community out of stock (page 2)', '33847120', 'Community Coffee Breakfast Blend Medium Roast Ground Coffee, 32 oz', 9.98, '31.2 ¢/oz', 'oos again');
const WA4 = p('WA4 creamer off subject (page 3)', '10292533', 'Coffee mate Original Powdered Coffee Creamer, 35.3 oz', 5.48, '15.5 ¢/oz', 'again');
const WA5 = p('WA5 Black Rifle (page 3)', '48823167', 'Black Rifle Coffee Silencer Smooth Medium Roast Ground Coffee, 12 oz', 9.98, '83.2 ¢/oz', 'again');
const WA6 = p('WA6 Starbucks Breakfast (page 4)', '45632977', 'Starbucks Breakfast Blend Medium Roast Ground Coffee, 12 oz Bag', 8.98, '74.8 ¢/oz', 'again');
const WA7 = p('WA7 Folgers Colombian (page 4)', '10451402', 'Folgers 100% Colombian Medium Roast Ground Coffee, 24.2 oz Canister', 8.48, '35.0 ¢/oz', 'again');
const W_COFFEE = { maxPage: 4, pages: {
  1: [W1, W2, W3, W4, W5, W6, W1, W7, W8, W9, W10, W11],
  2: [WA1, WA2, W7, WAS, WA3],
  3: [WA4, WA5],
  4: [WA6, WA7],
} };

const D1 = { ...p('D1 Gain Plus rollback, $5 back on 2', '79N9XC4DAU4J', 'Gain Plus Laundry Detergent Liquid, Original, 99 fl oz', 13.47, '13.6 ¢/fl oz', 'again'),
  was: '15.94', a11y: 'Price Now $13.47 Was $15.94 13.6 ¢/fl oz Options from $8.94', offer: ['Get $5.00 Walmart Cash', 'Manufacturer offer |  buy 2'] };
const D2 = { ...p('D2 Tide Simply, $2 back', '3KHQT8RZZGO7', 'Tide Simply Laundry Detergent Liquid, Clean & Fresh, 173 fl oz', 14.94, '8.6 ¢/fl oz', 'again'),
  a11y: 'Price $14.94 8.6 ¢/fl oz', offer: ['Get $2.00 Walmart Cash', 'Manufacturer offer'] };
const D3 = { ...p('D3 Purex, offer on its second copy', '6ZCHWZ6ZBUF2', 'Purex Advanced Oxi Laundry Detergent, 128 fl oz', 10.47, '8.2 ¢/fl oz', 'again'), a11y: 'Price $10.47 8.2 ¢/fl oz' };
const D3B = { ...D3, offer: ['Get $0.50 Walmart Cash', 'Manufacturer offer'] };
const D4 = { ...p('D4 all Free Clear, cash on another size', '42QQHMP48CUS', 'all Free Clear Liquid Laundry Detergent, 73 fl oz', 12.12, '16.6 ¢/fl oz', 'again'),
  a11y: 'Price $12.12 16.6 ¢/fl oz Options from $12.12 – $20.17', offer: 'available' };
const D5 = { ...p('D5 Tide Oxi, $1 claimed on 2', '6HRD80KP45FS', 'Tide Simply Laundry Detergent Liquid, Oxi Boost, 94 fl oz', 9.97, '10.6 ¢/fl oz', 'again'),
  a11y: 'Price $9.97 10.6 ¢/fl oz', offer: ['$1.00 claimed', 'Manufacturer offer | buy 2'] };
const D6 = { ...p('D6 Gain sponsored, $5 back on 2', '1XCAZSIJEP2H', 'Gain Laundry Detergent Liquid, Original, 132 fl oz', 15.94, '12.1 ¢/fl oz', 'ad again'),
  a11y: 'Price $15.94 12.1 ¢/fl oz', offer: ['Get $5.00 Walmart Cash', 'Manufacturer offer |  buy 2'] };
const D7 = { ...p('D7 Arm & Hammer', '5ARMHAMR0001', 'Arm & Hammer Clean Burst Laundry Detergent, 100 fl oz', 5.97, '6.0 ¢/fl oz', 'again'), a11y: 'Price $5.97 6.0 ¢/fl oz' };
const D8 = { ...p('D8 Persil, unknown wording', '5PERSIL00001', 'Persil ProClean Laundry Detergent, 100 fl oz', 13.97, '14.0 ¢/fl oz', 'again'),
  a11y: 'Price $13.97 14.0 ¢/fl oz', offer: ['Get $3.00 Walmart Cash', 'With purchase of $30'] };
const D9 = { ...p('D9 Great Value, free after cash', '5GVFREE00001', 'Great Value Free & Clear Laundry Detergent, 50 fl oz', 3.74, '7.5 ¢/fl oz', 'again'),
  a11y: 'Price $3.74 7.5 ¢/fl oz', offer: ['Get $5.00 Walmart Cash', null] };
const D10 = { ...p('D10 Xtra, offer drawn late', '5XTRA0000001', 'Xtra Plus OxiClean Laundry Detergent, 75 fl oz', 4.97, '6.6 ¢/fl oz', 'again'), a11y: 'Price $4.97 6.6 ¢/fl oz' };
const D10_OFFER = ['Get $1.00 Walmart Cash', 'Manufacturer offer |  buy 2'];
const D12 = { ...p('D12 Seventh Generation', '5SEVENTHGEN1', 'Seventh Generation Laundry Detergent, 90 fl oz', 13.99, '15.5 ¢/fl oz', 'again'), a11y: 'Price $13.99 15.5 ¢/fl oz' };
const D20 = { ...p('D20 Great Value (page 2), $2 back on 2', '5GV150000002', 'Great Value Laundry Detergent, Original, 150 fl oz', 8.97, '6.0 ¢/fl oz', 'again'),
  rewards: { rewardAmt: 2, minQuantity: 2, state: 'UNCLIPPED', rewardMultiplierStr: null, restriction: null } };
const D21 = { ...p('D21 Tide (page 2), cash on another size', '5TIDE1250002', 'Tide Original Laundry Detergent Liquid, 125 fl oz', 19.94, '16.0 ¢/fl oz', 'again'),
  rewards: { rewardAmt: 3, minQuantity: 1, state: 'NOT_AVAILABLE' } };
const W_DETERGENT = { maxPage: 2, pages: { 1: [D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D3B, D12], 2: [D20, D21] } };

const pillows = (fmt) => [
  p('P1 Mainstays navy', '57123001', 'Mainstays Decorative Throw Pillow Cover, 18" x 18", Navy Stripe, 2 Pack', 12.97, fmt(6.49)),
  p('P2 velvet', '57123002', 'Better Homes & Gardens Velvet Throw Pillow Covers, 20" x 20", Blush, 2 Pack', 19.97, fmt(9.99)),
  p('P3 linen sponsored', '57123003', 'MIULEE Pack of 4 Decorative Linen Throw Pillow Covers, 18" x 18", Beige', 17.99, fmt(4.5), 'ad'),
  p('P4 faux fur', '57123004', 'Mainstays Faux Fur Throw Pillow Cover, 18" x 18", White, 2 Pack', 14.97, fmt(7.49)),
  p('P5 chunky knit', '57123005', 'Gap Home Chunky Knit Throw Pillow Cover, 20" x 20", Gray', 24.98, fmt(24.98)),
  p('P6 outdoor', '57123006', 'Better Homes & Gardens Outdoor Throw Pillow Covers, 18" x 18", Teal, 4 Pack', 22.97, fmt(5.74)),
  p('P7 chenille', '57123007', 'Mainstays Solid Chenille Throw Pillow Cover, 18" x 18", Navy', 4.97, fmt(4.97)),
  p('P8 floral', '57123008', 'Thyme & Table Floral Throw Pillow Covers, 20" x 20", Sage, 2 Pack', 16.97, fmt(8.49)),
  p('P9 corduroy', '57123009', 'Home Brilliant Corduroy Throw Pillow Covers, 18" x 18", Rust, 2 Pack', 11.99, fmt(6.0)),
  p('P10 kids', '57123010', 'Your Zone Kids Rainbow Throw Pillow Cover, 16" x 16", Multicolor', 7.97, fmt(7.97)),
];
const W_PILLOWS = { maxPage: 1, pages: { 1: pillows((d) => '$' + d.toFixed(2) + '/ea') } };
const PILLOWS_SORTED = ['P7 chenille', 'P6 outdoor', 'P9 corduroy', 'P1 Mainstays navy', 'P4 faux fur', 'P10 kids', 'P8 floral', 'P2 velvet', 'P5 chunky knit'];

const MY = [
  p('M1 eggs', '14514541', 'Great Value Large White Eggs, 18 Count', 4.12, '22.9 ¢/ea', 'again'),
  p('M2 milk', '10450114', 'Great Value Whole Vitamin D Milk, Gallon, 128 fl oz', 3.68, '2.9 ¢/fl oz', 'again'),
  p('M3 bananas', '44390948', 'Fresh Banana, Each', 0.27, '$0.27/ea', 'again'),
  p('M4 bread out of stock', '10315752', 'Great Value White Sandwich Bread, 20 oz Loaf', 1.42, '7.1 ¢/oz', 'oos again'),
  p('M5 butter', '10291555', 'Great Value Sweet Cream Salted Butter Sticks, 16 oz, 4 Count', 4.47, '27.9 ¢/oz', 'again'),
  p('M6 cheese', '10291711', 'Great Value Finely Shredded Mexican Style Four Cheese Blend, 8 oz', 2.12, '26.5 ¢/oz', 'again'),
  p('M7 oats', '10295584', 'Great Value Old Fashioned Oats, 42 oz', 3.92, '9.3 ¢/oz', 'again'),
  p('M8 rice', '10315384', 'Great Value Long Grain Enriched Rice, 32 oz', 1.84, '5.8 ¢/oz', 'again'),
  p('M9 apples', '44390953', 'Fresh Gala Apples, 3 lb Bag', 4.27, '8.9 ¢/oz', 'again'),
];

const Z1 = p('Z1 Amazon Fresh', 'B07ZJ2HT3P', 'Amazon Fresh Colombia Ground Coffee, Medium Roast, 32 Ounce', 12.99, '$0.41/Ounce', 'again');
const Z2 = p('Z2 Lavazza sponsored', 'B00I0MJ4L4', 'Lavazza House Blend Perfetto Ground Coffee, Medium Roast, 12 Ounce', 7.99, '$0.67/Ounce', 'ad again');
const Z3 = p('Z3 Folgers store price wrong', 'B00LWRF2NK', 'Folgers Classic Roast Medium Roast Ground Coffee, 43.5 Ounce Canister', 17.48, '$0.04/Ounce', 'again');
const Z4 = p('Z4 Maxwell House', 'B00I5FWWPI', 'Maxwell House The Original Roast Medium Roast Ground Coffee, 30.6 Ounce Canister', 11.97, '$0.39/Ounce', 'again');
const Z5 = p('Z5 Dunkin out of stock', 'B0049I8UAS', "Dunkin' Original Blend Medium Roast Ground Coffee, 22 Ounce", 6.99, '$0.32/Ounce', 'oos again');
const Z6 = p('Z6 Peet\'s', 'B000VDR7ZK', "Peet's Coffee Major Dickason's Blend Dark Roast Ground Coffee, 18 Ounce Bag", 10.49, '$0.58/Ounce', 'again');
const Z7 = p('Z7 Death Wish', 'B00WFSSH9W', 'Death Wish Coffee Dark Roast Ground Coffee, 16 Ounce', 19.99, '$1.25/Ounce', 'again');
const Z8 = p('Z8 Cafe Bustelo no unit price', 'B00F9KLI6O', 'Café Bustelo Espresso Style Dark Roast Ground Coffee, 10 Ounce Brick', 4.98, '', 'again');
const Z9 = p('Z9 gift basket no size', 'B0BX6R4QZT', "Coffee Lover's Gift Basket, Assorted Roasts and Treats", 29.99, '');
const Z10 = p('Z10 Eight O\'Clock', 'B001FA1KAC', "Eight O'Clock Coffee The Original Ground Coffee, Medium Roast, 36 Ounce", 15.99, '$0.44/Ounce', 'again');
const Z11 = p('Z11 Starbucks Pike', 'B07FQ9JSQD', 'Starbucks Ground Coffee, Pike Place Roast, Medium Roast, 28 Ounce', 21.99, '$0.79/Ounce', 'again');
const ZB1 = p('ZB1 Community (page 2)', 'B08XQ5M3RZ', 'Community Coffee Breakfast Blend Medium Roast Ground Coffee, 32 Ounce', 14.49, '$0.45/Ounce', 'again');
const ZBS = p('ZBS Gevalia sponsored (page 2)', 'B0C1K8K4RT', 'Gevalia House Blend Medium Roast Ground Coffee, 20 Ounce', 9.99, '$0.50/Ounce', 'ad again');
const ZB2 = p('ZB2 Kirkland out of stock (page 2)', 'B07Q4QYL5N', 'Kirkland Signature House Blend Medium Roast Ground Coffee, 40 Ounce', 11.99, '$0.30/Ounce', 'oos again');
const ZB3 = p('ZB3 creamer off subject (page 3)', 'B000E3WUJ8', 'Coffee mate Original Powdered Coffee Creamer, 35.3 Ounce', 5.48, '$0.16/Ounce', 'again');
const ZB4 = p('ZB4 Black Rifle (page 3)', 'B07GL7C4ZS', 'Black Rifle Coffee Company Silencer Smooth Ground Coffee, Medium Roast, 12 Ounce', 12.99, '$1.08/Ounce', 'again');
const ZB5 = p('ZB5 Bulletproof (page 4)', 'B074DCLVG5', 'Bulletproof The Original Medium Roast Ground Coffee, 12 Ounce', 11.99, '$1.00/Ounce', 'again');
const ZB6 = p('ZB6 Amazon Basics (page 4)', 'B07NQD5L5K', 'Amazon Basics Ground Coffee, Medium Roast, 24 Ounce', 7.69, '$0.32/Ounce', 'again');
const AD_BLOCK = { block: 'ad-block' };
const Z_COFFEE = { maxPage: 4, pages: {
  1: [Z1, Z2, Z3, Z4, Z5, AD_BLOCK, Z6, Z1, Z7, Z8, Z9, Z10, Z11],
  2: [ZB1, Z4, ZBS, ZB2],
  3: [ZB3, ZB4],
  4: [ZB5, ZB6],
} };
const Z_PILLOWS = { maxPage: 1, pages: { 1: pillows((d) => '$' + d.toFixed(2) + '/Count').map((x) => ({ ...x, id: 'B0P' + x.id })) } };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const byPrice = (list) => list.slice().sort((a, b) => (a.price || 0) - (b.price || 0));

function walmartTile(x, noPrice) {
  const priceLine = x.a11y || 'current price $' + x.price.toFixed(2) + (x.unit ? ', ' + x.unit : '');
  const price = noPrice
    ? '<div data-automation-id="product-price"><div data-testid="ugpp-main-price"><img alt="" src="https://i5.walmartimages.com/price.png"></div></div>'
    : x.was
    ? `<div data-automation-id="product-price" class="flex"><span data-testid="unified-global-product-price-a11y-text" class="w_iUH7">${esc(priceLine)}</span>` +
      `<div class="flex flex-column black" aria-hidden="true" data-testid="unified-global-product-price"><span class="flex flex-wrap" data-testid="ugpp-reduced-price">` +
      `<span class="flex"><span class="green">Now</span><span>$</span><span data-testid="ugpp-reduced-price-display">${Math.floor(x.price)}</span><span>${x.price.toFixed(2).split('.')[1]}</span></span>` +
      `<span class="strike ml1" data-testid="ugpp-was-price">$${esc(x.was)}</span><span class="f7 ml1">${esc(x.unit)}</span></span></div></div>`
    : `<div data-automation-id="product-price" class="flex"><div data-testid="ugpp-main-price" class="b black f5" aria-hidden="true">$${x.price.toFixed(2)}</div>` +
      `<span data-testid="unified-global-product-price-a11y-text" class="w_iUH7">${esc(priceLine)}</span>` +
      (x.unit ? `<div class="gray f7" aria-hidden="true">${esc(x.unit)}</div>` : '') + '</div>';
  return `<div class="mb0 ph1 pa0-xl bb b--near-white w-25"><div class="h-100 pb1-xl pr4-xl pv1 ph1">` +
    `<div data-item-id="${x.id}" role="group" class="sans-serif mid-gray relative flex flex-column w-100">` +
    (x.ad ? '<div class="gray f7">Sponsored</div>' : '') + price +
    `<a href="/ip/${x.id}"><span data-automation-id="product-title" class="normal dark-gray f6">${esc(x.title)}</span></a>` +
    (x.again ? '<div class="f7">EBT eligible</div>' : '') +
    (x.oos ? '<div class="f7 red">Out of stock</div>' : '<button class="w_hhLG">Add</button>') +
    walmartOffer(x) + '</div></div></div>';
}
function walmartOffer(x, offer = x.offer) {
  if (!offer) return '';
  const box = (inner) => `<div class="mb2"><div data-testid="qa-id-walmartReward-${x.id}" class="pa1 br2 relative z-1 pr3 b--navy ba dib bg-washed-blue">${inner}</div></div>`;
  const stack = (first, second) => `<div class="flex items-center"><div class="flex items-start flex-column" style="gap: 4px;"><div class="flex items-center">${first}</div>` +
    (second == null ? '' : `<div class="sans-serif f7 dark-gray" id="add-walmart-reward${x.id}">${esc(second)}</div>`) + '</div></div>';
  if (offer === 'available') return box(`<div class="flex" style="gap: 6px;"><i class="ld ld-InfoCircle" aria-hidden="true"></i><div class="flex items-center"><div class="flex items-start flex-column" style="gap: 4px;"><span id="reward-unlock-checkbox-label-${x.id}">Walmart Cash available</span></div></div></div>`);
  const [first, second] = offer;
  if (/claimed$/.test(first)) return box(`<div class=""><div class="flex" style="gap: 6px;"><i class="ld ld-Check navy" aria-hidden="true"></i>${stack(`<span tabindex="-1" class="f7 navy b">${esc(first)}</span>`, second)}</div></div>`);
  const cb = 'product-reward-toggle-clip-checkbox-' + x.id;
  const aria = esc(first + ', ');
  return box(`<div class="pointer"><div class="flex" style="gap: 6px;"><label class="f7 navy b lh-title" for="${cb}" aria-label="${aria}"><input id="${cb}" type="checkbox" aria-labelledby="${cb}-label" aria-describedby="add-walmart-reward${x.id}"><div></div></label>` +
    stack(`<label for="${cb}" class="f7 navy b pointer" id="${cb}-label" aria-label="${aria}">${esc(first)}</label>`, second) + '</div></div>');
}
const walmartItem = (x) => ({
  __typename: 'Product', id: x.id, usItemId: x.id, name: x.title, canonicalUrl: '/ip/' + x.id,
  imageInfo: { thumbnailUrl: 'https://i5.walmartimages.com/seo/' + x.id + '.jpeg?odnHeight=180&odnWidth=180' },
  priceInfo: { priceDetails: { priceLines: [{ lineType: 'CURRENT_PRICE', values: [{ key: 'PRICE', value: x.price.toFixed(2) }] }]
    .concat(x.unit ? [{ lineType: 'UNIT_PRICE', values: [{ key: 'UNIT_PRICE', value: x.unit }] }] : []) } },
  averageRating: 4.6, numberOfReviews: 2817,
  badges: { flags: [], groupsV2: x.again ? [{ members: [{ content: [{ type: 'TEXT', value: 'EBT eligible' }] }] }] : [] },
  availabilityStatusV2: { value: x.oos ? 'OUT_OF_STOCK' : 'IN_STOCK' },
  isSponsoredFlag: x.ad,
  rewards: x.rewards || null,
});
const walmartNav = (max, cur, base) => {
  let lis = '';
  for (let n = 1; n <= max; n++) lis += `<li><a href="${base}${n > 1 ? '&amp;page=' + n : ''}"${n === cur ? ' aria-current="page"' : ''}>${n}</a></li>`;
  return max > 1 ? `<nav aria-label="pagination" class="mv3"><ul class="list flex">${lis}<li><a aria-label="Next Page" href="#">&gt;</a></li></ul></nav>` : '';
};

function walmartPage(url, cat, opts = {}) {
  const u = new URL(url);
  const page = parseInt(u.searchParams.get('page') || '1', 10);
  const sort = u.searchParams.get('sort') || 'best_match';
  const items = cat.pages[page] || [];
  const tiles = (sort === 'price_low' ? byPrice(items) : items).map((x) => walmartTile(x, opts.noPrice)).join('');
  const data = { props: { pageProps: { initialData: { searchResult: { itemStacks: [{ items: items.map(walmartItem) }], paginationV2: { maxPage: cat.maxPage } } } } } };
  const sorts = [['best_match', 'Best Match'], ['price_low', 'Price: low to high'], ['price_high', 'Price: high to low'], ['best_seller', 'Best selling']];
  const rows = sorts.map(([v, l]) => `<div class="flex items-center pv2"><input type="radio" name="sort-by" id="sort-${v}" value="${v}"${v === sort ? ' checked' : ''}><label for="sort-${v}" class="pointer"><i class="ld ld-Check"></i>${l}</label></div>`).join('');
  const label = sorts.find((s) => s[0] === sort)[1];
  const base = '/search?q=' + encodeURIComponent(u.searchParams.get('q') || '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(u.searchParams.get('q'))} - Walmart.com</title><style>
body{margin:0;font:14px/1.3 sans-serif;width:1200px}
#sortpanel{position:absolute;top:40px;left:0;background:#fff;border:1px solid #ccc;z-index:5}
fieldset[role="radiogroup"] label{display:inline-flex;gap:6px;padding:4px 10px}
i.ld-Check{display:inline-block;width:12px;height:12px;background:#0071dc;opacity:0}
input:checked + label i.ld-Check{opacity:1}
input[name="sort-by"]{position:absolute;opacity:0}
[data-testid="item-stack"]{display:flex;flex-wrap:wrap;width:1200px}
.w-25{width:25%;height:150px;box-sizing:border-box;overflow:hidden}
.full{flex:0 0 100%;height:40px}
nav[aria-label="pagination"] ul{display:flex;gap:8px;list-style:none}
</style></head><body>
<div id="sortbar" style="position:relative;height:40px"><button aria-label="Sort by ${esc(label)}" aria-expanded="false" class="sortbtn">Sort by | ${esc(label)}</button>
<div id="sortpanel" hidden>${opts.lazyMenu ? '' : `<fieldset role="radiogroup" class="bn ma0 pa0">${rows}</fieldset>`}</div></div>
${opts.ticker ? '<div id="clock" data-label="deal-clock">Deal ends in 0</div>' : ''}
<main><div data-testid="item-stack" class="flex flex-wrap">
<div class="full" data-label="top-banner">Results for "${esc(u.searchParams.get('q'))}"</div>${tiles}
<div class="full" data-label="related-searches">Related searches: coffee pods, whole bean coffee</div>
</div><div id="navbox">${walmartNav(cat.maxPage, page, base)}</div></main>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
(() => {
  const btn = document.querySelector('.sortbtn'), panel = document.getElementById('sortpanel');
  const stack = document.querySelector('[data-testid="item-stack"]');
  const LAZY = ${JSON.stringify(opts.lazyMenu ? `<fieldset role="radiogroup" class="bn ma0 pa0">${rows}</fieldset>` : '')};
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
    if (LAZY) panel.innerHTML = open ? LAZY : '';
  };
  if (${!!opts.ticker}) { let n = 0; setInterval(() => { document.getElementById('clock').textContent = 'Deal ends in ' + (++n); }, 100); }
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  const SEARCH = ${JSON.stringify(items.map((x) => [x.price, walmartTile(x, opts.noPrice)]))};
  const MY = ${JSON.stringify(MY.map((x) => walmartTile(x)))};
  const NAV = ${JSON.stringify(walmartNav(cat.maxPage, page, base))};
  const MYNAV = ${JSON.stringify(walmartNav(3, 1, '/my-items?x=1'))};
  const siteNodes = () => [...stack.children].filter((n) => n.querySelector('[data-item-id]'));
  const draw = (htmls) => {
    for (const n of siteNodes()) n.remove();
    const tmp = document.createElement('div'); tmp.innerHTML = htmls.join('');
    stack.querySelector('[data-label="top-banner"]').after(...tmp.children);
  };
  panel.addEventListener('change', (e) => {
    if (e.target.name !== 'sort-by') return;
    const u = new URL(location.href); u.searchParams.set('sort', e.target.value); u.searchParams.delete('page');
    history.pushState({}, '', u);
    const order = e.target.value === 'price_low' ? SEARCH.slice().sort((a, b) => a[0] - b[0]) : SEARCH;
    draw(order.map((x) => x[1]));
    const text = e.target.nextElementSibling.textContent;
    btn.lastChild.textContent = 'Sort by | ' + text; btn.setAttribute('aria-label', 'Sort by ' + text);
    setOpen(false);
  });
  window.toMyItems = () => {
    history.pushState({}, '', '/my-items');
    draw(MY);
    stack.querySelector('[data-label="top-banner"]').textContent = 'My Items';
    document.getElementById('navbox').innerHTML = MYNAV;
  };
  addEventListener('popstate', () => {
    if (location.pathname !== '/search') return;
    draw(SEARCH.map((x) => x[1]));
    stack.querySelector('[data-label="top-banner"]').textContent = 'Results';
    document.getElementById('navbox').innerHTML = NAV;
  });
})();
</script></body></html>`;
}

function amazonTile(x, i, noPrice, clock) {
  if (x.block) return `<div class="AdHolder s-result-item s-widget s-flex-full-width" data-label="${x.block}"><span class="puis-sponsored-label-text">Sponsored</span> Brand row</div>`;
  const money = (v) => `<span class="a-offscreen">$${v.toFixed(2)}</span><span aria-hidden="true">$${v.toFixed(2)}</span>`;
  const unit = x.unit ? (() => { const [amount, per] = x.unit.split('/'); return `<span class="a-size-base a-color-secondary">(<span class="a-price a-text-price" data-a-size="b" data-a-color="secondary"><span class="a-offscreen">${amount}</span><span aria-hidden="true">${amount}</span></span>/${per})</span>`; })() : '';
  return `<div role="listitem" data-asin="${x.id}" data-index="${i}" data-component-type="s-search-result" class="sg-col-4-of-24 s-result-item s-asin sg-col" id="r-${x.id}-${i}">` +
    `<div class="sg-col-inner"><div class="s-card-container"><img class="s-image" src="https://m.media-amazon.com/images/I/${x.id}.jpg" alt="">` +
    (x.ad ? '<span class="puis-sponsored-label-text">Sponsored</span>' : '') +
    `<h2 class="a-size-base-plus a-spacing-none a-color-base a-text-normal"><span>${esc(x.title)}</span></h2>` +
    (noPrice ? '<div class="a-row"><span class="a-color-base">See options</span></div>'
      : `<div class="a-row a-size-base a-color-base"><a class="a-link-normal s-no-hover" href="/dp/${x.id}"><span class="a-price" data-a-color="base">${money(x.price)}</span></a> ${unit}</div>`) +
    (x.again ? '<div class="a-row a-size-base a-color-secondary"><span>Save more with Subscribe &amp; Save</span></div>' : '') +
    (x.oos ? '<div class="a-row"><span class="a-color-price">Currently unavailable.</span></div>' : '') +
    (clock ? '<div class="a-row a-size-base a-color-secondary">Ends in <span id="clock">02:00:00</span></div>' : '') +
    '</div></div></div>';
}
const amazonStrip = (max, cur) => {
  if (max < 2) return '';
  let s = '<span class="s-pagination-item s-pagination-previous s-pagination-disabled">Previous</span>';
  for (let n = 1; n <= max; n++) s += n === cur ? `<span class="s-pagination-item s-pagination-selected">${n}</span>` : `<a class="s-pagination-item s-pagination-button" href="/s?page=${n}">${n}</a>`;
  return `<div class="s-result-item s-widget s-flex-full-width" data-label="page-numbers"><div class="s-pagination-container"><span class="s-pagination-strip">${s}<a class="s-pagination-item s-pagination-next">Next</a></span></div></div>`;
};

function amazonPage(url, cat, opts = {}) {
  const u = new URL(url);
  const page = parseInt(u.searchParams.get('page') || '1', 10);
  const sort = u.searchParams.get('s') || 'relevanceblender';
  const items = cat.pages[page] || [];
  const ordered = sort === 'price-asc-rank' ? byPrice(items.filter((x) => !x.block)) : items;
  const sorts = [['relevanceblender', 'Featured'], ['price-asc-rank', 'Price: Low to High'], ['price-desc-rank', 'Price: High to Low'], ['review-rank', 'Avg. Customer Review'], ['date-desc-rank', 'Newest Arrivals'], ['exact-aware-popularity-rank', 'Best Sellers']];
  const hasSort = !u.searchParams.has('rh');
  const label = sorts.find((s) => s[0] === sort)[1];
  const menu = hasSort ? `<form class="s-sort-form"><span class="a-dropdown-container"><select name="s" id="s-result-sort-select" class="a-native-dropdown" style="display:none">${sorts.map(([v, l]) => `<option value="${v}"${v === sort ? ' selected' : ''}>${l}</option>`).join('')}</select>` +
    `<span class="a-button a-button-dropdown"><span class="a-button-inner"><span class="a-button-text" role="button"><span class="a-dropdown-label">Sort by:</span><span class="a-dropdown-prompt">${esc(label)}</span></span></span></span></span></form>` : '';
  const pop = hasSort ? `<div class="a-popover a-dropdown a-dropdown-common" aria-hidden="true" style="display:none;position:absolute;top:30px;left:0;background:#fff;z-index:5"><div class="a-popover-wrapper"><div class="a-popover-inner"><ul class="a-nostyle a-list-link" role="listbox">` +
    sorts.map(([v, l], i) => `<li class="a-dropdown-item" role="presentation"><a class="a-dropdown-link${v === sort ? ' a-active' : ''}" id="s-result-sort-select_${i}" href="javascript:void(0)" role="option">${l}</a></li>`).join('') + '</ul></div></div></div>' : '';
  return `<!doctype html><html lang="en-us"><head><meta charset="utf-8"><title>Amazon.com : ${esc(u.searchParams.get('k'))}</title><style>
body{margin:0;font:14px/1.3 sans-serif;width:1200px}
.a-dropdown-link{display:block;padding:4px 10px;border:1px solid transparent}
.a-dropdown-link.a-active{background-color:rgb(237, 253, 255);border-color:rgb(0, 113, 133)}
.s-main-slot{display:grid;grid-template-columns:repeat(4,1fr);width:1200px}
.s-result-item{height:180px;overflow:hidden}
.s-flex-full-width,.s-breadcrumb{grid-column:1 / -1;height:40px}
.s-flex-full-width[data-label="page-numbers"]{height:auto}
</style></head><body>
<div style="position:relative;height:40px">${menu}${pop}</div>
<div class="s-main-slot s-result-list s-search-results sg-row">
<div class="s-breadcrumb" data-label="results-header">1-48 of over 3,000 results for "${esc(u.searchParams.get('k'))}"</div>
${ordered.map((x, i) => amazonTile(x, i, opts.noPrice, opts.clock && i === 1)).join('')}${amazonStrip(cat.maxPage, page)}
</div>
<script>
(() => {
  const sel = document.getElementById('s-result-sort-select');
  if (!sel) return;
  const pop = document.querySelector('.a-popover');
  document.querySelector('.a-button-dropdown').addEventListener('click', () => { pop.style.display = 'block'; pop.setAttribute('aria-hidden', 'false'); });
  pop.addEventListener('click', (e) => {
    const a = e.target.closest('a[id^="s-result-sort-select_"]');
    if (!a) return;
    sel.selectedIndex = parseInt(a.id.split('_').pop(), 10);
    pop.style.display = 'none';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pop.style.display = 'none'; pop.setAttribute('aria-hidden', 'true'); } });
  sel.addEventListener('change', () => { const u = new URL(location.href); u.searchParams.set('s', sel.value); u.searchParams.delete('page'); setTimeout(() => location.assign(u), 50); });
})();
</script></body></html>`;
}

function standIn(url) {
  const u = new URL(url);
  if (u.hostname === 'www.walmart.com' && u.pathname === '/search') {
    const q = u.searchParams.get('q');
    if (q === 'throw pillow covers') return walmartPage(url, W_PILLOWS);
    if (q === 'coffee beans') return walmartPage(url, { maxPage: 1, pages: { 1: W_COFFEE.pages[1] } }, { lazyMenu: true, ticker: true });
    if (q === 'medium roast coffee') return walmartPage(url, { maxPage: 1, pages: { 1: W_COFFEE.pages[1] } }, { noPrice: true });
    if (q === 'laundry detergent') return walmartPage(url, W_DETERGENT);
    return walmartPage(url, W_COFFEE);
  }
  if (u.hostname === 'www.amazon.com' && u.pathname === '/s') {
    const k = u.searchParams.get('k');
    if (k === 'throw pillow covers') return amazonPage(url, Z_PILLOWS);
    if (k === 'medium roast coffee') return amazonPage(url, { maxPage: 1, pages: { 1: Z_COFFEE.pages[1] } }, { noPrice: true });
    if (k === 'dark roast coffee') return amazonPage(url, { maxPage: 1, pages: { 1: Z_COFFEE.pages[1] } }, { clock: true });
    return amazonPage(url, Z_COFFEE);
  }
  return null;
}

async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const fetched = [];
  const gates = {};
  for (const n of opts.hold || []) { let release; gates[n] = { promise: new Promise((r) => { release = r; }), release }; }
  const failed = new Set();
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const body = standIn(req.url());
    if (body == null) return route.abort();
    if (req.resourceType() === 'fetch') {
      const n = parseInt(new URL(req.url()).searchParams.get('page') || '1', 10);
      fetched.push(n);
      if (gates[n]) await gates[n].promise;
      if ((opts.failOnce || []).includes(n) && !failed.has(n)) { failed.add(n); return route.fulfill({ status: 503, contentType: 'text/html', body: 'Service unavailable' }); }
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
  });
  await goto(page, url);
  return { page, fetched, release: (n) => gates[n].release() };
}
async function goto(page, url) {
  await page.goto(url);
  await inject(page);
}
const inject = async (page) => { await page.addScriptTag({ path: SCRIPT }); await sleep(250); };
const click = (page, sel, how = 'click') => page[how](sel, { timeout: 3000 }).then(() => true, () => { ok('there is something to ' + how + ' at ' + sel, false); return false; });
const until = (page, fn, arg, ms = 6000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);

const screen = (page) => page.evaluate((keys) => {
  const stack = document.querySelector('[data-testid="item-stack"], .s-main-slot');
  const out = [];
  for (const n of stack.children) {
    const r = n.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(n).visibility === 'hidden') continue;
    const t = n.querySelector('[data-automation-id="product-title"], .wups-title, h2');
    let label;
    if (t) label = keys[t.textContent.trim()] || t.textContent.trim();
    else if (n.classList.contains('wups-divider')) label = '[' + n.textContent.trim() + ']';
    else if (n.classList.contains('wups-more')) label = '[' + n.textContent.trim() + ']';
    else if (n.classList.contains('wups-status')) label = '[status: ' + n.textContent.trim() + ']';
    else label = n.getAttribute('data-label') || n.className;
    out.push({ label, top: Math.round(r.top), left: Math.round(r.left) });
  }
  out.sort((a, b) => a.top - b.top || a.left - b.left);
  return out.map((x) => x.label);
}, KEYS);
const domOrder = (page) => page.evaluate((keys) => {
  const stack = document.querySelector('[data-testid="item-stack"], .s-main-slot');
  return [...stack.children].filter((n) => n.getBoundingClientRect().height > 0).map((n) => {
    const t = n.querySelector('[data-automation-id="product-title"], .wups-title, h2');
    return t ? keys[t.textContent.trim()] || t.textContent.trim() : n.getAttribute('data-label') || n.className;
  });
}, KEYS);
const products = (list) => list.filter((k) => /^[A-Z]+\d/.test(k));
const info = (page) => page.evaluate(() => { const s = document.querySelector('[data-wups-info]'); return s ? JSON.parse(s.getAttribute('data-wups-info')) : {}; });
const noteOf = (page, key) => page.evaluate(([keys, key]) => {
  const title = Object.keys(keys).find((t) => keys[t] === key);
  for (const t of document.querySelectorAll('[data-automation-id="product-title"], .wups-title, h2')) {
    if (t.textContent.trim() !== title) continue;
    const tile = t.closest('[data-item-id], .wups-card, [data-asin]');
    const n = tile.querySelector('[data-wups-note]');
    if (!n) return null;
    const c = getComputedStyle(n, '::after').content;
    return c === 'none' ? null : n.getAttribute('data-wups-note');
  }
  return 'not found';
}, [KEYS, key]);
const watch = (page, tickMs) => page.evaluate((tickMs) => {
  const w = window.__watch = { writes: 0, reads: 0, early: null };
  new MutationObserver((rs) => { w.writes += rs.length; }).observe(document.documentElement, { attributes: true, subtree: true });
  for (const proto of [Document.prototype, Element.prototype]) {
    const all = proto.querySelectorAll;
    proto.querySelectorAll = function (...a) { w.reads++; return all.apply(this, a); };
  }
  setTimeout(() => { w.early = { writes: w.writes, reads: w.reads }; }, 2000);
  if (!tickMs) return;
  const clock = document.getElementById('clock');
  let left = 7200;
  const two = (n) => String(n).padStart(2, '0');
  setInterval(() => { left--; clock.textContent = two(Math.floor(left / 3600)) + ':' + two(Math.floor(left / 60) % 60) + ':' + two(left % 60); }, tickMs);
}, tickMs);
const watched = (page) => page.evaluate(() => ({ writes: window.__watch.writes, reads: window.__watch.reads, early: window.__watch.early }));
const visible = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((n) => n.getBoundingClientRect().height > 0 && getComputedStyle(n).display !== 'none'), sel);
const traces = (page) => page.evaluate(() => ({
  ourNodes: document.querySelectorAll('.wups-tile,.wups-status,.wups-divider,.wups-more,.wups-opt').length,
  classes: document.querySelectorAll('.wups-stack,.wups-on,.wups-oos,.wups-hide,.wups-btn-on,.wups-sel').length,
  marks: document.querySelectorAll('[data-wups-note],[data-wups-label],[data-wups-info]').length,
  ordered: [...document.querySelectorAll('*')].filter((n) => n.style && n.style.order).length,
  merged: document.documentElement.classList.contains('wups-merged'),
}));

const walmartButton = (page) => page.evaluate(() => {
  const b = document.querySelector('button[aria-label^="Sort by"]');
  const before = getComputedStyle(b, '::before').content;
  const fontSize = getComputedStyle(b).fontSize;
  return fontSize === '0px' && before !== 'none' ? b.getAttribute('data-wups-label') : b.textContent.trim();
});
const walmartMenu = (page) => page.evaluate(() => [...document.querySelectorAll('fieldset[role="radiogroup"] > div')].map((row) => {
  const check = row.querySelector('i.ld-Check');
  return row.textContent.trim() + (check && getComputedStyle(check).opacity === '1' ? ' (checked)' : '');
}));
const amazonButton = (page) => page.evaluate(() => {
  const p = document.querySelector('.a-dropdown-prompt');
  const after = getComputedStyle(p, '::after').content;
  return getComputedStyle(p).fontSize === '0px' && after !== 'none' ? p.getAttribute('data-wups-label') : p.textContent.trim();
});
const amazonMenu = (page) => page.evaluate(() => [...document.querySelectorAll('.a-popover li a')].map((a) => {
  const marked = getComputedStyle(a).backgroundColor === 'rgb(237, 253, 255)';
  return a.textContent.trim() + (marked ? ' (marked)' : '');
}));

const W_WEIGHT = 'Price per weight (oz): Low to High';
const W_SITE_MENU = ['Best Match', 'Price: low to high', 'Price: high to low', 'Best selling'];

(async () => {
  const kind = process.env.BROWSER || 'chromium';
  const launch = { headless: true };
  if (process.env.CHROME_EXE) launch.executablePath = process.env.CHROME_EXE;
  const browser = await pw[kind].launch(launch);
  const t0 = Date.now();
  try {
    console.log('Walmart: a coffee search, sorted by price per ounce');
    let tab = await open(browser, 'https://www.walmart.com/search?q=ground+coffee', { hold: [2, 3] });
    let page = tab.page;
    const W_PAGE1 = ['top-banner', 'W1 Great Value Classic', 'W3 Folgers store price wrong', 'W11 Great Value Colombian', 'W4 Maxwell House', 'W7 Eight O\'Clock', 'W8 McCafe no unit price', 'W6 Cafe Bustelo', 'W10 Peet\'s', '[Other results]', 'W9 gift set no size', 'related-searches'];
    let s = await screen(page);
    same('the sort turns on by itself and puts page 1 in price-per-ounce order', s, W_PAGE1);
    ok('it says why: most tiles carry a unit price and EBT eligible', (await info(page)).auto === true && ((await info(page)).basis || {}).replenish >= 0.25, await info(page));
    ok('the site\'s own tiles are re-ordered with CSS order, never moved', await page.evaluate(() => {
      const stack = document.querySelector('[data-testid="item-stack"]');
      const ids = [...stack.querySelectorAll('[data-item-id]')].map((n) => n.getAttribute('data-item-id'));
      return ids.join() === '10315162,45632981,10451393,10292470,16774843,10308115,10315162,10535127,28936754,55127830,12014576,10403117' &&
        getComputedStyle(stack.querySelector('[data-item-id="10315162"]').closest('.w-25')).order === '1';
    }));
    ok('the sponsored product is not shown', !s.includes('W2 Starbucks Pike sponsored'));
    ok('the out-of-stock product is not shown', !s.includes('W5 Dunkin out of stock'));
    ok('a product listed twice is shown once', s.filter((k) => k === 'W1 Great Value Classic').length === 1);
    ok('a store unit price that disagrees with the title does not put the product first', s.indexOf('W3 Folgers store price wrong') === 2, s);
    same('that product shows the worked-out price', await noteOf(page, 'W3 Folgers store price wrong'), '≈ 37.2 ¢/oz');
    same('a product with no store unit price shows one worked out from its size', await noteOf(page, 'W8 McCafe no unit price'), '≈ 43.3 ¢/oz');
    same('a product whose store unit price is fine gets no note', await noteOf(page, 'W1 Great Value Classic'), null);
    same('the Sort button names our sort', await walmartButton(page), W_WEIGHT);
    await click(page, 'button[aria-label^="Sort by"]');
    same('our sort is in Walmart\'s Sort menu, with the check mark', await walmartMenu(page), [W_WEIGHT + ' (checked)', ...W_SITE_MENU]);
    await click(page, 'button[aria-label^="Sort by"]');

    console.log('Walmart: the next two result pages');
    same('pages 2 and 3 are asked for, page 4 is not', tab.fetched.slice().sort(), [2, 3]);
    tab.release(2); await sleep(500);
    same('with page 2 in and page 3 still loading, nothing moves yet', await screen(page), W_PAGE1);
    tab.release(3);
    await until(page, () => document.querySelectorAll('.wups-tile').length > 0);
    await sleep(300);
    const W_MERGED = ['top-banner', 'W1 Great Value Classic', 'W3 Folgers store price wrong', 'WA1 Breakfast Blend (page 2)', 'W11 Great Value Colombian', 'W4 Maxwell House', 'W7 Eight O\'Clock', 'W8 McCafe no unit price', 'W6 Cafe Bustelo', 'W10 Peet\'s', 'WA2 Lavazza (page 2)', 'WA5 Black Rifle (page 3)', '[More results]', '[Other results]', 'WA4 creamer off subject (page 3)', 'W9 gift set no size', 'related-searches'];
    s = await screen(page);
    same('then pages 2 and 3 join the list in one step, in order', s, W_MERGED);
    ok('the off-subject creamer, cheapest per ounce of all, sits under "Other results"', s.indexOf('WA4 creamer off subject (page 3)') > s.indexOf('[Other results]'), s);
    ok('a page-1 product that turns up again on page 2 is shown once', s.filter((k) => k === 'W7 Eight O\'Clock').length === 1);
    ok('sponsored and out-of-stock products from page 2 are not shown', !s.includes('WAS French Roast sponsored (page 2)') && !s.includes('WA3 Community out of stock (page 2)'));
    ok('Walmart\'s page-number bar is hidden while the pages are merged', await page.evaluate(() => document.documentElement.classList.contains('wups-merged')) && !(await visible(page, 'nav[aria-label="pagination"]')));
    ok('a product from page 2 gets a tile with a picture, a View button, its price and its unit price', await page.evaluate(() => {
      const t = [...document.querySelectorAll('.wups-tile')].find((n) => n.querySelector('.wups-title').textContent.startsWith('Great Value Breakfast Blend'));
      return !!t.querySelector('.wups-img img') && t.querySelector('.wups-view').getAttribute('href') === '/ip/10535160' &&
        t.querySelector('.wups-price').textContent.replace(/\s/g, '').startsWith('$447') && t.querySelector('.wups-unit').textContent === '37.3 ¢/oz';
    }));
    await sleep(800);
    same('each page was asked for once', tab.fetched.slice().sort(), [2, 3]);

    await click(page, '.wups-more button');
    await until(page, () => !document.querySelector('.wups-more'));
    await sleep(300);
    s = await screen(page);
    same('"More results" loads page 4 into the list', products(s), ['W1 Great Value Classic', 'WA7 Folgers Colombian (page 4)', 'W3 Folgers store price wrong', 'WA1 Breakfast Blend (page 2)', 'W11 Great Value Colombian', 'W4 Maxwell House', 'W7 Eight O\'Clock', 'W8 McCafe no unit price', 'W6 Cafe Bustelo', 'W10 Peet\'s', 'WA2 Lavazza (page 2)', 'WA6 Starbucks Breakfast (page 4)', 'WA5 Black Rifle (page 3)', 'WA4 creamer off subject (page 3)', 'W9 gift set no size']);
    ok('and goes away once every page is in', !s.includes('[More results]'), s);
    same('page 4 was asked for once', tab.fetched.slice().sort(), [2, 3, 4]);

    console.log('Walmart: leaving the search without a reload');
    await page.evaluate(() => window.toMyItems());
    await sleep(900);
    s = await screen(page);
    same('My Items keeps Walmart\'s order, out-of-stock items included', s, ['top-banner', 'M1 eggs', 'M2 milk', 'M3 bananas', 'M4 bread out of stock', 'M5 butter', 'M6 cheese', 'M7 oats', 'M8 rice', 'M9 apples', 'related-searches']);
    same('nothing of Thrifty Sort is left on the page', await traces(page), { ourNodes: 0, classes: 0, marks: 0, ordered: 0, merged: false });
    ok('Walmart\'s page-number bar is back', await visible(page, 'nav[aria-label="pagination"]'));
    same('the Sort button reads Walmart\'s own words again', await walmartButton(page), 'Sort by | Best Match');
    await sleep(1000);
    same('and it stays that way', await traces(page), { ourNodes: 0, classes: 0, marks: 0, ordered: 0, merged: false });
    const before = tab.fetched.length;
    await page.evaluate(() => history.back());
    await until(page, () => document.querySelectorAll('.wups-tile').length > 0);
    await sleep(400);
    ok('Back to the search: sorted again with the pages already loaded, none asked for again', tab.fetched.length === before && products(await screen(page))[1] === 'WA7 Folgers Colombian (page 4)', [tab.fetched, products(await screen(page)).slice(0, 3)]);

    console.log('Walmart: picking a sort in the Sort menu');
    await click(page, 'button[aria-label^="Sort by"]');
    await click(page, 'fieldset[role="radiogroup"] label[for="sort-price_low"]');
    await sleep(700);
    s = await screen(page);
    same('one of Walmart\'s own sorts turns ours off: Walmart\'s order, as it drew it', s, await domOrder(page));
    ok('in that order sponsored and out-of-stock products show again', s.includes('W2 Starbucks Pike sponsored') && s.includes('W5 Dunkin out of stock'), s);
    ok('the products from other pages are gone', !s.some((k) => /\(page \d\)/.test(k)), s);
    ok('the page-number bar is back', await visible(page, 'nav[aria-label="pagination"]'));
    same('the Sort button reads Walmart\'s sort', await walmartButton(page), 'Sort by | Price: low to high');
    await click(page, 'button[aria-label^="Sort by"]');
    same('the menu still lists ours, unchecked, with Walmart\'s check on its pick', await walmartMenu(page), [W_WEIGHT, 'Best Match', 'Price: low to high (checked)', 'Price: high to low', 'Best selling']);
    await click(page, 'button[aria-label^="Sort by"]');
    await goto(page, 'https://www.walmart.com/search?q=ground+coffee');
    s = await screen(page);
    same('the same search again in that tab stays in Walmart\'s order', s, await domOrder(page));
    ok('and our sort is not on', (await info(page)).active === false && (await walmartButton(page)) === 'Sort by | Best Match');
    await goto(page, 'https://www.walmart.com/search?q=whole+bean+coffee');
    ok('another search sorts by itself again', (await info(page)).active === true && products(await screen(page))[0] === 'W1 Great Value Classic', products(await screen(page)));
    await goto(page, 'https://www.walmart.com/search?q=ground+coffee');
    await click(page, 'button[aria-label^="Sort by"]');
    await click(page, '.wups-opt label', 'focus');
    await page.keyboard.press('Enter');
    await until(page, () => document.querySelectorAll('.wups-tile').length > 0);
    await sleep(300);
    s = await screen(page);
    same('picking ours in the menu (Enter key) turns it back on, pages 2 and 3 included', s, W_MERGED);
    ok('the menu closes', await page.evaluate(() => document.getElementById('sortpanel').hidden));
    same('and the button names our sort', await walmartButton(page), W_WEIGHT);
    await page.context().close();

    console.log('Walmart: a search where unit price is not how people choose');
    tab = await open(browser, 'https://www.walmart.com/search?q=throw+pillow+covers');
    page = tab.page;
    await sleep(300);
    s = await screen(page);
    same('throw pillow covers keep Walmart\'s order, sponsored included', s, await domOrder(page));
    ok('it says why: a dollar or more apiece and nothing bought again and again', (await info(page)).auto === false && ((await info(page)).basis || {}).each > 100, await info(page));
    ok('no other result pages are loaded', tab.fetched.length === 0);
    same('the Sort button keeps Walmart\'s words', await walmartButton(page), 'Sort by | Best Match');
    await click(page, 'button[aria-label^="Sort by"]');
    same('our sort is offered in the Sort menu, unchecked', await walmartMenu(page), ['Price per count: Low to High', 'Best Match (checked)', 'Price: low to high', 'Price: high to low', 'Best selling']);
    await click(page, '.wups-opt label');
    await sleep(400);
    s = await screen(page);
    same('picking it sorts them by price per count', products(s), PILLOWS_SORTED);
    ok('the sponsored cover is then not shown', !s.includes('P3 linen sponsored'));
    same('the button names it', await walmartButton(page), 'Price per count: Low to High');
    await inject(page);
    await sleep(300);
    ok('a second copy of the script takes over: one entry in the menu, same order', (await page.evaluate(() => document.querySelectorAll('.wups-opt').length)) === 1 && products(await screen(page)).join() === PILLOWS_SORTED.join());
    await page.context().close();

    console.log('Walmart: a page that is never quiet, with a Sort list built on opening');
    tab = await open(browser, 'https://www.walmart.com/search?q=coffee+beans');
    page = tab.page;
    ok('the sort is on', (await info(page)).active === true);
    await sleep(3000);
    await watch(page, 0);
    await until(page, () => window.__watch.early, null, 8000);
    let seen = await watched(page);
    ok('the page is read again as the clock ticks', seen.early.reads > 0, seen);
    ok('and nothing on it is rewritten', seen.early.writes === 0, seen);
    const ticks = await page.evaluate(() => document.getElementById('clock').textContent);
    const opened = Date.now();
    await click(page, 'button[aria-label^="Sort by"]');
    const inMenu = await until(page, () => document.querySelectorAll('.wups-opt').length > 0, null, 3000);
    const took = Date.now() - opened;
    ok('the clock beside the results ticks all the while', (await page.evaluate(() => document.getElementById('clock').textContent)) !== ticks);
    ok('our entry is in the Sort list within 1.5 s of the list being built', inMenu && took <= 1500, took);
    same('listed first, with the check mark', await walmartMenu(page), [W_WEIGHT + ' (checked)', ...W_SITE_MENU]);
    await page.context().close();

    console.log('Walmart: prices the script cannot read');
    tab = await open(browser, 'https://www.walmart.com/search?q=medium+roast+coffee');
    page = tab.page;
    s = await screen(page);
    ok('one sentence says so, above the products', s.indexOf('[status: Thrifty Sort could not read this page\'s prices.]') === 1, s);
    ok('the sentence is shown once', s.filter((k) => k === '[status: Thrifty Sort could not read this page\'s prices.]').length === 1, s);
    ok('the products stay in Walmart\'s order', products(s).join() === products(await domOrder(page)).join(), s);
    ok('and no sort is on', (await info(page)).active === false && tab.fetched.length === 0);
    await page.context().close();

    console.log('Walmart: a result page the store refuses');
    tab = await open(browser, 'https://www.walmart.com/search?q=decaf+coffee', { failOnce: [3] });
    page = tab.page;
    await until(page, () => document.querySelector('.wups-more'));
    await sleep(300);
    s = await screen(page);
    ok('loading stops at the refusal and what did load is merged', s.includes('WA1 Breakfast Blend (page 2)') && !s.includes('WA5 Black Rifle (page 3)') && (await info(page)).blocked === true, s);
    ok('"More results" is offered', s.includes('[More results]'));
    const asked = tab.fetched.length;
    await goto(page, 'https://www.walmart.com/search?q=decaf+coffee');
    await sleep(800);
    s = await screen(page);
    ok('the same search reloaded soon after asks the store for nothing by itself', tab.fetched.length === asked && s.includes('WA1 Breakfast Blend (page 2)') && s.includes('[More results]'), [tab.fetched, s]);
    await click(page, '.wups-more button');
    await until(page, () => !document.querySelector('.wups-more'));
    await sleep(300);
    s = await screen(page);
    ok('"More results" tries again and loads the rest', s.includes('WA5 Black Rifle (page 3)') && s.includes('WA6 Starbucks Breakfast (page 4)'), s);
    same('pages asked for: 2, 3 (refused), then 3 and 4', tab.fetched.slice(0, 2).sort().concat(tab.fetched.slice(2).sort()), [2, 3, 3, 4]);
    await page.context().close();

    console.log('Walmart: Walmart Cash counted in the unit price');
    tab = await open(browser, 'https://www.walmart.com/search?q=laundry+detergent', { hold: [2] });
    page = tab.page;
    s = await screen(page);
    same('page 1 sorts by price per fluid ounce after each product\'s share of the cash', products(s),
      ['D9 Great Value, free after cash', 'D7 Arm & Hammer', 'D10 Xtra, offer drawn late', 'D2 Tide Simply, $2 back', 'D3 Purex, offer on its second copy', 'D5 Tide Oxi, $1 claimed on 2', 'D1 Gain Plus rollback, $5 back on 2', 'D8 Persil, unknown wording', 'D12 Seventh Generation', 'D4 all Free Clear, cash on another size']);
    ok('$2.00 back puts Tide (8.6 on the shelf) ahead of Purex (8.2)', s.indexOf('D2 Tide Simply, $2 back') < s.indexOf('D3 Purex, offer on its second copy'), s);
    same('the tile says the price is after Walmart Cash and how many to buy, on a Rollback card too', await noteOf(page, 'D1 Gain Plus rollback, $5 back on 2'), '11.1 ¢/fl oz after Walmart Cash if you buy 2');
    same('an offer with no count is for buying one', await noteOf(page, 'D2 Tide Simply, $2 back'), '7.4 ¢/fl oz after Walmart Cash');
    same('a claimed offer counts the same', await noteOf(page, 'D5 Tide Oxi, $1 claimed on 2'), '10.1 ¢/fl oz after Walmart Cash if you buy 2');
    same('an offer on the second copy of a product counts for the copy shown', await noteOf(page, 'D3 Purex, offer on its second copy'), '7.8 ¢/fl oz after Walmart Cash');
    same('more cash than the price makes it free, never less', await noteOf(page, 'D9 Great Value, free after cash'), 'Free after Walmart Cash');
    ok('and a free product stays with the products searched for, above "Other results"', !s.includes('[Other results]') || s.indexOf('D9 Great Value, free after cash') < s.indexOf('[Other results]'), s);
    same('"Walmart Cash available" (no amount) changes nothing', await noteOf(page, 'D4 all Free Clear, cash on another size'), null);
    same('a wording we do not know changes nothing', await noteOf(page, 'D8 Persil, unknown wording'), null);
    same('a product with no offer gets no note', await noteOf(page, 'D7 Arm & Hammer'), null);
    ok('the sponsored card with an offer is not shown', !s.includes('D6 Gain sponsored, $5 back on 2'), s);
    same('Walmart\'s own unit price stays on each tile as Walmart printed it', await page.evaluate(() => document.querySelector('[data-item-id="79N9XC4DAU4J"] [data-testid="ugpp-reduced-price"]').textContent.includes('13.6 ¢/fl oz')), true);
    same('the grid counts the products with Walmart Cash in their price', (await info(page)).cash, 5);

    await page.evaluate(([id, html]) => document.querySelector('[data-item-id="' + id + '"]').insertAdjacentHTML('beforeend', html), [D10.id, walmartOffer(D10, D10_OFFER)]);
    await until(page, (id) => { const n = document.querySelector('[data-item-id="' + id + '"] [data-wups-note]'); return !!n && /Walmart Cash/.test(n.getAttribute('data-wups-note')); }, D10.id, 3000);
    await sleep(400);
    s = await screen(page);
    same('an offer drawn after the card is counted once it appears', products(s).slice(0, 3), ['D9 Great Value, free after cash', 'D10 Xtra, offer drawn late', 'D7 Arm & Hammer']);
    same('and its tile says so', await noteOf(page, 'D10 Xtra, offer drawn late'), '5.9 ¢/fl oz after Walmart Cash if you buy 2');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(([id, html]) => { const b = document.querySelector('[data-testid="qa-id-walmartReward-' + id + '"]').parentElement; b.outerHTML = html; }, [D10.id, walmartOffer(D10, i === 1 ? ['$1.00 claimed', 'Manufacturer offer | buy 2'] : D10_OFFER)]);
      await sleep(300);
    }
    same('redrawn three times, it is still counted once', await noteOf(page, 'D10 Xtra, offer drawn late'), '5.9 ¢/fl oz after Walmart Cash if you buy 2');
    same('and the order holds', products(await screen(page)).slice(0, 3), ['D9 Great Value, free after cash', 'D10 Xtra, offer drawn late', 'D7 Arm & Hammer']);

    tab.release(2);
    await until(page, () => document.querySelectorAll('.wups-tile').length > 0);
    await sleep(300);
    s = await screen(page);
    same('page 2\'s products come in with their Walmart Cash from the page data', products(s),
      ['D9 Great Value, free after cash', 'D20 Great Value (page 2), $2 back on 2', 'D10 Xtra, offer drawn late', 'D7 Arm & Hammer', 'D2 Tide Simply, $2 back', 'D3 Purex, offer on its second copy', 'D5 Tide Oxi, $1 claimed on 2', 'D1 Gain Plus rollback, $5 back on 2', 'D8 Persil, unknown wording', 'D12 Seventh Generation', 'D21 Tide (page 2), cash on another size', 'D4 all Free Clear, cash on another size']);
    same('a page-2 tile shows the offer and the price after it', await page.evaluate(() => {
      const t = [...document.querySelectorAll('.wups-tile')].find((n) => n.querySelector('.wups-title').textContent.startsWith('Great Value Laundry Detergent'));
      return [t.querySelector('.wups-cash') && t.querySelector('.wups-cash').textContent, t.querySelector('.wups-unit').textContent];
    }), ['Get $2.00 Walmart Cash, buy 2', '6.0 ¢/fl oz']);
    same('with the note beside its unit price', await noteOf(page, 'D20 Great Value (page 2), $2 back on 2'), '5.3 ¢/fl oz after Walmart Cash if you buy 2');
    same('an offer the page data marks as not available changes nothing', await noteOf(page, 'D21 Tide (page 2), cash on another size'), null);
    await page.context().close();

    console.log('Amazon: a coffee search, sorted by price per ounce');
    tab = await open(browser, 'https://www.amazon.com/s?k=ground+coffee&crid=1A2B3C4D5E&sprefix=ground+coffee%2Caps%2C162&ref=nb_sb_noss_1', { hold: [3] });
    page = tab.page;
    let Z_MERGED;
    const Z_PAGE1 = ['results-header', 'Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh', 'Z10 Eight O\'Clock', 'Z8 Cafe Bustelo no unit price', 'Z6 Peet\'s', 'Z11 Starbucks Pike', 'Z7 Death Wish', '[Other results]', 'Z9 gift basket no size', 'page-numbers'];
    s = await screen(page);
    same('the sort turns on by itself and puts page 1 in price-per-ounce order', s, Z_PAGE1);
    ok('it says why: most tiles carry a unit price and Subscribe & Save', (await info(page)).auto === true && ((await info(page)).basis || {}).replenish >= 0.25, await info(page));
    ok('the sponsored product and the sponsored brand row are not shown', !s.includes('Z2 Lavazza sponsored') && !s.includes('ad-block'));
    ok('the unavailable product is not shown', !s.includes('Z5 Dunkin out of stock'));
    ok('a product listed twice is shown once', s.filter((k) => k === 'Z1 Amazon Fresh').length === 1);
    ok('a store unit price that disagrees with the title does not put the product first', s.indexOf('Z3 Folgers store price wrong') === 2, s);
    same('that product shows the worked-out price', await noteOf(page, 'Z3 Folgers store price wrong'), '≈ 40.2 ¢/oz');
    same('a product with no store unit price shows one worked out from its size', await noteOf(page, 'Z8 Cafe Bustelo no unit price'), '≈ 49.8 ¢/oz');
    same('the Sort by box names our sort', await amazonButton(page), W_WEIGHT);
    await click(page, '.a-button-dropdown');
    same('our sort is in Amazon\'s Sort list and marked, Amazon\'s own pick is not', await amazonMenu(page), [W_WEIGHT + ' (marked)', 'Featured', 'Price: Low to High', 'Price: High to Low', 'Avg. Customer Review', 'Newest Arrivals', 'Best Sellers']);
    await page.keyboard.press('Escape');

    console.log('Amazon: the next two result pages');
    for (let i = 0; i < 60 && !tab.fetched.includes(3); i++) await sleep(100);
    same('page 2 is asked for, then page 3, and not page 4', tab.fetched, [2, 3]);
    same('with page 2 in and page 3 still loading, nothing moves yet', await screen(page), Z_PAGE1);
    tab.release(3);
    await until(page, () => document.querySelectorAll('.wups-tile').length > 0);
    await sleep(300);
    s = await screen(page);
    same('then pages 2 and 3 join the list in one step, in order', s, Z_MERGED = ['results-header', 'Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh', 'Z10 Eight O\'Clock', 'ZB1 Community (page 2)', 'Z8 Cafe Bustelo no unit price', 'Z6 Peet\'s', 'Z11 Starbucks Pike', 'ZB4 Black Rifle (page 3)', 'Z7 Death Wish', '[More results]', '[Other results]', 'ZB3 creamer off subject (page 3)', 'Z9 gift basket no size']);
    ok('sponsored, unavailable and repeated products from page 2 are not shown', !s.includes('ZBS Gevalia sponsored (page 2)') && !s.includes('ZB2 Kirkland out of stock (page 2)') && s.filter((k) => k === 'Z4 Maxwell House').length === 1, s);
    ok('Amazon\'s page numbers are hidden while the pages are merged', !(await visible(page, '.s-pagination-container')));
    ok('a product from page 2 is Amazon\'s own tile, with its price and unit price', await page.evaluate(() => {
      const t = document.querySelector('.wups-tile[data-asin="B08XQ5M3RZ"]');
      return !!t && t.querySelector('.a-price .a-offscreen').textContent === '$14.49' && t.textContent.includes('($0.45$0.45/Ounce)');
    }));
    await sleep(1500);
    same('each page was asked for once', tab.fetched, [2, 3]);
    await click(page, '.wups-more button');
    await until(page, () => !document.querySelector('.wups-more'), null, 8000);
    await sleep(300);
    s = await screen(page);
    same('"More results" loads page 4 into the list', products(s), ['ZB6 Amazon Basics (page 4)', 'Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh', 'Z10 Eight O\'Clock', 'ZB1 Community (page 2)', 'Z8 Cafe Bustelo no unit price', 'Z6 Peet\'s', 'Z11 Starbucks Pike', 'ZB5 Bulletproof (page 4)', 'ZB4 Black Rifle (page 3)', 'Z7 Death Wish', 'ZB3 creamer off subject (page 3)', 'Z9 gift basket no size']);
    same('page 4 was asked for once', tab.fetched, [2, 3, 4]);

    console.log('Amazon: picking a sort in the Sort list');
    await click(page, '.a-button-dropdown');
    await click(page, '#s-result-sort-select_1');
    await page.waitForURL(/s=price-asc-rank/, { timeout: 5000 }).catch(() => {});
    await inject(page);
    s = await screen(page);
    same('one of Amazon\'s own sorts turns ours off: Amazon\'s order, as it drew it', s, await domOrder(page));
    ok('in that order sponsored and unavailable products show again', s.includes('Z2 Lavazza sponsored') && s.includes('Z5 Dunkin out of stock'), s);
    same('the Sort by box reads Amazon\'s sort', await amazonButton(page), 'Price: Low to High');
    ok('no other result pages are loaded', tab.fetched.length === 3);
    await click(page, '.a-button-dropdown');
    same('the list still offers ours, unmarked', await amazonMenu(page), [W_WEIGHT, 'Featured', 'Price: Low to High (marked)', 'Price: High to Low', 'Avg. Customer Review', 'Newest Arrivals', 'Best Sellers']);
    await click(page, '.wups-opt a');
    await sleep(400);
    s = await screen(page);
    ok('picking ours turns it back on', products(s).slice(0, 3).join() === ['Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh'].join() && !s.includes('Z2 Lavazza sponsored'), products(s));
    ok('the list closes', await page.evaluate(() => getComputedStyle(document.querySelector('.a-popover')).display === 'none'));
    same('and the Sort by box names ours', await amazonButton(page), W_WEIGHT);
    await page.context().close();

    console.log('Amazon: a search with no Sort menu');
    tab = await open(browser, 'https://www.amazon.com/s?k=ground+coffee&rh=n%3A16318031');
    page = tab.page;
    s = await screen(page);
    same('a row of buttons sits above the results, ours in force', s.slice(0, 2), ['results-header', '[status: Price per weight (oz)Amazon\'s order]']);
    const current = () => page.evaluate(() => [...document.querySelectorAll('.wups-status button.wups-cur')].map((b) => b.textContent));
    same('the price-per-ounce button is the one marked', await current(), ['Price per weight (oz)']);
    same('and the results are sorted', products(s).slice(0, 3), ['Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh']);
    await until(page, () => document.querySelectorAll('.wups-tile').length > 0, null, 8000);
    await sleep(300);
    same('pages 2 and 3 are merged here too', products(await screen(page)), products(Z_MERGED));
    await click(page, '.wups-status button >> text=Amazon\'s order');
    await sleep(300);
    s = await screen(page);
    ok('"Amazon\'s order" puts Amazon\'s order back', products(s).join() === products(await domOrder(page)).join() && s.includes('Z2 Lavazza sponsored'), s);
    ok('without the products from other pages', !s.some((k) => /\(page \d\)/.test(k)), s);
    same('and the row of buttons stays above the results', s.slice(0, 2), ['results-header', '[status: Price per weight (oz)Amazon\'s order]']);
    same('and is the one marked', await current(), ['Amazon\'s order']);
    const askedBefore = tab.fetched.length;
    await click(page, '.wups-status button >> text=Price per weight (oz)');
    await sleep(300);
    same('the price-per-ounce button sorts again straight away, pages 2 and 3 included', products(await screen(page)), products(Z_MERGED));
    ok('from the pages loaded before, none asked for again', tab.fetched.length === askedBefore, tab.fetched);
    await page.context().close();

    console.log('Amazon: a search where unit price is not how people choose');
    tab = await open(browser, 'https://www.amazon.com/s?k=throw+pillow+covers');
    page = tab.page;
    await sleep(300);
    s = await screen(page);
    same('throw pillow covers keep Amazon\'s order, sponsored included', s, await domOrder(page));
    ok('it says why: a dollar or more apiece and nothing bought again and again', (await info(page)).auto === false && ((await info(page)).basis || {}).each > 100, await info(page));
    same('the Sort by box keeps Amazon\'s words', await amazonButton(page), 'Featured');
    await click(page, '.a-button-dropdown');
    same('our sort is offered in the Sort list', (await amazonMenu(page))[0], 'Price per count: Low to High');
    await click(page, '.wups-opt a');
    await sleep(400);
    same('picking it sorts them by price per count', products(await screen(page)), PILLOWS_SORTED);
    await page.context().close();

    console.log('Amazon: a deal countdown on a product');
    tab = await open(browser, 'https://www.amazon.com/s?k=dark+roast+coffee');
    page = tab.page;
    same('the results are sorted', products(await screen(page)).slice(0, 3), ['Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh']);
    await sleep(3000);
    await watch(page, 100);
    await until(page, () => window.__watch.early, null, 8000);
    seen = await watched(page);
    ok('the countdown ticks', (await page.evaluate(() => document.getElementById('clock').textContent)) !== '02:00:00');
    ok('for two seconds of ticks the page is not read again', seen.early.reads === 0, seen);
    ok('and nothing on it is rewritten', seen.early.writes === 0, seen);
    const readLater = await until(page, () => window.__watch.reads > 0, null, 8000);
    seen = await watched(page);
    ok('the page is read again within a few seconds', readLater, seen);
    ok('still with nothing rewritten', seen.writes === 0, seen);
    same('and the order holds', products(await screen(page)).slice(0, 3), ['Z4 Maxwell House', 'Z3 Folgers store price wrong', 'Z1 Amazon Fresh']);
    await page.context().close();

    console.log('Amazon: prices the script cannot read');
    tab = await open(browser, 'https://www.amazon.com/s?k=medium+roast+coffee');
    page = tab.page;
    s = await screen(page);
    ok('one sentence says so, above the products', s.indexOf('[status: Thrifty Sort could not read this page\'s prices.]') === 1, s);
    ok('once', s.filter((k) => k === '[status: Thrifty Sort could not read this page\'s prices.]').length === 1, s);
    ok('the products stay in Amazon\'s order', products(s).join() === products(await domOrder(page)).join(), s);
    ok('and no sort is on', (await info(page)).active === false && tab.fetched.length === 0);
    await page.context().close();
  } finally { await browser.close(); }
  console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
