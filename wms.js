// AUREO — MÓDULO WMS: ocupación de bodega, indicador de frescura, clasificación ABC / Pareto

// ==========================================================================
//   MÓDULO: ÍNDICES DE OCUPACIÓN DE BODEGA
// ==========================================================================

const WH_GRID = { aisles: ['A', 'B', 'C', 'D'], shelvesPerAisle: 5, levelsPerShelf: 3 };
const WH_CAPACITY = 300;                          // total warehouse slots
const WH_AISLE_CAP = Math.round(WH_CAPACITY / 4); // 75 per aisle

const OCC_AISLE_CLR = { A: '#2E4A6E', B: '#4A7AB5', C: '#1E3352', D: '#A8442C' };
const OCC_ABC_CLR = { A: '#2E4A6E', B: '#4A7AB5', C: '#7BA3D0' };
const OCC_CAT_CLR = ['#2E4A6E', '#4A7AB5', '#1E3352', '#A8442C', '#3A6090', '#5E7D52', '#7BA3D0'];

let _occMode = 'general'; // 'general' | 'diario' | 'mensual'
let _occFilter = 'todo';    // 'todo' | 'pasillo' | 'categoria' | 'abc'
let _occOpenAisles = new Set();
let _occOpenCats = new Set();

// ── Donut SVG via stroke-dasharray ────────────────────────────────────────────
function buildDonutSVG(segments, { size = 150, thick = 26 } = {}) {
    const total = segments.reduce((s, g) => s + g.value, 0);
    const cx = size / 2, cy = size / 2;
    const r = (size - thick) / 2;
    const C = 2 * Math.PI * r;

    if (total === 0) {
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(36,31,26,.06)" stroke-width="${thick}"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="rgba(36,31,26,.25)" font-size="11">Sin datos</text>
        </svg>`;
    }

    let cumLen = 0;
    const arcs = segments.filter(s => s.value > 0).map(seg => {
        const segLen = (seg.value / total) * C;
        const offset = C - cumLen;
        cumLen += segLen;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}"
            stroke-width="${thick}" stroke-linecap="butt"
            stroke-dasharray="${segLen.toFixed(2)} ${(C - segLen).toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"/>`;
    });

    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(36,31,26,.06)" stroke-width="${thick}"/>
        ${arcs.join('')}
    </svg>`;
}

// ── Compute all occupancy metrics ─────────────────────────────────────────────
function computeOccupancyData() {
    const prods = state.products;

    const byAisle = {};
    WH_GRID.aisles.forEach(a => { byAisle[a] = 0; });
    prods.forEach(p => { if (p.aisle && byAisle[p.aisle] !== undefined) byAisle[p.aisle]++; });

    const byCategory = {};
    prods.forEach(p => {
        const cat = p.category || 'Sin categoría';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    let classification = [];
    try { classification = calculateABCClassification(); } catch (e) { }
    const byABC = { A: 0, B: 0, C: 0 };
    classification.forEach(p => { if (byABC[p.abcClass] !== undefined) byABC[p.abcClass]++; });
    const classifiedIds = new Set(classification.map(p => p.id));
    prods.forEach(p => { if (!classifiedIds.has(p.id)) byABC.C++; });

    const totalOccupied = prods.length;
    const occupancyPct = Math.round((totalOccupied / WH_CAPACITY) * 100);

    const today = new Date().toISOString().split('T')[0];
    const todayInv = state.invoices.filter(i => i.date === today);
    const dailyOrders = todayInv.length;
    const dailyUnits = todayInv.reduce((s, i) => s + (i.items || []).reduce((ss, it) => ss + (it.qty || 0), 0), 0);

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const byDay = {};
    state.invoices.filter(i => i.date && i.date.startsWith(monthStr)).forEach(i => {
        const u = (i.items || []).reduce((s, it) => s + (it.qty || 0), 0);
        byDay[i.date] = (byDay[i.date] || 0) + u;
    });
    const dayEntries = Object.entries(byDay).sort((a, b) => b[1] - a[1]);
    const monthlyRecord = dayEntries[0] ? dayEntries[0][1] : 0;
    const recordDate = dayEntries[0] ? dayEntries[0][0] : '—';

    return {
        byAisle, byCategory, byABC, totalOccupied, occupancyPct,
        dailyOrders, dailyUnits, monthlyRecord, recordDate,
        freeSlots: Math.max(0, WH_CAPACITY - totalOccupied)
    };
}

// ── Mode / filter controls ────────────────────────────────────────────────────
function setOccMode(m) { _occMode = m; _renderOccChart(); }
function setOccFilter(f) { _occFilter = f; _renderOccChart(); }

function _getOccSegments(d) {
    // Occupied count depends on mode
    let occupied;
    if (_occMode === 'general') occupied = state.products.length;
    else if (_occMode === 'diario') occupied = d.dailyUnits;
    else occupied = d.monthlyRecord;

    const free = Math.max(0, WH_CAPACITY - occupied);
    const freeLabel = _occMode === 'general' ? 'Disponible' : 'Sin actividad';
    const freeSeg = { label: freeLabel, value: free, color: 'rgba(36,31,26,0.09)' };

    let segments, centerVal, centerSub;

    if (_occFilter === 'todo') {
        const clr = _occMode === 'general' ? '#2E4A6E' : _occMode === 'diario' ? '#4A7AB5' : '#A8442C';
        const lbl = _occMode === 'general' ? 'Ocupado' : _occMode === 'diario' ? 'Despachado hoy' : 'Récord día';
        segments = [{ label: lbl, value: occupied, color: clr }, freeSeg].filter(s => s.value >= 0);
        centerVal = _occMode === 'general' ? (Math.round((occupied / WH_CAPACITY) * 100) + '%') : occupied;
        centerSub = _occMode === 'general' ? 'ocupación' : _occMode === 'diario' ? 'uds hoy' : 'uds récord';

    } else if (_occFilter === 'pasillo') {
        let byAisle;
        if (_occMode === 'general') {
            byAisle = Object.assign({}, d.byAisle);
        } else {
            byAisle = {};
            WH_GRID.aisles.forEach(a => { byAisle[a] = 0; });
            const targetDate = _occMode === 'diario'
                ? new Date().toISOString().split('T')[0]
                : d.recordDate;
            state.invoices.filter(i => i.date === targetDate).forEach(inv => {
                (inv.items || []).forEach(it => {
                    const prod = state.products.find(p =>
                        p.sku === it.sku || p.name === it.name || p.id === it.productId);
                    if (prod && prod.aisle && WH_GRID.aisles.includes(prod.aisle))
                        byAisle[prod.aisle] += (it.qty || 0);
                });
            });
        }
        segments = WH_GRID.aisles.map(a => ({ label: 'Pasillo ' + a, value: byAisle[a] || 0, color: OCC_AISLE_CLR[a] }));
        segments.push(freeSeg);
        centerVal = occupied;
        centerSub = _occMode === 'general' ? 'productos' : 'unidades';

    } else if (_occFilter === 'categoria') {
        let byCat = {};
        if (_occMode === 'general') {
            byCat = Object.assign({}, d.byCategory);
        } else {
            const targetDate = _occMode === 'diario'
                ? new Date().toISOString().split('T')[0]
                : d.recordDate;
            state.invoices.filter(i => i.date === targetDate).forEach(inv => {
                (inv.items || []).forEach(it => {
                    const prod = state.products.find(p =>
                        p.sku === it.sku || p.name === it.name || p.id === it.productId);
                    const cat = (prod && prod.category) ? prod.category : 'Sin categoría';
                    byCat[cat] = (byCat[cat] || 0) + (it.qty || 0);
                });
            });
        }
        const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const top = entries.slice(0, 6).map(function (e, i) { return { label: e[0], value: e[1], color: OCC_CAT_CLR[i] }; });
        if (entries.length > 6)
            top.push({ label: 'Otras categorías', value: entries.slice(6).reduce((s, e) => s + e[1], 0), color: '#6b7280' });
        segments = top;
        segments.push(freeSeg);
        centerVal = occupied;
        centerSub = _occMode === 'general' ? 'productos' : 'unidades';

    } else { // abc
        let byABC;
        if (_occMode === 'general') {
            byABC = Object.assign({}, d.byABC);
        } else {
            byABC = { A: 0, B: 0, C: 0 };
            let cls = [];
            try { cls = calculateABCClassification(); } catch (e) { }
            const classMap = {};
            cls.forEach(p => { classMap[p.id] = p.abcClass; });
            const targetDate = _occMode === 'diario'
                ? new Date().toISOString().split('T')[0]
                : d.recordDate;
            state.invoices.filter(i => i.date === targetDate).forEach(inv => {
                (inv.items || []).forEach(it => {
                    const prod = state.products.find(p =>
                        p.sku === it.sku || p.name === it.name || p.id === it.productId);
                    if (prod) { const c = classMap[prod.id] || 'C'; byABC[c] = (byABC[c] || 0) + (it.qty || 0); }
                });
            });
        }
        segments = [
            { label: 'Clase A · Alto mov.', value: byABC.A, color: OCC_ABC_CLR.A },
            { label: 'Clase B · Medio', value: byABC.B, color: OCC_ABC_CLR.B },
            { label: 'Clase C · Bajo mov.', value: byABC.C, color: OCC_ABC_CLR.C },
            freeSeg
        ];
        centerVal = occupied;
        centerSub = _occMode === 'general' ? 'productos' : 'unidades';
    }

    return { segments: segments.filter(s => s.value >= 0), centerVal, centerSub };
}

// ── Partial chart re-render (no full page rebuild) ────────────────────────────
function _renderOccChart() {
    // Sync mode button styles
    ['general', 'diario', 'mensual'].forEach(function (m) {
        const btn = document.getElementById('occ-mode-' + m);
        if (!btn) return;
        const on = _occMode === m;
        btn.style.background = on ? 'var(--primary,#2E4A6E)' : 'rgba(36,31,26,0.04)';
        btn.style.color = on ? '#fff' : 'var(--text-secondary)';
        btn.style.borderColor = on ? 'transparent' : 'rgba(36,31,26,0.1)';
    });
    // Sync filter button styles
    ['todo', 'pasillo', 'categoria', 'abc'].forEach(function (f) {
        const btn = document.getElementById('occ-filter-' + f);
        if (!btn) return;
        const on = _occFilter === f;
        btn.style.background = on ? 'rgba(192,138,45,0.2)' : 'transparent';
        btn.style.color = on ? '#2E2208' : 'var(--text-muted)';
        btn.style.borderColor = on ? '#2E4A6E' : 'rgba(36,31,26,0.08)';
    });

    const chartEl = document.getElementById('occ-chart-area');
    if (!chartEl) return;

    const d = computeOccupancyData();
    const { segments, centerVal, centerSub } = _getOccSegments(d);
    const totalSeg = segments.reduce(function (s, g) { return s + g.value; }, 0);

    const legend = segments.filter(function (s) { return s.value > 0; }).map(function (seg) {
        const pct = totalSeg > 0 ? Math.round((seg.value / totalSeg) * 100) : 0;
        const isAvail = seg.label === 'Disponible' || seg.label === 'Sin actividad';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid rgba(36,31,26,.04);">'
            + '<div style="display:flex;align-items:center;gap:.45rem;min-width:0;">'
            + '<span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + seg.color + ';'
            + (isAvail ? 'border:1px solid rgba(36,31,26,0.2);' : '') + '"></span>'
            + '<span style="font-size:.79rem;color:' + (isAvail ? 'var(--text-muted)' : 'var(--text-secondary)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + seg.label + '</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0;margin-left:.5rem;">'
            + '<span style="font-size:.8rem;font-weight:700;color:' + (isAvail ? 'var(--text-muted)' : 'var(--text-primary)') + ';">' + seg.value + '</span>'
            + '<span style="font-size:.72rem;color:var(--text-muted);min-width:30px;text-align:right;">' + pct + '%</span>'
            + '</div></div>';
    }).join('');

    const stockPct = Math.min(100, Math.round((state.products.length / WH_CAPACITY) * 100));
    const barClr = stockPct >= 85 ? '#A8442C' : stockPct >= 60 ? '#4A7AB5' : '#5E7D52';

    chartEl.innerHTML =
        '<div style="display:flex;align-items:center;gap:2.5rem;flex-wrap:wrap;justify-content:center;padding:1.25rem 0 .75rem;">'
        + '<div style="position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;">'
        + buildDonutSVG(segments, { size: 230, thick: 34 })
        + '<div style="position:absolute;text-align:center;pointer-events:none;line-height:1.2;">'
        + '<div style="font-size:2rem;font-weight:900;color:var(--text-primary);">' + centerVal + '</div>'
        + '<div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;max-width:85px;">' + centerSub + '</div>'
        + '</div></div>'
        + '<div style="flex:1;min-width:200px;max-width:300px;">'
        + '<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:.65rem;">Distribución</div>'
        + (legend || '<div style="color:var(--text-muted);font-size:.8rem;padding:.5rem 0;">Sin actividad para este período.</div>')
        + '<div style="margin-top:.9rem;padding-top:.8rem;border-top:1px solid rgba(36,31,26,.06);">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:.35rem;">'
        + '<span style="font-size:.68rem;color:var(--text-muted);">Ocupación real · ' + WH_CAPACITY + ' slots</span>'
        + '<span style="font-size:.74rem;font-weight:700;color:' + barClr + ';">' + stockPct + '%</span>'
        + '</div>'
        + '<div style="background:rgba(36,31,26,.07);border-radius:4px;height:6px;overflow:hidden;">'
        + '<div style="width:' + stockPct + '%;background:' + barClr + ';height:100%;border-radius:4px;"></div>'
        + '</div>'
        + '<div style="font-size:.67rem;color:var(--text-muted);margin-top:.3rem;">'
        + state.products.length + ' ocupados · ' + (WH_CAPACITY - state.products.length) + ' libres</div>'
        + '</div></div></div>';
}

// ── Accordion: toggle helpers ─────────────────────────────────────────────────
function toggleOccAisle(aisle) {
    if (_occOpenAisles.has(aisle)) _occOpenAisles.delete(aisle);
    else _occOpenAisles.add(aisle);
    _renderOccAccordion();
}

function toggleOccCat(key) {
    if (_occOpenCats.has(key)) _occOpenCats.delete(key);
    else _occOpenCats.add(key);
    _renderOccAccordion();
}

function _renderOccAccordion() {
    const el = document.getElementById('occ-accordion');
    if (!el) return;

    let classification = [];
    try { classification = calculateABCClassification(); } catch (e) { }
    const classMap = {};
    classification.forEach(function (p) { classMap[p.id] = p.abcClass; });

    const rows = WH_GRID.aisles.map(function (aisle) {
        const prods = state.products.filter(function (p) { return p.aisle === aisle; });
        const isOpen = _occOpenAisles.has(aisle);
        const pct = Math.round((prods.length / WH_AISLE_CAP) * 100);
        const barClr = pct >= 90 ? '#A8442C' : pct >= 65 ? '#4A7AB5' : '#5E7D52';

        // Group by category
        const byCat = {};
        prods.forEach(function (p) {
            const cat = p.category || 'Sin categoría';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(p);
        });

        const catsHtml = Object.entries(byCat).map(function (entry) {
            const cat = entry[0], catProds = entry[1];
            const catKey = aisle + '::' + cat;
            const catOpen = _occOpenCats.has(catKey);

            const prodsHtml = catProds.map(function (p) {
                const abcCls = classMap[p.id] || 'C';
                const abcClr = OCC_ABC_CLR[abcCls];
                const stockLow = Number(p.stock) <= Number(p.threshold);
                const today = new Date().toISOString().split('T')[0];
                const expNear = p.expiry && p.expiry <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

                return `<div style="background:rgba(36,31,26,.04);border-radius:8px;padding:.75rem 1rem;margin:.3rem 0;border-left:3px solid ${abcClr};">
                    <div style="display:grid;grid-template-columns:90px 1fr 90px 1fr;gap:.3rem .6rem;font-size:.78rem;align-items:start;">
                        <span style="color:var(--text-muted);font-size:.72rem;">SKU</span>
                        <span style="font-family:monospace;font-weight:700;color:var(--text-primary);">${escapeHtml(p.sku) || '—'}</span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Clase ABC</span>
                        <span style="font-weight:700;color:${abcClr};">Clase ${abcCls}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Artículo</span>
                        <span style="font-weight:600;color:var(--text-primary);grid-column:2/5;">${escapeHtml(p.name)}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Marca</span>
                        <span>${escapeHtml(p.brand) || '—'}</span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Categoría</span>
                        <span>${escapeHtml(p.category) || '—'}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Stock</span>
                        <span style="font-weight:700;color:${stockLow ? '#A8442C' : 'var(--text-primary)'};">${p.stock} uds ${stockLow ? '⚠' : ''}</span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Precio unit.</span>
                        <span style="color:#5E7D52;font-weight:600;">${formatCurrency ? formatCurrency(p.price) : p.price}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Ubicación</span>
                        <span>Pasillo <b>${p.aisle || '—'}</b> · Est.<b>${p.shelf || '—'}</b> · Niv.<b>${p.level || '—'}</b></span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Alerta mín.</span>
                        <span style="color:${stockLow ? '#A8442C' : 'var(--text-muted)'};">${p.threshold} uds</span>

                        ${p.expiry ? `<span style="color:var(--text-muted);font-size:.72rem;">Vencimiento</span>
                        <span style="color:${expNear ? '#A8442C' : 'var(--text-secondary)'};">${p.expiry}${expNear ? ' ⚠ próximo' : ''}</span>` : ''}
                        ${p.lote ? `<span style="color:var(--text-muted);font-size:.72rem;">Lote</span>
                        <span>${p.lote}</span>` : ''}
                    </div>
                </div>`;
            }).join('');

            return `<div style="margin:.3rem 0 .3rem 1.2rem;">
                <div onclick="toggleOccCat('${catKey.replace(/'/g, "\\'")}')"
                     style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
                            padding:.48rem .8rem;background:rgba(36,31,26,.05);border-radius:7px;
                            border:1px solid rgba(36,31,26,.07);user-select:none;">
                    <div style="display:flex;align-items:center;gap:.5rem;">
                        <span style="font-size:.65rem;display:inline-block;transition:transform .2s;
                                     transform:${catOpen ? 'rotate(90deg)' : 'rotate(0deg)'};">▶</span>
                        <span style="font-size:.82rem;font-weight:600;color:var(--text-secondary);">${cat}</span>
                    </div>
                    <span style="font-size:.74rem;color:var(--text-muted);background:rgba(36,31,26,.06);
                                 padding:1px 8px;border-radius:10px;">${catProds.length} producto${catProds.length !== 1 ? 's' : ''}</span>
                </div>
                ${catOpen ? '<div style="margin:.25rem 0 .25rem .5rem;">' + prodsHtml + '</div>' : ''}
            </div>`;
        }).join('');

        return `<div style="margin-bottom:.5rem;border-radius:10px;border:1px solid rgba(36,31,26,.09);overflow:hidden;">
            <div onclick="toggleOccAisle('${aisle}')"
                 style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
                        padding:.8rem 1.1rem;background:rgba(36,31,26,.06);user-select:none;">
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <span style="font-size:.75rem;display:inline-block;transition:transform .2s;
                                 transform:${isOpen ? 'rotate(90deg)' : 'rotate(0deg)'};">▶</span>
                    <span style="font-size:1.05rem;font-weight:900;color:${OCC_AISLE_CLR[aisle]};">Pasillo ${aisle}</span>
                    <span style="font-size:.78rem;color:var(--text-muted);">${prods.length} producto${prods.length !== 1 ? 's' : ''}</span>
                </div>
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <div style="background:rgba(36,31,26,.08);border-radius:4px;height:6px;width:80px;overflow:hidden;">
                        <div style="width:${Math.min(100, pct)}%;background:${barClr};height:100%;border-radius:4px;"></div>
                    </div>
                    <span style="font-size:.78rem;font-weight:700;color:${barClr};">${pct}%</span>
                    <span style="font-size:.74rem;color:var(--text-muted);">${WH_AISLE_CAP - prods.length} libres</span>
                </div>
            </div>
            ${isOpen ? '<div style="padding:.5rem .8rem .8rem;">' + (catsHtml || '<div style="color:var(--text-muted);font-size:.8rem;padding:.5rem;">Sin productos en este pasillo.</div>') + '</div>' : ''}
        </div>`;
    }).join('');

    el.innerHTML = rows;
}

// ── Main section renderer ─────────────────────────────────────────────────────
function renderOccupancySection() {
    const el = document.getElementById('dashboard-occupancy-section');
    if (!el) return;

    const d = computeOccupancyData();
    const stockPct = Math.min(100, Math.round((state.products.length / WH_CAPACITY) * 100));
    const genClr = stockPct >= 85 ? '#A8442C' : stockPct >= 60 ? '#4A7AB5' : '#5E7D52';
    const freeSlots = Math.max(0, WH_CAPACITY - state.products.length);

    const kpi = function (lbl, val, sub, clr) {
        return '<div style="background:var(--bg-secondary,#16162a);border-radius:10px;padding:1rem 1.2rem;border-left:3px solid ' + clr + ';">'
            + '<div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;margin-bottom:.3rem;">' + lbl + '</div>'
            + '<div style="font-size:1.75rem;font-weight:900;color:' + clr + ';line-height:1;">' + val + '</div>'
            + '<div style="font-size:.74rem;color:var(--text-muted);margin-top:.3rem;">' + sub + '</div>'
            + '</div>';
    };


    const tabBase = 'padding:.45rem 1.1rem;border-radius:6px;border:1px solid;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s;';
    const filterBase = 'padding:.35rem .85rem;border-radius:5px;border:1px solid;font-size:.74rem;font-weight:600;cursor:pointer;transition:all .2s;';

    el.innerHTML =
        '<div class="card">'
        + '<div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1.25rem;">'
        + '<h2 class="card-title">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20" style="margin-right:.4rem;">'
        + '<rect x="2" y="3" width="6" height="10" rx="1"/><rect x="10" y="3" width="6" height="6" rx="1"/>'
        + '<rect x="10" y="13" width="6" height="8" rx="1"/><rect x="18" y="3" width="4" height="18" rx="1"/>'
        + '<rect x="2" y="17" width="6" height="4" rx="1"/></svg>'
        + 'Índices de Ocupación de Bodega</h2>'
        + '<span class="badge badge-info">' + state.products.length + ' / ' + WH_CAPACITY + ' posiciones</span>'
        + '</div>'

        // Mode selector
        + '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">'
        + '<span style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.25rem;">Vista:</span>'
        + "<button id=\"occ-mode-general\"  onclick=\"setOccMode('general')\"  style=\"" + tabBase + "\">General</button>"
        + "<button id=\"occ-mode-diario\"   onclick=\"setOccMode('diario')\"   style=\"" + tabBase + "\">Diario</button>"
        + "<button id=\"occ-mode-mensual\"  onclick=\"setOccMode('mensual')\"  style=\"" + tabBase + "\">Récord Mensual</button>"
        + '</div>'

        // Filter selector
        + '<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:1.4rem;">'
        + '<span style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.25rem;">Filtrar:</span>'
        + "<button id=\"occ-filter-todo\"      onclick=\"setOccFilter('todo')\"      style=\"" + filterBase + "\">Sin filtro</button>"
        + "<button id=\"occ-filter-pasillo\"   onclick=\"setOccFilter('pasillo')\"   style=\"" + filterBase + "\">Por Pasillo</button>"
        + "<button id=\"occ-filter-categoria\" onclick=\"setOccFilter('categoria')\" style=\"" + filterBase + "\">Por Categoría</button>"
        + "<button id=\"occ-filter-abc\"       onclick=\"setOccFilter('abc')\"       style=\"" + filterBase + "\">Por ABC</button>"
        + '</div>'

        // Chart area
        + '<div id="occ-chart-area" style="background:var(--bg-secondary,#16162a);border-radius:12px;padding:1rem 1.5rem;margin-bottom:1.5rem;"></div>'

        // KPI row
        + '<div class="wms-kpi-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.75rem;">'
        + kpi('Ocupación General', stockPct + '%', state.products.length + ' de ' + WH_CAPACITY + ' slots', genClr)
        + kpi('Despachos Hoy', d.dailyOrders, d.dailyUnits + ' uds · ' + new Date().toLocaleDateString('es-CO'), '#2E4A6E')
        + kpi('Récord Mensual', d.monthlyRecord + ' uds', 'Pico del mes · ' + d.recordDate, '#4A7AB5')
        + kpi('Posiciones Libres', freeSlots, freeSlots + ' de ' + WH_CAPACITY + ' disponibles', '#5E7D52')
        + '</div>'

        // Aisle accordion
        + '<div style="font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:.75rem;">Detalle por pasillo</div>'
        + '<div id="occ-accordion"></div>'
        + '</div>';

    _renderOccChart();
    _renderOccAccordion();
}

// ==========================================================================
//   MÓDULO: INDICADOR DE FRESCURA
// ==========================================================================

const FRESH_BUCKETS = [
    { key: 'expired', label: 'Vencido', color: '#7A2E1E' },
    { key: 'm3', label: '< 3 meses', color: '#A8442C' },
    { key: 'm6', label: '< 6 meses', color: '#C8932E' },
    { key: 'm9', label: '< 9 meses', color: '#C9A876' },
    { key: 'm12', label: '< 1 año', color: '#5E7D52' },
];

let _freshFilter = 'pasillo';
let _freshTimeRange = 'm3';
let _freshOpenGroups = new Set();

function setFreshFilter(f) { _freshFilter = f; _renderFreshAll(); }
function setFreshTimeRange(t) { _freshTimeRange = t; _renderFreshAll(); }
function toggleFreshGroup(key) {
    if (_freshOpenGroups.has(key)) _freshOpenGroups.delete(key);
    else _freshOpenGroups.add(key);
    _renderFreshAccordion();
}

function _getFreshBucket(expiryStr) {
    if (!expiryStr) return 'none';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryStr + 'T00:00:00');
    if (exp < today) return 'expired';
    const days = (exp - today) / 86400000;
    if (days < 90) return 'm3';
    if (days < 180) return 'm6';
    if (days < 270) return 'm9';
    if (days < 365) return 'm12';
    return 'ok';
}

function _buildFreshGroups() {
    const prods = state.products;
    const groups = {};
    if (_freshFilter === 'pasillo') {
        WH_GRID.aisles.forEach(function (a) { groups['Pasillo ' + a] = []; });
        prods.forEach(function (p) {
            const key = p.aisle ? 'Pasillo ' + p.aisle : 'Sin pasillo';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
    } else if (_freshFilter === 'categoria') {
        prods.forEach(function (p) {
            const key = p.category || 'Sin categoría';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
    } else {
        var cls = [];
        try { cls = calculateABCClassification(); } catch (e) { }
        const classMap = {};
        cls.forEach(function (p) { classMap[p.id] = p.abcClass; });
        groups['Clase A'] = []; groups['Clase B'] = []; groups['Clase C'] = [];
        prods.forEach(function (p) {
            const key = 'Clase ' + (classMap[p.id] || 'C');
            groups[key].push(p);
        });
    }
    return Object.entries(groups).map(function (e) {
        const label = e[0], ps = e[1];
        const counts = { expired: 0, m3: 0, m6: 0, m9: 0, m12: 0, ok: 0, none: 0 };
        ps.forEach(function (p) { counts[_getFreshBucket(p.expiry)]++; });
        return { label: label, prods: ps, counts: counts, total: ps.length };
    }).filter(function (r) { return r.total > 0; });
}

function _renderFreshAll() {
    ['pasillo', 'categoria', 'abc'].forEach(function (f) {
        const btn = document.getElementById('fresh-filter-' + f);
        if (!btn) return;
        const on = _freshFilter === f;
        btn.style.background = on ? 'var(--primary,#2E4A6E)' : 'rgba(36,31,26,.04)';
        btn.style.color = on ? '#fff' : 'var(--text-secondary)';
        btn.style.borderColor = on ? 'transparent' : 'rgba(36,31,26,.1)';
    });
    FRESH_BUCKETS.forEach(function (b) {
        const btn = document.getElementById('fresh-time-' + b.key);
        if (!btn) return;
        const on = _freshTimeRange === b.key;
        btn.style.background = on ? b.color : 'rgba(36,31,26,.04)';
        btn.style.color = on ? '#fff' : 'var(--text-secondary)';
        btn.style.borderColor = on ? 'transparent' : 'rgba(36,31,26,.1)';
        btn.style.boxShadow = on ? '0 0 0 2px ' + b.color + '55' : 'none';
    });
    _renderFreshChart();
    _renderFreshAccordion();
}

function _renderFreshChart() {
    const chartEl = document.getElementById('fresh-chart-area');
    if (!chartEl) return;
    const groups = _buildFreshGroups();
    if (groups.length === 0) {
        chartEl.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:.75rem 0;">Sin productos registrados.</div>';
        return;
    }
    const bucket = FRESH_BUCKETS.find(function (b) { return b.key === _freshTimeRange; }) || FRESH_BUCKETS[0];
    const maxCount = Math.max(1, groups.reduce(function (m, g) { return Math.max(m, g.counts[_freshTimeRange] || 0); }, 0));
    const html = groups.map(function (row) {
        const count = row.counts[_freshTimeRange] || 0;
        const pct = row.total > 0 ? Math.round((count / row.total) * 100) : 0;
        const barW = (count / maxCount) * 100;
        const inner = count > 0
            ? '<div style="width:' + barW.toFixed(1) + '%;background:' + bucket.color
            + ';height:100%;border-radius:5px;display:flex;align-items:center;padding:0 .55rem;'
            + 'font-size:.72rem;font-weight:700;color:rgba(36,31,26,.95);white-space:nowrap;'
            + 'overflow:hidden;transition:width .35s;">'
            + (barW > 10 ? count + ' · ' + pct + '%' : '') + '</div>'
            : '<div style="height:100%;display:flex;align-items:center;padding:0 .55rem;">'
            + '<span style="font-size:.7rem;color:var(--text-muted);">ninguno</span></div>';
        return '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;">'
            + '<div style="min-width:110px;text-align:right;font-size:.79rem;font-weight:600;'
            + 'color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + row.label + '</div>'
            + '<div style="flex:1;background:rgba(36,31,26,.06);border-radius:5px;height:26px;overflow:hidden;">' + inner + '</div>'
            + '<div style="min-width:72px;font-size:.77rem;color:var(--text-muted);">'
            + (count > 0 ? '<span style="font-weight:700;color:' + bucket.color + ';">' + count + '</span> / ' + row.total : '0 / ' + row.total)
            + '</div></div>';
    }).join('');
    chartEl.innerHTML = html;
}

function _renderFreshAccordion() {
    const el = document.getElementById('fresh-accordion');
    if (!el) return;
    const groups = _buildFreshGroups();
    const html = groups.map(function (row) {
        const isOpen = _freshOpenGroups.has(row.label);
        const urgCount = (row.counts['expired'] || 0) + (row.counts['m3'] || 0);
        const urgBadge = urgCount > 0
            ? '<span style="font-size:.64rem;font-weight:700;background:#A8442C;color:#fff;'
            + 'border-radius:10px;padding:1px 7px;margin-left:.4rem;">'
            + urgCount + ' urgente' + (urgCount !== 1 ? 's' : '') + '</span>'
            : '';
        const sorted = row.prods.slice().sort(function (a, b) {
            if (!a.expiry && !b.expiry) return 0;
            if (!a.expiry) return 1;
            if (!b.expiry) return -1;
            return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0;
        });
        const prodsHtml = sorted.map(function (p) {
            const bk = _getFreshBucket(p.expiry);
            const bCfg = FRESH_BUCKETS.find(function (b) { return b.key === bk; });
            const bClr = bCfg ? bCfg.color : (bk === 'ok' ? '#5E7D52' : '#6b7280');
            const bLbl = bCfg ? bCfg.label : (bk === 'ok' ? '> 1 año' : 'Sin venc.');
            let daysLabel = '';
            if (p.expiry) {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const days = Math.round((new Date(p.expiry + 'T00:00:00') - today) / 86400000);
                daysLabel = days < 0 ? 'Vencido hace ' + Math.abs(days) + 'd'
                    : days === 0 ? '¡Vence hoy!'
                        : 'Vence en ' + days + 'd';
            }
            return '<div style="background:rgba(36,31,26,.04);border-radius:8px;padding:.6rem .9rem;'
                + 'margin:.25rem 0;border-left:3px solid ' + bClr + ';">'
                + '<div style="display:grid;grid-template-columns:85px 1fr 85px 1fr;gap:.22rem .55rem;font-size:.76rem;">'
                + '<span style="color:var(--text-muted);font-size:.7rem;">SKU</span>'
                + '<span style="font-family:monospace;font-weight:700;">' + (p.sku || '—') + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Frescura</span>'
                + '<span style="font-weight:700;color:' + bClr + ';">' + bLbl + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Artículo</span>'
                + '<span style="font-weight:600;grid-column:2/5;color:var(--text-primary);">' + p.name + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Vencimiento</span>'
                + '<span style="color:' + bClr + ';font-weight:600;">' + (p.expiry || '—') + (daysLabel ? ' · ' + daysLabel : '') + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Lote</span>'
                + '<span>' + (p.lote || '—') + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Stock</span>'
                + '<span style="font-weight:700;">' + p.stock + ' uds</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Ubicación</span>'
                + '<span>P.' + (p.aisle || '—') + ' · Est.' + (p.shelf || '—') + ' · Niv.' + (p.level || '—') + '</span>'
                + '</div></div>';
        }).join('');
        // Use data-key attribute to avoid quote nesting in onclick
        const safeLabel = row.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return '<div style="margin-bottom:.45rem;border-radius:10px;border:1px solid rgba(36,31,26,.08);overflow:hidden;">'
            + '<div data-gkey="' + safeLabel + '" onclick="var k=this.dataset.gkey;toggleFreshGroup(k)" '
            + 'style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;'
            + 'padding:.75rem 1.1rem;background:rgba(36,31,26,.05);user-select:none;">'
            + '<div style="display:flex;align-items:center;gap:.6rem;">'
            + '<span style="font-size:.7rem;display:inline-block;transition:transform .2s;'
            + 'transform:' + (isOpen ? 'rotate(90deg)' : 'rotate(0deg)') + ';">►</span>'
            + '<span style="font-size:.9rem;font-weight:700;color:var(--text-primary);">' + row.label + '</span>'
            + urgBadge + '</div>'
            + '<span style="font-size:.75rem;color:var(--text-muted);">' + row.total + ' producto' + (row.total !== 1 ? 's' : '') + '</span>'
            + '</div>'
            + (isOpen ? '<div style="padding:.4rem .75rem .75rem;">' + prodsHtml + '</div>' : '')
            + '</div>';
    }).join('');
    el.innerHTML = html || '<div style="color:var(--text-muted);font-size:.82rem;padding:.5rem;">Sin productos.</div>';
}

function seedTestExpiryDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = [
        { days: -45, weight: 5 },
        { days: -10, weight: 5 },
        { days: 12, weight: 8 },
        { days: 55, weight: 10 },
        { days: 85, weight: 10 },
        { days: 120, weight: 13 },
        { days: 165, weight: 12 },
        { days: 230, weight: 12 },
        { days: 310, weight: 13 },
        { days: 430, weight: 7 },
        { days: 600, weight: 5 },
    ];
    const pool = [];
    buckets.forEach(function (b) { for (var i = 0; i < b.weight; i++) pool.push(b.days); });
    state.products.forEach(function (p, idx) {
        const base = pool[idx % pool.length];
        const jitter = Math.floor(Math.random() * 14) - 7;
        const d = new Date(today);
        d.setDate(d.getDate() + base + jitter);
        p.expiry = d.toISOString().split('T')[0];
    });
    saveState();
    renderFreshnessSection();
}

function renderFreshnessSection() {
    const el = document.getElementById('dashboard-freshness-section');
    if (!el) return;
    const withExpiry = state.products.filter(function (p) { return !!p.expiry; }).length;
    const expired = state.products.filter(function (p) { return _getFreshBucket(p.expiry) === 'expired'; }).length;
    const critical = state.products.filter(function (p) { return _getFreshBucket(p.expiry) === 'm3'; }).length;
    const tabBase = 'padding:.42rem 1rem;border-radius:6px;border:1px solid;font-size:.77rem;font-weight:600;cursor:pointer;transition:all .2s;';
    const timeBase = 'padding:.38rem .9rem;border-radius:6px;border:1px solid;font-size:.76rem;font-weight:700;cursor:pointer;transition:all .2s;';
    el.innerHTML = '<div class="card">'
        + '<div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1.25rem;">'
        + '<h2 class="card-title">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20" style="margin-right:.4rem;">'
        + '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
        + 'Indicador de Frescura de Inventario</h2>'
        + '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">'
        + '<span class="badge badge-info">' + withExpiry + ' con fecha</span>'
        + (expired > 0 ? '<span class="badge" style="background:rgba(127,29,29,.4);color:#fca5a5;border:1px solid #7f1d1d;">' + expired + ' vencido' + (expired !== 1 ? 's' : '') + '</span>' : '')
        + (critical > 0 ? '<span class="badge" style="background:rgba(168,68,44,.15);color:#A8442C;border:1px solid rgba(168,68,44,.5);">' + critical + ' crítico' + (critical !== 1 ? 's' : '') + '</span>' : '')
        + '<button onclick="seedTestExpiryDates()" style="margin-left:.5rem;padding:.3rem .8rem;border-radius:6px;border:1px dashed rgba(36,31,26,.25);background:rgba(36,31,26,.04);color:var(--text-muted);font-size:.72rem;cursor:pointer;" title="Asigna fechas de vencimiento de prueba a todos los productos">⚗ Cargar fechas de prueba</button>'
        + '</div></div>'
        + '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.8rem;">'
        + '<span style="font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.2rem;">Ver por:</span>'
        + '<button id="fresh-filter-pasillo"   data-val="pasillo"   onclick="setFreshFilter(this.dataset.val)"   style="' + tabBase + '">Por Pasillo</button>'
        + '<button id="fresh-filter-categoria" data-val="categoria" onclick="setFreshFilter(this.dataset.val)"   style="' + tabBase + '">Por Categoría</button>'
        + '<button id="fresh-filter-abc"       data-val="abc"       onclick="setFreshFilter(this.dataset.val)"   style="' + tabBase + '">Por ABC</button>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;margin-bottom:1.25rem;">'
        + '<span style="font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.2rem;">Temporalidad:</span>'
        + '<button id="fresh-time-expired" data-val="expired" onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">Vencido</button>'
        + '<button id="fresh-time-m3"      data-val="m3"      onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 3 meses</button>'
        + '<button id="fresh-time-m6"      data-val="m6"      onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 6 meses</button>'
        + '<button id="fresh-time-m9"      data-val="m9"      onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 9 meses</button>'
        + '<button id="fresh-time-m12"     data-val="m12"     onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 1 año</button>'
        + '</div>'
        + '<div id="fresh-chart-area" style="margin-bottom:1.5rem;"></div>'
        + '<div style="font-size:.73rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;'
        + 'color:var(--text-muted);margin-bottom:.7rem;">Detalle de productos · orden FEFO</div>'
        + '<div id="fresh-accordion"></div>'
        + '</div>';
    _renderFreshAll();
}

// ==========================================================================
//   ABC CLASSIFICATION & WAREHOUSE OPTIMIZATION ENGINE (PARETO)
// ==========================================================================

/**
 * Main ABC View orchestrator — called when the logistics tab is active.
 * Reads filter values, computes classification, and renders all sub-views.
 */
function renderABCView() {
    // Fallback: si por cualquier razón el estado está vacío, sembrar demo
    if (state.products.length === 0) {
        state.products = [...DEMO_PRODUCTS];
        saveProductsToStorage();
    }
    if (state.invoices.length === 0) {
        state.invoices = [...DEMO_INVOICES];
        saveInvoicesToStorage();
    }

    console.log('[WMS] productos:', state.products.length, '| facturas:', state.invoices.length);
    const classification = calculateABCClassification();
    console.log('[WMS] clasificados:', classification.length, '| mal ubicados:', classification.filter(p => p.isMisplaced).length);

    // --- Update KPI stat cards ---
    const classA = classification.filter(p => p.abcClass === 'A');
    const classB = classification.filter(p => p.abcClass === 'B');
    const classC = classification.filter(p => p.abcClass === 'C');

    document.getElementById('abc-count-a').innerText = classA.length;
    document.getElementById('abc-count-b').innerText = classB.length;
    document.getElementById('abc-count-c').innerText = classC.length;

    // Revenue participation % (real Pareto metric, not product count %)
    const totalRevenue = classification.reduce((sum, p) => sum + p.salesRevenue, 0) || 1;
    document.getElementById('abc-pct-a').innerText = ((classA.reduce((s, p) => s + p.salesRevenue, 0) / totalRevenue) * 100).toFixed(1) + '%';
    document.getElementById('abc-pct-b').innerText = ((classB.reduce((s, p) => s + p.salesRevenue, 0) / totalRevenue) * 100).toFixed(1) + '%';
    document.getElementById('abc-pct-c').innerText = ((classC.reduce((s, p) => s + p.salesRevenue, 0) / totalRevenue) * 100).toFixed(1) + '%';

    // Efficiency: how many products are in the right zone?
    const misplaced = classification.filter(p => p.isMisplaced);
    const total = classification.length;
    const efficiency = total > 0 ? (((total - misplaced.length) / total) * 100).toFixed(0) : 100;
    document.getElementById('abc-warehouse-efficiency').innerText = efficiency + '%';

    const misplacedEl = document.getElementById('abc-misplaced-count');
    misplacedEl.innerText = `${misplaced.length} mal ubicados`;
    misplacedEl.className = misplaced.length > 0 ? 'stat-trend down' : 'stat-trend up';

    // --- Render sub-components ---
    renderWarehouseHeatmap(classification);
    renderParetoChart(classification);
    renderABCRecommendations(classification);
    renderABCTable(classification);
    renderManualRelocation();
}

/**
 * Core ABC Score Calculator
 * Scores each product using weighted Pareto formula:
 *   Score = 0.40 * FrequencyNorm + 0.25 * QuantityNorm + 0.20 * RevenueNorm + 0.15 * RotationNorm
 *
 * Then classifies: top ~80% cumulative score → A, next ~15% → B, rest → C
 */
function calculateABCClassification() {
    // --- Read filter controls ---
    const warehouseFilter = document.getElementById('abc-warehouse').value;
    const categoryFilter = document.getElementById('abc-category').value;

    // Filter products
    let products = state.products.filter(p => {
        const matchWarehouse = warehouseFilter === 'all' || p.warehouse === warehouseFilter;
        const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
        return matchWarehouse && matchCategory;
    });

    if (products.length === 0) return [];

    // --- Apply period filter to invoices ---
    const periodVal = document.getElementById('abc-period').value;
    const periodDays = { semanal: 7, mensual: 30, trimestral: 90, anual: 365 };
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (periodDays[periodVal] || 30));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // --- Gather sales data from invoices within the selected period ---
    const salesMap = {}; // productId → { frequency, quantity, revenue }
    state.invoices.forEach(inv => {
        if (inv.status !== 'paid') return;
        if (inv.date < cutoffStr) return;
        inv.items.forEach(item => {
            if (!salesMap[item.productId]) {
                salesMap[item.productId] = { frequency: 0, quantity: 0, revenue: 0 };
            }
            salesMap[item.productId].frequency += 1;
            salesMap[item.productId].quantity += item.qty;
            salesMap[item.productId].revenue += item.price * item.qty;
        });
    });

    // --- Compute raw metrics for each product ---
    const enriched = products.map(p => {
        const sales = salesMap[p.id] || { frequency: 0, quantity: 0, revenue: 0 };

        // Rotation index: how fast stock cycles (higher = more rotation)
        const rotation = p.stock > 0 ? (sales.quantity / p.stock) : (sales.quantity > 0 ? sales.quantity : 0);

        return {
            ...p,
            salesFrequency: sales.frequency,
            salesQuantity: sales.quantity,
            salesRevenue: sales.revenue,
            rotation: rotation
        };
    });

    // --- Normalize each metric (linear 0 → 100) ---
    const maxFreq = Math.max(...enriched.map(p => p.salesFrequency), 1);
    const maxQty = Math.max(...enriched.map(p => p.salesQuantity), 1);
    const maxRev = Math.max(...enriched.map(p => p.salesRevenue), 1);
    const maxRot = Math.max(...enriched.map(p => p.rotation), 0.01);

    enriched.forEach(p => {
        const normFreq = (p.salesFrequency / maxFreq) * 100;
        const normQty = (p.salesQuantity / maxQty) * 100;
        const normRev = (p.salesRevenue / maxRev) * 100;
        const normRot = (p.rotation / maxRot) * 100;

        // Weighted Score (Pareto)
        p.abcScore = (0.40 * normFreq) + (0.25 * normQty) + (0.20 * normRev) + (0.15 * normRot);
    });

    // --- Sort descending by Score ---
    enriched.sort((a, b) => b.abcScore - a.abcScore);

    // --- Classify using cumulative % thresholds ---
    const totalScore = enriched.reduce((sum, p) => sum + p.abcScore, 0);

    if (totalScore === 0) {
        // No invoice data in period — classify by physical aisle instead of Pareto
        const aisleClass = { A: 'A', B: 'B', C: 'C', D: 'C' };
        enriched.forEach(p => {
            p.abcClass = aisleClass[p.aisle] || 'C';
            p.cumulativePct = 100;
        });
    } else {
        let cumulative = 0;
        enriched.forEach(p => {
            cumulative += p.abcScore;
            const cumulativePct = (cumulative / totalScore) * 100;
            p.cumulativePct = cumulativePct;
            if (cumulativePct <= 80) {
                p.abcClass = 'A';
            } else if (cumulativePct <= 95) {
                p.abcClass = 'B';
            } else {
                p.abcClass = 'C';
            }
        });
    }

    // --- Determine misplacement ---
    // Class A: debe estar en pasillo A o B (dist ≤ 20m)
    // Class B: debe estar en pasillo B o C (dist ≤ 28m)
    // Class C: no debe ocupar espacio premium de pasillo A (dist > 18m)
    const aisleOrder = { A: 1, B: 2, C: 3, D: 4 };
    enriched.forEach(p => {
        const dist = p.pickingDistance || 25;
        const aisleRank = aisleOrder[p.aisle] || 3;

        if (p.abcClass === 'A' && (aisleRank > 2 || dist > 20)) {
            p.isMisplaced = true;
            p.misplacedReason = `Artículo crítico Clase A ("${p.name.split(' ').slice(0, 2).join(' ')}") ubicado en ${p.aisle ? 'Pasillo ' + p.aisle : 'zona lejana'} a ${dist}m de despacho. Mover a zona acelerada (Pasillo A/B, ≤ 20m) para optimizar el picking diario.`;
            p.suggestedAisle = 'A';
        } else if (p.abcClass === 'B' && (aisleRank === 1 || aisleRank > 3 || dist > 28)) {
            p.isMisplaced = true;
            p.misplacedReason = `Artículo media rotación Clase B ("${p.name.split(' ').slice(0, 2).join(' ')}") mal posicionado en ${p.aisle ? 'Pasillo ' + p.aisle : 'zona incorrecta'} a ${dist}m. Reubicar a pasillo intermedio (Pasillo B/C, ≤ 28m).`;
            p.suggestedAisle = 'B';
        } else if (p.abcClass === 'C' && (aisleRank <= 1 || dist <= 18)) {
            p.isMisplaced = true;
            p.misplacedReason = `Artículo baja rotación Clase C ("${p.name.split(' ').slice(0, 2).join(' ')}") ocupa espacio premium en ${p.aisle ? 'Pasillo ' + p.aisle : 'zona delantera'} a ${dist}m. Liberar estante rápido y reubicar a Pasillo C/D (> 25m).`;
            p.suggestedAisle = 'D';
        } else {
            p.isMisplaced = false;
            p.misplacedReason = '';
            p.suggestedAisle = '';
        }
    });

    return enriched;
}

/**
 * Renders the 2D warehouse floor plan heatmap.
 * 4 columns (Aisles A–D), each containing shelves.
 * Each shelf cell is color-coded by the highest-priority product stored there.
 */
function renderWarehouseHeatmap(classification) {
    const gridContainer = document.getElementById('warehouse-grid-map');
    gridContainer.innerHTML = '';

    const aisles = ['A', 'B', 'C', 'D'];
    const aisleLabels = {
        'A': 'Pasillo A · EPP y Consumibles',
        'B': 'Pasillo B · Bahía Herramientas',
        'C': 'Pasillo C · Bahía Fijaciones',
        'D': 'Pasillo D · Patio Carga Pesada'
    };

    aisles.forEach(aisleId => {
        const aisleColumn = document.createElement('div');
        aisleColumn.className = 'warehouse-aisle-column';

        // Aisle header
        aisleColumn.innerHTML = `<div class="warehouse-aisle-header">${aisleLabels[aisleId]}</div>`;

        // Shelves container
        const shelvesContainer = document.createElement('div');
        shelvesContainer.className = 'warehouse-shelves-container';

        // Find all products in this aisle
        const aisleProducts = classification.filter(p => p.aisle === aisleId);

        // Group by shelf number
        const shelfMap = {};
        aisleProducts.forEach(p => {
            const key = p.shelf || 1;
            if (!shelfMap[key]) shelfMap[key] = [];
            shelfMap[key].push(p);
        });

        // Render up to 5 shelf slots per aisle
        const maxShelves = 5;
        for (let s = 1; s <= maxShelves; s++) {
            const slot = document.createElement('div');
            slot.className = 'warehouse-rack-slot';

            const productsOnShelf = shelfMap[s] || [];

            if (productsOnShelf.length === 0) {
                slot.classList.add('slot-empty');
                slot.innerHTML = `<span class="rack-slot-meta">Bahía ${s} · Libre</span>`;
            } else {
                // Use highest priority (A > B > C) product to color the slot
                const priorityOrder = { 'A': 0, 'B': 1, 'C': 2 };
                productsOnShelf.sort((a, b) => priorityOrder[a.abcClass] - priorityOrder[b.abcClass]);
                const primary = productsOnShelf[0];

                slot.classList.add(`slot-class-${primary.abcClass.toLowerCase()}`);
                slot.style.cursor = 'pointer';

                if (productsOnShelf.some(p => p.isMisplaced)) {
                    slot.classList.add('slot-misplaced');
                }

                slot.innerHTML = `
                    <span class="rack-slot-title">Clase ${primary.abcClass}</span>
                    <span class="rack-slot-meta">${productsOnShelf.length} SKU${productsOnShelf.length > 1 ? 's' : ''} &bull; Bahía ${s}</span>
                `;

                slot.addEventListener('click', () => openSlotModal(aisleId, s, productsOnShelf));
            }

            shelvesContainer.appendChild(slot);
        }

        aisleColumn.appendChild(shelvesContainer);
        gridContainer.appendChild(aisleColumn);
    });

    // Update warehouse label
    const warehouseFilter = document.getElementById('abc-warehouse').value;
    document.getElementById('heatmap-warehouse-label').innerText = warehouseFilter === 'all' ? 'Todos los Depósitos' : warehouseFilter;
}

// --- WMS Slot Modal ---
const _aisleLabels = {
    A: 'Pasillo A · EPP y Consumibles',
    B: 'Pasillo B · Bahía Herramientas',
    C: 'Pasillo C · Bahía Fijaciones',
    D: 'Pasillo D · Patio Carga Pesada'
};
const _abcColors = { A: 'var(--accent-emerald)', B: '#4A7AB5', C: 'var(--accent-rose)' };

function openSlotModal(aisleId, shelf, products) {
    let modal = document.getElementById('wms-slot-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wms-slot-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);align-items:center;justify-content:center;';
        modal.innerHTML = `<div id="wms-slot-modal-box" style="background:#F7F3EA;border:1px solid var(--border-accent);border-radius:var(--radius-lg);padding:1.75rem;width:min(480px,92vw);max-height:80vh;overflow-y:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.6);">
            <button onclick="closeSlotModal()" style="position:absolute;top:1rem;right:1rem;background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:1.3rem;line-height:1;">&#x2715;</button>
            <div id="wms-slot-modal-content"></div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) closeSlotModal(); });
        document.body.appendChild(modal);
    }

    const hasMisplaced = products.some(p => p.isMisplaced);
    const content = document.getElementById('wms-slot-modal-content');
    content.innerHTML = `
        <div style="margin-bottom:1.25rem;">
            <div style="font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:0.2rem;">
                Estantería ${aisleId}${shelf}
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${_aisleLabels[aisleId] || 'Pasillo ' + aisleId} &bull; Bahía ${shelf}</div>
            ${hasMisplaced ? `<div style="margin-top:0.6rem;display:inline-flex;align-items:center;gap:0.4rem;background:rgba(255,42,95,0.08);color:var(--accent-rose);border:1px solid rgba(255,42,95,0.2);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.75rem;font-weight:700;">⚠️ Contiene productos desalineados</div>` : `<div style="margin-top:0.6rem;display:inline-flex;align-items:center;gap:0.4rem;background:rgba(0,255,135,0.07);color:var(--accent-emerald);border:1px solid rgba(0,255,135,0.2);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.75rem;font-weight:700;">✅ Ubicación óptima</div>`}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
            ${products.map(p => `
                <div style="background:rgba(36,31,26,0.04);border:1px solid var(--border-subtle);border-left:3px solid ${_abcColors[p.abcClass]};border-radius:var(--radius-sm);padding:0.85rem 1rem;">
                    <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:0.5rem;">${escapeHtml(p.name)}</div>
                    <div class="kv-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:0.35rem 1rem;font-size:0.78rem;color:var(--text-secondary);">
                        <span>Clase ABC <strong style="color:${_abcColors[p.abcClass]};">Clase ${p.abcClass}</strong></span>
                        <span>Score <strong style="color:var(--text-primary);">${p.abcScore.toFixed(1)}</strong></span>
                        <span>SKU <strong style="color:var(--text-primary);">${escapeHtml(p.sku) || '—'}</strong></span>
                        <span>Stock <strong style="color:var(--text-primary);">${p.stock ?? '—'} uds</strong></span>
                        <span>Distancia <strong style="color:var(--text-primary);">${p.pickingDistance}m</strong></span>
                        <span>Estado <strong style="${p.isMisplaced ? 'color:var(--accent-rose)' : 'color:var(--accent-emerald)'};">${p.isMisplaced ? '⚠️ Desalineado' : '✅ Correcto'}</strong></span>
                    </div>
                    ${p.isMisplaced ? `<div style="margin-top:0.6rem;display:flex;align-items:center;gap:0.5rem;padding-top:0.6rem;border-top:1px solid var(--border-subtle);">
                        <span style="font-size:0.75rem;color:var(--text-muted);">Reubicar a</span>
                        <span style="background:rgba(0,255,135,0.07);color:var(--accent-emerald);border:1px solid rgba(0,255,135,0.2);border-radius:20px;padding:0.15rem 0.65rem;font-size:0.75rem;font-weight:700;">Pasillo ${p.suggestedAisle}</span>
                        <button class="btn btn-primary btn-sm" style="font-size:0.72rem;padding:.25rem .7rem;margin-left:auto;" onclick="applyOneRelocation('${p.id}','${p.suggestedAisle}');closeSlotModal();">Aplicar</button>
                    </div>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    modal.style.display = 'flex';
}

function closeSlotModal() {
    const modal = document.getElementById('wms-slot-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Renders the Pareto SVG chart with:
 * - Colored bars (green=A, blue=B, red=C) showing individual scores
 * - Cumulative % line overlay
 * - 80%/95% threshold lines
 */
function renderParetoChart(classification) {
    const svg = document.getElementById('abc-pareto-svg');
    if (!svg) return;
    svg.innerHTML = '';

    if (classification.length === 0) {
        svg.innerHTML = `<text x="250" y="140" fill="var(--text-muted)" font-size="14" text-anchor="middle">No hay suficientes transacciones para el gráfico de Pareto.</text>`;
        return;
    }

    const viewWidth = 500;
    const viewHeight = 280;
    const padding = { top: 30, right: 55, bottom: 40, left: 55 };
    const chartW = viewWidth - padding.left - padding.right;
    const chartH = viewHeight - padding.top - padding.bottom;

    // Acumulamos todo el markup en un string y lo asignamos UNA sola vez al final
    // (evita reparsear el SVG completo en cada concatenación — mucho más rápido)
    let svgParts = '';

    const maxScore = Math.max(...classification.map(p => p.abcScore), 1);
    const n = classification.length;
    const barGap = 4;
    const barWidth = Math.max(8, Math.min(50, (chartW - barGap * n) / n));

    // --- Draw grid lines ---
    for (let pct = 0; pct <= 100; pct += 25) {
        const y = padding.top + chartH - (pct / 100) * chartH;
        svgParts += `<line class="pareto-axis" x1="${padding.left}" y1="${y}" x2="${viewWidth - padding.right}" y2="${y}" />`;
        svgParts += `<text class="pareto-label" x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${pct}%</text>`;
    }

    // --- Draw 80% and 95% threshold horizontal dashed lines ---
    const y80 = padding.top + chartH - (80 / 100) * chartH;
    const y95 = padding.top + chartH - (95 / 100) * chartH;
    svgParts += `<line x1="${padding.left}" y1="${y80}" x2="${viewWidth - padding.right}" y2="${y80}" stroke="var(--accent-emerald)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.6" />`;
    svgParts += `<text x="${viewWidth - padding.right + 4}" y="${y80 + 3}" fill="var(--accent-emerald)" font-size="9" font-weight="700">80%</text>`;
    svgParts += `<line x1="${padding.left}" y1="${y95}" x2="${viewWidth - padding.right}" y2="${y95}" stroke="var(--accent-cyan)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.6" />`;
    svgParts += `<text x="${viewWidth - padding.right + 4}" y="${y95 + 3}" fill="var(--accent-cyan)" font-size="9" font-weight="700">95%</text>`;

    // --- Draw bars and build line points ---
    let linePoints = [];
    let dotElements = '';

    classification.forEach((p, i) => {
        const x = padding.left + i * (barWidth + barGap) + barGap / 2;
        const barH = (p.abcScore / maxScore) * chartH;
        const barY = padding.top + chartH - barH;

        const classColor = p.abcClass === 'A' ? 'bar-class-a' : p.abcClass === 'B' ? 'bar-class-b' : 'bar-class-c';

        svgParts += `<rect class="pareto-bar ${classColor}" x="${x}" y="${barY}" width="${barWidth}" height="${barH}" rx="3">
            <title>${escapeHtml(p.name)}\nScore ABC: ${p.abcScore.toFixed(1)} &bull; Clase ${p.abcClass}</title>
        </rect>`;

        // X-axis label (truncated name) — solo etiquetas espaciadas para evitar solape;
        // el nombre completo queda en el tooltip de la barra.
        const labelStep = Math.max(1, Math.ceil(n / 9));
        if (i % labelStep === 0) {
            const shortName = p.name.split(' ').slice(0, 1).join('').substring(0, 8);
            const lx = x + barWidth / 2;
            const ly = viewHeight - padding.bottom + 13;
            svgParts += `<text class="pareto-label" x="${lx}" y="${ly}" text-anchor="end" font-size="8" transform="rotate(-45 ${lx} ${ly})">${shortName}</text>`;
        }

        // Cumulative line point
        const lineY = padding.top + chartH - (p.cumulativePct / 100) * chartH;
        const lineX = x + barWidth / 2;
        linePoints.push(`${lineX},${lineY}`);

        dotElements += `<circle class="pareto-line-dot" cx="${lineX}" cy="${lineY}" r="4">
            <title>${escapeHtml(p.name)} &bull; Acumulado: ${p.cumulativePct.toFixed(1)}%</title>
        </circle>`;
    });

    // --- Draw cumulative line ---
    if (linePoints.length > 1) {
        svgParts += `<polyline class="pareto-line" points="${linePoints.join(' ')}" />`;
    }
    svgParts += dotElements;

    // --- Axis labels ---
    svgParts += `<text x="${viewWidth / 2}" y="${viewHeight - 5}" fill="var(--text-muted)" font-size="10" text-anchor="middle" font-weight="700">Artículos (Ordenados por rotación)</text>`;
    svgParts += `<text x="12" y="${viewHeight / 2}" fill="var(--text-muted)" font-size="10" text-anchor="middle" transform="rotate(-90 12 ${viewHeight / 2})" font-weight="700">% Acumulado</text>`;

    // Asignación única — un solo reflow en lugar de ~30
    svg.innerHTML = svgParts;
}

/**
 * Renders intelligent relocation recommendation cards.
 * Only shows products that are misplaced.
 */
function renderABCRecommendations(classification) {
    const container = document.getElementById('abc-recommendations-list');
    const btnArea = document.getElementById('abc-rec-btn-area');
    container.innerHTML = '';

    const misplaced = classification.filter(p => p.isMisplaced);

    if (btnArea) {
        btnArea.innerHTML = misplaced.length > 0
            ? `<button class="btn btn-primary btn-sm" onclick="applyAllSuggestedRelocations()"
                style="white-space:nowrap;">
                ⚡ Aplicar todas (${misplaced.length})
               </button>`
            : '';
    }

    if (misplaced.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <svg viewBox="0 0 24 24" width="40" height="40" stroke="var(--accent-emerald)" stroke-width="2" fill="none" style="margin-bottom: 1rem;">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.35rem; font-family:'Syne';">Bahías Optimizadas</p>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Todas las herramientas y cargas están en su pasillo óptimo.</p>
            </div>
        `;
        return;
    }

    const arrowSvg = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

    const aisleNames = {
        A: 'Pasillo A · EPP y Consumibles',
        B: 'Pasillo B · Bahía Herramientas',
        C: 'Pasillo C · Bahía Fijaciones',
        D: 'Pasillo D · Patio Carga Pesada'
    };

    misplaced.forEach(p => {
        const card = document.createElement('div');
        card.className = 'abc-recommendation-card';
        const tagClass = p.abcClass === 'A' ? 'tag-high' : p.abcClass === 'B' ? 'tag-medium' : 'tag-low';
        const tagLabel = p.abcClass === 'A' ? 'Acelerado / Clase A' : p.abcClass === 'B' ? 'Media Rotación / Clase B' : 'Bajo Rotación / Clase C';
        const fromLabel = aisleNames[p.aisle] || `Pasillo ${p.aisle}`;
        const toLabel = aisleNames[p.suggestedAisle] || `Pasillo ${p.suggestedAisle}`;

        // Determinar causa del desalineado
        const aisleOrder = { A: 1, B: 2, C: 3, D: 4 };
        const aisleRank = aisleOrder[p.aisle] || 3;
        const dist = p.pickingDistance || 25;
        const expectedMaxAisle = p.abcClass === 'A' ? 2 : p.abcClass === 'B' ? 3 : 99;
        const aisleMismatch = p.abcClass === 'C' ? aisleRank <= 1 : aisleRank > expectedMaxAisle;
        const distMismatch = (p.abcClass === 'A' && dist > 20) || (p.abcClass === 'B' && dist > 28) || (p.abcClass === 'C' && dist <= 18);

        const causeBadges = [];
        if (aisleMismatch) causeBadges.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(255,42,95,0.08);color:var(--accent-rose);border:1px solid rgba(255,42,95,0.2);border-radius:4px;padding:0.15rem 0.5rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Pasillo incorrecto</span>`);
        if (distMismatch) causeBadges.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(192,138,45,0.08);color:var(--accent-gold);border:1px solid rgba(192,138,45,0.2);border-radius:4px;padding:0.15rem 0.5rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Distancia excesiva</span>`);

        card.innerHTML = `
            <div class="abc-rec-header">
                <span class="abc-rec-tag ${tagClass}">${tagLabel}</span>
                <span style="font-family:'JetBrains Mono';font-size:0.78rem;color:var(--text-muted);font-weight:600;">Score: ${p.abcScore.toFixed(1)}</span>
            </div>
            <div class="abc-rec-product-name">${escapeHtml(p.name)}</div>
            ${causeBadges.length ? `<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:0.4rem 0;">${causeBadges.join('')}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.6rem;gap:.5rem;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:.5rem;">
                    <span style="background:rgba(192,138,45,0.10);color:var(--accent-gold);border:1px solid rgba(192,138,45,0.25);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.78rem;font-weight:700;font-family:'Rajdhani';text-transform:uppercase;letter-spacing:0.5px;">Pasillo ${p.aisle}</span>
                    ${arrowSvg}
                    <span style="background:rgba(0,255,135,0.07);color:var(--accent-emerald);border:1px solid rgba(0,255,135,0.2);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.78rem;font-weight:700;font-family:'Rajdhani';text-transform:uppercase;letter-spacing:0.5px;">Pasillo ${p.suggestedAisle}</span>
                </div>
                <button class="btn btn-primary btn-sm" style="font-size:0.75rem;padding:.3rem .8rem;"
                    onclick="applyOneRelocation('${p.id}', '${p.suggestedAisle}')">
                    Aplicar esta
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Distance (m) reference by aisle — used when auto-relocating
const AISLE_DIST = { A: 9, B: 15, C: 24, D: 34 };

function _applyRelocationToProduct(productId, targetAisle) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return false;
    const prevAisle = product.aisle;
    product.aisle = targetAisle;
    product.pickingDistance = AISLE_DIST[targetAisle] || product.pickingDistance;
    // Update the location string used in picking
    if (product.location) {
        product.location = `${targetAisle}-${product.shelf || 1}`;
    }
    logWMSRelocation(product, prevAisle, targetAisle, 'WMS Automático');
    return true;
}

function logWMSRelocation(product, fromAisle, toAisle, by) {
    if (!state.wmsLog) state.wmsLog = [];
    state.wmsLog.unshift({
        ts: Date.now(),
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        fromAisle,
        toAisle,
        fromShelf: product.shelf,
        toShelf: product.shelf,
        by
    });
    if (state.wmsLog.length > 200) state.wmsLog.length = 200;
    localStorage.setItem('aura_wms_log', JSON.stringify(state.wmsLog));
}

function applyAllSuggestedRelocations() {
    const classification = calculateABCClassification();
    const misplaced = classification.filter(p => p.isMisplaced);
    if (misplaced.length === 0) { triggerToast('info', 'No hay productos mal ubicados.'); return; }
    let applied = 0;
    misplaced.forEach(p => { if (_applyRelocationToProduct(p.id, p.suggestedAisle)) applied++; });
    saveProductsToStorage();
    triggerToast('success', `${applied} producto(s) reubicados automáticamente por WMS.`);
    renderABCView();
}

function applyOneRelocation(productId, targetAisle) {
    if (_applyRelocationToProduct(productId, targetAisle)) {
        saveProductsToStorage();
        const product = state.products.find(p => p.id === productId);
        triggerToast('success', `${escapeHtml(product?.name?.split(' ').slice(0, 3).join(' '))} → Pasillo ${targetAisle}.`);
        renderABCView();
    }
}

// --- WMS Log load on startup ---
function loadWMSLog() {
    try { state.wmsLog = JSON.parse(localStorage.getItem('aura_wms_log') || '[]'); }
    catch { state.wmsLog = []; }
}

// ── REUBICACIÓN MANUAL ──────────────────────────────────────────────────────
let _wmsEditId = null;   // product being edited inline
let _wmsSearch = '';     // current search filter in manual table

function renderManualRelocation() {
    const section = document.getElementById('wms-manual-section');
    if (!section) return;

    const warehouses = [...new Set(state.products.map(p => p.warehouse).filter(Boolean))];
    const aisles = ['A', 'B', 'C', 'D'];

    const filtered = state.products.filter(p => {
        if (!_wmsSearch) return true;
        const q = _wmsSearch.toLowerCase();
        return (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.aisle || '').toLowerCase().includes(q);
    });

    const rows = filtered.map(p => {
        const isEditing = _wmsEditId === p.id;
        const rowBg = isEditing ? 'background:var(--bg-secondary,#16162a);' : '';

        const displayRow = `
            <tr id="wms-row-${p.id}" style="${rowBg}">
                <td style="font-family:monospace;font-size:0.8rem;">${p.sku || '—'}</td>
                <td>
                    <div style="font-weight:600;font-size:0.88rem;">${escapeHtml(p.name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${p.category || ''}</div>
                </td>
                <td style="font-size:0.82rem;">${p.warehouse || '—'}</td>
                <td style="text-align:center;font-size:1.1rem;font-weight:900;color:var(--accent-cyan,#2E4A6E);">${p.aisle || '—'}</td>
                <td style="text-align:center;font-weight:600;">${p.shelf || '—'}</td>
                <td style="text-align:center;">${p.level || '—'}</td>
                <td style="text-align:center;font-size:0.8rem;">${p.pickingDistance ?? '—'} m</td>
                <td style="text-align:right;">
                    ${isEditing
                ? `<button class="btn btn-danger btn-sm" onclick="_wmsEditId=null;renderManualRelocation()">✕ Cancelar</button>`
                : `<button class="btn btn-primary btn-sm" onclick="_wmsEditId='${p.id}';renderManualRelocation()">✎ Mover</button>`
            }
                </td>
            </tr>
            ${isEditing ? `
            <tr id="wms-edit-${p.id}" style="background:var(--bg-secondary,#16162a);">
                <td colspan="8" style="padding:.75rem 1rem 1rem;">
                    <div style="background:var(--bg-card,#1a1a30);border:1px solid var(--accent-cyan,#2E4A6E);border-radius:10px;padding:1rem 1.25rem;">
                        <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-cyan,#2E4A6E);margin-bottom:.9rem;">
                            Nueva ubicación para: <em style="color:var(--text-primary);">${escapeHtml(p.name)}</em>
                        </div>
                        <div class="resp-collapse-600" style="display:grid;grid-template-columns:2fr 100px 80px 80px 110px;gap:.75rem;align-items:end;">
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Bodega</label>
                                <select class="form-select" id="wms-e-wh">
                                    ${warehouses.map(w => `<option value="${w}" ${w === p.warehouse ? 'selected' : ''}>${w}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Pasillo</label>
                                <select class="form-select" id="wms-e-aisle">
                                    ${aisles.map(a => `<option value="${a}" ${a === p.aisle ? 'selected' : ''}>${a}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Estante</label>
                                <input type="number" class="form-input" id="wms-e-shelf" value="${p.shelf || 1}" min="1" max="20">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Nivel</label>
                                <input type="number" class="form-input" id="wms-e-level" value="${p.level || 1}" min="1" max="5">
                            </div>
                            <div style="display:flex;gap:.5rem;">
                                <button class="btn btn-primary" style="flex:1;" onclick="saveManualRelocation('${p.id}')">
                                    ✓ Guardar
                                </button>
                            </div>
                        </div>
                        <div style="margin-top:.6rem;font-size:0.75rem;color:var(--text-muted);">
                            Distancia estimada nueva:
                            <strong id="wms-e-dist-preview" style="color:var(--accent-gold);">
                                ${AISLE_DIST[p.aisle] || p.pickingDistance} m
                            </strong>
                            &nbsp;— La distancia se recalcula al cambiar el pasillo.
                        </div>
                    </div>
                </td>
            </tr>` : ''}`;
        return displayRow;
    }).join('');

    // WMS Log (last 10 entries)
    const log = (state.wmsLog || []).slice(0, 10);
    const logRows = log.length === 0
        ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem 0;">Sin movimientos registrados.</td></tr>`
        : log.map(e => {
            const d = new Date(e.ts);
            return `<tr>
                <td style="font-size:0.78rem;color:var(--text-muted);">${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                <td style="font-size:0.82rem;">${escapeHtml(e.productName)}</td>
                <td style="font-family:monospace;font-size:0.78rem;">${escapeHtml(e.sku)}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent-rose,#A8442C);">${escapeHtml(e.fromAisle)}-${escapeHtml(e.fromShelf)}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent-emerald,#5E7D52);">${escapeHtml(e.toAisle)}-${escapeHtml(e.toShelf)}</td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(e.by)}</td>
            </tr>`;
        }).join('');

    section.innerHTML = `
        <div class="card">
            <div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1rem;">
                <h2 class="card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20">
                        <path d="M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/>
                        <path d="M3 9h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    Reubicación Manual de Inventario
                </h2>
                <input type="text" class="form-input" placeholder="Buscar producto o SKU..."
                    style="max-width:240px;padding:.4rem .8rem;font-size:0.85rem;"
                    value="${_wmsSearch}"
                    oninput="_wmsSearch=this.value;renderManualRelocation()">
            </div>
            <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">
                Haz clic en <strong>✎ Mover</strong> en cualquier producto para editar su ubicación en bodega. Los cambios se guardan en el inventario y actualizan el mapa de bodega.
            </p>
            <div class="table-responsive">
                <table class="custom-table" style="font-size:0.85rem;">
                    <thead>
                        <tr>
                            <th>SKU</th><th>Producto</th><th>Bodega</th>
                            <th style="text-align:center;">Pasillo</th>
                            <th style="text-align:center;">Estante</th>
                            <th style="text-align:center;">Nivel</th>
                            <th style="text-align:center;">Distancia</th>
                            <th style="text-align:right;">Acción</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>

        <!-- WMS Movement Log -->
        <div class="card" style="margin-top:1.5rem;">
            <div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:.75rem;margin-bottom:.75rem;">
                <h2 class="card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Historial de Movimientos WMS
                </h2>
                <span class="badge badge-info">${(state.wmsLog || []).length} movimientos</span>
            </div>
            <div class="table-responsive">
                <table class="custom-table" style="font-size:0.82rem;">
                    <thead><tr>
                        <th>Fecha/Hora</th><th>Producto</th><th>SKU</th>
                        <th style="text-align:center;">Desde</th>
                        <th style="text-align:center;">Hacia</th>
                        <th>Por</th>
                    </tr></thead>
                    <tbody>${logRows}</tbody>
                </table>
            </div>
        </div>
    `;

    // Wire the aisle selector to update distance preview live
    const aisleEl = document.getElementById('wms-e-aisle');
    if (aisleEl) {
        aisleEl.addEventListener('change', () => {
            const preview = document.getElementById('wms-e-dist-preview');
            if (preview) preview.textContent = (AISLE_DIST[aisleEl.value] || 20) + ' m';
        });
    }
}

function saveManualRelocation(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const newWarehouse = document.getElementById('wms-e-wh')?.value || product.warehouse;
    const newAisle = document.getElementById('wms-e-aisle')?.value || product.aisle;
    const newShelf = parseInt(document.getElementById('wms-e-shelf')?.value) || product.shelf;
    const newLevel = parseInt(document.getElementById('wms-e-level')?.value) || product.level;

    const prevAisle = product.aisle;
    const prevShelf = product.shelf;

    product.warehouse = newWarehouse;
    product.aisle = newAisle;
    product.shelf = newShelf;
    product.level = newLevel;
    product.pickingDistance = AISLE_DIST[newAisle] || product.pickingDistance;
    product.location = `${newAisle}-${newShelf}`;

    if (!state.wmsLog) state.wmsLog = [];
    state.wmsLog.unshift({
        ts: Date.now(),
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        fromAisle: prevAisle,
        toAisle: newAisle,
        fromShelf: prevShelf,
        toShelf: newShelf,
        by: 'Manual'
    });
    if (state.wmsLog.length > 200) state.wmsLog.length = 200;
    localStorage.setItem('aura_wms_log', JSON.stringify(state.wmsLog));

    saveProductsToStorage();
    _wmsEditId = null;
    triggerToast('success', `${escapeHtml(product.name.split(' ').slice(0, 3).join(' '))} → ${escapeHtml(newWarehouse)}, Pasillo ${escapeHtml(newAisle)}, Est. ${newShelf}`);
    renderABCView();
}

/**
 * Renders the full ABC analytics data table.
 */
function renderABCTable(classification) {
    const tbody = document.getElementById('abc-table-body');
    tbody.innerHTML = '';

    if (classification.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No se encontraron datos de rotación.
                </td>
            </tr>
        `;
        return;
    }

    classification.forEach(p => {
        const tr = document.createElement('tr');

        // Class badge color
        const classBadgeMap = {
            'A': 'badge-success',
            'B': 'badge-info',
            'C': 'badge-danger'
        };

        // Relocation status
        let relocateCell = '';
        if (p.isMisplaced) {
            relocateCell = `<span class="badge badge-danger" style="cursor: help;" title="${p.misplacedReason}">⚠️ Ajustar &rarr; Pasillo ${p.suggestedAisle}</span>`;
        } else {
            relocateCell = `<span class="badge badge-success">✅ OK</span>`;
        }

        tr.innerHTML = `
            <td>
                <div class="product-cell">
                    <div class="product-meta-info">
                        <span class="product-name">${escapeHtml(p.name)}</span>
                        <span class="product-sku">${escapeHtml(p.sku)} &bull; <strong style="color:var(--text-muted);">${escapeHtml(p.brand)}</strong></span>
                    </div>
                </div>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                ${p.salesQuantity}
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary);">
                ${formatCurrency(p.salesRevenue)}
            </td>
            <td style="text-align: center;">
                <span style="font-family: 'JetBrains Mono'; font-size: 0.8rem; font-weight:600;">Pasillo ${p.aisle} &bull; E${p.shelf}</span>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">
                ${p.pickingDistance}m
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-gold);">
                ${p.abcScore.toFixed(1)}
            </td>
            <td>
                <span class="badge ${classBadgeMap[p.abcClass]}">Clase ${p.abcClass}</span>
            </td>
            <td style="text-align: right;">
                ${relocateCell}
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function buildXLSTable(title, headers, rows) {
    const ths = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const trs = rows.map(r => '<tr>' + r.map(c => `<td>${escapeHtml(c ?? '')}</td>`).join('') + '</tr>').join('');
    return `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  h2 { color: #1a1a2e; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #1a1a2e; color: #ffffff; font-weight: bold; padding: 6px 10px; border: 1px solid #999; }
  td { padding: 5px 10px; border: 1px solid #ccc; }
  tr:nth-child(even) td { background: #f5f5f5; }
</style>
</head>
<body>
<h2>${escapeHtml(title)}</h2>
<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
</body></html>`;
}

function exportToCSV() {
    const classification = calculateABCClassification();

    if (classification.length === 0) {
        triggerToast('error', 'No hay datos de rotación para exportar.');
        return;
    }

    const headers = ['Producto', 'SKU', 'Categoría', 'Ventas (uds)', 'Ingresos', 'Bodega', 'Pasillo', 'Estante', 'Distancia Picking (m)', 'Score ABC', 'Clase', 'Requiere Traslado', 'Acción Recomendada'];

    const rows = classification.map(p => [
        p.name,
        p.sku,
        p.category,
        p.salesQuantity,
        p.salesRevenue.toFixed(2),
        p.warehouse,
        p.aisle,
        p.shelf,
        p.pickingDistance,
        p.abcScore.toFixed(2),
        p.abcClass,
        p.isMisplaced ? 'Sí' : 'No',
        p.isMisplaced ? `Trasladar a Pasillo ${p.suggestedAisle}` : 'Sin cambios'
    ]);

    const dateStr = new Date().toISOString().split('T')[0];
    const html = buildXLSTable(`Clasificaci\u00F3n ABC \u2014 AUREO (${dateStr})`, headers, rows);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `AUREO_Clasificacion_ABC_${dateStr}.xls`;
    link.click();

    triggerToast('success', `Planilla ABC exportada correctamente (${classification.length} productos).`);
}

