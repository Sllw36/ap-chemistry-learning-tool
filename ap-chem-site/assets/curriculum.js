(() => {
  'use strict';
  const study = window.AP_STUDY, lessons = window.AP_LESSONS;
  const entries = new Map();
  for (const unit of study.chapters) {
    const lesson = lessons[unit.id];
    for (const [field, tab] of [['sections','reading'],['examples','examples'],['checks','checks']]) {
      for (const item of lesson[field]) entries.set(item.id, { unit:unit.id, tab, item });
    }
  }
  const first = (unit, tab='reading') => {
    const field = {reading:'sections',examples:'examples',checks:'checks'}[tab];
    return lessons[unit]?.[field]?.[0]?.id;
  };
  const href = id => {
    const entry = entries.get(id);
    return entry ? `#/${{reading:'read',examples:'example',checks:'check'}[entry.tab]}/${id}` : '#/learn';
  };
  function legacy(chapter, tab='reading', point='') {
    const index = Number(/^reading-\d+-(\d+)$/.exec(point)?.[1] || 0);
    const id = study.legacyChapters[chapter]?.[index] || study.legacyChapters[chapter]?.[0];
    const entry = entries.get(id);
    if (!entry || tab === 'reading') return id;
    return [...entries].find(([,e])=>e.tab===tab && e.item.sourceChapter===Number(chapter))?.[0] || first(entry.unit,tab);
  }
  function migrate(positions, last) {
    const state = { positions:{}, last:null };
    for (const [chapter, point] of Object.entries(positions || {})) {
      const id = legacy(chapter,'reading',point);
      if (id) state.positions[id] = 1;
    }
    if (last) {
      const id = legacy(last.chapter,last.tab,positions?.[last.chapter]);
      if (id) { state.last=id; if(entries.get(id).tab==='reading')state.positions[id]=2; }
    }
    return state;
  }
  function latest(state, unit) {
    return Object.keys(state.positions).filter(id=>entries.get(id)?.unit===unit && entries.get(id)?.tab==='reading')
      .sort((a,b)=>state.positions[b]-state.positions[a])[0] || first(unit);
  }
  window.AP_CURRICULUM = { entries, first, href, legacy, migrate, latest };
})();
