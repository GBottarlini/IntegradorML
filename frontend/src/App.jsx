import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function computeStats(items) {
  let hasMl = 0;
  let hasTn = 0;
  let linked = 0;
  for (const sku of items) {
    const ml = Boolean(sku.has_ml);
    const tn = Boolean(sku.has_tn);
    if (ml) hasMl += 1;
    if (tn) hasTn += 1;
    if (ml && tn) linked += 1;
  }
  return {
    total: items.length,
    linked,
    ml_only: hasMl - linked,
    tn_only: hasTn - linked,
  };
}

export default function App() {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(true);
  const [busySku, setBusySku] = useState(null);
  const [editing, setEditing] = useState({});
  const [notice, setNotice] = useState("");
  const [apiHealth, setApiHealth] = useState("checking");
  const [sortKey, setSortKey] = useState("stock_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    linked: 0,
    ml_only: 0,
    tn_only: 0,
  });

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    fetch(`${API_BASE}/ping`)
      .then((res) => {
        if (!res.ok) throw new Error("offline");
        setApiHealth("online");
      })
      .catch(() => setApiHealth("offline"));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 400);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, linkedOnly, sortKey, pageSize]);

  useEffect(() => {
    loadSkus();
  }, [debouncedQuery, linkedOnly, sortKey, page, pageSize]);

  async function loadSkus() {
    setLoading(true);
    setNotice("");

    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (linkedOnly) params.set("linked", "1");
    if (sortKey) params.set("sort", sortKey);

    try {
      const res = await fetch(`${API_BASE}/skus/with-sources?${params.toString()}`);
      if (!res.ok) {
        throw new Error("No se pudo cargar /skus/with-sources");
      }
      const data = await res.json();
      const normalized = Array.isArray(data)
        ? { items: data, total: data.length, stats: computeStats(data) }
        : {
            items: data.items || [],
            total: data.total ?? data.items?.length ?? 0,
            stats: data.stats || computeStats(data.items || []),
          };
      setSkus(normalized.items);
      setTotal(normalized.total);
      setStats(normalized.stats);
    } catch (error) {
      try {
        const res = await fetch(`${API_BASE}/skus/linked?${params.toString()}`);
        if (!res.ok) throw new Error("No se pudo cargar /skus/linked");
        const data = await res.json();
        const normalized = Array.isArray(data)
          ? {
              items: data.map((item) => ({
                ...item,
                has_ml: true,
                has_tn: true,
              })),
              total: data.length,
              stats: computeStats(
                data.map((item) => ({
                  ...item,
                  has_ml: true,
                  has_tn: true,
                }))
              ),
            }
          : {
              items: (data.items || []).map((item) => ({
                ...item,
                has_ml: true,
                has_tn: true,
              })),
              total: data.total ?? data.items?.length ?? 0,
              stats: data.stats || computeStats(data.items || []),
            };
        setSkus(normalized.items);
        setTotal(normalized.total);
        setStats(normalized.stats);
        setLinkedOnly(true);
      } catch (fallbackError) {
        setNotice("No se pudo cargar la lista de SKUs.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStock(sku) {
    const raw = editing[sku];
    const nextValue = raw === undefined ? "" : raw;
    const stock = Number(nextValue);

    if (!Number.isFinite(stock) || stock < 0) {
      setNotice("Stock invalido. Usa un numero mayor o igual a 0.");
      return;
    }

    setBusySku(sku);
    setNotice("");
    try {
      const res = await fetch(`${API_BASE}/skus/${encodeURIComponent(sku)}/stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || "Error actualizando stock.");
      }
      const updated = await res.json();
      setSkus((prev) =>
        prev.map((item) =>
          item.sku === updated.sku ? { ...item, ...updated } : item
        )
      );
      setNotice(`Stock actualizado para ${sku}.`);
    } catch (error) {
      setNotice(error.message || "Error actualizando stock.");
    } finally {
      setBusySku(null);
    }
  }

  function updateEditingValue(sku, value) {
    setEditing((prev) => ({
      ...prev,
      [sku]: value,
    }));
  }

  function goToPrevPage() {
    setPage((prev) => Math.max(1, prev - 1));
  }

  function goToNextPage() {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Nation Stock Integrator</p>
          <h1>Panel de stock unificado</h1>
          <p className="subtitle">
            Controla el stock maestro y empuja cambios a Mercado Libre y Tienda Nube
            desde un solo lugar.
          </p>
        </div>
        <div className="status-card">
          <div>
            <span className="status-label">API</span>
            <strong className={`status ${apiHealth}`}>
              {apiHealth === "online"
                ? "Online"
                : apiHealth === "offline"
                ? "Offline"
                : "Checking"}
            </strong>
          </div>
          <button className="ghost" onClick={loadSkus} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </header>

      <section className="stats">
        <div className="card">
          <p>Total SKUs</p>
          <h3>{stats.total}</h3>
        </div>
        <div className="card">
          <p>Vinculados ML + TN</p>
          <h3>{stats.linked}</h3>
        </div>
        <div className="card">
          <p>Solo ML</p>
          <h3>{stats.ml_only}</h3>
        </div>
        <div className="card">
          <p>Solo TN</p>
          <h3>{stats.tn_only}</h3>
        </div>
      </section>

      <section className="toolbar">
        <div className="search">
          <input
            type="search"
            placeholder="Buscar por SKU o titulo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="sort">
          <label htmlFor="sort">Ordenar</label>
          <select
            id="sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
          >
            <option value="stock_desc">Stock: mayor a menor</option>
            <option value="stock_asc">Stock: menor a mayor</option>
            <option value="updated_desc">Actualizacion reciente</option>
          </select>
        </div>
        <div className="toggle">
          <button
            className={linkedOnly ? "active" : ""}
            onClick={() => setLinkedOnly(true)}
          >
            Solo vinculados
          </button>
          <button
            className={!linkedOnly ? "active" : ""}
            onClick={() => setLinkedOnly(false)}
          >
            Todos
          </button>
        </div>
      </section>

      <section className="pagination">
        <div className="pager-info">
          Pagina {page} de {totalPages} ({total} resultados)
        </div>
        <div className="pager-controls">
          <button className="ghost" onClick={goToPrevPage} disabled={page <= 1}>
            Anterior
          </button>
          <button
            className="ghost"
            onClick={goToNextPage}
            disabled={page >= totalPages}
          >
            Siguiente
          </button>
        </div>
        <div className="pager-size">
          <label htmlFor="page-size">Filas</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </section>

      {notice ? <p className="notice">{notice}</p> : null}

      <section className="table">
        <div className="row header">
          <div className="cell">SKU</div>
          <div className="cell">Titulo</div>
          <div className="cell">Stock</div>
          <div className="cell">Origen</div>
          <div className="cell">Accion</div>
        </div>

        {skus.length === 0 ? (
          <div className="empty">
            <h4>Sin resultados</h4>
            <p>Proba con otro SKU o desactiva el filtro.</p>
          </div>
        ) : (
          skus.map((item) => {
            const currentValue =
              editing[item.sku] === undefined ? item.stock : editing[item.sku];
            return (
              <div className="row" key={item.sku}>
                <div className="cell sku">{item.sku}</div>
                <div className="cell title">
                  <div className="title-body">
                    <div className="thumb">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title || item.sku} />
                      ) : (
                        <span className="thumb-placeholder">Sin imagen</span>
                      )}
                    </div>
                    <div>
                      <span>{item.title || "Sin titulo"}</span>
                      <small>
                        Ultima actualizacion: {formatDate(item.updated_at)}
                      </small>
                    </div>
                  </div>
                </div>
                <div className="cell stock">
                  <span className="stock-pill">{item.stock}</span>
                  <input
                    type="number"
                    min="0"
                    value={currentValue}
                    onChange={(event) =>
                      updateEditingValue(item.sku, event.target.value)
                    }
                  />
                </div>
                <div className="cell sources">
                  <span className={item.has_ml ? "pill ok" : "pill"}>ML</span>
                  <span className={item.has_tn ? "pill ok" : "pill"}>TN</span>
                </div>
                <div className="cell actions">
                  <button
                    className="primary"
                    onClick={() => handleUpdateStock(item.sku)}
                    disabled={busySku === item.sku}
                  >
                    {busySku === item.sku ? "Enviando..." : "Actualizar"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
