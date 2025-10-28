async function checkBlueBookPrice(listingTitle, price) {
  const blueBookData = await fetch('/Bluebook.json').then(r => r.json());
  const entry = blueBookData.find(i => i.title.toLowerCase() === listingTitle.toLowerCase());
  if (!entry) return;
  const avg = entry.avgPrice;
  if (price > avg * 1.25) {
    alert(`⚠️ Your price is ${Math.round((price / avg - 1) * 100)}% above the Blue Book average (${avg}).`);
  }
}