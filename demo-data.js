// AUREO — Data ficticia para el demo comercial. Se carga antes de app.js.
// Solo contenido: nada visual. Marcas, clientes y RUT son inventados.
(function () {
    function iso(d) { return d.toISOString().split('T')[0]; }
    function daysAgo(base, n) { const d = new Date(base); d.setDate(d.getDate() - n); return d; }
    function daysAhead(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

    // --- CATÁLOGO DE PRODUCTOS (marcas ficticias) ---
    const PRODUCTS = [
        { id: "1", name: "Rotomartillo Percutor SDS-Max 1500W (Ferrox)", sku: "SKU-FRX-1500", category: "Herramientas Eléctricas", price: 489.00, stock: 8, threshold: 3, lot: "L-2938", mfgDate: "2026-01-15", expDate: "2028-06-15", warehouse: "Bodega Principal", aisle: "D", shelf: 3, level: 1, pickingDistance: 32, brand: "Ferrox", supplier: "Ferrox Andina", expiry: "2031-01-15" },
        { id: "2", name: "Disco Flap de Desbaste 4.5\" G60 (Caja x50) (TitanPro)", sku: "SKU-TTP-FLAP60", category: "Consumibles", price: 125.00, stock: 22, threshold: 5, lot: "L-1102", mfgDate: "2026-02-10", expDate: "2027-12-31", warehouse: "Bodega Principal", aisle: "A", shelf: 1, level: 2, pickingDistance: 8, brand: "TitanPro", supplier: "TitanPro Abrasivos", expiry: "2026-08-15" },
        { id: "3", name: "Juego de Llaves Allen de Titanio Profesional (Andina Tools)", sku: "SKU-AND-ALLEN", category: "Herramientas Manuales", price: 49.00, stock: 35, threshold: 8, lot: "L-5524", mfgDate: "2025-11-01", expDate: "2027-11-01", warehouse: "Bodega Principal", aisle: "B", shelf: 2, level: 1, pickingDistance: 15, brand: "Andina Tools", supplier: "Andina Tools SpA", expiry: "2035-11-01" },
        { id: "4", name: "Compresor de Aire Trifásico 3HP 100L (Vulcan Air)", sku: "SKU-VUL-100L", category: "Maquinaria Pesada", price: 899.00, stock: 2, threshold: 1, lot: "L-0045", mfgDate: "2025-08-20", expDate: "2030-08-20", warehouse: "Bodega Principal", aisle: "A", shelf: 4, level: 1, pickingDistance: 6, brand: "Vulcan Air", supplier: "Vulcan Air Equipos", expiry: "2035-08-20" },
        { id: "5", name: "Soldadora Inverter Turbo Profesional 250A (SoldarTek)", sku: "SKU-STK-250A", category: "Herramientas Eléctricas", price: 649.00, stock: 0, threshold: 2, lot: "L-8821", mfgDate: "2025-10-15", expDate: "2027-10-15", warehouse: "Bodega Principal", aisle: "D", shelf: 5, level: 3, pickingDistance: 38, brand: "SoldarTek", supplier: "SoldarTek Industrial", expiry: "2027-04-15" },
        { id: "6", name: "Cerradura Digital Multianclaje de Alta Seguridad (SegurAndes)", sku: "SKU-SGA-DIGI", category: "Fijaciones", price: 185.00, stock: 12, threshold: 3, lot: "L-9021", mfgDate: "2026-03-01", expDate: "2029-03-01", warehouse: "Bodega Principal", aisle: "C", shelf: 1, level: 2, pickingDistance: 24, brand: "SegurAndes", supplier: "SegurAndes EPP", expiry: "2031-03-01" },
        { id: "7", name: "Taladro Atornillador Inalámbrico 20V MAX (Rhino Power)", sku: "SKU-RHP-20V", category: "Herramientas Eléctricas", price: 219.00, stock: 14, threshold: 4, lot: "L-7001", mfgDate: "2026-01-20", expDate: "2029-01-20", warehouse: "Bodega Principal", aisle: "B", shelf: 1, level: 1, pickingDistance: 12, brand: "Rhino Power", supplier: "Ferrox Andina", expiry: "2030-01-20" },
        { id: "8", name: "Amoladora Angular 4.5\" 900W (Kratos)", sku: "SKU-KRT-900W", category: "Herramientas Eléctricas", price: 139.00, stock: 9, threshold: 3, lot: "L-7002", mfgDate: "2025-12-05", expDate: "2028-12-05", warehouse: "Bodega Principal", aisle: "B", shelf: 2, level: 1, pickingDistance: 14, brand: "Kratos", supplier: "Ferrox Andina", expiry: "2026-10-05" },
        { id: "9", name: "Sierra Circular 7-1/4\" 1800W (Kratos)", sku: "SKU-KRT-1800", category: "Herramientas Eléctricas", price: 169.00, stock: 6, threshold: 2, lot: "L-7003", mfgDate: "2025-11-18", expDate: "2028-11-18", warehouse: "Bodega Principal", aisle: "B", shelf: 3, level: 2, pickingDistance: 16, brand: "Kratos", supplier: "Ferrox Andina", expiry: "2027-03-18" },
        { id: "10", name: "Set Destornilladores Aislados 1000V x12 (Andina Tools)", sku: "SKU-AND-D12", category: "Herramientas Manuales", price: 89.00, stock: 21, threshold: 5, lot: "L-7004", mfgDate: "2026-02-01", expDate: "2030-02-01", warehouse: "Bodega Principal", aisle: "B", shelf: 1, level: 2, pickingDistance: 13, brand: "Andina Tools", supplier: "Andina Tools SpA", expiry: "2031-02-01" },
        { id: "11", name: "Llave de Impacto Neumática 1/2\" (Vulcan Air)", sku: "SKU-VUL-IMP12", category: "Herramientas Eléctricas", price: 299.00, stock: 4, threshold: 2, lot: "L-7005", mfgDate: "2025-10-22", expDate: "2029-10-22", warehouse: "Bodega Principal", aisle: "B", shelf: 4, level: 1, pickingDistance: 18, brand: "Vulcan Air", supplier: "Vulcan Air Equipos", expiry: "2026-12-22" },
        { id: "12", name: "Juego de Dados Cromo Vanadio 1/2\" x40 (Andina Tools)", sku: "SKU-AND-D40", category: "Herramientas Manuales", price: 75.00, stock: 28, threshold: 6, lot: "L-7006", mfgDate: "2026-01-12", expDate: "2030-01-12", warehouse: "Bodega Principal", aisle: "B", shelf: 2, level: 2, pickingDistance: 15, brand: "Andina Tools", supplier: "Andina Tools SpA", expiry: "2036-01-12" },
        { id: "13", name: "Martillo de Uña Fibra de Vidrio 16oz (HerraMax)", sku: "SKU-HMX-16OZ", category: "Herramientas Manuales", price: 18.50, stock: 42, threshold: 10, lot: "L-7007", mfgDate: "2026-03-08", expDate: "2031-03-08", warehouse: "Bodega Principal", aisle: "B", shelf: 3, level: 1, pickingDistance: 15, brand: "HerraMax", supplier: "Andina Tools SpA", expiry: "2036-03-08" },
        { id: "14", name: "Flexómetro Profesional 8m Anti-impacto (HerraMax)", sku: "SKU-HMX-8M", category: "Herramientas Manuales", price: 14.90, stock: 55, threshold: 12, lot: "L-7008", mfgDate: "2026-02-25", expDate: "2031-02-25", warehouse: "Bodega Principal", aisle: "A", shelf: 2, level: 1, pickingDistance: 9, brand: "HerraMax", supplier: "Andina Tools SpA", expiry: "2031-02-25" },
        { id: "15", name: "Guantes Anticorte Nivel 5 (Caja x12 pares) (SegurAndes)", sku: "SKU-SGA-GL5", category: "Consumibles", price: 64.00, stock: 18, threshold: 5, lot: "L-7009", mfgDate: "2026-01-05", expDate: "2026-07-10", warehouse: "Bodega Principal", aisle: "A", shelf: 1, level: 1, pickingDistance: 7, brand: "SegurAndes", supplier: "SegurAndes EPP", expiry: "2026-05-20" },
        { id: "16", name: "Casco de Seguridad con Ratchet (SegurAndes)", sku: "SKU-SGA-CAS", category: "Consumibles", price: 32.00, stock: 30, threshold: 8, lot: "L-7010", mfgDate: "2026-02-14", expDate: "2029-02-14", warehouse: "Bodega Principal", aisle: "A", shelf: 1, level: 2, pickingDistance: 8, brand: "SegurAndes", supplier: "SegurAndes EPP", expiry: "2031-02-14" },
        { id: "17", name: "Lentes de Seguridad Antiempañe (Caja x20) (SegurAndes)", sku: "SKU-SGA-LEN20", category: "Consumibles", price: 48.00, stock: 26, threshold: 6, lot: "L-7011", mfgDate: "2026-03-02", expDate: "2028-03-02", warehouse: "Bodega Principal", aisle: "A", shelf: 2, level: 2, pickingDistance: 9, brand: "SegurAndes", supplier: "SegurAndes EPP", expiry: "2026-08-20" },
        { id: "18", name: "Cinta Aislante 3/4\" Negra (Pack x10) (TitanPro)", sku: "SKU-TTP-TAPE10", category: "Consumibles", price: 22.00, stock: 60, threshold: 15, lot: "L-7012", mfgDate: "2026-01-30", expDate: "2028-01-30", warehouse: "Bodega Principal", aisle: "A", shelf: 3, level: 1, pickingDistance: 10, brand: "TitanPro", supplier: "TitanPro Abrasivos", expiry: "2026-11-15" },
        { id: "19", name: "Electrodos de Soldadura 6013 1/8\" (5kg) (SoldarTek)", sku: "SKU-STK-6013", category: "Consumibles", price: 38.50, stock: 9, threshold: 4, lot: "L-7013", mfgDate: "2025-12-28", expDate: "2026-06-28", warehouse: "Bodega Principal", aisle: "A", shelf: 4, level: 2, pickingDistance: 11, brand: "SoldarTek", supplier: "SoldarTek Industrial", expiry: "2026-06-15" },
        { id: "20", name: "Disco de Corte Metal 4.5\" (Caja x100) (TitanPro)", sku: "SKU-TTP-CUT100", category: "Consumibles", price: 95.00, stock: 0, threshold: 5, lot: "L-7014", mfgDate: "2025-11-10", expDate: "2027-11-10", warehouse: "Bodega Principal", aisle: "A", shelf: 5, level: 2, pickingDistance: 12, brand: "TitanPro", supplier: "TitanPro Abrasivos", expiry: "2027-02-10" },
        { id: "21", name: "Tornillos Autoperforantes #8 x1\" (Caja x500) (FixPro)", sku: "SKU-FXP-SD500", category: "Fijaciones", price: 28.00, stock: 34, threshold: 8, lot: "L-7015", mfgDate: "2026-02-18", expDate: "2031-02-18", warehouse: "Bodega Principal", aisle: "C", shelf: 2, level: 1, pickingDistance: 22, brand: "FixPro", supplier: "FixPro Fijaciones", expiry: "2036-02-18" },
        { id: "22", name: "Anclajes de Expansión 3/8\" (Caja x50) (FixPro)", sku: "SKU-FXP-EXP50", category: "Fijaciones", price: 41.00, stock: 19, threshold: 6, lot: "L-7016", mfgDate: "2026-01-08", expDate: "2031-01-08", warehouse: "Bodega Principal", aisle: "C", shelf: 3, level: 1, pickingDistance: 25, brand: "FixPro", supplier: "FixPro Fijaciones", expiry: "2036-01-08" },
        { id: "23", name: "Tarugos Nylon 8mm (Bolsa x200) (FixPro)", sku: "SKU-FXP-N200", category: "Fijaciones", price: 12.00, stock: 48, threshold: 12, lot: "L-7017", mfgDate: "2026-03-15", expDate: "2032-03-15", warehouse: "Bodega Principal", aisle: "C", shelf: 4, level: 2, pickingDistance: 26, brand: "FixPro", supplier: "FixPro Fijaciones", expiry: "2036-03-15" },
        { id: "24", name: "Pernos Hexagonales Grado 8 1/2\"x2\" (Caja x100) (NordSteel)", sku: "SKU-NST-G8", category: "Fijaciones", price: 33.50, stock: 23, threshold: 6, lot: "L-7018", mfgDate: "2026-02-09", expDate: "2032-02-09", warehouse: "Bodega Secundaria", aisle: "C", shelf: 5, level: 1, pickingDistance: 28, brand: "NordSteel", supplier: "NordSteel Import", expiry: "2036-02-09" },
        { id: "25", name: "Generador Eléctrico a Gasolina 6500W (Vulcan Air)", sku: "SKU-VUL-6500", category: "Maquinaria Pesada", price: 1290.00, stock: 3, threshold: 1, lot: "L-7019", mfgDate: "2025-09-12", expDate: "2032-09-12", warehouse: "Bodega Secundaria", aisle: "D", shelf: 4, level: 1, pickingDistance: 36, brand: "Vulcan Air", supplier: "Vulcan Air Equipos", expiry: "2035-09-12" },
        { id: "26", name: "Hidrolavadora Industrial 2500PSI (Vulcan Air)", sku: "SKU-VUL-2500", category: "Maquinaria Pesada", price: 749.00, stock: 5, threshold: 2, lot: "L-7020", mfgDate: "2025-10-30", expDate: "2031-10-30", warehouse: "Bodega Secundaria", aisle: "D", shelf: 5, level: 1, pickingDistance: 40, brand: "Vulcan Air", supplier: "Vulcan Air Equipos", expiry: "2032-10-30" },
        { id: "27", name: "Escalera Telescópica Aluminio 3.8m (Cumbre)", sku: "SKU-CMB-38M", category: "Herramientas Manuales", price: 159.00, stock: 11, threshold: 3, lot: "L-7021", mfgDate: "2026-02-20", expDate: "2032-02-20", warehouse: "Bodega Secundaria", aisle: "C", shelf: 1, level: 1, pickingDistance: 23, brand: "Cumbre", supplier: "NordSteel Import", expiry: "2036-02-20" },
        { id: "28", name: "Apilador Manual Hidráulico 1000kg (NordSteel)", sku: "SKU-NST-AP1000", category: "Maquinaria Pesada", price: 425.00, stock: 4, threshold: 1, lot: "L-7022", mfgDate: "2025-12-01", expDate: "2032-12-01", warehouse: "Bodega Secundaria", aisle: "D", shelf: 2, level: 1, pickingDistance: 34, brand: "NordSteel", supplier: "NordSteel Import", expiry: "2035-12-01" }
    ];

    // --- CLIENTES FICTICIOS ---
    const CLIENTS = [
        { name: "Constructora Horizonte Ltda.", rut: "RUT-76.412.887-3" },
        { name: "Minera Atacama Norte", rut: "RUT-96.554.120-8" },
        { name: "Maestranza del Pacífico", rut: "RUT-77.203.446-K" },
        { name: "Ingeniería y Montajes Cordillera", rut: "RUT-76.980.332-5" },
        { name: "Servicios Industriales Loa", rut: "RUT-78.115.209-1" },
        { name: "Agroindustrial Valle Verde", rut: "RUT-79.640.518-7" },
        { name: "Taller Mecánico El Fundador", rut: "RUT-12.774.905-2" },
        { name: "Comercial Ferretera Sur", rut: "RUT-77.856.041-9" },
        { name: "Energía Solar Altiplano", rut: "RUT-76.220.874-0" },
        { name: "Pesquera Bahía Dorada", rut: "RUT-88.417.336-4" }
    ];

    // [díasAtrás, clienteIdx, items [productId, qty], descuentoPct, status]
    const INVOICE_PLAN = [
        [44, 0, [["1", 2], ["15", 3]], 0, "paid"],
        [43, 1, [["25", 1]], 5, "paid"],
        [41, 2, [["19", 4], ["18", 2]], 0, "paid"],
        [40, 3, [["7", 3], ["10", 2]], 0, "paid"],
        [38, 4, [["13", 6], ["14", 10]], 0, "paid"],
        [37, 5, [["16", 8], ["17", 3]], 10, "paid"],
        [36, 6, [["8", 1], ["20", 1]], 0, "paid"],
        [34, 7, [["21", 5], ["22", 3], ["23", 4]], 0, "paid"],
        [33, 8, [["26", 1]], 5, "paid"],
        [31, 9, [["2", 4], ["18", 5]], 0, "paid"],
        [30, 0, [["11", 1], ["12", 2]], 0, "paid"],
        [29, 1, [["4", 1]], 10, "paid"],
        [27, 2, [["3", 5], ["13", 3]], 0, "paid"],
        [26, 3, [["9", 2], ["17", 2]], 0, "paid"],
        [24, 4, [["24", 6]], 0, "paid"],
        [23, 5, [["1", 1], ["2", 2], ["19", 3]], 5, "paid"],
        [22, 6, [["15", 4]], 0, "paid"],
        [20, 7, [["27", 2], ["14", 5]], 0, "paid"],
        [19, 8, [["28", 1]], 0, "paid"],
        [17, 9, [["6", 2], ["21", 3]], 0, "paid"],
        [16, 0, [["7", 2], ["8", 2]], 5, "paid"],
        [15, 1, [["25", 1], ["26", 1]], 10, "paid"],
        [13, 2, [["10", 3], ["12", 3], ["23", 6]], 0, "paid"],
        [12, 3, [["16", 5]], 0, "paid"],
        [10, 4, [["2", 6]], 0, "paid"],
        [9, 5, [["22", 4], ["24", 3]], 0, "paid"],
        [6, 6, [["1", 1], ["17", 2]], 0, "paid"],
        [4, 7, [["3", 2], ["13", 2], ["14", 3]], 0, "pending"],
        [2, 8, [["18", 4], ["15", 2]], 0, "pending"],
        [1, 9, [["7", 1], ["9", 1], ["4", 1]], 0, "paid"],
        [0, 3, [["25", 1], ["16", 3]], 0, "paid"]
    ];

    function buildInvoices(today) {
        const year = today.getFullYear();
        return INVOICE_PLAN.map(function (row, i) {
            const back = row[0], client = CLIENTS[row[1]], discountPct = row[3], status = row[4];
            const items = row[2].map(function (pair) {
                const p = PRODUCTS.find(function (x) { return x.id === pair[0]; });
                return { productId: p.id, name: p.name, price: p.price, qty: pair[1] };
            });
            const subtotal = Math.round(items.reduce(function (s, it) { return s + it.price * it.qty; }, 0) * 100) / 100;
            const discountVal = Math.round(subtotal * discountPct) / 100;
            const taxVal = Math.round((subtotal - discountVal) * 19) / 100;
            return {
                id: "FACT-" + year + "-" + String(i + 1).padStart(4, "0"),
                clientName: client.name, clientId: client.rut,
                date: iso(daysAgo(today, back)),
                items: items, subtotal: subtotal, discountPct: discountPct, discountVal: discountVal,
                taxRate: 19, taxVal: taxVal,
                total: Math.round((subtotal - discountVal + taxVal) * 100) / 100,
                status: status
            };
        });
    }

    // Una lista por factura (syncPickingWithInvoices exige cobertura total).
    // Antigüedad decide estado: >=7 días completado, 3-6 en_proceso, <3 pendiente.
    function buildPicking(today, products, invoices) {
        const OPS = ["C. Rojas", "M. Fuentes", "J. Paredes"];
        return invoices.map(function (inv, n) {
            const age = Math.round((today - new Date(inv.date + "T12:00:00")) / 86400000);
            const status = age >= 7 ? "completado" : (age >= 3 ? "en_proceso" : "pendiente");
            const items = inv.items.map(function (line, i) {
                const p = products.find(function (x) { return x.id === line.productId; }) || {};
                const done = status === "completado" || (status === "en_proceso" && i === 0);
                return {
                    productId: line.productId, name: line.name, sku: p.sku || "—", category: p.category || "—",
                    requestedQty: line.qty, pickedQty: done ? line.qty : 0, picked: done,
                    status: done ? "completado" : "pendiente",
                    warehouse: p.warehouse || "Bodega Principal", aisle: p.aisle || "A", shelf: p.shelf || 1,
                    level: p.level || 1, pickingDistance: p.pickingDistance || 15,
                    location: (p.aisle || "A") + "-" + (p.shelf || 1), lot: p.lot || "", expDate: p.expDate || "",
                    lots: [], stockSnapshot: Number(p.stock) || 0
                };
            });
            const created = new Date(inv.date + "T09:00:00").getTime();
            return {
                id: "PICK-" + today.getFullYear() + "-" + String(n + 1).padStart(4, "0"),
                orderRef: inv.id, type: "Factura", clientName: inv.clientName, clientId: inv.clientId,
                date: inv.date, createdAt: created, status: status,
                operator: status === "pendiente" ? "Sin asignar" : OPS[n % 3],
                priority: ["alta", "media", "baja"][n % 3],
                estimatedSec: 300 + items.length * 120,
                startedAt: status === "pendiente" ? null : created + 1800000,
                finishedAt: status === "completado" ? created + 1800000 + (600 + items.length * 300) * 1000 : null,
                items: items,
                history: [{ ts: created, action: "Creada", detail: "Generada desde " + inv.id, by: "Sistema" }]
            };
        });
    }

    // --- INGRESO DE DATOS ---
    // postal: código postal colombiano (4-72) del municipio del proveedor
    const SUPPLIERS = [
        { id: "PROV-0001", name: "Ferrox Andina", acreedor: "4000001", postal: "110111" },
        { id: "PROV-0002", name: "TitanPro Abrasivos", acreedor: "4000002", postal: "050001" },
        { id: "PROV-0003", name: "Andina Tools SpA", acreedor: "4000003", postal: "760001" },
        { id: "PROV-0004", name: "Vulcan Air Equipos", acreedor: "4000004", postal: "080001" },
        { id: "PROV-0005", name: "SoldarTek Industrial", acreedor: "4000005", postal: "680001" },
        { id: "PROV-0006", name: "SegurAndes EPP", acreedor: "4000006", postal: "130001" },
        { id: "PROV-0007", name: "FixPro Fijaciones", acreedor: "4000007", postal: "540001" },
        { id: "PROV-0008", name: "NordSteel Import", acreedor: "4000008", postal: "470001" }
    ];

    const MATERIALS = [
        { id: "MAT-0001", code: "FRX-1500", desc: "Rotomartillo Percutor SDS-Max 1500W", unit: "0", uom: "UN", category: "Herramientas Eléctricas" },
        { id: "MAT-0002", code: "TTP-FLAP60", desc: "Disco Flap Desbaste 4.5\" G60", unit: "0", uom: "CJ", category: "Consumibles" },
        { id: "MAT-0003", code: "AND-ALLEN", desc: "Juego Llaves Allen Titanio", unit: "0", uom: "UN", category: "Herramientas Manuales" },
        { id: "MAT-0004", code: "VUL-100L", desc: "Compresor Trifásico 3HP 100L", unit: "0", uom: "UN", category: "Maquinaria Pesada" },
        { id: "MAT-0005", code: "STK-250A", desc: "Soldadora Inverter 250A", unit: "0", uom: "UN", category: "Herramientas Eléctricas" },
        { id: "MAT-0006", code: "SGA-GL5", desc: "Guantes Anticorte Nivel 5 x12", unit: "0", uom: "CJ", category: "Consumibles" },
        { id: "MAT-0007", code: "SGA-CAS", desc: "Casco Seguridad Ratchet", unit: "0", uom: "UN", category: "Consumibles" },
        { id: "MAT-0008", code: "TTP-TAPE10", desc: "Cinta Aislante 3/4\" Pack x10", unit: "0", uom: "PQ", category: "Consumibles" },
        { id: "MAT-0009", code: "STK-6013", desc: "Electrodos 6013 1/8\" 5kg", unit: "0", uom: "UN", category: "Consumibles" },
        { id: "MAT-0010", code: "FXP-SD500", desc: "Tornillos Autoperforantes #8 x500", unit: "0", uom: "CJ", category: "Fijaciones" },
        { id: "MAT-0011", code: "FXP-EXP50", desc: "Anclajes Expansión 3/8\" x50", unit: "0", uom: "CJ", category: "Fijaciones" },
        { id: "MAT-0012", code: "NST-G8", desc: "Pernos Hexagonales G8 x100", unit: "0", uom: "CJ", category: "Fijaciones" },
        { id: "MAT-0013", code: "VUL-6500", desc: "Generador Gasolina 6500W", unit: "0", uom: "UN", category: "Maquinaria Pesada" },
        { id: "MAT-0014", code: "CMB-38M", desc: "Escalera Telescópica 3.8m", unit: "0", uom: "UN", category: "Herramientas Manuales" },
        { id: "MAT-0015", code: "NST-AP1000", desc: "Apilador Hidráulico 1000kg", unit: "0", uom: "UN", category: "Maquinaria Pesada" }
    ];

    const LOCATIONS = [
        { id: "UBIC-0001", base: 100, position: "A-01", final: "100-A-01", warehouse: "Bodega Principal" },
        { id: "UBIC-0002", base: 100, position: "A-02", final: "100-A-02", warehouse: "Bodega Principal" },
        { id: "UBIC-0003", base: 100, position: "A-03", final: "100-A-03", warehouse: "Bodega Principal" },
        { id: "UBIC-0004", base: 200, position: "B-01", final: "200-B-01", warehouse: "Bodega Principal" },
        { id: "UBIC-0005", base: 200, position: "B-02", final: "200-B-02", warehouse: "Bodega Principal" },
        { id: "UBIC-0006", base: 200, position: "B-03", final: "200-B-03", warehouse: "Bodega Principal" },
        { id: "UBIC-0007", base: 300, position: "C-01", final: "300-C-01", warehouse: "Bodega Principal" },
        { id: "UBIC-0008", base: 300, position: "C-02", final: "300-C-02", warehouse: "Bodega Principal" },
        { id: "UBIC-0009", base: 400, position: "D-01", final: "400-D-01", warehouse: "Bodega Principal" },
        { id: "UBIC-0010", base: 500, position: "A-01", final: "500-A-01", warehouse: "Bodega Secundaria" },
        { id: "UBIC-0011", base: 500, position: "B-01", final: "500-B-01", warehouse: "Bodega Secundaria" },
        { id: "UBIC-0012", base: 500, position: "C-01", final: "500-C-01", warehouse: "Bodega Secundaria" }
    ];

    // [díasAtrás, type, status, matIdx, locIdx, qty, user, admitido]
    const MOVEMENT_PLAN = [
        [28, "Entrada", "Almacenado", 0, 8, 10, "C. Rojas", false],
        [27, "Entrada", "Almacenado", 1, 0, 40, "M. Fuentes", false],
        [25, "Salida", "Almacenado", 5, 0, 6, "J. Paredes", false],
        [23, "Entrada", "Almacenado", 9, 6, 20, "C. Rojas", false],
        [21, "Salida", "Almacenado", 8, 2, 12, "M. Fuentes", false],
        [19, "Entrada", "Almacenado", 3, 9, 2, "J. Paredes", false],
        [17, "Salida", "Almacenado", 2, 3, 8, "C. Rojas", false],
        [15, "Entrada", "Almacenado", 10, 7, 15, "M. Fuentes", false],
        [14, "Salida", "Almacenado", 6, 1, 10, "J. Paredes", false],
        [12, "Entrada", "Almacenado", 12, 10, 3, "C. Rojas", false],
        [11, "Salida", "Almacenado", 7, 2, 18, "M. Fuentes", false],
        [9, "Entrada", "Almacenado", 13, 11, 5, "J. Paredes", false],
        [8, "Salida", "Almacenado", 11, 8, 9, "C. Rojas", false],
        [6, "Entrada", "Almacenado", 4, 9, 4, "M. Fuentes", false],
        [5, "Salida", "Almacenado", 14, 11, 2, "J. Paredes", false],
        [4, "Entrada", "En Tránsito", 2, 3, 30, "C. Rojas", true],
        [3, "Entrada", "En Tránsito", 6, 1, 25, "M. Fuentes", true],
        [2, "Entrada", "En Tránsito", 9, 6, 50, "J. Paredes", false],
        [1, "Entrada", "En Tránsito", 12, 10, 8, "C. Rojas", false],
        [0, "Entrada", "En Tránsito", 0, 8, 6, "M. Fuentes", false]
    ];

    function buildMovements(today) {
        return MOVEMENT_PLAN.map(function (row, i) {
            const mat = MATERIALS[row[3]], loc = LOCATIONS[row[4]];
            const d = daysAgo(today, row[0]);
            const mov = {
                id: String(Date.now() - i * 1000),
                datetime: iso(d) + "T" + String(8 + (i % 9)).padStart(2, "0") + ":30",
                type: row[1], status: row[2], user: row[6],
                doc: "DOC-" + String(48300 + i),
                materialId: mat.id, desc: mat.desc, um: mat.uom, category: mat.category,
                ubicBase: String(loc.base), position: loc.position, ubicFinal: loc.final,
                bodega: loc.warehouse,
                lotAlm: "LA-" + String(2100 + i), lotProv: "LP-" + String(9300 + i),
                expiry: iso(daysAhead(today, 240 + i * 30)), qty: row[5]
            };
            if (row[2] === "En Tránsito") {
                if (row[7]) {
                    mov.transitValidation = "Admitido";
                    mov.transitLocation = loc.final;
                    mov.transitUMB = mat.uom;
                    mov.transitFab = iso(daysAgo(today, row[0] + 60));
                } else {
                    mov.transitValidation = "Pendiente";
                }
            }
            return mov;
        });
    }

    function buildLabels(today) {
        const rows = [
            [9, 0, 1, "OC-4501", 40, "RM-7701"],
            [8, 1, 2, "OC-4502", 25, "RM-7702"],
            [6, 5, 9, "OC-4503", 20, "RM-7703"],
            [5, 6, 10, "OC-4504", 15, "RM-7704"],
            [3, 2, 3, "OC-4505", 12, "RM-7705"],
            [1, 7, 12, "OC-4506", 5, "RM-7706"]
        ];
        return rows.map(function (r, i) {
            const sup = SUPPLIERS[r[1]], mat = MATERIALS[r[2]];
            const rec = daysAgo(today, r[0]);
            return {
                id: "ROT-" + String(i + 1).padStart(4, "0"),
                serialImp: "IMP-" + today.getFullYear() + "-" + String(i + 1).padStart(4, "0"),
                serialCita: "CITA-" + String(9000 + i),
                fechaRec: iso(rec),
                semana: "S" + String(Math.ceil(((rec - new Date(rec.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0"),
                proveedor: sup.name, auxiliar: ["C. Rojas", "M. Fuentes", "J. Paredes"][i % 3],
                documento: "DOC-" + String(48350 + i), remesa: r[5], ordenCompra: r[3],
                cantidad: r[4], sku: mat.code, textoBreve: mat.desc, um: mat.uom, umb: mat.uom,
                fFabricacion: iso(daysAgo(today, r[0] + 90)), fVencimiento: iso(daysAhead(today, 365)),
                loteProv: "LP-" + String(9400 + i), loteAlm: "LA-" + String(2200 + i)
            };
        });
    }

    function buildDE(today) {
        return {
            materials: MATERIALS.map(function (m) { return Object.assign({}, m); }),
            suppliers: SUPPLIERS.map(function (s) { return Object.assign({}, s); }),
            locations: LOCATIONS.map(function (l) { return Object.assign({}, l); }),
            movements: buildMovements(today),
            transit: [],
            labels: buildLabels(today)
        };
    }

    function buildInvData(today) {
        const f = today.toLocaleDateString("es-CO");
        const fOld = daysAgo(today, 5).toLocaleDateString("es-CO");
        return {
            tareas: [
                { codigo: "CONT-0001", tipo: "Cíclico", zona: "Pasillo A", asignado: "C. Rojas", creadopor: "Supervisor Bodega", obs: "Conteo cíclico semanal zona rápida", fecha: fOld, estado: "reconteo pendiente" },
                { codigo: "RC-CONT-0001-DEMO", tipo: "Reconteo", zona: "Pasillo A", criterio: "", asignado: "C. Rojas", creadopor: "Sistema", estado: "pendiente", reconteo: "CONT-0001", fecha: f, obs: "Reconteo automático generado desde tarea CONT-0001" },
                { codigo: "CONT-0002", tipo: "General", zona: "Bodega Secundaria", asignado: "M. Fuentes", creadopor: "Supervisor Bodega", obs: "Inventario general trimestral", fecha: f, estado: "activa" }
            ],
            conteos: [
                { tareaId: "CONT-0001", ubicacion: "100-A-01", zona: "Pasillo A", codigoMaterial: "TTP-FLAP60", descripcion: "Disco Flap Desbaste 4.5\" G60", loteAlmacen: "LA-2101", loteProveedor: "LP-9301", fv: "2027-12-31", cantidadSistema: 22, cantidadContada: 22, estado: "contado", usuario: "C. Rojas", fecha: fOld, obs: "" },
                { tareaId: "CONT-0001", ubicacion: "100-A-02", zona: "Pasillo A", codigoMaterial: "SGA-GL5", descripcion: "Guantes Anticorte Nivel 5 x12", loteAlmacen: "LA-2103", loteProveedor: "LP-9303", fv: "2026-07-10", cantidadSistema: 18, cantidadContada: 18, estado: "contado", usuario: "C. Rojas", fecha: fOld, obs: "" },
                { tareaId: "CONT-0001", ubicacion: "100-A-03", zona: "Pasillo A", codigoMaterial: "TTP-TAPE10", descripcion: "Cinta Aislante 3/4\" Pack x10", loteAlmacen: "LA-2107", loteProveedor: "LP-9307", fv: "2028-01-30", cantidadSistema: 60, cantidadContada: 56, estado: "reconteo pendiente", usuario: "C. Rojas", fecha: fOld, obs: "Diferencia -4" },
                { tareaId: "RC-CONT-0001-DEMO", ubicacion: "100-A-03", zona: "Pasillo A", codigoMaterial: "TTP-TAPE10", descripcion: "Cinta Aislante 3/4\" Pack x10", loteAlmacen: "LA-2107", loteProveedor: "LP-9307", fv: "2028-01-30", cantidadSistema: 60, cantidadContada: null, estado: "pendiente", usuario: "", fecha: f, obs: "" }
            ],
            reconteos: [
                { id: "RC-CONT-0001-DEMO", tareaOrigen: "CONT-0001", items: 1, estado: "abierto", fecha: f }
            ]
        };
    }

    function buildWmsLog(today, products) {
        const rows = [[12, "1", "D", "A", "Manual"], [10, "4", "A", "D", "Manual"], [7, "8", "B", "B", "Manual"], [4, "15", "A", "A", "Manual"], [2, "21", "C", "B", "Manual"]];
        return rows.map(function (r) {
            const p = products.find(function (x) { return x.id === r[1]; }) || {};
            return {
                ts: daysAgo(today, r[0]).getTime(), productId: r[1], productName: p.name || "",
                sku: p.sku || "", fromAisle: r[2], toAisle: r[3],
                fromShelf: p.shelf || 1, toShelf: p.shelf || 1, by: r[4]
            };
        });
    }

    // --- COMPRAS A PROVEEDORES ---
    // Proveedores adicionales por producto (un producto puede comprarse a varios).
    const PRODUCT_SUPPLIERS_EXTRA = {
        "2": ["NordSteel Import"],
        "5": ["Ferrox Andina"],
        "18": ["FixPro Fijaciones"],
        "21": ["NordSteel Import"],
        "24": ["FixPro Fijaciones"]
    };

    function buildCompras(today) {
        const productSuppliers = {};
        PRODUCTS.forEach(function (p) {
            productSuppliers[p.id] = [p.supplier].concat(PRODUCT_SUPPLIERS_EXTRA[p.id] || []);
        });

        function prod(pid) { return PRODUCTS.find(function (x) { return x.id === pid; }); }
        // Costo estimado de compra: ~62% del precio de venta
        function cost(pid) { const p = prod(pid); return p ? Math.round(p.price * 62) / 100 : 0; }
        function ocItem(pid, qty) {
            const p = prod(pid);
            return { productId: pid, name: p.name, sku: p.sku, qty: qty, unitCost: cost(pid) };
        }
        function ocTotal(items) {
            return Math.round(items.reduce(function (s, it) { return s + it.qty * it.unitCost; }, 0) * 100) / 100;
        }

        // Solicitudes manuales pendientes (las automáticas las calcula la app según stock vs punto de reorden)
        const solicitudes = [
            { id: "SOL-0001", productId: "13", supplier: "Andina Tools SpA", qty: 24, origin: "Manual", status: "pendiente", date: iso(daysAgo(today, 2)) },
            { id: "SOL-0002", productId: "27", supplier: "NordSteel Import", qty: 4, origin: "Manual", status: "pendiente", date: iso(daysAgo(today, 1)) },
            { id: "SOL-0003", productId: "16", supplier: "SegurAndes EPP", qty: 12, origin: "Manual", status: "pendiente", date: iso(today) }
        ];

        // OCs históricas coherentes con las etiquetas de recepción (OC-4501..4506 ya recibidas)
        // [díasAtrásRecepción, proveedor, productId, qty, número]
        const OC_PLAN = [
            [9, "Ferrox Andina", "2", 40, "OC-4501"],
            [8, "TitanPro Abrasivos", "3", 25, "OC-4502"],
            [6, "SegurAndes EPP", "21", 20, "OC-4503"],
            [5, "FixPro Fijaciones", "22", 15, "OC-4504"],
            [3, "Andina Tools SpA", "4", 12, "OC-4505"],
            [1, "NordSteel Import", "24", 5, "OC-4506"]
        ];
        const ocs = OC_PLAN.map(function (r) {
            const items = [ocItem(r[2], r[3])];
            return {
                id: r[4], date: iso(daysAgo(today, r[0] + 3)), supplier: r[1],
                items: items, total: ocTotal(items),
                status: "Recibida", receivedDate: iso(daysAgo(today, r[0]))
            };
        });
        // Una OC pendiente de recibir
        const pendItems = [ocItem("25", 2), ocItem("11", 3)];
        ocs.push({
            id: "OC-4507", date: iso(daysAgo(today, 1)), supplier: "Vulcan Air Equipos",
            items: pendItems, total: ocTotal(pendItems),
            status: "Pendiente", receivedDate: null
        });

        return { productSuppliers: productSuppliers, solicitudes: solicitudes, ocs: ocs, nextOcSeq: 4508 };
    }

    window.DEMO_DATA = {
        products: PRODUCTS,
        buildInvoices: buildInvoices,
        buildPicking: buildPicking,
        buildDE: buildDE,
        buildInvData: buildInvData,
        buildWmsLog: buildWmsLog,
        buildCompras: buildCompras
    };
})();
