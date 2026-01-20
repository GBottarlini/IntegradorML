import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function App() {
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(true);
  const [busySku, setBusySku] = useState(null);
  const [editing, setEditing] = useState({});
  const [notice, setNotice] = useState("");
  const [apiHealth, setApiHealth] = useState("checking");

  const stats = useMemo(() => {
    let hasMl = 0;
    let hasTn = 0;
    let linked = 0;
    for (const sku of skus) {
      const ml = Boolean(sku.has_ml);
      const tn = Boolean(sku.has_tn);
      if (ml) hasMl += 1;
      if (tn) hasTn += 1;
      if (ml && tn) linked += 1;
    }
    return {
      total: skus.length,
      linked,
      mlOnly: hasMl - linked,
      tnOnly: hasTn - linked,
    };
  }, [skus]);

  const filteredSkus = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let list = skus;
    if (linkedOnly) {
      list = list.filter((sku) => sku.has_ml && sku.has_tn);
    }
    if (!trimmed) return list;
    return list.filter((sku) => {
      return (
        String(sku.sku).toLowerCase().includes(trimmed) ||
        String(sku.title || "").toLowerCase().includes(trimmed)
      );
    });
  }, [skus, linkedOnly, query]);

  useEffect(() => {
    fetch(`${API_BASE}/ping`)
      .then((res) => {
        if (!res.ok) throw new Error("offline");
        setApiHealth("online");
      })
      .catch(() => setApiHealth("offline"));
  }, []);

  useEffect(() => {
    loadSkus();
  }, []);

  async function loadSkus() {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`${API_BASE}/skus/with-sources`);
      if (!res.ok) {
        throw new Error("No se pudo cargar /skus/with-sources");
      }
      const data = await res.json();
      setSkus(data);
    } catch (error) {
      try {
        const res = await fetch(`${API_BASE}/skus/linked`);
        if (!res.ok) throw new Error("No se pudo cargar /skus/linked");
        const data = await res.json();
        setSkus(
          data.map((item) => ({
            ...item,
            has_ml: true,
            has_tn: true,
          }))
        );
        setLinkedOnly(true);
        setNotice("Cargando solo vinculados.");
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
              {apiHealth === "online" ? "Online" : apiHealth === "offline" ? "Offline" : "Checking"}
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
          <h3>{stats.mlOnly}</h3>
        </div>
        <div className="card">
          <p>Solo TN</p>
          <h3>{stats.tnOnly}</h3>
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

      {notice ? <p className="notice">{notice}</p> : null}

      <section className="table">
        <div className="row header">
          <div className="cell">SKU</div>
          <div className="cell">Titulo</div>
          <div className="cell">Stock</div>
          <div className="cell">Origen</div>
          <div className="cell">Accion</div>
        </div>

        {filteredSkus.length === 0 ? (
          <div className="empty">
            <h4>Sin resultados</h4>
            <p>Proba con otro SKU o desactiva el filtro.</p>
          </div>
        ) : (
          filteredSkus.map((item) => {
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
                    onChange={(event) => updateEditingValue(item.sku, event.target.value)}
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
