'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Menu categories (sort_order) and items: { id, name, price }.
 * All veg; Panjabi Choley Bhature has no listed price → 0 (update in DB when known).
 */
const MENU = [
  {
    title: 'Thalis',
    sort: 0,
    items: [
      { id: 'TL1', name: 'JAANKI SPECIAL THALI', price: 560 },
      { id: 'TL2', name: 'DELUXE THALI', price: 360 },
    ],
  },
  {
    title: 'Momos Point',
    sort: 1,
    items: [
      { id: 'MO1', name: 'Steamed Veg Momos', price: 265 },
      { id: 'MO2', name: 'Fried Veg Momos', price: 275 },
      { id: 'MO3', name: 'Rich Dark Chocolate Ice Cream', price: 295 },
      { id: 'MO4', name: 'Steamed Paneer Momos', price: 310 },
      { id: 'MO5', name: 'Fried Paneer Momos', price: 320 },
      { id: 'MO6', name: 'Paneer Kurkure Momos', price: 330 },
      { id: 'MO7', name: 'Veg Chilli Momos', price: 290 },
      { id: 'MO8', name: 'Paneer Chilli Momos', price: 299 },
      { id: 'MO9', name: 'Tandoori Malai Momos', price: 375 },
    ],
  },
  {
    title: 'Bread Basket',
    sort: 2,
    items: [
      { id: 'BD1', name: 'Plain Roti', price: 25 },
      { id: 'BD2', name: 'Butter Roti', price: 30 },
      { id: 'BD3', name: 'Lacchha Paratha', price: 65 },
      { id: 'BD4', name: 'Missi Roti', price: 65 },
      { id: 'BD5', name: 'Missi Masala Roti', price: 75 },
      { id: 'BD6', name: 'Plain Naan', price: 65 },
      { id: 'BD7', name: 'Butter Naan', price: 85 },
      { id: 'BD8', name: 'Garlic Naan', price: 95 },
      { id: 'BD9', name: 'Cheese Garlic Naan', price: 115 },
      { id: 'BD10', name: 'Stuffed Naan', price: 115 },
      { id: 'BD11', name: 'Paneer Stuffed Naan', price: 149 },
      { id: 'BD12', name: 'Kabuli Naan', price: 135 },
      { id: 'BD13', name: 'Stuffed Kulcha', price: 125 },
      { id: 'BD14', name: 'Paneer Kulcha', price: 145 },
      { id: 'BD15', name: 'Kashmiri Naan', price: 145 },
      { id: 'BD16', name: 'Soya Keema Naan (Spicy)', price: 165 },
      { id: 'BD17', name: 'Mughlai Khamiri Roti', price: 135 },
      { id: 'BD18', name: 'Green Chilli Lacchha Paratha', price: 65 },
    ],
  },
  {
    title: 'Rice',
    sort: 3,
    items: [
      { id: 'RC1', name: 'Steamed Rice', price: 210 },
      { id: 'RC2', name: 'Jeera Rice', price: 225 },
      { id: 'RC3', name: 'Veg Pulav', price: 245 },
      { id: 'RC4', name: 'Matar Pulav', price: 290 },
      { id: 'RC5', name: 'Paneer Palav', price: 295 },
      { id: 'RC6', name: 'Kashmiri Pulav', price: 320 },
      { id: 'RC7', name: 'Veg Biryani', price: 340 },
      { id: 'RC8', name: 'Veg Hyderabadi Biryani', price: 365 },
    ],
  },
  {
    title: 'Snacks',
    sort: 4,
    items: [
      { id: 'SK1', name: 'Veg Pakoda (Assorted)', price: 175 },
      { id: 'SK2', name: 'Paneer Pakoda', price: 240 },
      { id: 'SK3', name: 'Cheese Balls', price: 280 },
      { id: 'SK4', name: 'Veg Cutlet', price: 180 },
      { id: 'SK5', name: 'Paneer Cutlet', price: 280 },
      { id: 'SK6', name: 'Corn Cutlet', price: 280 },
      { id: 'SK7', name: 'Paneer Rolls', price: 280 },
      { id: 'SK8', name: 'Veg Spring Rolls', price: 280 },
      { id: 'SK9', name: 'French Fries', price: 180 },
      { id: 'SK10', name: 'Peri-Peri Masala Fries', price: 190 },
      { id: 'SK11', name: 'Baked Cheesy Fries', price: 299 },
      { id: 'SK12', name: 'Cigar Rolls', price: 260 },
      { id: 'SK13', name: 'Mushroom Duplex', price: 300 },
      { id: 'SK14', name: 'Chilli Honey Potato', price: 260 },
      { id: 'SK15', name: 'Chilli Potato', price: 250 },
      { id: 'SK16', name: 'Fry Kaju Masala', price: 399 },
      { id: 'SK17', name: 'Masala Papad', price: 120 },
      { id: 'SK18', name: 'Cheese Chilly Toast', price: 220 },
      { id: 'SK19', name: 'Garlic Bread', price: 170 },
      { id: 'SK20', name: 'Cheese Garlic Bread', price: 240 },
      { id: 'SK21', name: 'Bombay Paav Bhaji (Extra Paav-60/-)', price: 190 },
      { id: 'SK22', name: 'Panjabi Choley Bhature (Extra Choley-120/-)', price: 0 },
    ],
  },
  {
    title: 'Indian Main Course',
    sort: 5,
    items: [
      { id: 'IM1', name: 'Dal Tadka', price: 295 },
      { id: 'IM2', name: 'Dal Fry', price: 280 },
      { id: 'IM3', name: 'Dal Panchratan', price: 335 },
      { id: 'IM4', name: 'Dal Makhani', price: 335 },
      { id: 'IM5', name: 'Aloo Jeera', price: 195 },
      { id: 'IM6', name: 'Aloo Achari', price: 215 },
      { id: 'IM7', name: 'Stuffed Shimla Mirch', price: 260 },
      { id: 'IM8', name: 'Stuffed Tomato', price: 260 },
      { id: 'IM9', name: 'Aloo Gobhi Matar (Dry)', price: 190 },
      { id: 'IM10', name: 'Mix Veg Dry', price: 325 },
      { id: 'IM11', name: 'Veg Jalfrezi', price: 325 },
      { id: 'IM12', name: 'Veg Jaipuri', price: 325 },
      { id: 'IM13', name: 'Veg Kofta', price: 375 },
      { id: 'IM14', name: 'Malai Kofta', price: 425 },
      { id: 'IM15', name: 'Shaam Savera Kofta', price: 410 },
      { id: 'IM16', name: 'Kashmiri Dum Aloo', price: 435 },
      { id: 'IM17', name: 'Punjabi Dum Aloo', price: 435 },
      { id: 'IM18', name: 'Mushroom Masala', price: 430 },
      { id: 'IM19', name: 'Mushroom Tikka Masala', price: 445 },
      { id: 'IM20', name: 'Kadhai Mushroom', price: 445 },
      { id: 'IM21', name: 'Mushroom Afghani Gravy', price: 295 },
      { id: 'IM22', name: 'Paneer Do Pyaza', price: 425 },
      { id: 'IM23', name: 'Kadhai Paneer', price: 425 },
      { id: 'IM24', name: 'Paneer Butter Masala', price: 425 },
      { id: 'IM25', name: 'Paneer Lababdar', price: 425 },
      { id: 'IM26', name: 'Palak Paneer', price: 425 },
      { id: 'IM27', name: 'Lahsuni Corn Palak', price: 415 },
      { id: 'IM28', name: 'Matar Paneer', price: 425 },
      { id: 'IM29', name: 'Paneer Tikka Masala', price: 485 },
      { id: 'IM30', name: 'Paneer Rogan Josh', price: 510 },
      { id: 'IM31', name: 'Shahi Paneer (White Gravy)', price: 430 },
      { id: 'IM32', name: 'Paneer Pasanda', price: 445 },
      { id: 'IM33', name: 'Paneer Peshawari', price: 425 },
      { id: 'IM34', name: 'Paneer Bhurji', price: 485 },
      { id: 'IM35', name: 'Paneer Kolhapuri', price: 425 },
      { id: 'IM36', name: 'Paneer Angara', price: 510 },
      { id: 'IM37', name: 'Handi Paneer Jaanki Special', price: 555 },
      { id: 'IM38', name: 'Soya Chaap Tikka Masala', price: 345 },
      { id: 'IM39', name: 'Kadhai Soya Chaap', price: 345 },
      { id: 'IM40', name: 'Soya Keema Masala Spicy', price: 360 },
      { id: 'IM41', name: 'Soya Chaap Rogan Josh', price: 455 },
      { id: 'IM42', name: 'Navratan Korma', price: 455 },
      { id: 'IM43', name: 'Navratan Kofta', price: 455 },
      { id: 'IM44', name: 'Kaju Masala Curry', price: 499 },
      { id: 'IM45', name: 'Methi Matar Malai', price: 395 },
      { id: 'IM46', name: 'Paneer Rajwadi', price: 435 },
      { id: 'IM47', name: 'Chana Masala', price: 340 },
      { id: 'IM48', name: 'Rajma Masala', price: 340 },
    ],
  },
  {
    title: 'Salads & Raita',
    sort: 6,
    items: [
      { id: 'SR1', name: 'Green Garden Salad', price: 140 },
      { id: 'SR2', name: 'Chinese Kimchi Salad', price: 165 },
      { id: 'SR3', name: 'Russian Salad', price: 175 },
      { id: 'SR4', name: 'Spicy Tossed Salad', price: 165 },
      { id: 'SR5', name: 'Mixed Fruit Salad', price: 280 },
      { id: 'SR6', name: 'Kachumber Salad', price: 149 },
      { id: 'SR7', name: 'Jaanki Special Salad', price: 180 },
      { id: 'SR8', name: 'Plain Raita', price: 160 },
      { id: 'SR9', name: 'Vegetable Mix Raita', price: 215 },
      { id: 'SR10', name: 'Aloo Pyaaz Raita', price: 210 },
      { id: 'SR11', name: 'Boondi Raita', price: 245 },
      { id: 'SR12', name: 'Mix Fruit Raita', price: 280 },
      { id: 'SR13', name: 'Pineapple Raita', price: 280 },
      { id: 'SR14', name: 'Jaanki Special Garlic Tadka Raita', price: 299 },
    ],
  },
  {
    title: 'South Indian Delicacies',
    sort: 7,
    items: [
      { id: 'SI1', name: 'Plain Butter Dosa', price: 130 },
      { id: 'SI2', name: 'Plain Paper Dosa', price: 145 },
      { id: 'SI3', name: 'Chocolate Paper Dosa', price: 149 },
      { id: 'SI4', name: 'Schezwan Paper Dosa', price: 149 },
      { id: 'SI5', name: 'Masala Dosa', price: 180 },
      { id: 'SI6', name: 'Paneer Masala Dosa', price: 260 },
      { id: 'SI7', name: 'Cheese Masala Dosa', price: 260 },
      { id: 'SI8', name: 'Mysore Masala Dosa', price: 255 },
      { id: 'SI9', name: 'Hungama Mysore Dosa', price: 310 },
      { id: 'SI10', name: 'Ghotala Mysore Dosa', price: 299 },
      { id: 'SI11', name: 'Jaanki Special Matki Dosa', price: 360 },
      { id: 'SI12', name: 'Jini Roll Dosa', price: 299 },
      { id: 'SI13', name: 'Spring Roll Dosa', price: 299 },
      { id: 'SI14', name: 'Cheese Chilli Dosa', price: 250 },
      { id: 'SI15', name: 'Plain Uttapam', price: 180 },
      { id: 'SI16', name: 'Uttapam (Onion/Tomato/Veg)', price: 199 },
      { id: 'SI17', name: 'Kashmiri Uttapam', price: 250 },
      { id: 'SI18', name: 'Idli Sambhar', price: 180 },
      { id: 'SI19', name: 'Masala Idli', price: 180 },
      { id: 'SI20', name: 'Medu Vada', price: 190 },
      { id: 'SI21', name: 'Curd Rice', price: 160 },
      { id: 'SI22', name: 'Lemon Rice', price: 160 },
    ],
  },
  {
    title: 'Chinese',
    sort: 8,
    items: [
      { id: 'CH1', name: 'Veg Manchurian Dry', price: 365 },
      { id: 'CH2', name: 'Paneer Manchurian Dry', price: 385 },
      { id: 'CH3', name: 'Gobhi Manchurian Dry', price: 365 },
      { id: 'CH4', name: 'Chilli Paneer Dry', price: 395 },
      { id: 'CH5', name: 'Chilli Mushroom Dry', price: 385 },
      { id: 'CH6', name: 'Chilli Babycorn Dry', price: 385 },
      { id: 'CH7', name: 'Chilli Soya Chap Dry', price: 360 },
      { id: 'CH8', name: 'Sweet Chilli Cauliflower Dry', price: 355 },
      { id: 'CH9', name: 'Corn Salt and Peppers', price: 295 },
      { id: 'CH10', name: 'Chilli Soyabean Dry', price: 295 },
      { id: 'CH11', name: 'Paneer 65', price: 395 },
      { id: 'CH12', name: 'Aloo 65', price: 395 },
    ],
  },
  {
    title: 'Noodles & Rice',
    sort: 9,
    items: [
      { id: 'NR1', name: 'Veg Hakka Noodles', price: 185 },
      { id: 'NR2', name: 'Schezwan Noodles', price: 195 },
      { id: 'NR3', name: 'Chilli Garlic Noodles', price: 199 },
      { id: 'NR4', name: 'Veg Chowmein', price: 190 },
      { id: 'NR5', name: 'Singapore Noodles', price: 199 },
      { id: 'NR6', name: 'Jaanki Special Spicy Noodles', price: 225 },
      { id: 'NR7', name: 'Veg Fried Rice', price: 245 },
      { id: 'NR8', name: 'Schezwan Fried Rice', price: 275 },
      { id: 'NR9', name: 'Singapore Fried Rice', price: 270 },
      { id: 'NR10', name: 'Mexican Fried Rice', price: 285 },
      { id: 'NR11', name: 'Jaanki Special Fried Rice', price: 295 },
    ],
  },
  {
    title: 'Tandoori',
    sort: 10,
    items: [
      { id: 'TD1', name: 'Hara Bhara Kababs', price: 195 },
      { id: 'TD2', name: 'Dahi ke Kababs', price: 299 },
      { id: 'TD3', name: 'Dahi ke Sholay', price: 310 },
      { id: 'TD4', name: 'Paneer Tikka', price: 465 },
      { id: 'TD5', name: 'Paneer Malai Tikka', price: 479 },
      { id: 'TD6', name: 'Mushroom Tikka', price: 465 },
      { id: 'TD7', name: 'Hariyali Paneer Tikka', price: 489 },
      { id: 'TD8', name: 'Soya Chaap Tikka', price: 349 },
      { id: 'TD9', name: 'Soya Chaap Malai Tikka', price: 349 },
      { id: 'TD10', name: 'Soya Chaap Hariyali Tikka', price: 479 },
      { id: 'TD11', name: 'Tandoori Aloo Nazakat', price: 465 },
      { id: 'TD12', name: 'Tandoori Mashroom Paneer Roll Tikka', price: 480 },
      { id: 'TD13', name: 'Hariyali Paneer Roll Tikka', price: 480 },
      { id: 'TD14', name: 'Kimchi Kabab (Seasonal)', price: 415 },
      { id: 'TD15', name: 'Stuffed Paneer Tikka', price: 449 },
      { id: 'TD16', name: 'Jaanki Special Tandoori Platter', price: 525 },
    ],
  },
  {
    title: 'Chinese Maincourse',
    sort: 11,
    items: [
      { id: 'XG1', name: 'Chilli Paneer Gravy', price: 399 },
      { id: 'XG2', name: 'Veg Manchurian Gravy', price: 370 },
      { id: 'XG3', name: 'Baby Corn Mushroom in Hot Garlic Sauce', price: 385 },
      { id: 'XG4', name: 'American Chopsuey (Sweet/Sour)', price: 410 },
      { id: 'XG5', name: 'Veg Spicy Chopsuey', price: 390 },
      { id: 'XG6', name: 'Chilli Soybean Gravy', price: 385 },
      { id: 'XG7', name: 'Paneer Manchurian Gravy', price: 410 },
    ],
  },
  {
    title: 'Pasta / Pizza House',
    sort: 12,
    items: [
      { id: 'PZ1', name: 'Pasta (Alfredo Sauce)', price: 310 },
      { id: 'PZ2', name: 'Pasta (Arrabbiata Sauce)', price: 290 },
      { id: 'PZ3', name: 'Pasta (Pesto Sauce)', price: 320 },
      { id: 'PZ4', name: 'Pasta (Pink Sauce)', price: 299 },
      { id: 'PZ5', name: 'Baked Mac & Cheese', price: 340 },
      { id: 'PZ6', name: 'Baked Lasagna', price: 360 },
      { id: 'PZ7', name: 'Spaghetti', price: 299 },
      { id: 'PZ8', name: 'Margherita Pizza', price: 290 },
      { id: 'PZ9', name: 'Herby Italian Pizza', price: 299 },
      { id: 'PZ10', name: 'Country Feast Pizza', price: 380 },
      { id: 'PZ11', name: 'Smoked Tandoori Pizza', price: 410 },
      { id: 'PZ12', name: 'Mexican Wave Pizza', price: 349 },
      { id: 'PZ13', name: 'Onion Capsicum Pizza', price: 349 },
      { id: 'PZ14', name: 'Golden Corn Pizza', price: 440 },
      { id: 'PZ15', name: 'Jaanki Special Pizza', price: 510 },
    ],
  },
  {
    title: 'Soups & Shorbas',
    sort: 13,
    items: [
      { id: 'SU1', name: 'Veg Soup', price: 140 },
      { id: 'SU2', name: 'Manchow Soup', price: 140 },
      { id: 'SU3', name: 'Hot and Sour Soup', price: 149 },
      { id: 'SU4', name: 'Sweet Corn Soup', price: 149 },
      { id: 'SU5', name: 'Mushroom Noodles Soup', price: 160 },
      { id: 'SU6', name: 'Cream of Tomato Soup', price: 165 },
      { id: 'SU7', name: 'Cream of Mushroom Soup', price: 180 },
      { id: 'SU8', name: 'Cream of Broccoli Soup', price: 180 },
      { id: 'SU9', name: 'Veg Lemon Coriander Soup', price: 165 },
      { id: 'SU10', name: 'Tomato Dhania Shorba', price: 120 },
      { id: 'SU11', name: 'Palak Pudina Shorba', price: 120 },
    ],
  },
];

function sqlQuote(s) {
  return String(s).replace(/'/g, "''");
}

function buildSeedSql() {
  const lines = [];
  const policiesPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250513200000_menu_backend_write_policies.sql');
  try {
    const pol = fs.readFileSync(policiesPath, 'utf8').trim();
    if (pol) {
      lines.push(pol);
      lines.push('');
    }
  } catch (_) {
    /* migration file optional when generating from a minimal checkout */
  }
  lines.push('-- Jaanki full menu (all veg). Idempotent: safe to re-run.');
  lines.push('-- Generated from scripts/menu-seed-data.js');
  lines.push('');
  lines.push('INSERT INTO public.menu_categories (title, sort_order) VALUES');
  const catVals = MENU.map((c, i) => `  ('${sqlQuote(c.title)}', ${c.sort})`);
  lines.push(catVals.join(',\n'));
  lines.push('ON CONFLICT (title) DO UPDATE SET sort_order = EXCLUDED.sort_order;');
  lines.push('');
  lines.push('INSERT INTO public.menu_items (id, category_id, name, price, veg, sort_order)');
  lines.push('SELECT v.id, mc.id, v.name, v.price, true, v.sort_order');
  lines.push('FROM (VALUES');
  const valueRows = [];
  let sort = 0;
  for (const cat of MENU) {
    cat.items.forEach((it, idx) => {
      valueRows.push(
        `  ('${sqlQuote(it.id)}', '${sqlQuote(cat.title)}', '${sqlQuote(it.name)}', ${Number(it.price)}::numeric, ${idx})`
      );
    });
  }
  lines.push(valueRows.join(',\n'));
  lines.push(') AS v(id, cat_title, name, price, sort_order)');
  lines.push('JOIN public.menu_categories mc ON mc.title = v.cat_title');
  lines.push('ON CONFLICT (id) DO UPDATE SET');
  lines.push('  category_id = EXCLUDED.category_id,');
  lines.push('  name = EXCLUDED.name,');
  lines.push('  price = EXCLUDED.price,');
  lines.push('  veg = EXCLUDED.veg,');
  lines.push('  sort_order = EXCLUDED.sort_order,');
  lines.push('  active = true;');
  lines.push('');
  return lines.join('\n');
}

module.exports = { MENU, buildSeedSql };
