/*
 * Map: the board with nothing at stake. Click or arrow around, open a minor
 * group to see its broad occupations, open one of those to see its detailed
 * occupations. "Find" lights up where something lives — every term (BLS job
 * title, NAICS index entry, O*NET task) is searchable, so "barista" shows you
 * the one group it's filed in.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  let board = null;
  let bound = false;

  function onKey(e) {
    if (!board) return;
    if (e.target.closest?.('input, select, textarea')) {
      if (e.key === 'Escape') { $('map-find').value = ''; find(); $('map-find').blur(); }
      else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); $('map-find').blur(); jumpToFirstHit(); }
      return;
    }
    board.key(e);
  }

  function find() {
    const q = $('map-find').value.trim();
    const r = board.search(q);
    $('map-found').textContent = !q ? '' : r.broads
      ? `${r.broads} ${Tax.lower(r.broads === 1 ? board.popLevel.name : board.popLevel.plural)} in ${r.groups} ${Tax.lower(r.groups === 1 ? board.rowLevel.name : board.rowLevel.plural)}`
      : 'Not found on the map';
  }

  function jumpToFirstHit() {
    const first = document.querySelector('#map-board .mrow.has-hits');
    if (first) board.setState({ row: +first.dataset.row, k: 0 });
  }

  window.MapView = {
    start(tax) {
      if (!bound) {
        $('map-find').addEventListener('input', () => board && find());
        bound = true;
      }
      board = Board.create($('map-board'), tax, { mode: 'map' });
      $('map-find').value = '';
      $('map-find').placeholder = tax.findPlaceholder || 'Find…';
      $('map-found').textContent = '';
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(() => { board.measure(); board.setState({ row: 0, k: null }); });
    },
    stop() {
      document.removeEventListener('keydown', onKey);
      board?.destroy();
      board = null;
    },
  };
})();
