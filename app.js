// Mejora progresiva: filtra las tarjetas por género. Sin JavaScript, se ven todas.
(() => {
  const bar = document.querySelector('[data-filters]');
  const grid = document.querySelector('[data-grid]');
  if (!bar || !grid) return;
  const cards = [...grid.querySelectorAll('.card')];
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const genre = chip.dataset.genre;
    bar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
    cards.forEach((card) => { card.hidden = !!genre && !card.dataset.genres.split('|').includes(genre); });
  });
})();
