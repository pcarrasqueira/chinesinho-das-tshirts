import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Clipboard,
  ChevronDown,
  Download,
  Eye,
  FileImage,
  Link as LinkIcon,
  Plus,
  RotateCcw,
  Save,
  Shirt,
  Trash2,
  Upload,
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "chinesinho-das-tshirts:v1";

const emptyRow = () => ({
  id: crypto.randomUUID(),
  quantity: "1",
  size: "M",
  name: "",
  number: "",
  notes: "",
});

const emptyProduct = () => ({
  id: crypto.randomUUID(),
  label: "",
  image: "",
  imageUrl: "",
  rows: [emptyRow()],
});

const defaultOrder = {
  orderNotes: "",
  products: [emptyProduct()],
};

const sizeRows = [
  ["S", "71", "50", "160-170"],
  ["M", "74", "50", "170-175"],
  ["L", "77", "54", "175-180"],
  ["XL", "80", "56", "180-185"],
  ["XXL", "83", "58", "185-190"],
];

const kidsSizeRows = [
  ["16", "XXS", "2-4", "90-105", "44", "35", "32", "20-37"],
  ["18", "XS", "4-5", "105-115", "47", "37", "34", "21-39"],
  ["20", "S", "5-6", "115-125", "50", "39", "36", "22-41"],
  ["22", "M", "7-8", "125-135", "53", "41", "38", "23-42"],
  ["24", "L", "8-9", "135-145", "56", "43", "39", "24-44"],
  ["26", "XL", "10-11", "145-155", "59", "45", "40", "25-47"],
  ["28", "XXL", "12-13", "155-165", "62", "47", "43", "26-50"],
];

function loadOrder() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeOrder(JSON.parse(saved)) : defaultOrder;
  } catch {
    return defaultOrder;
  }
}

function normalizeOrder(savedOrder) {
  return {
    orderNotes: savedOrder.orderNotes || "",
    products: (savedOrder.products?.length ? savedOrder.products : [emptyProduct()]).map((product) => ({
      ...product,
      label: product.label === "Tshirt" || product.label === "Arsenal 25/26" ? "" : product.label || "",
      image: product.imageUrl ? proxiedImageUrl(product.imageUrl) : product.image || "",
      rows: product.rows?.length ? product.rows : [emptyRow()],
    })),
  };
}

function proxiedImageUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return `/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return "";
  }
}

function App() {
  const [order, setOrder] = useState(loadOrder);
  const [isExporting, setIsExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const exportRef = useRef(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const totals = useMemo(() => {
    const lines = order.products.reduce((sum, product) => sum + product.rows.length, 0);
    const quantity = order.products.reduce(
      (sum, product) =>
        sum +
        product.rows.reduce((rowSum, row) => rowSum + (Number.parseInt(row.quantity, 10) || 0), 0),
      0,
    );
    return { lines, quantity };
  }, [order.products]);

  useEffect(() => {
    const onPaste = (event) => {
      const imageItem = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      const reader = new FileReader();
      reader.onload = () => {
        setOrder((current) => {
          const products = [...current.products];
          const firstWithoutImage = products.findIndex((product) => !product.image);
          const targetIndex = firstWithoutImage >= 0 ? firstWithoutImage : 0;
          products[targetIndex] = {
            ...products[targetIndex],
            image: reader.result,
            imageUrl: "",
          };
          return { ...current, products };
        });
      };
      reader.readAsDataURL(file);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const updateOrder = (field, value) => setOrder((current) => ({ ...current, [field]: value }));

  const updateProduct = (productId, patch) => {
    setOrder((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === productId ? { ...product, ...patch } : product,
      ),
    }));
  };

  const updateRow = (productId, rowId, patch) => {
    setOrder((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === productId
          ? {
              ...product,
              rows: product.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : product,
      ),
    }));
  };

  const addProduct = () =>
    setOrder((current) => ({ ...current, products: [...current.products, emptyProduct()] }));

  const resetOrder = () => {
    localStorage.removeItem(STORAGE_KEY);
    setOrder({
      orderNotes: "",
      products: [emptyProduct()],
    });
  };

  const removeProduct = (productId) =>
    setOrder((current) => ({
      ...current,
      products:
        current.products.length === 1
          ? current.products
          : current.products.filter((product) => product.id !== productId),
    }));

  const addRow = (productId) => {
    setOrder((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === productId ? { ...product, rows: [...product.rows, emptyRow()] } : product,
      ),
    }));
  };

  const removeRow = (productId, rowId) => {
    setOrder((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.id === productId
          ? {
              ...product,
              rows:
                product.rows.length === 1
                  ? product.rows
                  : product.rows.filter((row) => row.id !== rowId),
            }
          : product,
      ),
    }));
  };

  const handleImageUpload = (productId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateProduct(productId, { image: reader.result, imageUrl: "" });
    reader.readAsDataURL(file);
  };

  const handleImageUrl = (productId, value) => {
    updateProduct(productId, { imageUrl: value, image: proxiedImageUrl(value) });
  };

  const saveSession = () => {
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      order,
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tshirts-session-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importSession = (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const importedOrder = normalizeOrder(parsed.order || parsed);
        setOrder(importedOrder);
      } catch {
        window.alert("Não consegui importar a sessão. Confirma que o ficheiro é um JSON exportado pela app.");
      } finally {
        if (importInputRef.current) {
          importInputRef.current.value = "";
        }
      }
    };
    reader.readAsText(file);
  };

  const downloadPdf = async () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: false,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const canvasPageHeight = Math.floor((canvas.width * pageHeight) / pageWidth);
      let renderedHeight = 0;
      let pageIndex = 0;

      while (renderedHeight < canvas.height) {
        const pageCanvas = document.createElement("canvas");
        const sliceHeight = Math.min(canvasPageHeight, canvas.height - renderedHeight);
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(
          canvas,
          0,
          renderedHeight,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );

        if (pageIndex > 0) pdf.addPage();
        const imageData = pageCanvas.toDataURL("image/jpeg", 0.95);
        const imageHeight = (sliceHeight * pageWidth) / canvas.width;
        pdf.addImage(imageData, "JPEG", 0, 0, pageWidth, imageHeight);
        renderedHeight += sliceHeight;
        pageIndex += 1;
      }

      const filename = "Tshirts"
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      pdf.save(`${filename}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className={`app-shell ${showPreview ? "preview-open" : ""}`}>
      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="brand">
              <Shirt size={30} />
              <h1>Chinesinho das Tshirts</h1>
            </div>
            <p>{totals.quantity} unidades em {totals.lines} linhas</p>
          </div>
          <div className="topbar-actions">
            <button onClick={saveSession}>
              <Save size={18} />
              Save Session
            </button>
            <button onClick={() => importInputRef.current?.click()}>
              <Upload size={18} />
              Import Session
            </button>
            <input
              ref={importInputRef}
              className="session-file-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => importSession(event.target.files?.[0])}
            />
            <button onClick={() => setShowPreview((current) => !current)}>
              <Eye size={18} />
              Preview
            </button>
            <button onClick={resetOrder}>
              <RotateCcw size={18} />
              Nova Folha
            </button>
            <button className="primary-button" onClick={downloadPdf} disabled={isExporting}>
              <Download size={18} />
              {isExporting ? "A gerar..." : "Download PDF"}
            </button>
          </div>
        </header>

        <section className="form-grid">
          <SizeReference />
        </section>

        <section className="products">
          <div className="section-heading">
            <h2>Tshirts</h2>
            <button onClick={addProduct}>
              <Plus size={17} />
              Adicionar tshirt
            </button>
          </div>

          {order.products.map((product, index) => (
            <ProductEditor
              key={product.id}
              product={product}
              index={index}
              onUpdateProduct={updateProduct}
              onUpdateRow={updateRow}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onRemoveProduct={removeProduct}
              onImageUpload={handleImageUpload}
              onImageUrl={handleImageUrl}
            />
          ))}

          <div className="panel notes-panel">
            <label>
              Notas gerais
              <textarea
                placeholder="Notas"
                value={order.orderNotes}
                onChange={(event) => updateOrder("orderNotes", event.target.value)}
              />
            </label>
          </div>
        </section>
      </section>

      {showPreview && (
        <aside className="preview-pane">
          <div className="preview-toolbar">
            <h2>Preview</h2>
            <span>A4</span>
          </div>
          <OrderPreview order={order} />
        </aside>
      )}

      <div className="pdf-export-source" aria-hidden="true">
        <OrderPreview ref={exportRef} order={order} />
      </div>
    </main>
  );
}

function ProductEditor({
  product,
  index,
  onUpdateProduct,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onRemoveProduct,
  onImageUpload,
  onImageUrl,
}) {
  return (
    <article className="product-editor">
      <div className="product-head">
        <label>
          Identificação
        <input
            placeholder="Arsenal 25/26"
            value={product.label}
            onChange={(event) => onUpdateProduct(product.id, { label: event.target.value })}
          />
        </label>
        <button className="icon-button danger" onClick={() => onRemoveProduct(product.id)} title="Apagar tshirt">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="product-body">
        <div className="image-input">
          <div className="image-frame">
            {product.image ? <img crossOrigin="anonymous" src={product.image} alt="" /> : <FileImage size={42} />}
          </div>
          <label className="file-button">
            <Clipboard size={17} />
            Colar ou escolher imagem
            <input
              type="file"
              accept="image/*"
              onChange={(event) => onImageUpload(product.id, event.target.files?.[0])}
            />
          </label>
          <label className="url-field">
            <LinkIcon size={16} />
            <input
              placeholder="https://imagem-da-tshirt..."
              value={product.imageUrl}
              onChange={(event) => onImageUrl(product.id, event.target.value)}
            />
          </label>
        </div>

        <div className="rows-editor">
          <div className="rows-header">
            <span>Qtd.</span>
            <span>Tamanho</span>
            <span>Nome</span>
            <span>Número</span>
            <span>Notas</span>
            <span />
          </div>
          {product.rows.map((row) => (
            <div className="row-editor" key={row.id}>
              <input
                type="number"
                min="1"
                value={row.quantity}
                onChange={(event) => onUpdateRow(product.id, row.id, { quantity: event.target.value })}
              />
              <select
                value={row.size}
                onChange={(event) => onUpdateRow(product.id, row.id, { size: event.target.value })}
              >
                {[
                  "XS",
                  "S",
                  "M",
                  "L",
                  "XL",
                  "2XL",
                  "3XL",
                  "4XL",
                  "Kids 16/XXS",
                  "Kids 18/XS",
                  "Kids 20/S",
                  "Kids 22/M",
                  "Kids 24/L",
                  "Kids 26/XL",
                  "Kids 28/XXL",
                ].map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
              <input
                placeholder="Nome"
                value={row.name}
                onChange={(event) => onUpdateRow(product.id, row.id, { name: event.target.value })}
              />
              <input
                placeholder="N.º"
                value={row.number}
                onChange={(event) => onUpdateRow(product.id, row.id, { number: event.target.value })}
              />
              <input
                placeholder="Notas"
                value={row.notes}
                onChange={(event) => onUpdateRow(product.id, row.id, { notes: event.target.value })}
              />
              <button className="icon-button" onClick={() => onRemoveRow(product.id, row.id)} title="Apagar linha">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="add-line" onClick={() => onAddRow(product.id)}>
            <Plus size={16} />
            Adicionar linha para esta tshirt
          </button>
        </div>
      </div>
    </article>
  );
}

function SizeReference() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="panel size-reference">
      <button className="size-toggle" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen}>
        <span>
          <Shirt size={21} />
          Referência de tamanhos
        </span>
        <ChevronDown className={isOpen ? "open" : ""} size={20} />
      </button>
      {isOpen && (
        <div className="size-tables">
          <div className="size-table-scroll">
            <table>
              <caption>Adulto</caption>
              <thead>
                <tr>
                  <th>Tam.</th>
                  <th>Compr.</th>
                  <th>Peito</th>
                  <th>Altura</th>
                </tr>
              </thead>
              <tbody>
                {sizeRows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="size-table-scroll">
            <table className="kids-size-table">
              <caption>Criança</caption>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tam.</th>
                  <th>Idade</th>
                  <th>Altura</th>
                  <th>Compr.</th>
                  <th>Peito</th>
                  <th>Calças</th>
                  <th>Cintura</th>
                </tr>
              </thead>
              <tbody>
                {kidsSizeRows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const OrderPreview = React.forwardRef(function OrderPreview({ order }, ref) {
  return (
    <div className="pdf-sheet" ref={ref}>
      <header className="pdf-title">
        <h2>Tshirts</h2>
      </header>

      <table className="order-table">
        <thead>
          <tr>
            <th className="image-col">Tshirt</th>
            <th>Quantity</th>
            <th>Size</th>
            <th>Name</th>
            <th>Number</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {order.products.map((product) =>
            product.rows.map((row, rowIndex) => (
              <tr key={`${product.id}-${row.id}`}>
                {rowIndex === 0 && (
                  <td className="image-cell" rowSpan={product.rows.length}>
                    <div>
                      {product.image ? (
                        <img crossOrigin="anonymous" src={product.image} alt="" />
                      ) : (
                        <span>Sem imagem</span>
                      )}
                      {product.label && <strong>{product.label}</strong>}
                    </div>
                  </td>
                )}
                <td>{row.quantity}</td>
                <td>{row.size}</td>
                <td>{row.name}</td>
                <td>{row.number}</td>
                <td>{row.notes}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      {order.orderNotes && (
        <section className="pdf-notes">
          <strong>Notas gerais</strong>
          <p>{order.orderNotes}</p>
        </section>
      )}
    </div>
  );
});

createRoot(document.getElementById("root")).render(<App />);
